'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { isOperationAccount } from '@/lib/crm/operation-accounts'

/**
 * QAQC (Quality Assurance / Quality Control) lead verification.
 *
 * A tick on each lead card that Super Admin / Regional Manager / Operation
 * accounts can toggle to mark a lead "verified". The verified flag + timestamp
 * + which account did it are stored on crm.crm_opportunity via self-provisioned
 * columns (the build only runs `prisma generate`, not migrations — so we ADD
 * COLUMN IF NOT EXISTS at runtime, same pattern as the recruitment placement
 * columns). Read through raw SQL keyed by opportunity id so the existing kanban
 * queries don't need to change.
 *
 * Access:
 *   - verify:   SUPER_ADMIN, REGIONAL_MANAGER, or an operation account.
 *   - unverify + edit the verified date: SUPER_ADMIN only.
 * Regional managers (branch-scoped) can only touch leads in their branches.
 */

export type QaqcResult = 'pass' | 'fail'

export interface QaqcState {
  verified: boolean
  verifiedAt: string | null      // ISO
  verifiedById: string | null
  verifiedByName: string | null
  /** Pass/Fail outcome — only meaningful once verified. Null until set. */
  result: QaqcResult | null
}

export interface QaqcCaps {
  /** May see + toggle the tick (verify). */
  canVerify: boolean
  /** May unverify + edit the verified date (SUPER_ADMIN only). */
  canManage: boolean
}

const EMPTY: QaqcState = { verified: false, verifiedAt: null, verifiedById: null, verifiedByName: null, result: null }

function coerceResult(v: string | null): QaqcResult | null {
  return v === 'pass' || v === 'fail' ? v : null
}

let columnsEnsured = false
async function ensureQaqcColumns(): Promise<void> {
  if (columnsEnsured) return
  await prisma.$executeRawUnsafe(`
    ALTER TABLE crm.crm_opportunity
      ADD COLUMN IF NOT EXISTS qaqc_verified boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS qaqc_verified_at timestamptz,
      ADD COLUMN IF NOT EXISTS qaqc_verified_by_id text,
      ADD COLUMN IF NOT EXISTS qaqc_verified_by_name text,
      ADD COLUMN IF NOT EXISTS qaqc_result text`)
  columnsEnsured = true
}

/** Read one opportunity's QAQC state (raw — the columns aren't in the Prisma
 *  model). Assumes ensureQaqcColumns() has already run. */
async function readState(tenantId: string, opportunityId: string): Promise<QaqcState> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      qaqc_verified: boolean
      qaqc_verified_at: Date | null
      qaqc_verified_by_id: string | null
      qaqc_verified_by_name: string | null
      qaqc_result: string | null
    }>
  >(
    `SELECT qaqc_verified, qaqc_verified_at, qaqc_verified_by_id, qaqc_verified_by_name, qaqc_result
       FROM crm.crm_opportunity WHERE id = $1 AND "tenantId" = $2 LIMIT 1`,
    opportunityId, tenantId,
  )
  const r = rows[0]
  if (!r) return EMPTY
  return {
    verified: !!r.qaqc_verified,
    verifiedAt: r.qaqc_verified_at ? new Date(r.qaqc_verified_at).toISOString() : null,
    verifiedById: r.qaqc_verified_by_id,
    verifiedByName: r.qaqc_verified_by_name,
    result: coerceResult(r.qaqc_result),
  }
}

interface Ctx {
  userId: string
  tenantId: string
  elevated: boolean
  branchIds: string[]
  caps: QaqcCaps
  displayName: string
}

async function resolveCtx(): Promise<Ctx | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session?.user?.id
  if (!userId) return null
  const access = await resolveBranchAccess(userId)
  if (!access) return null
  const email = session.user.email
  const isOperation = isOperationAccount(email)
  const canVerify = access.isSuperAdmin || access.role === 'REGIONAL_MANAGER' || isOperation
  return {
    userId,
    tenantId: access.tenantId,
    elevated: access.elevated,
    branchIds: access.branchIds,
    caps: { canVerify, canManage: access.isSuperAdmin },
    displayName: session.user.name?.trim() || email || 'Unknown',
  }
}

/** The current caller's QAQC capabilities (for gating UI without a write). */
export async function getQaqcCaps(): Promise<QaqcCaps> {
  const ctx = await resolveCtx()
  return ctx?.caps ?? { canVerify: false, canManage: false }
}

/** Verified state for a set of opportunities, keyed by id. Only returns rows
 *  the caller could see anyway (tenant-scoped); missing ids default to unset. */
export async function getQaqcMap(
  opportunityIds: string[],
): Promise<Record<string, QaqcState>> {
  const out: Record<string, QaqcState> = {}
  const ctx = await resolveCtx()
  if (!ctx || opportunityIds.length === 0) return out
  try {
    await ensureQaqcColumns()
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string
        qaqc_verified: boolean
        qaqc_verified_at: Date | null
        qaqc_verified_by_id: string | null
        qaqc_verified_by_name: string | null
        qaqc_result: string | null
      }>
    >(
      `SELECT id, qaqc_verified,
              qaqc_verified_at, qaqc_verified_by_id, qaqc_verified_by_name, qaqc_result
         FROM crm.crm_opportunity
        WHERE "tenantId" = $1 AND id = ANY($2::text[])`,
      ctx.tenantId,
      opportunityIds,
    )
    for (const r of rows) {
      out[r.id] = {
        verified: !!r.qaqc_verified,
        verifiedAt: r.qaqc_verified_at ? new Date(r.qaqc_verified_at).toISOString() : null,
        verifiedById: r.qaqc_verified_by_id,
        verifiedByName: r.qaqc_verified_by_name,
        result: coerceResult(r.qaqc_result),
      }
    }
  } catch (e) {
    console.warn('[qaqc] getQaqcMap failed:', (e as Error).message)
  }
  return out
}

/** Single-opportunity verified state (detail page/modal). */
export async function getQaqcForOpportunity(opportunityId: string): Promise<QaqcState> {
  const map = await getQaqcMap([opportunityId])
  return map[opportunityId] ?? EMPTY
}

/**
 * Set / clear a lead's QAQC verification.
 *   - verified = true  → requires canVerify. Stamps who + when (now, unless a
 *                        SUPER_ADMIN passes an explicit dateISO — the date edit).
 *   - verified = false → requires canManage (SUPER_ADMIN only).
 */
export async function setQaqcVerified(
  opportunityId: string,
  verified: boolean,
  dateISO?: string | null,
): Promise<{ ok: boolean; error?: string; state?: QaqcState }> {
  try {
    const ctx = await resolveCtx()
    if (!ctx) return { ok: false, error: 'Unauthorized' }
    if (!ctx.caps.canVerify) return { ok: false, error: 'Not allowed' }
    if (!verified && !ctx.caps.canManage) {
      return { ok: false, error: 'Only a super admin can unverify a lead' }
    }

    // Scope guard: the opportunity must be in the caller's tenant, and — for a
    // branch-scoped verifier (regional manager) — one of their branches.
    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true, branchId: true },
    })
    if (!opp) return { ok: false, error: 'Lead not found' }
    if (!ctx.elevated && !ctx.branchIds.includes(opp.branchId)) {
      return { ok: false, error: 'Lead is outside your branches' }
    }

    await ensureQaqcColumns()

    if (verified) {
      // Custom verified date is a SUPER_ADMIN-only affordance; everyone else
      // stamps "now". Accept YYYY-MM-DD or a full ISO string.
      let when: Date = new Date()
      if (dateISO && ctx.caps.canManage) {
        const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateISO) ? `${dateISO}T00:00:00.000Z` : dateISO)
        if (!isNaN(d.getTime())) when = d
      }
      await prisma.$executeRawUnsafe(
        `UPDATE crm.crm_opportunity
            SET qaqc_verified = true, qaqc_verified_at = $1,
                qaqc_verified_by_id = $2, qaqc_verified_by_name = $3
          WHERE id = $4 AND "tenantId" = $5`,
        when, ctx.userId, ctx.displayName, opportunityId, ctx.tenantId,
      )
      // Re-read so the returned state keeps any existing pass/fail result.
      return { ok: true, state: await readState(ctx.tenantId, opportunityId) }
    }

    // Unverify also clears the pass/fail result — it's meaningless unverified.
    await prisma.$executeRawUnsafe(
      `UPDATE crm.crm_opportunity
          SET qaqc_verified = false, qaqc_verified_at = NULL,
              qaqc_verified_by_id = NULL, qaqc_verified_by_name = NULL,
              qaqc_result = NULL
        WHERE id = $1 AND "tenantId" = $2`,
      opportunityId, ctx.tenantId,
    )
    return { ok: true, state: EMPTY }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed' }
  }
}

/**
 * Set (or clear) a verified lead's Pass/Fail QAQC result. Clickable by the same
 * three roles that can verify (Super Admin / Regional Manager / Operation). The
 * lead must already be verified — the result is meaningless otherwise.
 */
export async function setQaqcResult(
  opportunityId: string,
  result: QaqcResult | null,
): Promise<{ ok: boolean; error?: string; state?: QaqcState }> {
  try {
    const ctx = await resolveCtx()
    if (!ctx) return { ok: false, error: 'Unauthorized' }
    if (!ctx.caps.canVerify) return { ok: false, error: 'Not allowed' }
    if (result !== null && result !== 'pass' && result !== 'fail') {
      return { ok: false, error: 'Invalid result' }
    }

    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true, branchId: true },
    })
    if (!opp) return { ok: false, error: 'Lead not found' }
    if (!ctx.elevated && !ctx.branchIds.includes(opp.branchId)) {
      return { ok: false, error: 'Lead is outside your branches' }
    }

    await ensureQaqcColumns()
    // Guard: only a verified lead can carry a pass/fail result.
    const current = await readState(ctx.tenantId, opportunityId)
    if (result !== null && !current.verified) {
      return { ok: false, error: 'Verify the lead before setting Pass/Fail' }
    }

    await prisma.$executeRawUnsafe(
      `UPDATE crm.crm_opportunity SET qaqc_result = $1 WHERE id = $2 AND "tenantId" = $3`,
      result, opportunityId, ctx.tenantId,
    )
    return { ok: true, state: { ...current, result } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed' }
  }
}
