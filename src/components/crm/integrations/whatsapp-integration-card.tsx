'use client'

/**
 * Self-service WhatsApp connection card for the Integrations page.
 *
 * Deliberately NOT a hardcoded app-level integration: each branch pastes its
 * own WhatsApp Business credentials, they're verified against the live API,
 * then encrypted per-branch. A second branch — or, later, a second tenant —
 * connects its own number with no code change.
 */

import { useCallback, useContext, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BranchContext } from '../branch-context'
import {
  MessageCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Copy,
  Plug,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/crm/utils'

type Provider = 'META_CLOUD' | 'TWILIO'

interface WhatsAppStatus {
  branchId: string
  connected: boolean
  error: string | null
  provider: Provider | null
  summary: Record<string, string> | null
  updatedAt: string | null
  canManage: boolean
  webhookUrl: string
  verifyToken: string | null
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>
      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800">
        <code className="flex-1 truncate text-xs text-slate-700 dark:text-slate-300">{value}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
          className="shrink-0 text-slate-400 hover:text-slate-600"
        >
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, hint, type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  type?: string
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
      />
      {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
    </label>
  )
}

// ─── Connect modal ──────────────────────────────────────────────────────────

function ConnectModal({
  onClose, onConnected, branchId, branchName,
}: {
  onClose: () => void
  onConnected: (s: Partial<WhatsAppStatus> & { displayPhoneNumber?: string | null }) => void
  branchId?: string
  branchName?: string
}) {
  const [provider, setProvider] = useState<Provider>('META_CLOUD')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [accountSid, setAccountSid] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [fromNumber, setFromNumber] = useState('')

  const ready =
    provider === 'META_CLOUD'
      ? phoneNumberId.trim() && accessToken.trim() && appSecret.trim()
      : accountSid.trim() && authToken.trim() && fromNumber.trim()

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const payload =
        provider === 'META_CLOUD'
          ? { provider, branchId, phoneNumberId: phoneNumberId.trim(), wabaId: wabaId.trim() || undefined, accessToken: accessToken.trim(), appSecret: appSecret.trim() }
          : { provider, branchId, accountSid: accountSid.trim(), authToken: authToken.trim(), fromNumber: fromNumber.trim() }

      const res = await fetch('/api/crm/integrations/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json() as { error?: string; displayPhoneNumber?: string | null; verifiedName?: string | null }
      if (!res.ok) {
        setError(data.error ?? 'Could not connect')
        return
      }
      toast.success(
        data.displayPhoneNumber
          ? `WhatsApp connected — ${data.displayPhoneNumber}`
          : 'WhatsApp connected',
      )
      onConnected(data)
      onClose()
    } catch {
      setError('Network error — try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Connect WhatsApp</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Connecting <span className="font-medium text-slate-700 dark:text-slate-200">{branchName ?? 'your branch'}</span>.
          Use that branch&apos;s own WhatsApp Business account — credentials are encrypted and only
          ever used for this branch.
        </p>

        {/* Provider toggle */}
        <div className="mt-4 flex gap-2">
          {(['META_CLOUD', 'TWILIO'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { setProvider(p); setError(null) }}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition',
                provider === p
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {p === 'META_CLOUD' ? 'Meta Cloud API' : 'Twilio'}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {provider === 'META_CLOUD' ? (
            <>
              <Field
                label="Phone number ID"
                value={phoneNumberId}
                onChange={setPhoneNumberId}
                placeholder="123456789012345"
                hint="Meta dashboard → WhatsApp → API Setup. Not the phone number itself."
              />
              <Field
                label="WhatsApp Business Account ID (optional)"
                value={wabaId}
                onChange={setWabaId}
                placeholder="987654321098765"
                hint="Same API Setup page, just above the phone number. Only needed so staff can pick approved templates — sending still works without it."
              />
              <Field
                label="Permanent access token"
                value={accessToken}
                onChange={setAccessToken}
                type="password"
                hint="Business Settings → System Users → Generate token (whatsapp_business_messaging)."
              />
              <Field
                label="App secret"
                value={appSecret}
                onChange={setAppSecret}
                type="password"
                hint="App Settings → Basic → App Secret. Used to verify incoming webhooks."
              />
            </>
          ) : (
            <>
              <Field label="Account SID" value={accountSid} onChange={setAccountSid} placeholder="ACxxxxxxxx" />
              <Field label="Auth token" value={authToken} onChange={setAuthToken} type="password" />
              <Field
                label="WhatsApp number"
                value={fromNumber}
                onChange={setFromNumber}
                placeholder="+60123456789"
                hint="In E.164 format, including the country code."
              />
            </>
          )}
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready || saving}
            onClick={() => void submit()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            {saving ? 'Verifying…' : 'Verify & connect'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Card ───────────────────────────────────────────────────────────────────

export function WhatsAppIntegrationCard({ readOnly = false }: { readOnly?: boolean }) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  // Follow the CRM's global branch switcher so an elevated user connects the
  // branch they're actually looking at. Read via useContext (not the throwing
  // hook) so the card still renders if this page ever sits outside the provider.
  const branchCtx = useContext(BranchContext)
  const selectedBranchId = branchCtx?.selectedBranch?.id
  const selectedBranchName = branchCtx?.selectedBranch?.name

  const qs = selectedBranchId ? `?branchId=${encodeURIComponent(selectedBranchId)}` : ''

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/crm/integrations/whatsapp${qs}`)
      if (!res.ok) { setStatus(null); return }
      setStatus(await res.json() as WhatsAppStatus)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [qs])

  useEffect(() => { void load() }, [load])

  async function disconnect() {
    const res = await fetch(`/api/crm/integrations/whatsapp${qs}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to disconnect'); return }
    toast.success('WhatsApp disconnected — chat history kept')
    void load()
  }

  if (loading) {
    return <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />
  }

  const connected = status?.connected ?? false
  const errored = Boolean(status?.error)

  return (
    <>
      <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">WhatsApp Business</h3>
            {errored ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                <AlertCircle className="h-3 w-3" /> Error
              </span>
            ) : connected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                <XCircle className="h-3 w-3" /> Disconnected
              </span>
            )}
          </div>
        </div>

        <p className="mb-3 flex-1 text-xs text-slate-500 dark:text-slate-400">
          Connect {selectedBranchName ? <span className="font-medium text-slate-700 dark:text-slate-200">{selectedBranchName}</span> : 'this branch'}&apos;s
          own WhatsApp Business number to chat with parents from inside the CRM — every lead gets a
          conversation thread. Replies land back on the lead automatically.
        </p>

        {status?.error && (
          <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {status.error}
          </p>
        )}

        {connected && status?.summary && (
          <div className="mb-3 space-y-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <p className="font-medium">
              {status.provider === 'TWILIO' ? 'Twilio' : 'Meta Cloud API'}
            </p>
            {Object.entries(status.summary).map(([k, v]) => (
              <p key={k} className="truncate">
                <span className="text-slate-400">{k}:</span> {v}
              </p>
            ))}
          </div>
        )}

        {/* Webhook details — the branch pastes these into Meta/Twilio so replies
            reach the CRM. Only meaningful once credentials exist. */}
        {connected && status && (
          <div className="mb-3 space-y-2">
            <CopyRow label="Callback URL" value={status.webhookUrl} />
            {status.verifyToken && <CopyRow label="Verify token" value={status.verifyToken} />}
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Paste these into Meta → WhatsApp → Configuration <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {!readOnly && status?.canManage && (
          <div className="flex gap-2">
            {connected ? (
              <>
                <button
                  onClick={() => setModalOpen(true)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Update details
                </button>
                <button
                  onClick={() => void disconnect()}
                  className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
                >
                  <Plug className="h-3.5 w-3.5" /> Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                <Plug className="h-3.5 w-3.5" /> Connect
              </button>
            )}
          </div>
        )}

        {!status?.canManage && (
          <p className="text-[11px] italic text-slate-400">
            Ask your branch manager to connect WhatsApp for this branch.
          </p>
        )}
      </div>

      {modalOpen && (
        <ConnectModal
          onClose={() => setModalOpen(false)}
          onConnected={() => void load()}
          branchId={selectedBranchId}
          branchName={selectedBranchName}
        />
      )}
    </>
  )
}
