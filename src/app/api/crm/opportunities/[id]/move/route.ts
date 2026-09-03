import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { moveOpportunity, bulkMoveOpportunities } from '@/server/actions/opportunities'
import { MoveOpportunitySchema, BulkMoveSchema } from '@/lib/crm/validations/opportunity'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { hasPermission } from '@/lib/crm/permissions'
import { isMarketingAccount, MARKETING_BRANCH_NAME } from '@/lib/crm/operation-accounts'

async function resolveSession(_req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null

  const access = await resolveBranchAccess(session.user.id)
  if (!access) return null

  // Marketing can VIEW every branch's kanban but may only MOVE cards in its own
  // branch. It is not elevated, so `editableBranchIds` narrows the branch check
  // in assertOppsAccess to just the Marketing branch — regardless of the BM
  // links it holds to every other branch for the read-only view.
  let editableBranchIds: string[] | null = null
  let marketingElevated = access.elevated
  if (isMarketingAccount(session.user.email)) {
    const mk = await prisma.crm_branch.findFirst({
      where: { tenantId: access.tenantId, name: MARKETING_BRANCH_NAME },
      select: { id: true },
    })
    editableBranchIds = mk ? [mk.id] : []
    marketingElevated = false   // force the branch check even if links look elevated
  }

  return {
    tenantId: access.tenantId,
    userId: session.user.id,
    branchIds: access.branchIds,
    elevated: marketingElevated,
    role: access.role,
    editableBranchIds,
  }
}

/** Return 403 response if caller isn't elevated and opp isn't in their branches. */
async function assertOppsAccess(
  ctx: { tenantId: string; branchIds: string[]; elevated: boolean; editableBranchIds?: string[] | null },
  opportunityIds: string[],
): Promise<NextResponse | null> {
  // Marketing (editableBranchIds set) is checked against ONLY its own branch,
  // even though it isn't elevated and holds view links to every branch.
  const allowed = ctx.editableBranchIds ?? ctx.branchIds
  if ((ctx.elevated && !ctx.editableBranchIds) || opportunityIds.length === 0) return null
  const opps = await prisma.crm_opportunity.findMany({
    where: { id: { in: opportunityIds }, tenantId: ctx.tenantId },
    select: { id: true, branchId: true },
  })
  if (opps.length !== opportunityIds.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const forbidden = opps.some((o) => !allowed.includes(o.branchId))
  if (forbidden) {
    return NextResponse.json(
      { error: 'You can only move leads that belong to your branch.' },
      { status: 403 },
    )
  }
  return null
}

// ─── POST /api/crm/opportunities/[id]/move ────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveSession(req)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Moving a lead between stages is lead editing — read-only for AGENCY_ADMIN.
    if (!hasPermission(ctx.role, 'opportunities:write')) {
      return NextResponse.json({ error: 'Your role cannot move leads.' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()

    // Support bulk move if opportunityIds array provided
    if (Array.isArray(body.opportunityIds)) {
      const parsed = BulkMoveSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
      }
      const denied = await assertOppsAccess(ctx, parsed.data.opportunityIds)
      if (denied) return denied
      const result = await bulkMoveOpportunities(
        parsed.data.opportunityIds,
        parsed.data.toStageId,
        ctx.userId,
        ctx.tenantId,
        parsed.data.note,
      )
      return NextResponse.json(result)
    }

    // Single move
    const parsed = MoveOpportunitySchema.safeParse({ opportunityId: id, ...body })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const denied = await assertOppsAccess(ctx, [parsed.data.opportunityId])
    if (denied) return denied

    const updated = await moveOpportunity(
      parsed.data.opportunityId,
      parsed.data.toStageId,
      parsed.data.note,
      ctx.userId,
      ctx.tenantId,
      {
        trialDate: parsed.data.trialDate,
        trialTimeSlot: parsed.data.trialTimeSlot,
        enrollmentMonths: parsed.data.enrollmentMonths,
        rescheduleDate: parsed.data.rescheduleDate,
      },
    )

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[POST /api/crm/opportunities/[id]/move]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
