"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, Hourglass, UserPlus, X } from "lucide-react";

const APPROVAL_ROLES = new Set(["superadmin"]);
const INDUCTION_ROLES = new Set(["superadmin", "admin", "hr", "od"]);

interface Counts {
  approvals: number;
  inductionRequests: number;
}

export default function NotificationBell({ role }: { role?: string }) {
  const normalizedRole = (role ?? "").toLowerCase();
  const showApprovals = APPROVAL_ROLES.has(normalizedRole);
  const showInductionRequests = INDUCTION_ROLES.has(normalizedRole);
  const shouldShow = showApprovals || showInductionRequests;

  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [leaveCount, setLeaveCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shouldShow) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [a, b] = await Promise.all([
          showApprovals
            ? fetch("/api/approvals/count", { cache: "no-store" }).then((r) =>
                r.ok ? (r.json() as Promise<{ count?: number }>) : { count: 0 },
              )
            : Promise.resolve({ count: 0 }),
          showInductionRequests
            ? fetch("/api/induction-requests/count", { cache: "no-store" }).then((r) =>
                r.ok ? (r.json() as Promise<{ count?: number }>) : { count: 0 },
              )
            : Promise.resolve({ count: 0 }),
        ]);
        if (cancelled) return;
        // NOTE: induction-request count (`b`) is fetched but not currently
        // surfaced in the UI below — only the approvals count is rendered.
        // Wire up an induction notification card here if/when that's needed.
        setCount(typeof a.count === "number" ? a.count : 0);
      } catch {
        // network flake — no-op
      }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [shouldShow, showApprovals, showInductionRequests]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/leave/approvals/count", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        if (!cancelled && typeof data.count === "number") setLeaveCount(data.count);
      } catch {
        // network flake — no-op
      }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const totalCount = count + leaveCount;
  const leaveMessage =
    role === "hr"
      ? leaveCount === 1
        ? "1 leave request was recently approved."
        : `${leaveCount} leave requests were recently approved.`
      : leaveCount === 1
        ? "1 leave request is awaiting your review."
        : `${leaveCount} leave requests are awaiting your review.`;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={totalCount > 0 ? `Notifications: ${totalCount} pending` : "Notifications"}
        className={`relative inline-flex items-center justify-center w-10 h-10 rounded-full text-slate-800 dark:text-slate-300 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
          open ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
      >
        <span className="relative inline-flex">
          <Bell className="w-6 h-6" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
          {totalCount > 0 && (
            <span
              aria-hidden="true"
              className="ring-2 ring-white dark:ring-slate-900"
              style={{
                position: "absolute",
                top: "-6px",
                right: "-6px",
                minWidth: "18px",
                height: "18px",
                padding: "0 5px",
                borderRadius: "9999px",
                backgroundColor: "#dc2626",
                color: "#ffffff",
                fontSize: "10px",
                fontWeight: 700,
                lineHeight: 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              {totalCount > 99 ? "99+" : totalCount}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-[22rem] bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 dark:ring-1 dark:ring-white/10 z-50 overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {totalCount === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Bell className="w-5 h-5 text-slate-400" aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">You&apos;re all caught up</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">New notifications will show up here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {showApprovals && count > 0 && (
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900 flex items-center justify-center shrink-0 ring-1 ring-inset ring-amber-200 dark:ring-amber-700">
                      <Hourglass className="w-5 h-5 text-amber-600 dark:text-amber-300" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">Account approval</p>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400 leading-snug">
                        {count === 1
                          ? "1 registration is waiting for your approval."
                          : `${count} registrations are waiting for your approval.`}
                      </p>
                      <div className="mt-3">
                        <Link
                          href="/approvals"
                          onClick={() => setOpen(false)}
                          className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                        >
                          Review
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {leaveCount > 0 && (
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900 flex items-center justify-center shrink-0 ring-1 ring-inset ring-amber-200 dark:ring-amber-700">
                      <Hourglass className="w-5 h-5 text-amber-600 dark:text-amber-300" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                        {role === "hr" ? "Approved leave" : "Leave approvals"}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400 leading-snug">{leaveMessage}</p>
                      <div className="mt-3">
                        <Link
                          href="/attendance/leave/approvals"
                          onClick={() => setOpen(false)}
                          className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                        >
                          Review
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  iconBg,
  iconColor,
  Icon,
  title,
  description,
  actionHref,
  actionLabel,
  onDismiss,
}: {
  iconBg: string;
  iconColor: string;
  Icon: typeof Bell;
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
  onDismiss: () => void;
}) {
  return (
    <div className="p-4">
      <div className="flex items-start gap-3">
        <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ring-1 ring-inset ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900 leading-snug">{title}</p>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="shrink-0 -mt-0.5 -mr-1 p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-0.5 text-sm text-slate-500 leading-snug">{description}</p>
          <div className="mt-3 flex items-center gap-2">
            <Link
              href={actionHref}
              onClick={onDismiss}
              className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 shadow-sm"
            >
              {actionLabel}
            </Link>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex items-center justify-center h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
