import { type NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { Prisma } from '@/generated/crm-client'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { normalizePhone } from '@/lib/crm/utils'
import { logAudit } from '@/lib/crm/audit'

const SubmitSchema = z.object({
  parentName: z.string().min(1),
  parentPhone: z.string().min(1),
  parentEmail: z.string().email(),
  numChildren: z.number().int().min(1).max(4),
  children: z
    .array(
      z.object({
        name: z.string().min(1),
        age: z.string().min(1),
      }),
    )
    .min(1)
    .max(4),
  preferredBranch: z.string().min(1),
  remarks: z.string().optional(),
})

function splitName(full: string): { firstName: string; lastName: string | null } {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: null }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/**
 * Match the preferredBranch label to a crm_branch, tolerantly.
 *
 * The form sends crm_branch.name verbatim, so the exact match below normally
 * wins. But a branch that was renamed after a form/tab was opened, or a label
 * with stray whitespace/casing, used to fall straight through to null → a 409
 * "No branches available", which reads to the branch as "I can't submit the CNS
 * form." The fallbacks below (the fuzzy matching this function always claimed to
 * do but never did) make those near-misses resolve instead of silently failing.
 */
async function resolveBranchId(tenantId: string, preferredBranch: string): Promise<string | null> {
  const raw = preferredBranch.trim()

  // 1. Exact match — the normal path.
  const exact = await prisma.crm_branch.findFirst({ where: { tenantId, name: raw } })
  if (exact) return exact.id

  // Pull the tenant's branches once for the tolerant passes.
  const all = await prisma.crm_branch.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  })
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const target = norm(raw)

  // 2. Case-insensitive / whitespace-collapsed exact match.
  const ci = all.find((b) => norm(b.name) === target)
  if (ci) return ci.id

  // 3. Leading branch number ("07 Ebright (Ampang)" ↔ "07 …").
  const num = raw.match(/^(\d{2})\b/)?.[1]
  if (num) {
    const byNum = all.find((b) => b.name.trim().startsWith(num))
    if (byNum) return byNum.id
  }

  // 4. Parenthesised location ("… (Ampang)" ↔ "Ampang" or "Selangor - Ampang").
  const loc = raw.match(/\(([^)]+)\)/)?.[1]?.trim() ?? raw.split('-').pop()?.trim()
  if (loc) {
    const nLoc = norm(loc)
    const byLoc = all.find((b) => norm(b.name).includes(nLoc))
    if (byLoc) return byLoc.id
  }

  return null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = SubmitSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
    }

    // Resolve default tenant. Production seed uses slug 'ebright'; the legacy
    // demo seed used 'ebright-demo'. Try both so this works in either env.
    const tenant = await prisma.crm_tenant.findFirst({
      where: { slug: { in: ['ebright', 'ebright-demo'] } },
      select: { id: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not configured' }, { status: 500 })
    }

    const branchId = await resolveBranchId(tenant.id, parsed.data.preferredBranch)
    if (!branchId) {
      return NextResponse.json({ error: 'No branches available — configure one first' }, { status: 409 })
    }

    // Branch-scope guard: a branch manager submitting from /crm/forms can only
    // create leads for branches they're explicitly linked to. The dropdown is
    // locked client-side; this is the server-side enforcement against people
    // editing the request payload in dev tools. Super/agency admins bypass.
    const session = await auth.api.getSession({ headers: await headers() })
    if (session?.user?.id) {
      // Fetch ALL the user's branch links once — a multi-branch user has several
      // rows. Checking admin via findFirst (one arbitrary row) or the branch via
      // a separate query risked rejecting legit submissions for their non-primary
      // branches. Any SUPER/AGENCY link → admin; otherwise the submitted branch
      // must be one of their links.
      const links = await prisma.crm_user_branch.findMany({
        where: { userId: session.user.id, tenantId: tenant.id },
        select: { role: true, branchId: true },
      })
      const isAdmin = links.some((l) => l.role === 'SUPER_ADMIN' || l.role === 'AGENCY_ADMIN')
      if (!isAdmin && !links.some((l) => l.branchId === branchId)) {
        return NextResponse.json(
          { error: 'You can only submit form leads for a branch you manage.' },
          { status: 403 },
        )
      }
    }

    // Find the "New Lead" stage — first stage of the branch's pipeline
    const pipeline = await prisma.crm_pipeline.findFirst({
      where: { tenantId: tenant.id, branchId },
      include: { stages: { orderBy: { order: 'asc' }, take: 1 } },
    })
    if (!pipeline || pipeline.stages.length === 0) {
      return NextResponse.json(
        { error: 'No pipeline / New Lead stage exists for this branch' },
        { status: 409 },
      )
    }
    const newLeadStage = pipeline.stages[0]

    // Leads submitted through the CNS trial form are tagged with the
    // "CNS Form" lead source so they're distinguishable in the Opportunities
    // board / lead-source filter (created on first use if missing).
    let leadSource = await prisma.crm_lead_source.findFirst({
      where: { tenantId: tenant.id, name: 'CNS Form' },
    })
    if (!leadSource) {
      leadSource = await prisma.crm_lead_source.create({
        data: { tenantId: tenant.id, name: 'CNS Form' },
      })
    }

    // One contact + opportunity PER child, mirroring the master_leads_base
    // sibling-explosion path. Each contact's firstName/lastName holds the
    // child's name; parentFullName carries the parent.
    //
    // IDEMPOTENCY: the externalSourceId is a DETERMINISTIC key per (parent,
    // child) — parent's normalised phone (email fallback) + the child's name —
    // NOT a fresh random UUID per request. A random id meant every re-submit
    // (double-click, retry, back-then-resubmit) created a brand-new lead, which
    // is the duplicate-lead bug. The deterministic key + the
    // @@unique(tenantId, externalSourceTable, externalSourceId) index make a
    // repeat submission a no-op that reuses the existing lead.
    const parentKey =
      normalizePhone(parsed.data.parentPhone) || parsed.data.parentEmail.trim().toLowerCase()
    const childKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '-')
    const keyed = parsed.data.children.map((child, i) => {
      // A placeholder child name ("-" / blank) collapses to an empty key that
      // would collide across a parent's multiple nameless children — fall back
      // to the child's position so each stays a distinct lead.
      const ck = childKey(child.name)
      const safeKey = ck && ck !== '-' ? ck : `child-${i + 1}`
      return { child, externalSourceId: `trial:${parentKey}:${safeKey}` }
    })
    const keys = keyed.map((k) => k.externalSourceId)

    // Skip children that already have a lead from a prior submit (idempotent).
    const already = await prisma.crm_contact.findMany({
      where: { tenantId: tenant.id, externalSourceTable: 'trial_form', externalSourceId: { in: keys } },
      select: { externalSourceId: true },
    })
    const have = new Set(already.map((c) => c.externalSourceId))
    const toCreate = keyed.filter((k) => !have.has(k.externalSourceId))

    if (toCreate.length > 0) {
      try {
        await prisma.$transaction(async (tx) => {
          for (const { child, externalSourceId } of toCreate) {
            // Staff often don't know the child's name at submission and type a
            // "-" placeholder. Storing that makes an unfindable "-" card, so
            // fall back to the PARENT's name (the BM renames once known). Only
            // affects new submissions — existing "-" leads are left as-is.
            const rawChildName = child.name.trim()
            const displayName =
              rawChildName && rawChildName !== '-' ? rawChildName : parsed.data.parentName
            const { firstName, lastName } = splitName(displayName)
            const c = await tx.crm_contact.create({
              data: {
                tenantId:            tenant.id,
                branchId,
                firstName,
                lastName,
                email:               parsed.data.parentEmail,
                phone:               parsed.data.parentPhone,
                leadSourceId:        leadSource!.id,
                preferredBranchId:   branchId,
                parentFullName:      parsed.data.parentName,
                childAge1:           child.age,
                // Parent's free-text remarks from the form — stored on every
                // sibling so it shows on whichever child's card is opened.
                remarks:             parsed.data.remarks?.trim() || null,
                externalSourceTable: 'trial_form',
                externalSourceId,
              },
            })
            await tx.crm_opportunity.create({
              data: {
                tenantId:   tenant.id,
                branchId,
                contactId:  c.id,
                pipelineId: pipeline.id,
                stageId:    newLeadStage.id,
                value:      0,
              },
            })
          }
        })
      } catch (e) {
        // Race: a concurrent identical submit inserted the same key first. The
        // unique index rolled this transaction back, so no duplicate persisted —
        // treat as success and fall through to re-read the existing rows.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e
      }
    }

    // Full contact set for this submission (existing + newly created).
    const finalContacts = await prisma.crm_contact.findMany({
      where: { tenantId: tenant.id, externalSourceTable: 'trial_form', externalSourceId: { in: keys } },
      select: { id: true },
    })
    const contactIds = finalContacts.map((c) => c.id)

    void logAudit({
      tenantId: tenant.id,
      action: 'CREATE',
      entity: 'crm_contact',
      entityId: contactIds[0],
      meta: {
        source:           'trial-form',
        numChildren:      parsed.data.numChildren,
        preferredBranch:  parsed.data.preferredBranch,
        submissionId:     randomUUID(),
        created:          toCreate.length,
        reused:           have.size,
        contactIds,
      },
    })

    return NextResponse.json({
      success:    true,
      contactId:  contactIds[0],
      contactIds,
    })
  } catch (e) {
    console.error('[POST /api/crm/forms/trial-submit]', e)
    return NextResponse.json({ error: (e as Error).message ?? 'Internal error' }, { status: 500 })
  }
}
