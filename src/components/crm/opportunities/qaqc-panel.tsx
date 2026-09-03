'use client'

import { useState } from 'react'
import { BadgeCheck, Loader2, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import { setQaqcVerified, setQaqcResult, type QaqcState, type QaqcCaps, type QaqcResult } from '@/server/actions/qaqc'

/**
 * QAQC verification panel — shown in the lead's Action sidebar (kanban detail
 * modal + the full detail page). Renders the verified status, the verified
 * date, and which account verified it. Super Admins additionally get an
 * Unverify button and can edit the verified date; Regional Manager / Operation
 * accounts can only mark a lead verified.
 */
export function QaqcPanel({
  opportunityId,
  initial,
  caps,
  onChange,
}: {
  opportunityId: string
  initial: QaqcState
  caps: QaqcCaps
  onChange?: (state: QaqcState) => void
}) {
  const [state, setState] = useState<QaqcState>(initial)
  const [busy, setBusy] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Nothing to show for accounts without QAQC access.
  if (!caps.canVerify && !state.verified) return null

  async function run(verified: boolean, dateISO?: string | null) {
    setBusy(true); setErr(null)
    const res = await setQaqcVerified(opportunityId, verified, dateISO)
    setBusy(false)
    if (!res.ok || !res.state) { setErr(res.error ?? 'Update failed'); return }
    setState(res.state)
    setEditingDate(false)
    onChange?.(res.state)
  }

  async function runResult(result: QaqcResult) {
    setBusy(true); setErr(null)
    // Clicking the active outcome again clears it back to "no result".
    const next = state.result === result ? null : result
    const res = await setQaqcResult(opportunityId, next)
    setBusy(false)
    if (!res.ok || !res.state) { setErr(res.error ?? 'Update failed'); return }
    setState(res.state)
    onChange?.(res.state)
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Kuala_Lumpur',
    })
  const dateInputValue = state.verifiedAt
    ? new Date(state.verifiedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' })
    : ''

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <BadgeCheck className="h-3.5 w-3.5" /> QAQC
      </h3>

      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
            state.verified
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
          )}
        >
          <BadgeCheck className="h-3.5 w-3.5" />
          {state.verified ? 'Verified' : 'Not verified'}
        </span>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
      </div>

      {state.verified ? (
        <div className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
          {/* Verified date — editable inline for super admins. */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Date</span>
            {editingDate && caps.canManage ? (
              <>
                <input
                  type="date"
                  defaultValue={dateInputValue}
                  onChange={(e) => { if (e.target.value) void run(true, e.target.value) }}
                  className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
                <button onClick={() => setEditingDate(false)} className="text-slate-400 hover:text-slate-600" aria-label="Cancel">
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <span className="flex items-center gap-1.5 font-medium">
                {state.verifiedAt ? fmt(state.verifiedAt) : '—'}
                {caps.canManage && (
                  <button
                    onClick={() => setEditingDate(true)}
                    className="text-slate-400 hover:text-indigo-600"
                    title="Edit verified date"
                    aria-label="Edit verified date"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">By</span>
            <span className="font-medium">{state.verifiedByName ?? '—'}</span>
          </div>

          {/* Pass / Fail outcome — settable by Super Admin / Regional Manager /
              Operation. Stored on the lead for downstream systems. */}
          {caps.canVerify && (
            <div className="pt-1">
              <span className="text-slate-400">Result</span>
              <div className="mt-1 flex gap-2">
                <button
                  onClick={() => runResult('pass')}
                  disabled={busy}
                  className={cn(
                    'inline-flex items-center rounded-lg px-3 py-1 text-xs font-semibold transition disabled:opacity-50',
                    state.result === 'pass'
                      ? 'bg-emerald-600 text-white'
                      : 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30',
                  )}
                >
                  Pass
                </button>
                <button
                  onClick={() => runResult('fail')}
                  disabled={busy}
                  className={cn(
                    'inline-flex items-center rounded-lg px-3 py-1 text-xs font-semibold transition disabled:opacity-50',
                    state.result === 'fail'
                      ? 'bg-rose-600 text-white'
                      : 'border border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/30',
                  )}
                >
                  Fail
                </button>
              </div>
            </div>
          )}

          {caps.canManage && (
            <button
              onClick={() => run(false)}
              disabled={busy}
              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/30"
            >
              Unverify
            </button>
          )}
        </div>
      ) : (
        caps.canVerify && (
          <button
            onClick={() => run(true)}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <BadgeCheck className="h-3.5 w-3.5" /> Mark verified
          </button>
        )
      )}

      {err && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{err}</p>}
    </section>
  )
}
