"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import {
  Home,
  ChevronRight,
  Search,
  Plus,
  FileText,
  Inbox,
  Eye,
} from "lucide-react";
import DonutChart, { type DonutSegment } from "@/app/components/DonutChart";
import BarChart, { type BarDatum } from "@/app/components/BarChart";
import { CLAIM_TYPES, CLAIM_TYPE_LABELS, CLAIM_TYPE_SHORT_LABELS } from "@/app/claim/claim-types";

export interface ClaimRow {
  claimId: number;
  displayId: string;
  employeeName: string;
  branch: string;
  claimType: string;
  amount: number;
  claimDate: string;
  status: string;
}

export interface StatusCounts {
  submitted: number;
  pending: number;
  approved: number;
  rejected: number;
  disbursed: number;
  received: number;
}

export interface OrgOption {
  code: string;
  label: string;
  kind: "branch" | "department";
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "disbursed", label: "Disbursed" },
  { value: "received", label: "Received" },
] as const;

const TYPE_OPTIONS = CLAIM_TYPES.map((t) => ({ value: t.id, label: t.shortLabel }));

const cycleSteps = [
  { day: 2, date: "2nd", label: "Submission" },
  { day: 12, date: "12th", label: "Approval" },
  { day: 14, date: "14th", label: "Resubmission" },
  { day: 17, date: "17th", label: "Final Review" },
  { day: 22, date: "22nd", label: "Disbursement" },
];

// Status breakdown drives the donut slices and the interactive legend.
// "submitted" is the total (all claims) shown in the donut center, not a slice.
const STATUS_META = [
  { key: "pending", label: "Pending", color: "#F59E0B", text: "text-amber-600" },
  { key: "approved", label: "Approved", color: "#10B981", text: "text-emerald-600" },
  { key: "rejected", label: "Rejected", color: "#EF4444", text: "text-red-600" },
  { key: "disbursed", label: "Disbursed", color: "#A855F7", text: "text-purple-600" },
  { key: "received", label: "Received", color: "#14B8A6", text: "text-teal-600" },
] as const;

// Stable color per claim type for the "Claims by Type" bar chart.
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
const TYPE_FALLBACK_COLOR = "#64748B";

const STATUS_BADGE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  pending: { bg: "#FFFBEB", text: "#92400E", dot: "#F59E0B", label: "Pending" },
  approved: { bg: "#ECFDF5", text: "#047857", dot: "#10B981", label: "Approved" },
  rejected: { bg: "#FEF2F2", text: "#991B1B", dot: "#EF4444", label: "Rejected" },
  disbursed: { bg: "#FAF5FF", text: "#6B21A8", dot: "#A855F7", label: "Disbursed" },
  received: { bg: "#ECFDF5", text: "#047857", dot: "#10B981", label: "Received" },
};

const TYPE_LABEL: Record<string, string> = CLAIM_TYPE_LABELS;

export default function ClaimsView({
  claims = [],
  counts,
  isFinance = false,
  isSuperadmin = false,
  orgOptions = [],
  initialStatus = "",
}: {
  claims?: ClaimRow[];
  counts?: StatusCounts;
  isFinance?: boolean;
  isSuperadmin?: boolean;
  orgOptions?: OrgOption[];
  initialStatus?: string;
}) {
  // Only honour a status that maps to a real filter option (deep-link safety).
  const validInitialStatus = STATUS_OPTIONS.some((s) => s.value === initialStatus)
    ? initialStatus
    : "";

  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(validInitialStatus);
  const [typeFilter, setTypeFilter] = useState("");

  const monthOptions = useMemo(() => {
    const set = new Set(claims.map((c) => c.claimDate.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [claims]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return claims.filter((c) => {
      if (isFinance && branchFilter && c.branch !== branchFilter) return false;
      if (monthFilter && !c.claimDate.startsWith(monthFilter)) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      if (typeFilter && c.claimType !== typeFilter) return false;
      if (!q) return true;
      return (
        c.displayId.toLowerCase().includes(q) ||
        c.employeeName.toLowerCase().includes(q) ||
        c.claimType.toLowerCase().includes(q)
      );
    });
  }, [claims, query, branchFilter, monthFilter, statusFilter, typeFilter, isFinance]);

  const displayCounts: Record<string, number> = {
    submitted: counts?.submitted ?? 0,
    pending: counts?.pending ?? 0,
    approved: counts?.approved ?? 0,
    rejected: counts?.rejected ?? 0,
    disbursed: counts?.disbursed ?? 0,
    received: counts?.received ?? 0,
  };
  const totalClaims = displayCounts.submitted;
  const donutSegments: DonutSegment[] = STATUS_META.filter(
    (s) => displayCounts[s.key] > 0
  ).map((s) => ({ label: s.key, value: displayCounts[s.key], color: s.color }));

  // Claims by type — total RM amount and count per type, descending by amount.
  // Only counts approved-onward claims (approved → disbursed → received);
  // pending and rejected requests are excluded. Clicking a bar filters the table.
  const typeBars: BarDatum[] = useMemo(() => {
    const APPROVED_ONWARD = new Set(["approved", "disbursed", "received"]);
    const agg = new Map<string, { amount: number; count: number }>();
    for (const c of claims) {
      if (!APPROVED_ONWARD.has(c.status)) continue;
      const cur = agg.get(c.claimType) ?? { amount: 0, count: 0 };
      cur.amount += c.amount;
      cur.count += 1;
      agg.set(c.claimType, cur);
    }
    return Array.from(agg.entries())
      .map(([type, { amount, count }]) => ({
        key: type,
        label: CLAIM_TYPE_SHORT_LABELS[type as keyof typeof CLAIM_TYPE_SHORT_LABELS] ?? type,
        value: amount,
        meta: `${count} ${count === 1 ? "claim" : "claims"}`,
        color: TYPE_COLORS[type] ?? TYPE_FALLBACK_COLOR,
      }))
      .sort((a, b) => b.value - a.value);
  }, [claims]);

  // Claims made by month — count of all claims (any status) per submission month,
  // broken down by claim type (stacked) and ordered chronologically. Clicking a
  // bar filters the table to that month.
  const monthBars: BarDatum[] = useMemo(() => {
    const agg = new Map<string, { count: number; byType: Map<string, number> }>();
    for (const c of claims) {
      const ym = c.claimDate.slice(0, 7);
      const cur = agg.get(ym) ?? { count: 0, byType: new Map<string, number>() };
      cur.count += 1;
      cur.byType.set(c.claimType, (cur.byType.get(c.claimType) ?? 0) + 1);
      agg.set(ym, cur);
    }
    return Array.from(agg.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, { count, byType }]) => ({
        key: ym,
        label: new Date(ym + "-01").toLocaleString("en-US", {
          month: "short",
          year: "numeric",
        }),
        value: count,
        color: "#3B82F6",
        segments: CLAIM_TYPES.filter((t) => (byType.get(t.id) ?? 0) > 0).map((t) => ({
          key: t.id,
          label: t.shortLabel,
          value: byType.get(t.id)!,
          color: TYPE_COLORS[t.id] ?? TYPE_FALLBACK_COLOR,
        })),
      }));
  }, [claims]);

  // Claim types present across all claims — drives the month chart's legend.
  const typesPresent = useMemo(() => {
    const set = new Set(claims.map((c) => c.claimType));
    return CLAIM_TYPES.filter((t) => set.has(t.id)).map((t) => ({
      label: t.shortLabel,
      color: TYPE_COLORS[t.id] ?? TYPE_FALLBACK_COLOR,
    }));
  }, [claims]);

  const today = new Date();
  const monthLabel = today.toLocaleString("en-US", { month: "long", year: "numeric" });
  const currentDay = today.getDate();
  const activeStep =
    cycleSteps.find((s) => s.day >= currentDay)?.day ?? cycleSteps[cycleSteps.length - 1].day;
  const isSubmissionDeadlineStep = currentDay <= 2;
  
  // During submission days (1-2), show last month's label for the reminder
  const lastMonth = new Date(today);
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastMonthLabel = lastMonth.toLocaleString("en-US", { month: "long", year: "numeric" });
  const reminderMonthLabel = isSubmissionDeadlineStep ? lastMonthLabel : monthLabel;
  
  const cycleCardClass = isSubmissionDeadlineStep
    ? "bg-red-50 border-red-200"
    : "bg-white border-slate-200";

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-10 space-y-6">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500">
          <Link
            href="/home"
            className="flex items-center gap-1 hover:text-slate-900 transition-colors"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 transition-colors">
            HRMS
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Claims</span>
        </nav>

        {/* Page header */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
              Claims
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isFinance
                ? "Review and approve expense claims from all employees."
                : "Submit and track your expense claims."}
            </p>
          </div>
          {(!isFinance || isSuperadmin) && (
            <Link
              href="/claim/new"
              className="shrink-0 inline-flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-600/20 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add New Claim
            </Link>
          )}
        </header>

        {/* Monthly Claim Cycle */}
        <section
          aria-labelledby="cycle-heading"
          className={`${cycleCardClass} rounded-2xl px-6 py-6`}
        >
          <div className="flex items-center justify-center flex-wrap gap-3 mb-6">
            <h2
              id="cycle-heading"
              className="text-xs font-semibold tracking-widest text-slate-500 uppercase"
            >
              Monthly Claim Cycle
            </h2>
            <span className="text-slate-300">—</span>
            <p className="text-sm font-semibold text-slate-800">
              {isSubmissionDeadlineStep ? `${reminderMonthLabel} Claims` : monthLabel}
            </p>
            {cycleSteps.some((s) => s.day === currentDay) && (
              <span
                className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-3 py-1 text-xs font-semibold"
              >
                Deadline today!
              </span>
            )}
          </div>
          {isSubmissionDeadlineStep && (
            <p className="text-xs text-slate-500 text-center mb-4">
              Timeline below shows {monthLabel} schedule
            </p>
          )}

          <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
            {cycleSteps.map((step, i) => {
              const isPast = currentDay > step.day;
              const isSubmissionStep = step.day === 2;
              return (
                <Fragment key={step.label}>
                  <div
                    style={{ flexShrink: 0 }}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border whitespace-nowrap transition-all ${
                      isSubmissionStep
                        ? "bg-red-50 border-red-300 ring-2 ring-red-200"
                        : isPast
                        ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSubmissionStep
                          ? "bg-red-500"
                          : isPast
                          ? "bg-emerald-500"
                          : "bg-slate-400"
                      }`}
                      aria-hidden="true"
                    />
                    <p
                      className={`text-sm ${
                        isSubmissionStep
                          ? "text-red-700 font-semibold"
                          : isPast
                          ? "text-emerald-700 font-semibold"
                          : "text-slate-600"
                      }`}
                    >
                      <span className="font-semibold">{step.date}</span>
                      <span className="mx-1 text-slate-400">-</span>
                      {step.label}
                    </p>
                  </div>
                  {i < cycleSteps.length - 1 && (
                    <div
                      aria-hidden="true"
                      style={{
                        flex: "1 1 0%",
                        height: "2px",
                        margin: "0 8px",
                        backgroundColor: isPast ? "#60a5fa" : "#bfdbfe",
                      }}
                    />
                  )}
                </Fragment>
              );
            })}
          </div>
        </section>

        {/* Analytics — status donut beside stacked bar charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Status overview — donut + interactive legend */}
        <section
          aria-labelledby="status-heading"
          className="bg-white border border-slate-200 rounded-2xl px-6 py-6"
        >
          <div className="flex items-center justify-between mb-5">
            <h2
              id="status-heading"
              className="text-xs font-semibold tracking-widest text-slate-500 uppercase"
            >
              Claims by Status
            </h2>
            {statusFilter && (
              <button
                type="button"
                onClick={() => setStatusFilter("")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                Clear filter
              </button>
            )}
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-8">
            {/* Donut */}
            <div className="flex items-center justify-center shrink-0">
              {totalClaims > 0 ? (
                <DonutChart
                  data={donutSegments}
                  size={168}
                  thickness={20}
                  centerLabel="CLAIMS"
                  onSliceClick={(label) =>
                    setStatusFilter(statusFilter === label ? "" : label)
                  }
                />
              ) : (
                <div className="w-[168px] h-[168px] rounded-full border-[20px] border-slate-100 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-slate-900">0</span>
                  <span className="text-[11px] tracking-widest text-slate-400">CLAIMS</span>
                </div>
              )}
            </div>

            {/* Interactive legend — each row filters the table */}
            <ul
              className="flex-1 min-w-0 grid grid-cols-1 gap-2"
              role="group"
              aria-label="Filter claims by status"
            >
              {STATUS_META.map((s) => {
                const value = displayCounts[s.key];
                const pct =
                  totalClaims > 0 ? Math.round((value / totalClaims) * 100) : 0;
                const isActive = statusFilter === s.key;
                return (
                  <li key={s.key}>
                    <button
                      type="button"
                      onClick={() =>
                        setStatusFilter(isActive ? "" : s.key)
                      }
                      aria-pressed={isActive}
                      className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-400 ${
                        isActive
                          ? "border-slate-300 bg-slate-50 ring-1 ring-slate-200"
                          : "border-slate-200"
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: s.color }}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-medium text-slate-600 truncate">
                        {s.label}
                      </span>
                      <span className="ml-auto flex items-baseline gap-1.5 shrink-0">
                        <span className={`text-lg font-bold ${s.text}`}>{value}</span>
                        <span className="text-xs text-slate-400 tabular-nums">{pct}%</span>
                      </span>
                    </button>
                  </li>
                );
              })}

              {/* Total / show-all reset */}
              <li>
                <button
                  type="button"
                  onClick={() => setStatusFilter("")}
                  aria-pressed={statusFilter === ""}
                  className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all hover:border-blue-300 hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-400 ${
                    statusFilter === ""
                      ? "border-blue-200 bg-blue-50/50 ring-1 ring-blue-200"
                      : "border-slate-200"
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0 bg-blue-500"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold text-slate-700 truncate">
                    All Submitted
                  </span>
                  <span className="ml-auto text-lg font-bold text-blue-600 shrink-0">
                    {totalClaims}
                  </span>
                </button>
              </li>
            </ul>
          </div>
        </section>

        {/* Right column: approved amount over claims by month */}
        <div className="flex flex-col gap-6 min-w-0">
        {/* Type overview — claim amount by type */}
        <section
          aria-labelledby="type-heading"
          className="bg-white border border-slate-200 rounded-2xl px-6 py-6"
        >
          <div className="flex items-center justify-between mb-5">
            <h2
              id="type-heading"
              className="text-xs font-semibold tracking-widest text-slate-500 uppercase"
            >
              Approved Amount by Type
            </h2>
            {typeFilter && (
              <button
                type="button"
                onClick={() => setTypeFilter("")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                Clear filter
              </button>
            )}
          </div>

          {typeBars.length > 0 ? (
            <BarChart
              data={typeBars}
              activeKey={typeFilter}
              valueFormatter={(v) => `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              onBarClick={(key) => setTypeFilter(typeFilter === key ? "" : key)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-semibold text-slate-700">No approved claims yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Approved claim amounts by type will appear here once available.
              </p>
            </div>
          )}
        </section>

        {/* Claims made by month */}
        <section
          aria-labelledby="month-heading"
          className="bg-white border border-slate-200 rounded-2xl px-6 py-6"
        >
          <div className="flex items-center justify-between mb-5">
            <h2
              id="month-heading"
              className="text-xs font-semibold tracking-widest text-slate-500 uppercase"
            >
              Claims Made by Month
            </h2>
            {monthFilter && (
              <button
                type="button"
                onClick={() => setMonthFilter("")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                Clear filter
              </button>
            )}
          </div>

          {monthBars.length > 0 ? (
            <>
              <BarChart
                data={monthBars}
                activeKey={monthFilter}
                valueFormatter={(v) => `${v} ${v === 1 ? "claim" : "claims"}`}
                onBarClick={(key) => setMonthFilter(monthFilter === key ? "" : key)}
              />
              <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2" aria-label="Claim types">
                {typesPresent.map((t) => (
                  <li key={t.label} className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: t.color }}
                      aria-hidden="true"
                    />
                    <span className="text-xs text-slate-600">{t.label}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-semibold text-slate-700">No claims yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Monthly claim activity will appear here once available.
              </p>
            </div>
          )}
        </section>
        </div>
        </div>

        {/* Filters + action — single row */}
        <section className="flex items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isFinance
                  ? "Search by claim ID, employee, or type…"
                  : "Search by claim ID or type…"
              }
              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="shrink-0 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
          >
            <option value="">All Status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="shrink-0 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
          >
            <option value="">All Types</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {isFinance && (
            <select
              aria-label="Filter by branch or department"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="shrink-0 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
            >
              <option value="">All Branches / Depts</option>
              {orgOptions.filter((o) => o.kind === "branch").length > 0 && (
                <optgroup label="Branches">
                  {orgOptions
                    .filter((o) => o.kind === "branch")
                    .map((o) => (
                      <option key={`b-${o.code}`} value={o.code}>
                        {o.label}
                      </option>
                    ))}
                </optgroup>
              )}
              {orgOptions.filter((o) => o.kind === "department").length > 0 && (
                <optgroup label="Departments">
                  {orgOptions
                    .filter((o) => o.kind === "department")
                    .map((o) => (
                      <option key={`d-${o.code}`} value={o.code}>
                        {o.label}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          )}

          <select
            aria-label="Filter by month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="shrink-0 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
          >
            <option value="">All Months</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {new Date(m + "-01").toLocaleString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </option>
            ))}
          </select>
        </section>

        {/* Claims table */}
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900">All Claims</h2>
            </div>
            <p className="text-xs text-slate-500">
              {filtered.length} {filtered.length === 1 ? "record" : "records"}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold tracking-widest text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-6 py-3">Claim ID</th>
                  {isFinance && <th className="text-left px-6 py-3">Employee</th>}
                  {isFinance && <th className="text-left px-6 py-3">Branch</th>}
                  <th className="text-left px-6 py-3">Type</th>
                  <th className="text-left px-6 py-3">Amount</th>
                  <th className="text-left px-6 py-3">Date Submitted</th>
                  <th className="text-left px-6 py-3">Status</th>
                  <th className="text-right px-6 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={isFinance ? 8 : 6} className="px-6 py-20">
                      <div className="flex flex-col items-center gap-3 text-center">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                          <Inbox className="w-6 h-6 text-slate-400" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700">
                            {claims.length === 0
                              ? "No claims yet"
                              : "No claims match your filters"}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {claims.length === 0
                              ? "Submitted claims will appear here once available."
                              : "Try adjusting the search or filters."}
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    const badge = STATUS_BADGE[c.status] ?? {
                      bg: "#F1F5F9",
                      text: "#334155",
                      dot: "#64748B",
                      label: c.status,
                    };
                    return (
                      <tr
                        key={c.claimId}
                        className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors"
                      >
                        <td className="px-6 py-4 font-semibold text-blue-600">
                          {c.displayId}
                        </td>
                        {isFinance && (
                          <td className="px-6 py-4 text-slate-800">{c.employeeName}</td>
                        )}
                        {isFinance && (
                          <td className="px-6 py-4 text-slate-600">{c.branch}</td>
                        )}
                        <td className="px-6 py-4 text-slate-700">
                          {TYPE_LABEL[c.claimType] ?? c.claimType}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-900 tabular-nums">
                          RM {c.amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-slate-600 tabular-nums">
                          {new Date(c.claimDate).toLocaleDateString("en-GB")}
                        </td>
                        <td className="px-6 py-4">
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
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={`/claim/${c.claimId}`}
                            aria-label={`View ${c.displayId}`}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
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
      </div>
    </div>
  );
}
