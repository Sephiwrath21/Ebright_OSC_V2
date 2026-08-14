"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  Home,
  ChevronRight,
  Check,
  X,
  CircleAlert,
} from "lucide-react";
import { approveUser, rejectUser } from "@/app/approvals/actions";

export interface PendingRow {
  id: number;
  email: string;
  fullName: string | null;
  position: string | null;
  branchCode: string | null;
  branchName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  createdAt: string;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function getInitials(source: string): string {
  const base = source.includes("@") ? source.split("@")[0] : source;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export default function ApprovalsView({ pending }: { pending: PendingRow[] }) {
  const router = useRouter();
  const [rejectTarget, setRejectTarget] = useState<PendingRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startAction] = useTransition();

  useEffect(() => {
    if (!rejectTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) setRejectTarget(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rejectTarget, isPending]);

  const handleApprove = (row: PendingRow) => {
    setActionError(null);
    startAction(async () => {
      const res = await approveUser(row.id);
      if (!res.ok) setActionError(res.error ?? "Could not approve.");
      else router.refresh();
    });
  };

  const handleReject = () => {
    if (!rejectTarget) return;
    setActionError(null);
    const id = rejectTarget.id;
    startAction(async () => {
      const res = await rejectUser(id);
      if (!res.ok) {
        setActionError(res.error ?? "Could not reject.");
      } else {
        setRejectTarget(null);
        router.refresh();
      }
    });
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Approvals</span>
        </nav>

        <header className="flex items-end justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Account Approvals</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {pending.length === 0
                ? "No pending sign-ups to review."
                : `${pending.length} pending ${pending.length === 1 ? "registration" : "registrations"} to review.`}
            </p>
          </div>
        </header>

        {actionError && (
          <div role="alert" className="mb-5 flex items-start gap-2 p-3 rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900 text-sm text-red-800 dark:text-red-200">
            <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{actionError}</span>
          </div>
        )}

        {pending.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm px-6 py-20 text-center">
            <h3 className="text-base font-medium text-slate-900 dark:text-slate-100">All caught up</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              New sign-ups will appear here for your review.
            </p>
          </div>
        ) : (
          <ul className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {pending.map((p) => {
              const orgUnit = p.branchCode
                ? `${p.branchCode} — ${p.branchName ?? ""}`
                : p.departmentCode
                  ? `${p.departmentCode} — ${p.departmentName ?? ""}`
                  : null;
              const metaParts = [
                p.position,
                orgUnit,
                `Joined ${formatDateTime(p.createdAt)}`,
              ].filter(Boolean) as string[];
              return (
                <li key={p.id} className="px-5 py-4 flex items-center gap-4 flex-wrap hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors">
                  <span className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 text-white font-semibold text-base flex items-center justify-center shrink-0">
                    {getInitials(p.fullName ?? p.email)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{p.fullName ?? p.email}</div>
                    <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400 truncate">{p.email}</div>
                    <div className="mt-1 text-xs text-slate-400 truncate">
                      {metaParts.join("  ·  ")}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setRejectTarget(p)}
                      disabled={isPending}
                      className="inline-flex items-center justify-center gap-1.5 h-10 min-w-[110px] px-4 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprove(p)}
                      disabled={isPending}
                      className="inline-flex items-center justify-center gap-1.5 h-10 min-w-[110px] px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <Check className="w-4 h-4" aria-hidden="true" />
                      Approve
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => !isPending && setRejectTarget(null)}
            disabled={isPending}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm focus:outline-none"
          />
          <div role="dialog" aria-modal="true" className="relative w-full max-w-md bg-white dark:bg-slate-900 dark:ring-1 dark:ring-white/10 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900 flex items-center justify-center shrink-0">
                  <CircleAlert className="w-5 h-5 text-red-600 dark:text-red-400" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Reject registration?</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Confirm to permanently delete the registration for <span className="font-semibold text-slate-900 dark:text-slate-100">{rejectTarget.fullName ?? rejectTarget.email}</span>. All their data will be removed from the database. This cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                disabled={isPending}
                className="h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={isPending}
                className="h-10 px-4 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isPending ? "Rejecting..." : "Reject & Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
