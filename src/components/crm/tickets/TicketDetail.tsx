'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, XCircle, PlayCircle, RotateCcw, Paperclip, Download, ZoomIn, X } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/crm/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { StatusBadge } from './StatusBadge'
import { TicketTimeline } from './TicketTimeline'
import { useUpdateTicketStatus, type Ticket } from '@/hooks/crm/useTickets'

// The three "open" states a manager may move a ticket between freely.
const WORKING_STATES = ['received', 'approved', 'in_progress']
const WORKING_LABELS: Record<string, string> = {
  received: 'Received',
  approved: 'Approved',
  in_progress: 'In Progress',
}

interface TicketDetailProps {
  ticket: Ticket
  canManage: boolean
  canReopen: boolean
}

export function TicketDetail({ ticket, canManage, canReopen }: TicketDetailProps) {
  const [adminRemark, setAdminRemark] = useState(ticket.admin_remark ?? '')
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  // Full-screen zoom target for an attachment image (click a thumbnail/preview).
  const [zoomUrl, setZoomUrl] = useState<string | null>(null)
  const updateStatus = useUpdateTicketStatus()

  // Each attachment is served through the auth-gated proxy route, which streams
  // Google Drive bytes inline (or 302s to a presigned S3 URL).
  const attachmentUrl = (attId: string) => `/api/crm/tickets/${ticket.id}/attachments/${attId}`
  const isImageAtt = (att: (typeof ticket.attachments)[number]) =>
    /^image\//i.test(att.mime_type ?? '') ||
    /\.(jpe?g|png|gif|webp)$/i.test(att.original_name ?? '')
  const imageAttachments = ticket.attachments.filter(isImageAtt)

  async function handleStatusChange(newStatus: string, extra?: { rejectionReason?: string }) {
    await updateStatus.mutateAsync({
      id: ticket.id,
      status: newStatus,
      adminRemark: adminRemark || undefined,
      rejectionReason: extra?.rejectionReason,
    })
    setShowRejectForm(false)
    setRejectionReason('')
  }

  const fieldEntries = Object.entries(ticket.fields ?? {})

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/crm/tickets"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Tickets
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Header */}
          <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-xl font-semibold text-slate-900 dark:text-slate-100">
                {ticket.ticket_number}
              </h1>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: ticket.platform?.accent_color ?? '#94a3b8' }}
                />
                {ticket.platform?.name ?? '—'}
              </span>
              <StatusBadge status={ticket.status} />
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                Created {formatDateTime(ticket.created_at)}
              </span>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-3">
            <InfoItem
              label="Branch"
              value={ticket.branch ? `${ticket.branch.branch_number} — ${ticket.branch.name}` : '—'}
            />
            <InfoItem label="Platform" value={ticket.platform?.name ?? '—'} />
            <InfoItem label="Sub-type" value={ticket.sub_type.replace(/_/g, ' ')} />
            <InfoItem label="Submitter ID" value={ticket.user_id.slice(0, 8)} />
            <InfoItem
              label="Assigned Admin"
              value={ticket.assigned_admin_id ? ticket.assigned_admin_id.slice(0, 8) : 'Unassigned'}
            />
            {ticket.completed_at && (
              <InfoItem label="Completed" value={formatDateTime(ticket.completed_at)} />
            )}
          </div>

          {/* Fields */}
          <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Ticket Details</h2>
            <dl className="space-y-3">
              {fieldEntries.length === 0 && (
                <p className="text-sm text-slate-500">No additional fields.</p>
              )}
              {fieldEntries.map(([key, value]) => (
                <div key={key} className="flex flex-col gap-0.5 border-b border-slate-100 pb-2 last:border-0 dark:border-slate-700">
                  <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()}
                  </dt>
                  <dd className="text-sm text-slate-900 dark:text-slate-100">
                    {typeof value === 'string' ? value : JSON.stringify(value)}
                  </dd>
                </div>
              ))}
            </dl>
            {ticket.rejection_reason && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
                <div className="text-xs font-medium text-red-700 dark:text-red-400">Rejection Reason</div>
                <div className="mt-1 text-sm text-red-900 dark:text-red-100">{ticket.rejection_reason}</div>
              </div>
            )}
            {ticket.admin_remark && (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Admin Remark</div>
                <div className="mt-1 text-sm text-slate-900 dark:text-slate-100">{ticket.admin_remark}</div>
              </div>
            )}
          </div>

          {/* Attachments */}
          {ticket.attachments.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Attachments</h2>
              <ul className="space-y-2">
                {ticket.attachments.map((att) => {
                  const url = `/api/crm/tickets/${ticket.id}/attachments/${att.id}`
                  // Detect images by MIME (when present) or filename extension so
                  // we can render an inline preview instead of a bare download
                  // link. The <img> hits the GET route, which 302-redirects to a
                  // presigned S3 URL — no CORS needed for plain image display.
                  const isImage =
                    /^image\//i.test(att.mime_type ?? '') ||
                    /\.(jpe?g|png|gif|webp)$/i.test(att.original_name ?? '')
                  return (
                    <li
                      key={att.id}
                      className="rounded-md border border-slate-200 p-3 dark:border-slate-700"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Paperclip className="h-4 w-4 text-slate-500" />
                          <div>
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{att.original_name}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {att.file_type} · {att.size_bytes ? formatBytes(att.size_bytes) : ''}
                            </div>
                          </div>
                        </div>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                          <Download className="h-4 w-4" /> Download
                        </a>
                      </div>
                      {isImage && (
                        <button
                          type="button"
                          onClick={() => setZoomUrl(url)}
                          className="group relative mt-3 block w-full cursor-zoom-in overflow-hidden rounded-md border border-slate-200 text-left dark:border-slate-700"
                          title="Click to zoom"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={att.original_name ?? 'attachment'}
                            loading="lazy"
                            className="max-h-80 w-auto max-w-full object-contain"
                          />
                          <span className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                            <ZoomIn className="h-3 w-3" /> Zoom
                          </span>
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Timeline */}
          <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Timeline</h2>
            <TicketTimeline events={ticket.events} />
          </div>
        </div>

        {/* Action sidebar */}
        {canManage && (
          <aside className="space-y-4">
            {/* Attached media — shown ABOVE the actions so the admin sees the
                evidence before deciding to Start Progress. Click to zoom. */}
            {imageAttachments.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Attached Media
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {imageAttachments.map((att) => (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => setZoomUrl(attachmentUrl(att.id))}
                      className="group relative aspect-square cursor-zoom-in overflow-hidden rounded-md border border-slate-200 dark:border-slate-700"
                      title={att.original_name ?? 'Click to zoom'}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={attachmentUrl(att.id)}
                        alt={att.original_name ?? 'attachment'}
                        loading="lazy"
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                        <ZoomIn className="h-5 w-5" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Actions</h3>

              <div className="mb-3 space-y-1">
                <Label htmlFor="adminRemark" className="text-xs">Admin Remark</Label>
                <Textarea
                  id="adminRemark"
                  value={adminRemark}
                  onChange={(e) => setAdminRemark(e.target.value)}
                  placeholder="Optional note..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                {/* Working states (Received / Approved / In Progress) move
                    freely in any direction — one button per other working
                    state — plus Complete and Reject. Reopening a terminal
                    ticket stays gated to canReopen (super_admin). */}
                {WORKING_STATES.includes(ticket.status) && (
                  <>
                    {WORKING_STATES.filter((s) => s !== ticket.status).map((s) => (
                      <Button
                        key={s}
                        variant="outline"
                        className="w-full"
                        onClick={() => handleStatusChange(s)}
                        disabled={updateStatus.isPending}
                      >
                        <PlayCircle className="mr-2 h-4 w-4" /> Move to {WORKING_LABELS[s]}
                      </Button>
                    ))}
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700"
                      onClick={() => handleStatusChange('complete')}
                      disabled={updateStatus.isPending}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Complete
                    </Button>
                    {!showRejectForm ? (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setShowRejectForm(true)}
                      >
                        <XCircle className="mr-2 h-4 w-4" /> Reject
                      </Button>
                    ) : (
                      <div className="space-y-2 rounded-md border border-red-200 p-3 dark:border-red-900">
                        <Label className="text-xs">Rejection Reason (required)</Label>
                        <Textarea
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          rows={2}
                          placeholder="Why is this being rejected?"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                              setShowRejectForm(false)
                              setRejectionReason('')
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            className="flex-1 bg-red-600 hover:bg-red-700"
                            disabled={rejectionReason.length < 5 || updateStatus.isPending}
                            onClick={() => handleStatusChange('rejected', { rejectionReason })}
                          >
                            Confirm Reject
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {canReopen && (ticket.status === 'complete' || ticket.status === 'rejected') && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleStatusChange('in_progress')}
                    disabled={updateStatus.isPending}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" /> Reopen Ticket
                  </Button>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Zoom lightbox — full-screen overlay for a clicked attachment image.
          Click the backdrop or the ✕ to close; clicking the image itself does
          not close (stopPropagation), so users can pan/right-click-save. */}
      {zoomUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setZoomUrl(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setZoomUrl(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomUrl}
            alt="Attachment"
            className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
