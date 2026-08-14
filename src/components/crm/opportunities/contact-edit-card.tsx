'use client'

// Editable Email + Parent's Contact (phone) for the lead detail. Mirrors the
// StudentEditCard pattern: read-only rows with an inline Edit toggle; saving
// PATCHes /api/crm/contacts/[id]. The server records a change-log note
// ("Email changed from X to Y · by <user>") so the edit is visible in Notes.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Phone, PenLine, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ContactEditCardProps {
  contactId: string
  email: string | null
  phone: string | null
}

export function ContactEditCard({ contactId, email, phone }: ContactEditCardProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({ email: email ?? '', phone: phone ?? '' })

  function resetAndOpen() {
    setDraft({ email: email ?? '', phone: phone ?? '' })
    setOpen(true)
  }

  async function save() {
    if (saving) return
    const nextEmail = draft.email.trim()
    // Light client-side email check — the server validates strictly.
    if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      toast.error('Enter a valid email address')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: nextEmail, phone: draft.phone.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Failed to save')
      }
      toast.success('Contact details updated')
      setOpen(false)
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (open) {
    return (
      <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-2.5 dark:border-indigo-900 dark:bg-indigo-950/20">
        <label className="block">
          <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Email</span>
          <input
            type="email"
            value={draft.email}
            onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            disabled={saving}
            placeholder="parent@example.com"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Parent&apos;s Contact</span>
          <input
            type="tel"
            value={draft.phone}
            onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            disabled={saving}
            placeholder="01X-XXX XXXX"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
        </label>
        <div className="flex justify-end gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={saving}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-slate-400"><Mail className="h-3.5 w-3.5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Email</p>
          <p className="truncate text-slate-700 dark:text-slate-200">{email || '—'}</p>
        </div>
        <button
          type="button"
          onClick={resetAndOpen}
          title="Edit email & contact"
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
        >
          <PenLine className="h-3 w-3" /> Edit
        </button>
      </div>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-slate-400"><Phone className="h-3.5 w-3.5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Parent&apos;s Contact</p>
          <p className="truncate text-slate-700 dark:text-slate-200">{phone || '—'}</p>
        </div>
      </div>
    </div>
  )
}
