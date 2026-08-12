"use client";

import { useEffect, useState } from "react";
import { Eye, X, Calendar, Clock } from "lucide-react";

export interface LeaveDetail {
  displayId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
  appliedAt: string;
  reason?: string | null;
  rejectionReason?: string | null;
  requesterName?: string | null;
  departmentName?: string | null;
}

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  pending: { bg: "var(--tint-amber)", text: "var(--accent-amber-strong)", dot: "var(--accent-amber)", label: "Pending" },
  hod_approved: { bg: "var(--tint-blue)", text: "var(--status-blue-fg)", dot: "var(--accent-blue)", label: "HOD Approved" },
  approved: { bg: "var(--tint-green)", text: "var(--accent-green-strong)", dot: "var(--accent-green)", label: "Approved" },
  rejected: { bg: "var(--tint-red)", text: "var(--accent-red-strong)", dot: "var(--accent-red)", label: "Rejected" },
  cancelled: { bg: "var(--status-neutral-bg)", text: "var(--status-neutral-fg-strong)", dot: "var(--status-neutral-fg)", label: "Cancelled" },
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB");
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-t border-slate-100 dark:border-slate-800 first:border-t-0">
      <span className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400 uppercase shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-sm text-slate-800 dark:text-slate-200 text-right min-w-0">{value}</span>
    </div>
  );
}

function LeaveDetailModal({ detail, onClose }: { detail: LeaveDetail; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const badge = STATUS_STYLE[detail.status] ?? {
    bg: "var(--status-neutral-bg)",
    text: "var(--text-strong)",
    dot: "var(--text-muted-strong)",
    label: detail.status,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Leave request ${detail.displayId}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{detail.displayId}</p>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{detail.leaveTypeName}</p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ backgroundColor: badge.bg, color: badge.text }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: badge.dot }}
                aria-hidden="true"
              />
              {badge.label}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {detail.requesterName && <Row label="Employee" value={detail.requesterName} />}
          {detail.departmentName && <Row label="Department" value={detail.departmentName} />}
          <Row label="Leave Type" value={detail.leaveTypeName} />
          <Row
            label="From"
            value={
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Calendar className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                {formatDate(detail.startDate)}
              </span>
            }
          />
          <Row
            label="To"
            value={
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Calendar className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                {formatDate(detail.endDate)}
              </span>
            }
          />
          <Row
            label="Total Days"
            value={<span className="font-semibold tabular-nums">{detail.totalDays}</span>}
          />
          <Row
            label="Reason"
            value={
              detail.reason ? (
                <span className="whitespace-pre-wrap break-words">{detail.reason}</span>
              ) : (
                <span className="text-slate-400">—</span>
              )
            }
          />
          <Row
            label="Applied On"
            value={
              <span className="inline-flex items-center gap-1.5 tabular-nums text-slate-500 dark:text-slate-400">
                <Clock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                {formatDate(detail.appliedAt)}
              </span>
            }
          />

          {detail.status === "rejected" && detail.rejectionReason && (
            <div className="mt-3 rounded-xl border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900 px-4 py-3">
              <p className="text-xs font-semibold tracking-wide text-red-700 dark:text-red-300 uppercase">
                Rejection Reason
              </p>
              <p className="mt-1 text-sm text-red-900 dark:text-red-200 whitespace-pre-wrap break-words">
                {detail.rejectionReason}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Eye button that opens a modal with the full details of a leave request. */
export default function LeaveDetailButton({ detail }: { detail: LeaveDetail }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${detail.displayId}`}
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
      >
        <Eye className="w-4 h-4" aria-hidden="true" />
      </button>
      {open && <LeaveDetailModal detail={detail} onClose={() => setOpen(false)} />}
    </>
  );
}
