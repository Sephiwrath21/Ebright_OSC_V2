"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, Hourglass, UserPlus, X } from "lucide-react";
import { formatProbationReminder } from "@/lib/probationReminderText";

const APPROVAL_ROLES = new Set(["superadmin"]);
const INDUCTION_ROLES = new Set(["superadmin", "admin", "hr", "od"]);
const PROBATION_DECISION_ROLES = new Set(["hr", "superadmin"]);

// Read-tracking for probation reminders — localStorage, per-browser (2026-08-25,
// see conversation: explicit decision, DB table rejected in favor of this
// simpler option, accepting that a cache clear or new device shows everything
// as unread again). Deliberately separate from the Probation summary card's
// own red dot (EmployeeOverviewView.tsx's probationReminderNames prop, a
// server-rendered value from a completely different fetch) — nothing here
// touches that, so the dot keeps reflecting every currently-pending candidate
// regardless of what's been "read" in the bell.
//
// Keyed by candidateId + endDate, not just candidateId: if a probation gets
// extended (a new end_date), the old marker no longer matches and the
// reminder naturally becomes unread again — no manual cleanup needed. A
// confirmed/resolved candidate just stops appearing in probationCandidates at
// all (existing rule), leaving its marker an unused, harmless entry.
const PROBATION_READ_STORAGE_KEY = "ebright-probation-reminder-read";

function probationReadMarkerKey(candidateId: number, endDate: string): string {
  return `${candidateId}:${endDate}`;
}

function loadProbationReadMarkers(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(PROBATION_READ_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveProbationReadMarkers(markers: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROBATION_READ_STORAGE_KEY, JSON.stringify([...markers]));
  } catch {
    // storage full/blocked — no-op; worst case the badge just keeps counting it
  }
}

interface Counts {
  approvals: number;
  inductionRequests: number;
}

export default function NotificationBell({ role }: { role?: string }) {
  const normalizedRole = (role ?? "").toLowerCase();
  const showApprovals = APPROVAL_ROLES.has(normalizedRole);
  const showInductionRequests = INDUCTION_ROLES.has(normalizedRole);
  const shouldShow = showApprovals || showInductionRequests;

  const showProbationDecisions = PROBATION_DECISION_ROLES.has(normalizedRole);

  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [leaveCount, setLeaveCount] = useState(0);
  const [probationCandidates, setProbationCandidates] = useState<{ id: number; fullName: string; endDate: string }[]>([]);
  const [probationReadMarkers, setProbationReadMarkers] = useState<Set<string>>(() => loadProbationReadMarkers());
  const containerRef = useRef<HTMLDivElement>(null);

  // Marks one candidate read in localStorage and in local state together —
  // used both by "open the panel" (marks everything currently shown) and by
  // clicking directly into a specific candidate's Review link.
  const markProbationCandidateRead = (candidate: { id: number; endDate: string }) => {
    setProbationReadMarkers((prev) => {
      const next = new Set(prev);
      next.add(probationReadMarkerKey(candidate.id, candidate.endDate));
      saveProbationReadMarkers(next);
      return next;
    });
  };

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

  // Probation reminders — starting 3 days before a Full-Time employee's
  // probation end date, per explicit decision (see conversation). Same
  // computeProbationReminderCandidates rule as the Probation summary card's
  // own red dot. One entry per candidate, not just a count — see this
  // route's own comment.
  useEffect(() => {
    if (!showProbationDecisions) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/probation/pending-decisions/count", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { candidates?: { id: number; fullName: string; endDate: string }[] };
        if (!cancelled && Array.isArray(data.candidates)) setProbationCandidates(data.candidates);
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
  }, [showProbationDecisions]);

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

  // Unread-only figure for the badge (see markProbationCandidateRead above) —
  // separate from hasAnyContent below, which decides whether the panel shows
  // its empty state. A read-but-still-pending candidate no longer counts
  // toward the badge, but still renders in the panel when opened.
  const unreadProbationCandidates = probationCandidates.filter(
    (c) => !probationReadMarkers.has(probationReadMarkerKey(c.id, c.endDate)),
  );
  const totalCount = count + leaveCount + unreadProbationCandidates.length;
  const hasAnyContent = count > 0 || leaveCount > 0 || probationCandidates.length > 0;

  // Opening the panel marks every candidate CURRENTLY shown as read — per
  // explicit decision (see conversation), same trigger as clicking directly
  // into one candidate's own Review link below.
  const handleToggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next && probationCandidates.length > 0) {
        setProbationReadMarkers((prevMarkers) => {
          const merged = new Set(prevMarkers);
          for (const c of probationCandidates) merged.add(probationReadMarkerKey(c.id, c.endDate));
          saveProbationReadMarkers(merged);
          return merged;
        });
      }
      return next;
    });
  };

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
        onClick={handleToggle}
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

          {!hasAnyContent ? (
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

              {/* One row per candidate, per explicit decision (see
                  conversation, 2026-08-25) — was one shared block with one
                  shared "Review" button linking to the general Probation
                  list; each candidate now gets their own row and their own
                  Review link straight to their own profile, since "Review"
                  for one specific person's reminder should never require
                  finding them again in a list. */}
              {probationCandidates.map((c) => (
                <div key={c.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900 flex items-center justify-center shrink-0 ring-1 ring-inset ring-red-200 dark:ring-red-700">
                      <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">Probation ending soon</p>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400 leading-snug">
                        {formatProbationReminder(c.fullName, c.endDate)}
                      </p>
                      <div className="mt-3">
                        <Link
                          href={`/employee-folder/probation/employee/${c.id}`}
                          onClick={() => {
                            markProbationCandidateRead(c);
                            setOpen(false);
                          }}
                          className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                        >
                          Review
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
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
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">{title}</p>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="shrink-0 -mt-0.5 -mr-1 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400 leading-snug">{description}</p>
          <div className="mt-3 flex items-center gap-2">
            <Link
              href={actionHref}
              onClick={onDismiss}
              className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 shadow-sm"
            >
              {actionLabel}
            </Link>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex items-center justify-center h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
