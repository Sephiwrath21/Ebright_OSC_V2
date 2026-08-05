"use client";

import { useEffect, useState, useTransition } from "react";
import { X, CheckCircle2, AlertCircle, Trash2, ShieldCheck } from "lucide-react";
import {
  saveMyJustification,
  withdrawMyJustification,
} from "@/app/attendance/justifications/actions";

export interface SelfJustificationTarget {
  /** YYYY-MM-DD (MYT). */
  date: string;
  /** "absent" | "late" — what we're justifying. */
  state: "absent" | "late";
  /** Existing reason text, if any. */
  existingReason: string | null;
  /** pending | approved | rejected | null. */
  existingStatus: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending HR review", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "Rejected", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

export default function SelfJustificationModal({
  target,
  onClose,
  onSaved,
}: {
  target: SelfJustificationTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setReason(target.existingReason ?? "");
    setError(null);
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!target) return null;

  const status = target.existingStatus;
  const isApproved = status === "approved";
  const isEdit = Boolean(target.existingReason);
  const statusMeta = status ? STATUS_META[status] : null;

  const onSave = () => {
    setError(null);
    if (!reason.trim()) {
      setError("Reason is required");
      return;
    }
    const fd = new FormData();
    fd.set("date", target.date);
    fd.set("reason", reason.trim());
    startTransition(async () => {
      const res = await saveMyJustification(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
      onClose();
    });
  };

  const onWithdraw = () => {
    setError(null);
    const fd = new FormData();
    fd.set("date", target.date);
    startTransition(async () => {
      const res = await withdrawMyJustification(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
      onClose();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 px-5 py-4 border-b border-slate-200">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">
              {isEdit ? "Your justification" : "Justify attendance"}
            </h2>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              <span className="capitalize">{target.state}</span>
              <span className="ml-1 text-slate-400">· {target.date}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {statusMeta && (
            <div className={`flex items-center gap-2 text-xs font-semibold rounded-xl px-3 py-2 border ${statusMeta.cls}`}>
              <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              {statusMeta.label}
            </div>
          )}

          <div>
            <label htmlFor="self-just-reason" className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Reason
            </label>
            <textarea
              id="self-just-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              autoFocus
              disabled={isApproved}
              placeholder="Explain this day — e.g. off-site visit, scanner was down, approved medical leave without MC…"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none disabled:bg-slate-50 disabled:text-slate-500"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              {isApproved
                ? "HR has approved this justification — it can no longer be changed."
                : "Sent to HR for approval. It stays pending until they review it."}
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm rounded-xl px-3 py-2.5 font-medium bg-rose-50 text-rose-700 border border-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 bg-slate-50 border-t border-slate-200">
          {isEdit && status === "pending" ? (
            <button
              type="button"
              onClick={onWithdraw}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Withdraw
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="h-9 px-3 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Close
            </button>
            {!isApproved && (
              <button
                type="button"
                onClick={onSave}
                disabled={isPending || !reason.trim()}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                {isPending ? "Saving…" : isEdit ? "Update" : "Submit"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
