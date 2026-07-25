"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Home, ChevronRight, Users, CalendarCheck, UserCheck,
  GraduationCap, Download, ArrowRight, ChevronDown,
} from "lucide-react";

// ─── Types & constants ────────────────────────────────────────────────────────

type Region = "A" | "B" | "C";

interface Metrics { NL: number; CT: number; SU: number; ENR: number }
interface BranchMetric extends Metrics { id: string; name: string; code: string; region: Region }
interface MonthPoint { month: string; NL: number; CT: number; SU: number; ENR: number }

// Shape returned by /api/crm/leads-metrics?...&trend=1
interface ApiBranch extends Metrics { id: string; code: string; name: string; region: Region | null; BUF: number }
interface MetricsResponse {
  range: { from: string; to: string };
  main: Metrics;
  regions: Record<Region, Metrics>;
  branches: ApiBranch[];
  trend?: MonthPoint[];
}

const DATE_WINDOWS = [
  { id: "this_week",  label: "This Week" },
  { id: "this_month", label: "This Month" },
  { id: "last_30",    label: "Last 30 Days" },
  { id: "last_90",    label: "Last 90 Days" },
  { id: "last_12m",   label: "Last 12 Months" },
] as const;
type DateWindow = (typeof DATE_WINDOWS)[number]["id"];

// Map a UI window → leads-metrics query params (mirrors v1 analytics rangeParams).
function rangeParams(win: DateWindow): string {
  const now = new Date();
  const end = now.toISOString();
  if (win === "this_week") return "preset=this_week";
  if (win === "last_30") return "preset=30d";
  if (win === "last_90") return `preset=custom&from=${new Date(now.getTime() - 89 * 864e5).toISOString()}&to=${end}`;
  if (win === "last_12m") return `preset=custom&from=${new Date(now.getTime() - 364 * 864e5).toISOString()}&to=${end}`;
  // this_month → from the first of the current month (KL wall ≈ local here)
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return `preset=custom&from=${from}&to=${end}`;
}

const REGION_STYLE: Record<Region, { border: string; label: string; bg: string; text: string }> = {
  A: { border: "border-t-rose-400",    label: "Region A", bg: "bg-rose-50",    text: "text-rose-700" },
  B: { border: "border-t-amber-400",   label: "Region B", bg: "bg-amber-50",   text: "text-amber-700" },
  C: { border: "border-t-emerald-400", label: "Region C", bg: "bg-emerald-50", text: "text-emerald-700" },
};

const EMPTY: Metrics = { NL: 0, CT: 0, SU: 0, ENR: 0 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(num: number, den: number) {
  if (!den) return "—";
  return (num / den * 100).toFixed(1) + "%";
}

function sum(branches: BranchMetric[]): Metrics {
  return branches.reduce(
    (acc, b) => ({ NL: acc.NL + b.NL, CT: acc.CT + b.CT, SU: acc.SU + b.SU, ENR: acc.ENR + b.ENR }),
    { NL: 0, CT: 0, SU: 0, ENR: 0 },
  );
}

// "2026-02" → "Feb"
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
}

// ─── SVG trend chart ──────────────────────────────────────────────────────────

const CW = 560, CH = 180;
const P = { t: 12, r: 16, b: 28, l: 36 };
const innerW = CW - P.l - P.r;
const innerH = CH - P.t - P.b;

function TrendChart({ data }: { data: MonthPoint[] }) {
  const n = data.length;
  const maxVal = Math.max(1, ...data.flatMap(d => [d.NL, d.CT, d.SU, d.ENR]));
  const cx = (i: number) => P.l + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
  const cy = (v: number) => P.t + innerH - (v / maxVal) * innerH;
  const makePath = (key: "NL" | "CT" | "SU" | "ENR") =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${cy(d[key]).toFixed(1)}`).join(" ");
  const gridPcts = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full" aria-label="Monthly trend chart">
      {gridPcts.map(p => {
        const yp = P.t + innerH * (1 - p);
        const val = Math.round(maxVal * p);
        return (
          <g key={p}>
            <line x1={P.l} y1={yp} x2={CW - P.r} y2={yp} stroke="#e2e8f0" strokeWidth="1" />
            <text x={P.l - 6} y={yp + 4} textAnchor="end" fill="#94a3b8" fontSize="10">{val}</text>
          </g>
        );
      })}
      <path d={makePath("NL")}  stroke="#6366f1" fill="none" strokeWidth="2" strokeLinejoin="round" />
      <path d={makePath("CT")}  stroke="#3b82f6" fill="none" strokeWidth="2" strokeLinejoin="round" />
      <path d={makePath("SU")}  stroke="#f59e0b" fill="none" strokeWidth="2" strokeLinejoin="round" />
      <path d={makePath("ENR")} stroke="#10b981" fill="none" strokeWidth="2" strokeLinejoin="round" />
      {data.map((d, i) => (
        <text key={i} x={cx(i)} y={CH - 4} textAnchor="middle" fill="#94a3b8" fontSize="10">{monthLabel(d.month)}</text>
      ))}
    </svg>
  );
}

// ─── Dropdown ────────────────────────────────────────────────────────────────

function Select<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-7 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 cursor-pointer transition-colors"
      >
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CrmAnalyticsPage() {
  const [dateWindow, setDateWindow] = useState<DateWindow>("this_month");
  const [region,     setRegion]     = useState<"all" | Region>("all");
  const [branchId,   setBranchId]   = useState<string>("all");

  const [data,    setData]    = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const windowLabel = DATE_WINDOWS.find(d => d.id === dateWindow)?.label ?? "";

  // Fetch real metrics + 6-month trend from ebright_crm (read-only). Only the
  // date window hits the server; region/branch are client-side filters.
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    fetch(`/api/crm/leads-metrics?${rangeParams(dateWindow)}&trend=1`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `Request failed (${r.status})`);
        }
        return r.json() as Promise<MetricsResponse>;
      })
      .then((d) => { if (!ignore) { setData(d); setError(null); } })
      .catch((e) => { if (!ignore) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [dateWindow]);

  // All branches (region A/B/C) as page BranchMetric rows.
  const allBranches: BranchMetric[] = useMemo(
    () => (data?.branches ?? [])
      .filter((b): b is ApiBranch & { region: Region } => b.region === "A" || b.region === "B" || b.region === "C")
      .map((b) => ({ id: b.id, name: b.name, code: b.code, region: b.region, NL: b.NL, CT: b.CT, SU: b.SU, ENR: b.ENR })),
    [data],
  );

  const filteredBranches = useMemo(() => {
    let list = allBranches;
    if (region !== "all") list = list.filter(b => b.region === region);
    if (branchId !== "all") list = list.filter(b => b.id === branchId);
    return list;
  }, [allBranches, region, branchId]);

  const branchesInRegion = useMemo(
    () => region === "all" ? allBranches : allBranches.filter(b => b.region === region),
    [allBranches, region],
  );

  const kpi: Metrics = useMemo(() => {
    if (branchId !== "all") {
      const b = allBranches.find(b => b.id === branchId);
      return b ? { NL: b.NL, CT: b.CT, SU: b.SU, ENR: b.ENR } : (data?.main ?? EMPTY);
    }
    if (region !== "all") return data?.regions?.[region as Region] ?? EMPTY;
    return data?.main ?? EMPTY;
  }, [allBranches, region, branchId, data]);

  const showRegionCards = region === "all" && branchId === "all";
  const tableBranches   = filteredBranches;
  const trend = data?.trend ?? [];

  function changeRegion(r: "all" | Region) {
    setRegion(r);
    setBranchId("all");
  }

  const KPI_CARDS = [
    { key: "NL",  label: "New Leads",        Icon: Users,        color: "text-indigo-600", bg: "bg-indigo-50", val: kpi.NL,  sub: null },
    { key: "CT",  label: "Confirmed Trial",  Icon: CalendarCheck,color: "text-blue-600",   bg: "bg-blue-50",   val: kpi.CT,  sub: pct(kpi.CT,  kpi.NL) + " of NL" },
    { key: "SU",  label: "Show-Up",          Icon: UserCheck,    color: "text-amber-600",  bg: "bg-amber-50",  val: kpi.SU,  sub: pct(kpi.SU,  kpi.CT) + " of CT" },
    { key: "ENR", label: "Enrolled",         Icon: GraduationCap,color: "text-emerald-600",bg: "bg-emerald-50",val: kpi.ENR, sub: pct(kpi.ENR, kpi.SU) + " of SU" },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors rounded">
            <Home className="w-4 h-4" aria-hidden="true" /><span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <Link href="/dashboards/crm" className="hover:text-slate-900 transition-colors">CNS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-slate-700">Lead</span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-slate-900 font-medium">Analytics</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
            <p className="text-sm text-slate-500 mt-0.5">Lead performance across all regions and branches.</p>
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
            <Download className="w-4 h-4" /> Export PDF
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap mb-6">
          <Select<DateWindow>
            value={dateWindow}
            onChange={setDateWindow}
            options={DATE_WINDOWS as unknown as { id: DateWindow; label: string }[]}
          />
          <Select<"all" | Region>
            value={region}
            onChange={changeRegion}
            options={[
              { id: "all", label: "All Regions" },
              { id: "A",   label: "Region A" },
              { id: "B",   label: "Region B" },
              { id: "C",   label: "Region C" },
            ]}
          />
          {region !== "all" && (
            <Select<string>
              value={branchId}
              onChange={setBranchId}
              options={[
                { id: "all", label: `All branches (${branchesInRegion.length})` },
                ...branchesInRegion.map(b => ({ id: b.id, label: b.name })),
              ]}
            />
          )}
          <span className="text-xs text-slate-400 ml-auto">
            {windowLabel} · {branchId !== "all"
              ? (allBranches.find(b => b.id === branchId)?.name ?? "Branch")
              : region !== "all" ? `Region ${region}` : "All branches"}
          </span>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-12 text-center text-sm shadow-sm">
            <p className="text-red-600">Couldn&apos;t load analytics: {error}</p>
          </div>
        ) : loading && !data ? (
          <div className="rounded-xl border border-slate-200 bg-white p-16 text-center text-sm shadow-sm">
            <div className="mx-auto mb-2 h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
            <p className="text-slate-400">Loading analytics…</p>
          </div>
        ) : (
        <>
        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {KPI_CARDS.map(c => (
            <div key={c.key} className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{c.label}</span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.bg}`}>
                  <c.Icon className={`w-4 h-4 ${c.color}`} />
                </span>
              </div>
              <p className="text-3xl font-bold text-slate-900">{c.val.toLocaleString()}</p>
              {c.sub && <p className="text-xs text-slate-400 mt-1">{c.sub}</p>}
            </div>
          ))}
        </div>

        {/* Conversion funnel */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Conversion Funnel</p>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: "NL → CT",  val: pct(kpi.CT,  kpi.NL) },
              { label: "CT → SU",  val: pct(kpi.SU,  kpi.CT) },
              { label: "SU → ENR", val: pct(kpi.ENR, kpi.SU) },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />}
                <div className="bg-slate-50 rounded-lg border border-slate-200 px-4 py-2 text-center min-w-[80px]">
                  <p className="text-lg font-bold text-slate-800">{f.val}</p>
                  <p className="text-[10px] text-slate-400 font-medium">{f.label}</p>
                </div>
              </div>
            ))}
            <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
            <div className="bg-emerald-50 rounded-lg border border-emerald-200 px-4 py-2 text-center min-w-[80px]">
              <p className="text-lg font-bold text-emerald-700">{pct(kpi.ENR, kpi.NL)}</p>
              <p className="text-[10px] text-emerald-500 font-medium">NL → ENR</p>
            </div>
          </div>
        </div>

        {/* Region breakdown */}
        {showRegionCards && (
          <div className="grid grid-cols-3 gap-4 mb-4">
            {(["A", "B", "C"] as const).map(r => {
              const s = REGION_STYLE[r];
              const d = data?.regions?.[r] ?? EMPTY;
              return (
                <div key={r} className={`bg-white rounded-xl border-t-4 border border-slate-200 shadow-sm overflow-hidden ${s.border}`}>
                  <div className={`px-4 py-2 ${s.bg}`}>
                    <span className={`text-xs font-bold uppercase tracking-wider ${s.text}`}>{s.label}</span>
                  </div>
                  <div className="grid grid-cols-4 divide-x divide-slate-100 px-0 py-3">
                    {(["NL", "CT", "SU", "ENR"] as const).map(k => (
                      <div key={k} className="px-3 text-center">
                        <p className="text-[10px] text-slate-400 font-medium">{k}</p>
                        <p className="text-lg font-bold text-slate-800 mt-0.5">{d[k]}</p>
                        {k !== "NL" && (
                          <p className="text-[10px] text-slate-400">{pct(d[k], k === "CT" ? d.NL : k === "SU" ? d.CT : d.SU)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Trend chart */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Monthly Trend</p>
            <div className="flex items-center gap-3 text-[10px] font-medium">
              {[
                { label: "NL",  color: "bg-indigo-500" },
                { label: "CT",  color: "bg-blue-500" },
                { label: "SU",  color: "bg-amber-500" },
                { label: "ENR", color: "bg-emerald-500" },
              ].map(l => (
                <span key={l.label} className="flex items-center gap-1 text-slate-500">
                  <span className={`w-2.5 h-0.5 rounded ${l.color}`} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
          {trend.length > 0 ? (
            <TrendChart data={trend} />
          ) : (
            <p className="py-10 text-center text-xs text-slate-400">No trend data.</p>
          )}
        </div>

        {/* Branch performance table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Branch Performance</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Branch", "Reg", "NL", "CT", "SU", "ENR", "CT%", "SU%", "ENR%", "Conv%"].map(h => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${
                        h === "Branch" ? "text-left" : "text-right"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableBranches.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-400">No branches match this filter.</td></tr>
                ) : tableBranches.map((b) => {
                  const rs = REGION_STYLE[b.region];
                  return (
                    <tr key={b.id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors`}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{b.name}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${rs.bg} ${rs.text}`}>
                          {b.region}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{b.NL}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{b.CT}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{b.SU}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{b.ENR}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{pct(b.CT,  b.NL)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{pct(b.SU,  b.CT)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{pct(b.ENR, b.SU)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">{pct(b.ENR, b.NL)}</td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                {tableBranches.length > 0 && (() => {
                  const t = sum(tableBranches);
                  return (
                    <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200">
                      <td className="px-4 py-2.5 text-slate-800">Total</td>
                      <td className="px-4 py-2.5" />
                      <td className="px-4 py-2.5 text-right text-slate-800">{t.NL}</td>
                      <td className="px-4 py-2.5 text-right text-slate-800">{t.CT}</td>
                      <td className="px-4 py-2.5 text-right text-slate-800">{t.SU}</td>
                      <td className="px-4 py-2.5 text-right text-slate-800">{t.ENR}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{pct(t.CT,  t.NL)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{pct(t.SU,  t.CT)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{pct(t.ENR, t.SU)}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-emerald-600">{pct(t.ENR, t.NL)}</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
        </>
        )}

      </div>
    </div>
  );
}
