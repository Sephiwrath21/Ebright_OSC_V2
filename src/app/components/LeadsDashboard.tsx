"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Home } from "lucide-react";
import TrialSchedule from "@/app/components/TrialSchedule";

// ─── Types ────────────────────────────────────────────────────────────────────

type Preset = "today" | "yesterday" | "this_week" | "next_week" | "last_week" | "30d" | "custom";
type Region = "A" | "B" | "C";

interface BranchRow {
  code: string;
  name: string;
  region: Region | null;
  NL: number;
  CT: number;
  SU: number;
  ENR: number;
}

interface RegionTotals {
  NL: number;
  CT: number;
  SU: number;
  ENR: number;
}

interface MainTotals extends RegionTotals {
  BUF: number;
  convRate: number;
  confRate: number;
  showUpRate: number;
  enrolRate: number;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const PRESETS: Array<{ key: Preset; label: string }> = [
  { key: "today",     label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This Week (Mon)" },
  { key: "next_week", label: "Next Week" },
  { key: "last_week", label: "Last Week" },
  { key: "30d",       label: "Last 30 Days" },
  { key: "custom",    label: "Custom" },
];

// Live API payload shape — mirrors src/lib/crm-leads-metrics.ts (read-only,
// sourced from ebright_crm so the numbers tally with the v1 CNS dashboard).
interface MetricsResponse {
  range: { from: string; to: string };
  main: MainTotals;
  regions: Record<Region, RegionTotals>;
  branches: BranchRow[];
}

const EMPTY_REGION: RegionTotals = { NL: 0, CT: 0, SU: 0, ENR: 0 };
const EMPTY_MAIN: MainTotals = {
  ...EMPTY_REGION, BUF: 0, convRate: 0, confRate: 0, showUpRate: 0, enrolRate: 0,
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function pct(v: number): string {
  if (!isFinite(v) || isNaN(v) || v === 0) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

// ─── Root component ───────────────────────────────────────────────────────────

function formatRange(fromISO: string, toISO: string): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `${fmt(new Date(fromISO))} – ${fmt(new Date(toISO))}`;
}

export default function LeadsDashboard() {
  const [preset, setPreset] = useState<Preset>("this_week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [branchCode, setBranchCode] = useState("");

  const [data,    setData]    = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const customReady = preset === "custom" && !!customFrom && !!customTo;

  const load = useCallback(async () => {
    // Custom range only fires once both ends are picked.
    if (preset === "custom" && !customReady) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ preset });
      if (preset === "custom") {
        params.set("from", new Date(customFrom).toISOString());
        // Include the whole `to` day (end of day) so it isn't truncated.
        params.set("to", new Date(new Date(customTo).getTime() + 86_400_000 - 1).toISOString());
      }
      const res = await fetch(`/api/crm/leads-metrics?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      setData((await res.json()) as MetricsResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load metrics");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [preset, customReady, customFrom, customTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const main    = data?.main ?? EMPTY_MAIN;
  const regions = data?.regions ?? { A: EMPTY_REGION, B: EMPTY_REGION, C: EMPTY_REGION };
  const allBranches = useMemo(() => data?.branches ?? [], [data]);
  // Branch picker narrows the per-branch chart + table client-side; the Main
  // and Region blocks always show the full all-branches picture.
  const shownBranches = useMemo(
    () => (branchCode ? allBranches.filter((b) => b.code === branchCode) : allBranches),
    [allBranches, branchCode],
  );

  // Region-card subtitle: "NN Name · NN Name …" derived from live branches.
  const regionBranchLabels = useMemo(() => {
    const by: Record<Region, string[]> = { A: [], B: [], C: [] };
    for (const b of allBranches) {
      if (b.region) by[b.region].push(`${b.code} ${b.name}`);
    }
    return by;
  }, [allBranches]);

  const rangeLabel = data ? formatRange(data.range.from, data.range.to) : "—";

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded dark:hover:text-slate-100 dark:focus-visible:ring-offset-slate-950">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/crm" className="hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded dark:hover:text-slate-100 dark:focus-visible:ring-offset-slate-950">
            CNS
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-700 dark:text-slate-300">Lead</span>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium dark:text-slate-100">Dashboard</span>
        </nav>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Leads Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {loading ? "Loading…" : rangeLabel} · NL by created · CT by trial date · SU / ENR by stage entry
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Branch picker */}
            <select
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="">All branches</option>
              {allBranches.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code} {b.name}
                </option>
              ))}
            </select>

            {/* Date preset pill tabs */}
            <div className="flex items-center gap-0.5 rounded-full bg-slate-100 p-1 dark:bg-slate-800">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPreset(p.key)}
                  className={[
                    "rounded-full px-3 py-1 text-sm transition-all",
                    preset === p.key
                      ? "bg-white font-medium text-blue-700 shadow-sm dark:bg-slate-700 dark:text-blue-300"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
                  ].join(" ")}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Custom date pickers ─────────────────────────────────────────── */}
        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">From</span>
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
            />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">to</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
            />
            {!customReady && (
              <span className="text-xs italic text-slate-400">
                Pick both dates to apply.
              </span>
            )}
          </div>
        )}

        {/* ── Error banner ────────────────────────────────────────────────── */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900 dark:text-red-200">
            Couldn&apos;t load metrics: {error}
            <button
              type="button"
              onClick={() => void load()}
              className="ml-3 rounded-md border border-red-300 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-slate-900 dark:text-red-200 dark:hover:bg-red-900"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Main pipeline block ─────────────────────────────────────────── */}
        <MainBlock data={main} />

        {/* ── Regional cards ──────────────────────────────────────────────── */}
        <div className="grid gap-5 sm:grid-cols-3">
          <RegionCard
            title="Region A"
            accent="sky"
            branches={regionBranchLabels.A}
            data={regions.A}
          />
          <RegionCard
            title="Region B"
            accent="amber"
            branches={regionBranchLabels.B}
            data={regions.B}
          />
          <RegionCard
            title="Region C"
            accent="emerald"
            branches={regionBranchLabels.C}
            data={regions.C}
          />
        </div>

        {/* ── Trial Class Schedule ────────────────────────────────────────── */}
        <TrialSchedule />

        {/* ── New Leads by Branch ─────────────────────────────────────────── */}
        <BranchBarChart branches={shownBranches} />

        {/* ── Per-branch table ─────────────────────────────────────────────── */}
        <BranchTable branches={shownBranches} />

      </div>
    </div>
  );
}

// ─── Main pipeline block ──────────────────────────────────────────────────────

function MainBlock({ data }: { data: MainTotals }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Section title */}
      <div className="mb-5">
        <h2 className="text-base font-bold text-blue-600 dark:text-blue-400">Main</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Overall pipeline</p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {/* Funnel pairs — each column: big stat on top, rate below */}
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          <FunnelPair
            label="NL"
            value={data.NL}
            rateLabel="Conversion Rate"
            rateValue={pct(data.convRate)}
            rateHint="ENR / NL"
          />
          <FunnelPair
            label="CT"
            value={data.CT}
            rateLabel="Confirmed Rate"
            rateValue={pct(data.confRate)}
            rateHint="CT / NL"
          />
          <FunnelPair
            label="SU"
            value={data.SU}
            rateLabel="Show Up Rate"
            rateValue={pct(data.showUpRate)}
            rateHint="SU / CT"
          />
          <FunnelPair
            label="ENR"
            value={data.ENR}
            rateLabel="Enrolment Rate"
            rateValue={pct(data.enrolRate)}
            rateHint="ENR / SU"
          />
        </div>

        {/* Buffer — separated from the funnel; snapshot only */}
        <div className="lg:border-l lg:border-slate-200 lg:pl-5 dark:lg:border-slate-800">
          <div className="flex h-full min-w-28 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-6 py-4 text-center dark:border-slate-700 dark:bg-slate-800">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Buffer
            </span>
            <span className="mt-1.5 text-4xl font-bold text-slate-800 dark:text-slate-100">
              {data.BUF}
            </span>
            <span className="mt-1 text-[10px] text-slate-400">
              OD use only · snapshot
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FunnelPair({
  label,
  value,
  rateLabel,
  rateValue,
  rateHint,
}: {
  label: string;
  value: number;
  rateLabel: string;
  rateValue: string;
  rateHint: string;
}) {
  return (
    <div className="space-y-2">
      {/* Big stat */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      </div>
      {/* Rate */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {rateLabel}
        </p>
        <p className="mt-1 text-xl font-semibold text-slate-800 dark:text-slate-200">{rateValue}</p>
        <p className="mt-0.5 text-[10px] text-slate-400">{rateHint}</p>
      </div>
    </div>
  );
}

// ─── Region card ──────────────────────────────────────────────────────────────

const ACCENT_TITLE: Record<string, string> = {
  sky:     "text-sky-600 dark:text-sky-400",
  amber:   "text-amber-600 dark:text-amber-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
};

function RegionCard({
  title,
  accent,
  branches,
  data,
}: {
  title: string;
  accent: "sky" | "amber" | "emerald";
  branches: string[];
  data: RegionTotals;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4">
        <h3 className={`text-sm font-bold ${ACCENT_TITLE[accent]}`}>{title}</h3>
        <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
          {branches.join(" · ")}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <MiniStat label="NL"  value={data.NL}  />
        <MiniStat label="CT"  value={data.CT}  />
        <MiniStat label="SU"  value={data.SU}  />
        <MiniStat label="ENR" value={data.ENR} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

// ─── Branch bar chart (CSS-based, no library needed) ─────────────────────────

const BAR_COLOR: Record<Region, string> = {
  A: "bg-sky-500",
  B: "bg-amber-500",
  C: "bg-emerald-500",
};

function BranchBarChart({ branches }: { branches: BranchRow[] }) {
  const max = Math.max(1, ...branches.map((b) => b.NL));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          New Leads by Branch
        </h2>
        <div className="flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
          <LegendDot color="bg-sky-500"     label="Region A" />
          <LegendDot color="bg-amber-500"   label="Region B" />
          <LegendDot color="bg-emerald-500" label="Region C" />
        </div>
      </div>

      <div className="space-y-2">
        {branches.map((b) => {
          const color = b.region ? BAR_COLOR[b.region] : "bg-slate-400";
          const width = `${(b.NL / max) * 100}%`;
          return (
            <div key={b.code} className="flex items-center gap-3">
              <span className="w-6 font-mono text-[11px] font-semibold tabular-nums text-slate-400">
                {b.code}
              </span>
              <span className="w-40 truncate text-xs text-slate-700 dark:text-slate-300">
                {b.name}
              </span>
              <div className="flex-1 rounded-full bg-slate-100 dark:bg-slate-800" style={{ height: 20 }}>
                <div
                  className={`${color} h-full rounded-full transition-all duration-500`}
                  style={{ width }}
                />
              </div>
              <span className="w-8 text-right font-mono text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                {b.NL}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span>{label}</span>
    </span>
  );
}

// ─── Per-branch table ─────────────────────────────────────────────────────────

function BranchTable({ branches }: { branches: BranchRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-5 py-3">Branch</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3 text-right">NL</th>
              <th className="px-4 py-3 text-right">CT</th>
              <th className="px-4 py-3 text-right">SU</th>
              <th className="px-4 py-3 text-right">ENR</th>
              <th className="px-4 py-3 text-right">Conv</th>
              <th className="px-4 py-3 text-right">Enrol</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {branches.map((b) => {
              const conv  = b.NL > 0 ? b.ENR / b.NL : 0;
              const enrol = b.SU > 0 ? b.ENR / b.SU : 0;
              return (
                <tr
                  key={b.code}
                  className="text-slate-800 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <td className="px-5 py-3 font-medium">{b.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                    {b.code}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{b.NL}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{b.CT}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{b.SU}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{b.ENR}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-blue-600 dark:text-blue-400">
                    {pct(conv)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {pct(enrol)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
