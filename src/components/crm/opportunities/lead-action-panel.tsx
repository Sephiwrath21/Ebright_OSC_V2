'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Package, Clock, Loader2, Check, Trash2, UserCheck } from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import {
  getLeadAdminContext,
  adminSetLeadDate,
  adminSetTrial,
  adminClearTrial,
  adminSetPackage,
  adminClearPackage,
  adminSetShowUpDate,
  adminClearShowUp,
  adminSetRescheduleDate,
  type LeadAdminContext,
  type LeadDateField,
  type LeadWhenChoice,
} from '@/server/actions/admin-lead'

const WEEKDAY_SLOTS = ['06:00 PM', '07:15 PM', '08:30 PM']
const WEEKEND_SLOTS = ['09:15 AM', '10:30 AM', '12:00 PM', '01:15 PM', '02:45 PM', '04:00 PM', '05:30 PM']
const PACKAGES: Array<3 | 6 | 9 | 12 | 18 | 24> = [3, 6, 9, 12, 18, 24]
const WHENS: Array<{ key: LeadWhenChoice; label: string }> = [
  { key: 'last', label: 'Last week' },
  { key: 'this', label: 'This week' },
  { key: 'next', label: 'Next week' },
  { key: 'custom', label: 'Custom date' },
]

function slotsForDate(iso: string): string[] {
  if (!iso) return []
  const day = new Date(`${iso}T00:00:00`).getDay()
  if (day === 6 || day === 0) return WEEKEND_SLOTS
  if (day === 3 || day === 4 || day === 5) return WEEKDAY_SLOTS
  return []
}
function slotToHHMM(slot: string): string {
  const t = slot.trim().toUpperCase()
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/)
  if (m24) return `${m24[1].padStart(2, '0')}:${m24[2]}`
  const m12 = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/)
  if (m12) {
    let h = parseInt(m12[1], 10)
    const min = m12[2] ?? '00'
    if (m12[3] === 'PM' && h !== 12) h += 12
    if (m12[3] === 'AM' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${min}`
  }
  return ''
}
function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * SUPER-ADMIN action editors for a lead, embedded in the card-detail popup's
 * "Action" sidebar tab. All writes go through SUPER_ADMIN-gated server actions;
 * on success it calls onChanged so the board refetches.
 */
export function LeadActionContent({
  opportunityId,
  onChanged,
}: {
  opportunityId: string
  onChanged: () => void
}) {
  const qc = useQueryClient()
  const [ctx, setCtx] = useState<LeadAdminContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const [date, setDate] = useState('')
  const [slot, setSlot] = useState('')
  const [rsdDate, setRsdDate] = useState('')
  const [suDate, setSuDate] = useState('')

  // Dashboard-week / custom-date control (all stages).
  const [field, setField] = useState<LeadDateField>('created')
  const [when, setWhen] = useState<LeadWhenChoice | null>(null)
  const [customDate, setCustomDate] = useState('')

  async function reload() {
    const res = await getLeadAdminContext(opportunityId)
    if (res.ok && res.ctx) {
      setCtx(res.ctx)
      if (res.ctx.trial) {
        setDate(res.ctx.trial.date)
        setSlot([...WEEKDAY_SLOTS, ...WEEKEND_SLOTS].find((s) => slotToHHMM(s) === res.ctx!.trial!.slot) ?? '')
      }
      setRsdDate(res.ctx.rescheduleDate ?? '')
      setSuDate(res.ctx.showUpDate ?? '')
      // Default the moved field to whichever one drives the current stage's
      // dashboard count: Show-Up / Enrolment count by the "updated" signal,
      // everything else by "created" (New-Lead count).
      const sc = (res.ctx.stageShort ?? '').toUpperCase()
      setField(sc === 'SU' || sc === 'ENR' ? 'updated' : 'created')
    } else setError(res.error ?? 'Failed to load')
    setLoading(false)
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId])

  const stage = (ctx?.stageShort ?? '').toUpperCase()
  const hasTrial = !!ctx?.trial
  const showTrial = stage === 'CT' || hasTrial
  const showPackage = stage === 'ENR' || !!ctx?.enrolledPackage
  // Show-Up editor: whenever the lead IS in SU, or already has a show-up on
  // record (it stays countable after the lead moves on to SNE/CNS/ENR).
  const showSU = stage === 'SU' || !!ctx?.showUpDate
  const showRSD = stage === 'RSD'
  const availableSlots = useMemo(() => slotsForDate(date), [date])

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(key); setError(null); setOk(null)
    const res = await fn()
    setBusy(null)
    if (!res.ok) { setError(res.error ?? 'Action failed'); return }
    setOk(okMsg)
    onChanged()
    // onChanged() only refetches the kanban. Every action here moves a number
    // the Leads Dashboard shows (CT / SU / ENR, and the week buckets), and that
    // lives in a separate cached query — without this, removing a show-up or an
    // enrolment leaves the dashboard displaying the pre-edit figure until it
    // happens to refetch, which reads as "the action did nothing".
    void qc.invalidateQueries({ queryKey: ['crm', 'dashboard'] })
    await reload()
    setTimeout(() => setOk(null), 2500)
  }

  if (loading) {
    return <div className="flex items-center gap-2 py-10 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
  }
  if (!ctx) {
    return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error ?? 'Not available'}</p>
  }

  const updatedHint = stage === 'SU' ? ' · moves the Show-Up count' : stage === 'ENR' ? ' · moves the Enrolment count' : ''

  return (
    <div className="space-y-5">
      {(error || ok) && (
        <div className={cn('rounded-lg px-3 py-2 text-sm', ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300')}>
          {ok ? <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" />{ok}</span> : error}
        </div>
      )}

      {/* Dashboard week — move Created-on / Updated-on into a week (or a custom
          day) so the lead counts in that week on the dashboard. All stages. */}
      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <CalendarDays className="h-3.5 w-3.5" /> Dashboard week
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Move the lead&apos;s date so it counts in the chosen week on the dashboard.
        </p>

        {/* Which date to move */}
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-xs dark:border-slate-600">
          {(['created', 'updated'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setField(f)}
              disabled={!!busy}
              className={cn(
                'px-3 py-1.5 font-medium transition disabled:opacity-60',
                field === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
              )}
            >
              {f === 'created' ? 'Created on' : 'Updated on'}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">
          {field === 'created'
            ? `Currently ${ctx.createdOn} (${ctx.createdWeek} week) · moves the New-Lead count.`
            : `Currently ${ctx.updatedOn} (${ctx.updatedWeek} week)${updatedHint}.`}
        </p>

        {/* Week / custom choice */}
        <div className="grid grid-cols-2 gap-1.5">
          {WHENS.map((w) => (
            <button
              key={w.key}
              type="button"
              disabled={!!busy}
              onClick={() => setWhen(w.key)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm transition disabled:opacity-60',
                when === w.key
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-200'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
        {when === 'custom' && (
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 scheme-light dark:scheme-dark dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
        )}

        <button
          disabled={!when || (when === 'custom' && !customDate) || !!busy}
          onClick={() =>
            run(
              'setdate',
              () => adminSetLeadDate(opportunityId, { field, when: when as LeadWhenChoice, customDate: when === 'custom' ? customDate : undefined }),
              'Dashboard date updated',
            )
          }
          className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy === 'setdate' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Apply'}
        </button>
      </section>

      {/* Trial full editor */}
      {showTrial && (
        <section className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-900 dark:bg-indigo-950/20">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <Clock className="h-3.5 w-3.5" /> Edit trial (date · day · slot)
          </h3>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => { setDate(e.target.value); if (slot && !slotsForDate(e.target.value).includes(slot)) setSlot('') }}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 scheme-light dark:scheme-dark dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-slate-500">
              Time slot
              <select
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
                disabled={!date || availableSlots.length === 0}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                <option value="">{!date ? 'Pick a date…' : availableSlots.length === 0 ? 'No classes this day' : 'Select slot'}</option>
                {availableSlots.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <button
              disabled={!date || !slot || !!busy}
              onClick={() => run('trial', () => adminSetTrial(opportunityId, date, slot), 'Trial updated')}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy === 'trial' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </button>
          </div>
          <p className="text-[11px] italic text-slate-400">Classes run Wed–Sun only.</p>
          {hasTrial && (
            <button
              disabled={!!busy}
              onClick={() => run('trial-clear', () => adminClearTrial(opportunityId), 'Trial class removed')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/30"
            >
              {busy === 'trial-clear'
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <><Trash2 className="h-3.5 w-3.5" /> Remove trial class + date</>}
            </button>
          )}
        </section>
      )}

      {/* Show-Up — the dashboard SU headline counts the stage-history entry
          into Show-Up, so editing that date re-buckets the lead and removing
          it drops the lead out of the count entirely. */}
      {showSU && (
        <section className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/40 p-3 dark:border-sky-900 dark:bg-sky-950/20">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <UserCheck className="h-3.5 w-3.5" /> Show-up date
          </h3>
          <div className="flex items-end gap-2">
            <input
              type="date"
              value={suDate}
              onChange={(e) => setSuDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 scheme-light dark:scheme-dark dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
            <button
              disabled={!suDate || !!busy}
              onClick={() => run('su', () => adminSetShowUpDate(opportunityId, suDate), 'Show-up date updated')}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700 disabled:opacity-50"
            >
              {busy === 'su' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </button>
          </div>
          {ctx.showUpDate ? (
            <>
              <p className="text-[11px] text-slate-500">
                Currently counted on <span className="font-medium">{prettyDate(ctx.showUpDate)}</span>.
              </p>
              <button
                disabled={!!busy}
                onClick={() => run('su-clear', () => adminClearShowUp(opportunityId), 'Show-up removed — SU count updated')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/30"
              >
                {busy === 'su-clear'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <><Trash2 className="h-3.5 w-3.5" /> Remove show-up</>}
              </button>
            </>
          ) : (
            <p className="text-[11px] italic text-slate-400">
              No show-up recorded — this lead isn&apos;t in the SU count. Saving a date adds it.
            </p>
          )}
        </section>
      )}

      {/* ENR package */}
      {showPackage && (
        <section className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <Package className="h-3.5 w-3.5" /> Enrollment package
          </h3>
          <div className="grid grid-cols-4 gap-2">
            {PACKAGES.map((m) => {
              const active = ctx.enrolledPackage === `${m} months`
              return (
                <button
                  key={m}
                  disabled={!!busy}
                  onClick={() => run(`pkg-${m}`, () => adminSetPackage(opportunityId, m), `Package set to ${m} months`)}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-sm font-semibold transition disabled:opacity-50',
                    active
                      ? 'border-emerald-500 bg-emerald-100 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-900 dark:text-emerald-100'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
                  )}
                >
                  {busy === `pkg-${m}` ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : `${m}mo`}
                </button>
              )
            })}
          </div>
          {ctx.enrolledPackage && (
            <button
              disabled={!!busy}
              onClick={() => run('pkg-clear', () => adminClearPackage(opportunityId), 'Enrolment removed — ENR count updated')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/30"
            >
              {busy === 'pkg-clear'
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <><Trash2 className="h-3.5 w-3.5" /> Remove enrolment</>}
            </button>
          )}
          <p className="text-[11px] italic text-slate-400">
            Removing also drops this lead from the dashboard ENR count. Re-picking a package restores it.
          </p>
        </section>
      )}

      {/* RSD date */}
      {showRSD && (
        <section className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-900 dark:bg-amber-950/20">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" /> Reschedule date
          </h3>
          <div className="flex items-end gap-2">
            <input
              type="date"
              value={rsdDate}
              onChange={(e) => setRsdDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 scheme-light dark:scheme-dark dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
            <button
              disabled={!rsdDate || !!busy}
              onClick={() => run('rsd', () => adminSetRescheduleDate(opportunityId, rsdDate), 'Reschedule date updated')}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
            >
              {busy === 'rsd' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </button>
          </div>
        </section>
      )}

    </div>
  )
}
