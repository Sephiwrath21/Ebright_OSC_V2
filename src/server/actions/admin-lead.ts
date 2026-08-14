'use server'

import type { Prisma } from '@/generated/crm-client'
import { headers } from 'next/headers'
import { prisma } from '@/lib/crm/db'
import { auth } from '@/lib/crm/auth'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { TRIAL_CAPACITY } from '@/lib/crm/trial-config'
import { logAudit } from '@/lib/crm/audit'

// ────────────────────────────────────────────────────────────────────────────
// SUPER-ADMIN-only lead edits, surfaced in the kanban card detail popup's
// "Action" sidebar. Every action re-verifies SUPER_ADMIN server-side, so
// AGENCY_ADMIN ("operation") and branch roles are rejected even if the UI is
// bypassed.
//
// The dashboard buckets each funnel metric by a different date signal:
//   CT  → trial-class appointment date
//   SU  → crm_stage_history.changedAt of the SU entry
//   ENR → crm_stage_history.changedAt of the ENR entry
// The "Last/This/Next week" control therefore edits whichever signal matches
// the lead's CURRENT stage, so the lead displays in the chosen dashboard week
// regardless of when the BM actually dragged it.
// ────────────────────────────────────────────────────────────────────────────

const KL = 8 * 3600 * 1000
const DAY = 86400000
const pad = (n: number) => String(n).padStart(2, '0')

async function requireSuperAdmin(): Promise<{ userId: string; tenantId: string }> {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session?.user?.id
  if (!userId) throw new Error('Unauthorized')
  const access = await resolveBranchAccess(userId)
  if (!access?.isSuperAdmin) throw new Error('Only Super Admin can use lead admin actions.')
  return { userId, tenantId: access.tenantId }
}

/** Parse "07:15 PM" / "10am" / "14:00" → "HH:MM" (24h). */
function toHHMM(input: string): string {
  const t = input.trim().toUpperCase()
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/)
  if (m24) return `${m24[1].padStart(2, '0')}:${m24[2]}`
  const m12 = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/)
  if (m12) {
    let h = parseInt(m12[1], 10)
    const min = m12[2] ?? '00'
    if (m12[3] === 'PM' && h !== 12) h += 12
    if (m12[3] === 'AM' && h === 12) h = 0
    return `${pad(h)}:${min}`
  }
  return '10:00'
}

// Appointment startAt is stored naive-KL-as-UTC (a 19:15 pick is saved 19:15Z),
// so read it back with UTC getters — matching how the kanban renders the pill.
function isoDateUTC(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

type WeekChoice = 'last' | 'this' | 'next'
const weekOffset = (w: WeekChoice) => (w === 'last' ? -1 : w === 'next' ? 1 : 0)

/** KL "day index" (days since epoch in KL wall time) → Monday index of its week. */
function mondayIndexOf(dayIndex: number): number {
  const dow = new Date(dayIndex * DAY).getUTCDay()
  return dayIndex - (dow === 0 ? 6 : dow - 1)
}
/** Monday index of the CURRENT KL week. */
function todayMondayIndex(): number {
  const wall = new Date(Date.now() + KL)
  const todayIdx = Math.floor(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) / DAY)
  return mondayIndexOf(todayIdx)
}
function dayIndexToYMD(idx: number): string {
  const d = new Date(idx * DAY)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
/** Classify a KL day index as last / this / next week (else 'other'). */
function classifyWeek(dayIndex: number): 'last' | 'this' | 'next' | 'other' {
  const diff = Math.round((mondayIndexOf(dayIndex) - todayMondayIndex()) / 7)
  return diff === 0 ? 'this' : diff === -1 ? 'last' : diff === 1 ? 'next' : 'other'
}
export type LeadDateField = 'created' | 'updated'
export type LeadWhenChoice = 'last' | 'this' | 'next' | 'custom'

/**
 * Resolve the new timestamp for a "Dashboard week / custom date" choice. Week
 * shifts preserve the source field's weekday + time-of-day (KL); 'custom' lands
 * on the picked KL day at the source field's time-of-day.
 */
function resolveTargetDate(current: Date | null, when: LeadWhenChoice, customDate?: string): Date {
  const base = current ?? new Date()
  if (when === 'custom') {
    if (!customDate || !/^\d{4}-\d{2}-\d{2}$/.test(customDate)) throw new Error('Pick a valid custom date')
    const wall = new Date(base.getTime() + KL)
    const [y, m, d] = customDate.split('-').map(Number)
    // Custom KL day at the source field's time-of-day → real-UTC instant.
    return new Date(Date.UTC(y, m - 1, d, wall.getUTCHours(), wall.getUTCMinutes()) - KL)
  }
  const curKLDayIdx = Math.floor((base.getTime() + KL) / DAY)
  const deltaDays = (todayMondayIndex() + weekOffset(when) * 7) - mondayIndexOf(curKLDayIdx)
  return new Date(base.getTime() + deltaDays * DAY)
}

/** Replace the lead's Trial Class appointment (shared by trial edit + week shift). */
async function replaceTrial(
  tx: Prisma.TransactionClient,
  p: { tenantId: string; userId: string; contactId: string; branchId: string; date: string; slot: string },
) {
  const [startStr] = p.slot.split('–').map((s) => s.trim())
  const startAt = new Date(`${p.date}T${toHHMM(startStr)}:00`)
  if (Number.isNaN(startAt.getTime())) throw new Error('Invalid date/time')

  await tx.crm_appointment.deleteMany({
    where: { tenantId: p.tenantId, contactId: p.contactId, title: 'Trial Class' },
  })
  // Only live CT seats occupy the slot — retained records for leads who moved on
  // (SU/ENR/RSD/…) must not count toward capacity.
  const ctSeatStageIds = (
    await tx.crm_stage.findMany({
      where: {
        tenantId: p.tenantId,
        OR: [{ shortCode: 'CT' }, { name: { equals: 'Confirmed for Trial', mode: 'insensitive' } }],
      },
      select: { id: true },
    })
  ).map((s) => s.id)
  const booked = await tx.crm_appointment.count({
    where: {
      tenantId: p.tenantId,
      branchId: p.branchId,
      title: 'Trial Class',
      startAt,
      contact: { opportunities: { some: { stageId: { in: ctSeatStageIds } } } },
    },
  })
  if (booked >= TRIAL_CAPACITY) throw new Error(`That slot is fully booked (${booked}/${TRIAL_CAPACITY}). Pick another.`)
  await tx.crm_appointment.create({
    data: {
      tenantId: p.tenantId, branchId: p.branchId, contactId: p.contactId, userId: p.userId,
      startAt, endAt: new Date(startAt.getTime() + 60 * 60 * 1000), title: 'Trial Class',
    },
  })
  const TRIAL_DAY_BY_DOW: Record<number, 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'> = {
    3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT', 0: 'SUN',
  }
  const trialDay = TRIAL_DAY_BY_DOW[startAt.getUTCDay()]
  if (trialDay) await tx.crm_contact.update({ where: { id: p.contactId }, data: { preferredTrialDay: trialDay } })
}

export interface LeadAdminContext {
  stageName: string
  stageShort: string
  branchId: string
  contactName: string
  trial: { date: string; slot: string } | null
  enrolledPackage: string | null
  rescheduleDate: string | null
  /** Date the dashboard counts this lead's Show-Up on (KL), null if none. */
  showUpDate: string | null
  /** Which funnel metric the week control re-buckets (null = not applicable). */
  weekMetric: 'CT' | 'SU' | 'ENR' | null
  /** The lead's current dashboard week for that metric (pre-ticks the control). */
  currentWeek: 'last' | 'this' | 'next' | 'other' | null
  /** Current Created-on date (KL, YYYY-MM-DD) + its dashboard week bucket. */
  createdOn: string
  createdWeek: 'last' | 'this' | 'next' | 'other'
  /** Current Updated-on date (lastStageChangeAt, KL) + its dashboard week bucket. */
  updatedOn: string
  updatedWeek: 'last' | 'this' | 'next' | 'other'
}

export async function getLeadAdminContext(
  opportunityId: string,
): Promise<{ ok: boolean; ctx?: LeadAdminContext; error?: string }> {
  try {
    const { tenantId } = await requireSuperAdmin()

    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId, deletedAt: null },
      select: {
        branchId: true, contactId: true, stageId: true,
        createdAt: true, lastStageChangeAt: true, updatedAt: true,
        stage: { select: { name: true, shortCode: true } },
        contact: { select: { firstName: true, lastName: true, enrolledPackage: true } },
      },
    })
    if (!opp) return { ok: false, error: 'Lead not found' }
    const code = (opp.stage.shortCode ?? '').toUpperCase()

    // Created / Updated date buckets (KL) — surfaced so the admin can move
    // whichever one drives the metric they care about.
    const createdIdx = Math.floor((opp.createdAt.getTime() + KL) / DAY)
    const updBase = opp.lastStageChangeAt ?? opp.updatedAt ?? opp.createdAt
    const updatedIdx = Math.floor((updBase.getTime() + KL) / DAY)

    const appt = await prisma.crm_appointment.findFirst({
      where: { tenantId, contactId: opp.contactId, title: 'Trial Class' },
      orderBy: { startAt: 'desc' },
      select: { startAt: true },
    })
    let trial: LeadAdminContext['trial'] = null
    if (appt) {
      const d = new Date(appt.startAt)
      trial = { date: isoDateUTC(d), slot: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
    }

    const task = await prisma.crm_task.findFirst({
      where: { tenantId, contactId: opp.contactId, title: 'Reschedule follow-up' },
      orderBy: { dueAt: 'desc' },
      select: { dueAt: true },
    })
    const rescheduleDate = task?.dueAt ? isoDateUTC(new Date(task.dueAt)) : null

    // Show-Up entry row — the signal the dashboard SU headline counts.
    const suIds = await showUpStageIds(tenantId)
    const suHistory = suIds.length
      ? await prisma.crm_stage_history.findFirst({
          where: { tenantId, opportunityId, toStageId: { in: suIds } },
          orderBy: { changedAt: 'desc' },
          select: { changedAt: true },
        })
      : null
    const showUpDate = suHistory
      ? dayIndexToYMD(Math.floor((suHistory.changedAt.getTime() + KL) / DAY))
      : null

    // Week metric + current week, based on the lead's CURRENT stage.
    let weekMetric: LeadAdminContext['weekMetric'] = null
    let currentWeek: LeadAdminContext['currentWeek'] = null
    if (code === 'CT' && trial) {
      weekMetric = 'CT'
      const [y, m, d] = trial.date.split('-').map(Number)
      currentWeek = classifyWeek(Math.floor(Date.UTC(y, m - 1, d) / DAY))
    } else if (code === 'SU' || code === 'ENR') {
      weekMetric = code
      const h = await prisma.crm_stage_history.findFirst({
        where: { tenantId, opportunityId, toStageId: opp.stageId },
        orderBy: { changedAt: 'desc' },
        select: { changedAt: true },
      })
      if (h) currentWeek = classifyWeek(Math.floor((new Date(h.changedAt).getTime() + KL) / DAY))
    }

    return {
      ok: true,
      ctx: {
        stageName: opp.stage.name,
        stageShort: opp.stage.shortCode,
        branchId: opp.branchId,
        contactName: `${opp.contact.firstName} ${opp.contact.lastName ?? ''}`.trim() || '(No name)',
        trial, enrolledPackage: opp.contact.enrolledPackage, rescheduleDate, showUpDate,
        weekMetric, currentWeek,
        createdOn: dayIndexToYMD(createdIdx),
        createdWeek: classifyWeek(createdIdx),
        updatedOn: dayIndexToYMD(updatedIdx),
        updatedWeek: classifyWeek(updatedIdx),
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to load' }
  }
}

/**
 * Move a lead's dashboard date — Created-on or Updated-on — into last/this/next
 * week, or to a custom day. Works for EVERY stage:
 *   - field 'created' → crm_opportunity.createdAt (drives the New-Lead count +
 *     the kanban "created" date filter).
 *   - field 'updated' → crm_opportunity.lastStageChangeAt AND the current
 *     stage's latest stage-history entry (crm_stage_history.changedAt) — the
 *     latter is what the dashboard buckets Show-Up / Enrolment by, so those
 *     counts follow the chosen week; the former drives the kanban "updated"
 *     filter.
 * The dedicated Trial editor still owns the Confirmed-for-Trial (CT) date.
 */
export async function adminSetLeadDate(
  opportunityId: string,
  input: { field: LeadDateField; when: LeadWhenChoice; customDate?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { userId, tenantId } = await requireSuperAdmin()
    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId, deletedAt: null },
      select: { id: true, stageId: true, createdAt: true, lastStageChangeAt: true },
    })
    if (!opp) return { ok: false, error: 'Lead not found' }

    const current = input.field === 'created' ? opp.createdAt : (opp.lastStageChangeAt ?? opp.createdAt)
    let target: Date
    try {
      target = resolveTargetDate(current, input.when, input.customDate)
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }

    if (input.field === 'created') {
      await prisma.crm_opportunity.update({ where: { id: opp.id }, data: { createdAt: target } })
    } else {
      await prisma.crm_opportunity.update({ where: { id: opp.id }, data: { lastStageChangeAt: target } })
      const h = await prisma.crm_stage_history.findFirst({
        where: { tenantId, opportunityId, toStageId: opp.stageId },
        orderBy: { changedAt: 'desc' },
        select: { id: true },
      })
      if (h) await prisma.crm_stage_history.update({ where: { id: h.id }, data: { changedAt: target } })
    }

    void logAudit({
      tenantId, userId, action: 'UPDATE', entity: 'crm_opportunity', entityId: opportunityId,
      meta: {
        action: 'admin_set_lead_date',
        field: input.field, when: input.when,
        customDate: input.customDate ?? null, target: target.toISOString(),
      },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to set date' }
  }
}

/** Set / replace the lead's Trial Class appointment (full editor: date + slot). */
export async function adminSetTrial(
  opportunityId: string, date: string, timeSlot: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { userId, tenantId } = await requireSuperAdmin()
    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId, deletedAt: null },
      select: { contactId: true, branchId: true },
    })
    if (!opp) return { ok: false, error: 'Lead not found' }
    await prisma.$transaction((tx) =>
      replaceTrial(tx, { tenantId, userId, contactId: opp.contactId, branchId: opp.branchId, date, slot: timeSlot }),
    )
    void logAudit({
      tenantId, userId, action: 'UPDATE', entity: 'crm_opportunity', entityId: opportunityId,
      meta: { action: 'admin_set_trial', date, timeSlot },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to set trial' }
  }
}

/**
 * Remove the lead's Trial Class appointment(s) entirely — clears the trial
 * date/slot. The dashboard CT headline counts a lead's Trial Class record, so
 * deleting it makes the lead drop out of the CT count (and the Trial Class
 * schedule grid) on the next refetch.
 */
export async function adminClearTrial(
  opportunityId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { userId, tenantId } = await requireSuperAdmin()
    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId, deletedAt: null },
      select: { contactId: true },
    })
    if (!opp) return { ok: false, error: 'Lead not found' }
    const del = await prisma.crm_appointment.deleteMany({
      where: { tenantId, contactId: opp.contactId, title: 'Trial Class' },
    })
    void logAudit({
      tenantId, userId, action: 'DELETE', entity: 'crm_opportunity', entityId: opportunityId,
      meta: { action: 'admin_clear_trial', removed: del.count },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to clear trial' }
  }
}

/** Stage IDs that count as "Enrolled" for this tenant (code ENR or name "Enrolled"). */
async function enrolledStageIds(tenantId: string): Promise<string[]> {
  const rows = await prisma.crm_stage.findMany({
    where: {
      tenantId,
      OR: [{ shortCode: 'ENR' }, { name: { equals: 'Enrolled', mode: 'insensitive' } }],
    },
    select: { id: true },
  })
  return rows.map((s) => s.id)
}

/**
 * Change the enrolled package length.
 *
 * The dashboard ENR headline is driven by crm_stage_history ENTRY rows into the
 * Enrolled stage — NOT by contact.enrolledPackage. adminClearPackage deletes
 * those rows (see below), so re-picking a package here has to put one back,
 * otherwise the lead sits in the ENR column forever without ever counting again.
 * The restored row is back-dated to lastStageChangeAt so the lead lands in the
 * same dashboard week it originally enrolled in.
 */
export async function adminSetPackage(
  opportunityId: string, months: 3 | 6 | 9 | 12 | 18 | 24,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { userId, tenantId } = await requireSuperAdmin()
    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId, deletedAt: null },
      select: { contactId: true, stageId: true, lastStageChangeAt: true, createdAt: true },
    })
    if (!opp) return { ok: false, error: 'Lead not found' }

    const enrIds = await enrolledStageIds(tenantId)
    const inEnrolled = enrIds.includes(opp.stageId)

    await prisma.$transaction(async (tx) => {
      await tx.crm_contact.update({
        where: { id: opp.contactId },
        data: { enrolledPackage: `${months} months` },
      })
      if (!inEnrolled) return
      const existing = await tx.crm_stage_history.findFirst({
        where: { tenantId, opportunityId, toStageId: opp.stageId },
        select: { id: true },
      })
      if (existing) return
      await tx.crm_stage_history.create({
        data: {
          tenantId,
          opportunityId,
          fromStageId: null,
          toStageId: opp.stageId,
          changedByUserId: userId,
          note: `Enrolled — ${months}-month package (re-applied via admin panel)`,
          changedAt: opp.lastStageChangeAt ?? opp.createdAt,
        },
      })
    })

    void logAudit({
      tenantId, userId, action: 'UPDATE', entity: 'crm_contact', entityId: opp.contactId,
      meta: { action: 'admin_set_package', months, restoredEnrHistory: inEnrolled },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to set package' }
  }
}

/**
 * Remove the lead's enrolment: clears the package AND drops the lead out of the
 * dashboard ENR count.
 *
 * Clearing contact.enrolledPackage alone is NOT enough — the Leads Dashboard
 * counts ENR from crm_stage_history entries into the Enrolled stage, so a lead
 * whose package was reset kept counting toward ENR for its original date with
 * no enrolment data behind it. This mirrors what moveOpportunity already does
 * when a lead is dragged OUT of Enrolled (see `movingOutOfEnrolled`), except the
 * lead stays parked in the ENR column — the admin can re-pick a package (which
 * restores the history row) or drag it elsewhere.
 */
export async function adminClearPackage(
  opportunityId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { userId, tenantId } = await requireSuperAdmin()
    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId, deletedAt: null },
      select: { contactId: true },
    })
    if (!opp) return { ok: false, error: 'Lead not found' }

    const enrIds = await enrolledStageIds(tenantId)

    const removed = await prisma.$transaction(async (tx) => {
      await tx.crm_contact.update({ where: { id: opp.contactId }, data: { enrolledPackage: null } })
      if (enrIds.length === 0) return 0
      const del = await tx.crm_stage_history.deleteMany({
        where: { tenantId, opportunityId, toStageId: { in: enrIds } },
      })
      return del.count
    })

    void logAudit({
      tenantId, userId, action: 'UPDATE', entity: 'crm_contact', entityId: opp.contactId,
      meta: { action: 'admin_clear_package', enrHistoryRemoved: removed },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to clear package' }
  }
}

/** Stage IDs that count as "Show-Up" for this tenant (code SU or name "Show-Up"). */
async function showUpStageIds(tenantId: string): Promise<string[]> {
  const rows = await prisma.crm_stage.findMany({
    where: {
      tenantId,
      OR: [{ shortCode: 'SU' }, { name: { contains: 'show', mode: 'insensitive' } }],
    },
    select: { id: true, name: true, shortCode: true },
  })
  // The `contains 'show'` arm also catches "Showed No Enrol" (SNE), which is a
  // different funnel bucket — keep only real Show-Up stages.
  return rows
    .filter(
      (s) =>
        (s.shortCode ?? '').toUpperCase().replace(/_/g, '') === 'SU' ||
        /^show[- ]?up$/i.test(s.name),
    )
    .map((s) => s.id)
}

/**
 * Set the lead's Show-Up date — the date the dashboard buckets its SU count by.
 *
 * SU is counted from the crm_stage_history ENTRY row into the Show-Up stage, so
 * this edits that row's changedAt. Mirrors what the CT trial editor does for
 * Confirmed-for-Trial. If the lead is in SU with no history row (an import that
 * set stageId directly), one is created so the lead starts counting.
 */
export async function adminSetShowUpDate(
  opportunityId: string, date: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { userId, tenantId } = await requireSuperAdmin()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Pick a valid date' }

    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId, deletedAt: null },
      select: { stageId: true, lastStageChangeAt: true, createdAt: true },
    })
    if (!opp) return { ok: false, error: 'Lead not found' }

    const suIds = await showUpStageIds(tenantId)
    if (suIds.length === 0) return { ok: false, error: 'No Show-Up stage configured' }

    // Keep the existing time-of-day so the lead stays in the same KL day it
    // would have displayed under; only the calendar date moves.
    const existing = await prisma.crm_stage_history.findFirst({
      where: { tenantId, opportunityId, toStageId: { in: suIds } },
      orderBy: { changedAt: 'desc' },
      select: { id: true, changedAt: true },
    })

    const base = existing?.changedAt ?? opp.lastStageChangeAt ?? opp.createdAt
    const wall = new Date(base.getTime() + KL)
    const [y, m, d] = date.split('-').map(Number)
    const target = new Date(Date.UTC(y, m - 1, d, wall.getUTCHours(), wall.getUTCMinutes()) - KL)

    if (existing) {
      await prisma.crm_stage_history.update({ where: { id: existing.id }, data: { changedAt: target } })
    } else {
      const suStageId = suIds.includes(opp.stageId) ? opp.stageId : suIds[0]
      await prisma.crm_stage_history.create({
        data: {
          tenantId,
          opportunityId,
          fromStageId: null,
          toStageId: suStageId,
          changedByUserId: userId,
          note: 'Show-up recorded via admin panel',
          changedAt: target,
        },
      })
    }

    void logAudit({
      tenantId, userId, action: 'UPDATE', entity: 'crm_opportunity', entityId: opportunityId,
      meta: { action: 'admin_set_showup', date, created: !existing },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to set show-up date' }
  }
}

/**
 * Remove the lead's show-up: deletes the Show-Up entry history rows so the lead
 * drops out of the dashboard SU count.
 *
 * Same shape as adminClearPackage for ENR — clearing the signal the dashboard
 * actually counts, rather than only the cosmetic field. The lead stays in its
 * current column; re-dating via adminSetShowUpDate re-creates the row.
 */
export async function adminClearShowUp(
  opportunityId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { userId, tenantId } = await requireSuperAdmin()
    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId, deletedAt: null },
      select: { id: true },
    })
    if (!opp) return { ok: false, error: 'Lead not found' }

    const suIds = await showUpStageIds(tenantId)
    if (suIds.length === 0) return { ok: false, error: 'No Show-Up stage configured' }

    const del = await prisma.crm_stage_history.deleteMany({
      where: { tenantId, opportunityId, toStageId: { in: suIds } },
    })

    void logAudit({
      tenantId, userId, action: 'UPDATE', entity: 'crm_opportunity', entityId: opportunityId,
      meta: { action: 'admin_clear_showup', suHistoryRemoved: del.count },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to clear show-up' }
  }
}

/** Change the reschedule follow-up date. */
export async function adminSetRescheduleDate(
  opportunityId: string, date: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { userId, tenantId } = await requireSuperAdmin()
    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId, deletedAt: null },
      select: { contactId: true, branchId: true },
    })
    if (!opp) return { ok: false, error: 'Lead not found' }
    const dueAt = new Date(`${date}T09:00:00`)
    if (Number.isNaN(dueAt.getTime())) return { ok: false, error: 'Invalid date' }
    const task = await prisma.crm_task.findFirst({
      where: { tenantId, contactId: opp.contactId, title: 'Reschedule follow-up' },
      orderBy: { createdAt: 'desc' }, select: { id: true },
    })
    if (task) await prisma.crm_task.update({ where: { id: task.id }, data: { dueAt } })
    else await prisma.crm_task.create({
      data: { tenantId, branchId: opp.branchId, contactId: opp.contactId, assignedUserId: userId, title: 'Reschedule follow-up', dueAt },
    })
    void logAudit({
      tenantId, userId, action: 'UPDATE', entity: 'crm_opportunity', entityId: opportunityId,
      meta: { action: 'admin_set_reschedule', date },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to set date' }
  }
}
