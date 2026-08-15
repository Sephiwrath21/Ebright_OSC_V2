"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  FileText,
  Clock,
  CheckCircle2,
  Wallet,
  Banknote,
  Inbox,
  Eye,
} from "lucide-react";
import DonutChart, { type DonutSegment } from "@/app/components/DonutChart";
import BarChart, { type BarDatum } from "@/app/components/BarChart";
import ToDoList from "@/app/components/ToDoList";
import { CLAIM_TYPE_SHORT_LABELS } from "@/app/claim/claim-types";
import GreetingHeader from "./GreetingHeader";

interface ClaimRow {
  claimId: number;
  displayId: string;
  employeeName: string;
  claimType: string;
  amount: number;
  claimDate: string;
  status: string;
}

interface FinanceData {
  success: boolean;
  counts: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    disbursed: number;
    received: number;
  };
  approvedAmount: number;
  pendingAmount: number;
  pending: ClaimRow[];
  recent: ClaimRow[];
  byMonth: { month: string; count: number; amount: number }[];
  byType: { type: string; count: number; amount: number }[];
  headcountByDepartment: { label: string; count: number }[];
  headcountByBranch: { label: string; count: number }[];
  totalHeadcount: number;
}

const STATUS_META = [
  { key: "pending", label: "Pending", color: "#F59E0B" },
  { key: "approved", label: "Approved", color: "#10B981" },
  { key: "rejected", label: "Rejected", color: "#EF4444" },
  { key: "disbursed", label: "Disbursed", color: "#A855F7" },
  { key: "received", label: "Received", color: "#14B8A6" },
] as const;

const TYPE_COLORS: Record<string, string> = {
  sales: "#3B82F6",
  health: "#10B981",
  transport: "#F59E0B",
  sales_incentive: "#8B5CF6",
  renewal_incentive: "#EC4899",
  ot: "#14B8A6",
  branch_rank_reward: "#F97316",
  jackpot: "#EAB308",
  class: "#6366F1",
  roadshow: "#D946EF",
  showcase: "#0EA5E9",
  internship: "#84CC16",
  part_time: "#06B6D4",
  rm_incentive: "#7C3AED",
  trainer: "#F43F5E",
  referral: "#16A34A",
};

// bg/text use theme-aware CSS vars (globals.css) so the badge flips with
// dark mode; `dot` colours are the fixed pending/approved/rejected/disbursed
// series-identity colours (kept literal, matching STATUS_META/DonutChart).
// "disbursed" has no exact off-table match for its pale violet tint — mapped
// to the nearest --status-violet-* pair (reported: not byte-identical to the
// original #FAF5FF/#6B21A8, but same hue family).
const STATUS_BADGE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  pending: { bg: "var(--tint-amber)", text: "var(--accent-amber-strong)", dot: "#F59E0B", label: "Pending" },
  approved: { bg: "var(--tint-green)", text: "var(--accent-green-strong)", dot: "#10B981", label: "Approved" },
  rejected: { bg: "var(--tint-red)", text: "var(--accent-red-strong)", dot: "#EF4444", label: "Rejected" },
  disbursed: { bg: "var(--status-violet-bg)", text: "var(--status-violet-fg)", dot: "#A855F7", label: "Disbursed" },
  received: { bg: "var(--tint-green)", text: "var(--accent-green-strong)", dot: "#10B981", label: "Received" },
};

const rm = (n: number) =>
  `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const typeLabel = (t: string) =>
  CLAIM_TYPE_SHORT_LABELS[t as keyof typeof CLAIM_TYPE_SHORT_LABELS] ?? t;

export default function FinanceDashboard({
  userName,
  userEmail,
  taskOverview,
}: {
  userName?: string | null;
  userEmail?: string | null;
  /** Server-rendered Task Manager overview (scoped, with date filters). */
  taskOverview?: ReactNode;
}) {
  const greetName =
    userName?.split(" ")[0] ||
    userEmail?.split("@")[0] ||
    "finance";
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/finance/dashboard", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => active && setData(d))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-10">
        <p className="text-sm text-slate-500 dark:text-slate-400">Could not load the finance dashboard.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold">
        Loading dashboard…
      </div>
    );
  }

  const { counts } = data;
  const donutSegments: DonutSegment[] = STATUS_META.filter(
    (s) => counts[s.key] > 0,
  ).map((s) => ({ label: s.label, value: counts[s.key], color: s.color }));

  const typeBars: BarDatum[] = data.byType.map((t) => ({
    key: t.type,
    label: typeLabel(t.type),
    value: t.amount,
    meta: `${t.count} ${t.count === 1 ? "claim" : "claims"}`,
    color: TYPE_COLORS[t.type] ?? "#64748B",
  }));

  const monthBars: BarDatum[] = data.byMonth.map((m) => ({
    key: m.month,
    label: new Date(m.month + "-01").toLocaleString("en-US", {
      month: "short",
      year: "numeric",
    }),
    value: m.count,
    meta: rm(m.amount),
    color: "#3B82F6",
  }));

  const deptBars: BarDatum[] = data.headcountByDepartment.map((d) => ({
    key: d.label,
    label: d.label,
    value: d.count,
    color: "#6366F1",
  }));

  const branchBars: BarDatum[] = data.headcountByBranch.map((b) => ({
    key: b.label,
    label: b.label,
    value: b.count,
    color: "#0EA5E9",
  }));

  const deptTotal = deptBars.reduce((s, b) => s + b.value, 0);
  const branchTotal = branchBars.reduce((s, b) => s + b.value, 0);

  const stats: {
    label: string;
    value: string;
    Icon: typeof FileText;
    href?: string;
  }[] = [
    { label: "Total Claims", value: String(counts.total), Icon: FileText, href: "/claim" },
    {
      label: "Pending Review",
      value: String(counts.pending),
      Icon: Clock,
      href: "/claim?status=pending",
    },
    {
      label: "Approved",
      value: String(counts.approved),
      Icon: CheckCircle2,
      href: "/claim?status=approved",
    },
    {
      label: "Disbursed",
      value: String(counts.disbursed),
      Icon: Wallet,
      href: "/claim?status=disbursed",
    },
    { label: "Approved Amount", value: rm(data.approvedAmount), Icon: Banknote },
  ];

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-10 space-y-6">
        {/* Header */}
        <GreetingHeader name={greetName} style={{ padding: "8px 0 4px" }} />

        {/* Sub-header */}
        <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Overview of all expense claims.
          </p>
        </div>

        {/* Stat bar */}
        <section className="rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-3.5 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {stats.map(({ label, value, Icon, href }) => {
              const inner = (
                <>
                  <Icon className="w-4 h-4 mx-auto mb-1 opacity-80" aria-hidden="true" />
                  <p className="text-xl md:text-2xl font-bold leading-tight tabular-nums">
                    {value}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-white/80">
                    {label}
                  </p>
                </>
              );
              return href ? (
                <Link
                  key={label}
                  href={href}
                  className="text-center text-white px-2 rounded-xl py-0.5 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  {inner}
                </Link>
              ) : (
                <div key={label} className="text-center text-white px-2">
                  {inner}
                </div>
              );
            })}
          </div>
        </section>

        {/* Status donut (wide) + pending review (narrow) — swapped */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Status donut */}
          <section className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl px-6 py-6 dark:bg-slate-900 dark:border-slate-800">
            <h2 className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-5 dark:text-slate-400">
              Claims by Status
            </h2>
            {counts.total > 0 ? (
              <div className="flex flex-col md:flex-row md:items-center gap-8">
                <div className="flex justify-center shrink-0">
                  <DonutChart data={donutSegments} size={168} thickness={20} centerLabel="CLAIMS" />
                </div>
                <ul className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {STATUS_META.map((s) => {
                    const pct =
                      counts.total > 0 ? Math.round((counts[s.key] / counts.total) * 100) : 0;
                    return (
                      <li
                        key={s.key}
                        className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800"
                      >
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: s.color }}
                          aria-hidden="true"
                        />
                        <span className="text-sm font-medium text-slate-600 truncate dark:text-slate-300">
                          {s.label}
                        </span>
                        <span className="ml-auto flex items-baseline gap-1.5 shrink-0">
                          <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{counts[s.key]}</span>
                          <span className="text-xs text-slate-400 tabular-nums">{pct}%</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-10">No claims yet</p>
            )}
          </section>

          {/* Pending review queue */}
          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden dark:bg-slate-900 dark:border-slate-800">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Awaiting Review</h2>
                </div>
                <Link
                  href="/claim?status=pending"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  View all
                </Link>
              </div>
              <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                {counts.pending} pending · {rm(data.pendingAmount)}
              </p>
            </div>
            {data.pending.length === 0 ? (
              <div className="flex flex-col items-center gap-2 text-center py-12">
                <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center dark:bg-slate-800">
                  <Inbox className="w-5 h-5 text-slate-400" aria-hidden="true" />
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">All caught up</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Nothing waiting for review.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto dark:divide-slate-800">
                {data.pending.map((c) => (
                  <li key={c.claimId}>
                    <Link
                      href={`/claim/${c.claimId}`}
                      className="group block px-5 py-3 hover:bg-slate-50/70 transition-colors dark:hover:bg-slate-800/70"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-800 truncate dark:text-slate-200">
                          {c.employeeName}
                        </span>
                        <span className="text-sm font-bold text-slate-900 tabular-nums shrink-0 dark:text-slate-100">
                          {rm(c.amount)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{c.displayId}</span>
                        <span className="text-[11px] text-slate-400 truncate">
                          {typeLabel(c.claimType)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* To-Do list + charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <ToDoList storageKey="finance-dashboard-todos" />

          <section className="bg-white border border-slate-200 rounded-2xl px-6 py-6 dark:bg-slate-900 dark:border-slate-800">
            <h2 className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-5 dark:text-slate-400">
              Approved Amount by Type
            </h2>
            {typeBars.length > 0 ? (
              <BarChart data={typeBars} valueFormatter={rm} />
            ) : (
              <p className="text-sm text-slate-400 text-center py-10">No approved claims yet</p>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl px-6 py-6 dark:bg-slate-900 dark:border-slate-800">
            <h2 className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-5 dark:text-slate-400">
              Claims Made by Month
            </h2>
            {monthBars.length > 0 ? (
              <BarChart
                data={monthBars}
                valueFormatter={(v) => `${v} ${v === 1 ? "claim" : "claims"}`}
              />
            ) : (
              <p className="text-sm text-slate-400 text-center py-10">No claims yet</p>
            )}
          </section>
        </div>

        {/* Recent claims */}
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden dark:bg-slate-900 dark:border-slate-800">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between dark:border-slate-800">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent Claims</h2>
            </div>
            <Link href="/claim" className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold tracking-widest text-slate-500 uppercase dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="text-left px-6 py-3">Claim ID</th>
                  <th className="text-left px-6 py-3">Employee</th>
                  <th className="text-left px-6 py-3">Type</th>
                  <th className="text-left px-6 py-3">Amount</th>
                  <th className="text-left px-6 py-3">Date</th>
                  <th className="text-left px-6 py-3">Status</th>
                  <th className="text-right px-6 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-14 text-center text-sm text-slate-400">
                      No claims yet.
                    </td>
                  </tr>
                ) : (
                  data.recent.map((c) => {
                    const badge = STATUS_BADGE[c.status] ?? {
                      bg: "var(--status-neutral-bg)",
                      text: "var(--text-strong)",
                      dot: "var(--text-muted-strong)",
                      label: c.status,
                    };
                    return (
                      <tr
                        key={c.claimId}
                        className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors dark:border-slate-800 dark:hover:bg-slate-800/60"
                      >
                        <td className="px-6 py-2.5 font-semibold text-blue-600 dark:text-blue-400">{c.displayId}</td>
                        <td className="px-6 py-2.5 text-slate-800 dark:text-slate-200">{c.employeeName}</td>
                        <td className="px-6 py-2.5 text-slate-700 dark:text-slate-300">{typeLabel(c.claimType)}</td>
                        <td className="px-6 py-2.5 font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                          {rm(c.amount)}
                        </td>
                        <td className="px-6 py-2.5 text-slate-600 tabular-nums dark:text-slate-300">
                          {new Date(c.claimDate).toLocaleDateString("en-GB")}
                        </td>
                        <td className="px-6 py-2.5">
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
                        </td>
                        <td className="px-6 py-2.5 text-right">
                          <Link
                            href={`/claim/${c.claimId}`}
                            aria-label={`View ${c.displayId}`}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          >
                            <Eye className="w-4 h-4" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Headcount */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <section className="bg-white border border-slate-200 rounded-2xl px-6 py-6 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xs font-semibold tracking-widest text-slate-500 uppercase dark:text-slate-400">
                Headcount by Department
              </h2>
              <span className="text-xs font-semibold text-slate-400 tabular-nums">
                {deptTotal}
              </span>
            </div>
            {deptBars.length > 0 ? (
              <BarChart data={deptBars} />
            ) : (
              <p className="text-sm text-slate-400 text-center py-10">No data</p>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl px-6 py-6 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xs font-semibold tracking-widest text-slate-500 uppercase dark:text-slate-400">
                Headcount by Branch
              </h2>
              <span className="text-xs font-semibold text-slate-400 tabular-nums">
                {branchTotal}
              </span>
            </div>
            {branchBars.length > 0 ? (
              <BarChart data={branchBars} />
            ) : (
              <p className="text-sm text-slate-400 text-center py-10">No data</p>
            )}
          </section>
        </div>

        {/* Task Manager — own-department status (server-rendered slot).
            ALWAYS the LAST section on Home, for every account type
            (2026-07-28 placement decision). */}
        {taskOverview}
      </div>
    </div>
  );
}
