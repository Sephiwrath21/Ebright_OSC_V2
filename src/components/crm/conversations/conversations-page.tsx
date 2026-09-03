'use client'

/**
 * Unified WhatsApp inbox: thread list on the left, the live chat on the right.
 *
 * Reuses LeadWhatsAppPanel so this page, the kanban lead popup and the lead
 * detail page are all the same conversation — reply from whichever is in front
 * of you and the others catch up on their next poll.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { MessageCircle, Search, Loader2, ExternalLink, Clock, CornerUpLeft } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/crm/utils'
import { LeadWhatsAppPanel } from '@/components/crm/opportunities/lead-whatsapp-panel'

interface Conversation {
  contactId: string
  opportunityId: string | null
  stageCode: string | null
  name: string
  parentName: string | null
  phone: string | null
  branchId: string
  branchName: string
  lastBody: string
  lastAt: string
  lastDirection: 'IN' | 'OUT'
  messageCount: number
  awaitingReply: boolean
  windowOpen: boolean
}

const POLL_MS = 10000

export function ConversationsPageClient() {
  const [items, setItems] = useState<Conversation[] | null>(null)
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/crm/conversations')
      if (!res.ok) { setItems([]); return }
      const data = await res.json() as { conversations: Conversation[] }
      setItems(data.conversations)
    } catch {
      setItems([])
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(t)
  }, [load])

  // Filter client-side: the list is small and it keeps typing instant.
  const q = query.trim().toLowerCase()
  const filtered = (items ?? []).filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q) ||
      (c.parentName ?? '').toLowerCase().includes(q),
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Conversations</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Every WhatsApp thread across your branches. Replies from parents land here automatically.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Thread list */}
        <aside className="flex max-h-[36rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 p-2 dark:border-slate-700">
            <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1.5 dark:border-slate-600">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or phone…"
                className="flex-1 bg-transparent text-sm text-slate-900 outline-none dark:text-white"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {items === null && (
              <p className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></p>
            )}

            {items?.length === 0 && (
              <div className="p-6 text-center">
                <MessageCircle className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-500 dark:text-slate-400">No conversations yet.</p>
                <p className="mt-1 text-xs text-slate-400">
                  Threads appear here once a branch has connected WhatsApp under{' '}
                  <Link href="/crm/integrations" className="underline">Integrations</Link> and the
                  first message is sent or received.
                </p>
              </div>
            )}

            {filtered.map((c) => (
              <button
                key={c.contactId}
                type="button"
                onClick={() => setSelected(c)}
                className={cn(
                  'block w-full border-b border-slate-100 px-3 py-2.5 text-left transition last:border-0 dark:border-slate-800',
                  selected?.contactId === c.contactId
                    ? 'bg-indigo-50 dark:bg-indigo-950/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800',
                )}
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-white">
                    {c.name}
                  </p>
                  {c.stageCode && (
                    <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                      {c.stageCode}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                  {c.lastDirection === 'OUT' && <CornerUpLeft className="mr-1 inline h-3 w-3 opacity-60" />}
                  {c.lastBody}
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">{formatDateTime(c.lastAt)}</span>
                  <span className="truncate text-[10px] text-slate-400">· {c.branchName}</span>
                  {c.awaitingReply && (
                    <span className="ml-auto shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      REPLY
                    </span>
                  )}
                  {!c.windowOpen && (
                    <Clock className="h-3 w-3 shrink-0 text-amber-500" aria-label="24h window closed" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Active thread */}
        <div>
          {selected ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{selected.name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {selected.branchName}
                    {selected.parentName && <> · parent {selected.parentName}</>}
                  </p>
                </div>
                {selected.opportunityId && (
                  <Link
                    href={`/crm/opportunities/${selected.opportunityId}`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Open lead <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
              {/* key forces a fresh panel (and fresh fetch) per thread */}
              <LeadWhatsAppPanel key={selected.contactId} contactId={selected.contactId} />
            </div>
          ) : (
            <div className="flex h-[36rem] items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
              <div className="text-center">
                <MessageCircle className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Pick a conversation to open the chat.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
