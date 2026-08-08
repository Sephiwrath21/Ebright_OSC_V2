'use client'

/**
 * Per-lead WhatsApp conversation, shown in the kanban lead popup.
 *
 * Sends through whatever number THIS lead's branch connected in Integrations —
 * there is no shared/app-level number. Inbound replies arrive via the branch's
 * webhook and are written to crm_message, so they show up here on the next poll.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Send, AlertCircle, MessageCircle, Clock, FileText, X } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/crm/utils'

interface WhatsAppTemplate {
  name: string
  language: string
  category: string
  bodyText: string
  variableCount: number
}

interface ThreadMessage {
  id: string
  direction: 'IN' | 'OUT'
  body: string
  subject: string | null
  status: string
  errorMessage: string | null
  createdAt: string
}

interface ThreadResponse {
  messages: ThreadMessage[]
  phone: string | null
  connected: boolean
  provider: 'META_CLOUD' | 'TWILIO' | null
  windowOpen: boolean
  windowExpiresAt: string | null
}

/** How often to re-poll for inbound replies while the popup is open. */
const POLL_MS = 5000

export function LeadWhatsAppPanel({ contactId }: { contactId: string }) {
  const [thread, setThread] = useState<ThreadResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Template state — only fetched when the composer needs it (window closed or
  // the user opens the picker), so a normal reply costs no extra API calls.
  const [templates, setTemplates] = useState<WhatsAppTemplate[] | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [chosen, setChosen] = useState<WhatsAppTemplate | null>(null)
  const [vars, setVars] = useState<string[]>([])

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}/messages?channel=WHATSAPP`)
      if (!res.ok) return
      setThread(await res.json() as ThreadResponse)
    } catch {
      // Transient network blip — the next poll will recover.
    } finally {
      setLoading(false)
    }
  }, [contactId])

  useEffect(() => {
    void load(true)
    const t = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(t)
  }, [load])

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [thread?.messages.length])

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch(`/api/crm/whatsapp/templates?contactId=${encodeURIComponent(contactId)}`)
      const data = await res.json() as { templates?: WhatsAppTemplate[]; error?: string }
      setTemplates(data.templates ?? [])
      setTemplateError(data.error ?? null)
    } catch {
      setTemplates([])
      setTemplateError('Could not load templates')
    }
  }, [contactId])

  // Pre-fetch as soon as we know the window is shut — that's exactly when the
  // branch has no other way to reach the parent.
  useEffect(() => {
    if (thread && !thread.windowOpen && templates === null) void loadTemplates()
  }, [thread, templates, loadTemplates])

  /** Fill {{1}}, {{2}} … so the user sees what the parent will actually get. */
  function renderPreview(t: WhatsAppTemplate, values: string[]): string {
    return t.bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n: string) => {
      const v = values[Number(n) - 1]
      return v && v.trim() ? v : `{{${n}}}`
    })
  }

  function chooseTemplate(t: WhatsAppTemplate) {
    setChosen(t)
    setVars(Array.from({ length: t.variableCount }, () => ''))
    setPickerOpen(false)
  }

  async function send() {
    // Template send — body carries the filled-in preview so the thread shows
    // what the parent actually received, not the raw {{1}} skeleton.
    if (chosen) {
      if (vars.some((v) => !v.trim())) {
        toast.error('Fill in every template value first')
        return
      }
      setSending(true)
      try {
        const res = await fetch(`/api/crm/contacts/${contactId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: 'WHATSAPP',
            direction: 'OUT',
            body: renderPreview(chosen, vars),
            templateName: chosen.name,
            templateLanguage: chosen.language,
            templateVars: Object.fromEntries(vars.map((v, i) => [String(i + 1), v])),
          }),
        })
        const data = await res.json() as { error?: string }
        if (!res.ok) toast.error(data.error ?? 'Template failed to send')
        else { setChosen(null); setVars([]) }
        await load()
      } catch {
        toast.error('Network error — message not sent')
      } finally {
        setSending(false)
      }
      return
    }

    const body = draft.trim()
    if (!body) return
    setSending(true)
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'WHATSAPP', direction: 'OUT', body }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? 'Message failed to send')
      } else {
        setDraft('')
      }
      await load()
    } catch {
      toast.error('Network error — message not sent')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!thread?.connected) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/20">
        <p className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
          <AlertCircle className="h-4 w-4" /> WhatsApp isn&apos;t connected for this branch
        </p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          A branch manager can connect the branch&apos;s own WhatsApp Business number under{' '}
          <a href="/crm/integrations" className="font-medium underline">Integrations</a>. Until then
          messages can&apos;t be sent from the CRM.
        </p>
      </div>
    )
  }

  if (!thread.phone) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        This lead has no phone number, so there&apos;s nothing to message. Add one in the lead details first.
      </div>
    )
  }

  return (
    <div className="flex h-[28rem] flex-col overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
          <MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> {thread.phone}
        </p>
        {/* WhatsApp only allows free text within 24h of the parent's last reply.
            Surfacing it here stops branch staff typing into a void. */}
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
            thread.windowOpen
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
          )}
        >
          <Clock className="h-3 w-3" />
          {thread.windowOpen ? '24h window open' : 'Window closed — template only'}
        </span>
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-white p-3 dark:bg-slate-900">
        {thread.messages.length === 0 && (
          <p className="py-12 text-center text-xs text-slate-400">
            No WhatsApp messages with this parent yet.
          </p>
        )}
        {thread.messages.map((m) => (
          <div key={m.id} className={cn('flex', m.direction === 'OUT' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[80%] rounded-xl px-3 py-2 text-sm',
                m.direction === 'OUT'
                  ? m.status === 'failed'
                    ? 'rounded-br-sm bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200'
                    : 'rounded-br-sm bg-emerald-600 text-white'
                  : 'rounded-bl-sm bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
              )}
            >
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p
                className={cn(
                  'mt-1 text-[10px]',
                  m.direction === 'OUT' && m.status !== 'failed' ? 'text-emerald-100' : 'text-slate-400',
                )}
              >
                {formatDateTime(m.createdAt)}
                {m.direction === 'OUT' && m.status !== 'sent' && (
                  <span className="ml-1 opacity-80">· {m.status}</span>
                )}
              </p>
              {m.errorMessage && (
                <p className="mt-1 text-[10px] font-medium text-red-700 dark:text-red-300">{m.errorMessage}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        {!thread.windowOpen && !chosen && (
          <p className="mb-1.5 px-1 text-[11px] text-amber-600 dark:text-amber-400">
            The parent hasn&apos;t replied in the last 24 hours — WhatsApp will reject plain text.
            Use an approved template to reach out first.
          </p>
        )}

        {/* Template picker list */}
        {pickerOpen && (
          <div className="mb-2 max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
            {templates === null && (
              <p className="p-3 text-center text-xs text-slate-400">
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              </p>
            )}
            {templates?.length === 0 && (
              <p className="p-3 text-xs text-slate-500 dark:text-slate-400">
                No approved templates found.{' '}
                {templateError
                  ? templateError
                  : 'Add the WhatsApp Business Account ID under Integrations, and make sure at least one template is approved in Meta.'}
              </p>
            )}
            {templates?.map((t) => (
              <button
                key={`${t.name}-${t.language}`}
                type="button"
                onClick={() => chooseTemplate(t)}
                className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
              >
                <p className="text-xs font-medium text-slate-800 dark:text-slate-100">
                  {t.name}{' '}
                  <span className="font-normal text-slate-400">
                    · {t.language} · {t.category.toLowerCase()}
                  </span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">{t.bodyText}</p>
              </button>
            ))}
          </div>
        )}

        {/* Chosen template — fill in its variables, preview what the parent gets */}
        {chosen && (
          <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 dark:border-emerald-900 dark:bg-emerald-950/20">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
                <FileText className="mr-1 inline h-3.5 w-3.5" />
                {chosen.name} <span className="font-normal opacity-70">· {chosen.language}</span>
              </p>
              <button
                type="button"
                onClick={() => { setChosen(null); setVars([]) }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {vars.map((v, i) => (
              <input
                key={i}
                value={v}
                onChange={(e) => setVars((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`Value for {{${i + 1}}}`}
                className="mb-1.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            ))}
            <p className="rounded-md bg-white px-2 py-1.5 text-[11px] italic text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              {renderPreview(chosen, vars)}
            </p>
          </div>
        )}

        <div className="flex items-end gap-2">
          {!chosen && (
            <>
              <button
                type="button"
                title="Use an approved template"
                onClick={() => {
                  setPickerOpen((o) => !o)
                  if (templates === null) void loadTemplates()
                }}
                className="flex h-[52px] w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <FileText className="h-4 w-4" />
              </button>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
                }}
                rows={2}
                disabled={!thread.windowOpen}
                placeholder={
                  thread.windowOpen
                    ? 'Type a message… (Enter to send, Shift+Enter for a new line)'
                    : 'Outside the 24-hour window — pick a template instead'
                }
                className="min-h-[52px] flex-1 resize-none rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-800/50"
              />
            </>
          )}
          <button
            type="button"
            disabled={sending || (chosen ? vars.some((v) => !v.trim()) : !draft.trim() || !thread.windowOpen)}
            onClick={() => void send()}
            className={cn(
              'flex h-[52px] items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50',
              chosen && 'flex-1',
            )}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {chosen && (sending ? 'Sending…' : 'Send template')}
          </button>
        </div>
      </div>
    </div>
  )
}
