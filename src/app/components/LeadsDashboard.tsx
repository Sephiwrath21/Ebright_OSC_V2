"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Home } from "lucide-react";

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

const REGION_BRANCHES: Record<Region, string[]> = {
  A: ["17 Bandar Rimbayu", "09 Klang", "13 Shah Alam", "03 Setia Alam", "10 Denai Alam", "15 Eco Grandeur", "02 Subang Taipan", "21 Tropicana Sungai Buloh"],
  B: ["12 Danau Kota", "05 Kota Damansara", "07 Ampang", "04 Sri Petaling", "14 Bandar Tun Hussein Onn", "20 Kajang TTDI Grove", "18 Taman Sri Gombak", "23 Dataran Puchong Utama"],
  C: ["06 Putrajaya", "19 Kota Warisan", "11 Bandar Baru Bangi", "08 Cyberjaya", "16 Bandar Seri Putra", "01 Online", "22 Puncak Jalil"],
};

const MOCK_BRANCHES: BranchRow[] = [
  { code: "01", name: "Online",                region: "C", NL: 12, CT: 3,  SU: 0, ENR: 0 },
  { code: "02", name: "Subang Taipan",         region: "A", NL: 24, CT: 6,  SU: 0, ENR: 0 },
  { code: "03", name: "Setia Alam",            region: "A", NL: 32, CT: 8,  SU: 1, ENR: 1 },
  { code: "04", name: "Sri Petaling",          region: "B", NL: 20, CT: 5,  SU: 0, ENR: 0 },
  { code: "05", name: "Kota Damansara",        region: "B", NL: 28, CT: 7,  SU: 0, ENR: 0 },
  { code: "06", name: "Putrajaya",             region: "C", NL: 18, CT: 5,  SU: 0, ENR: 0 },
  { code: "07", name: "Ampang",                region: "B", NL: 24, CT: 6,  SU: 1, ENR: 1 },
  { code: "08", name: "Cyberjaya",             region: "C", NL: 20, CT: 5,  SU: 0, ENR: 0 },
  { code: "09", name: "Klang",                 region: "A", NL: 30, CT: 8,  SU: 0, ENR: 0 },
  { code: "10", name: "Denai Alam",            region: "A", NL: 22, CT: 6,  SU: 0, ENR: 0 },
  { code: "11", name: "Bandar Baru Bangi",     region: "C", NL: 20, CT: 5,  SU: 0, ENR: 0 },
  { code: "12", name: "Danau Kota",            region: "B", NL: 26, CT: 7,  SU: 0, ENR: 0 },
  { code: "13", name: "Shah Alam",             region: "A", NL: 38, CT: 10, SU: 1, ENR: 1 },
  { code: "14", name: "Bandar Tun Hussein Onn",region: "B", NL: 22, CT: 6,  SU: 0, ENR: 0 },
  { code: "15", name: "Eco Grandeur",          region: "A", NL: 18, CT: 5,  SU: 0, ENR: 0 },
  { code: "16", name: "Bandar Seri Putra",     region: "C", NL: 14, CT: 4,  SU: 0, ENR: 0 },
  { code: "17", name: "Bandar Rimbayu",        region: "A", NL: 28, CT: 7,  SU: 0, ENR: 0 },
  { code: "18", name: "Taman Sri Gombak",      region: "B", NL: 20, CT: 5,  SU: 1, ENR: 1 },
  { code: "19", name: "Kota Warisan",          region: "C", NL: 16, CT: 4,  SU: 0, ENR: 0 },
  { code: "20", name: "Kajang TTDI Grove",     region: "B", NL: 22, CT: 6,  SU: 0, ENR: 0 },
  { code: "21", name: "Tropicana Sungai Buloh",region: "A", NL: 18, CT: 5,  SU: 0, ENR: 0 },
  { code: "22", name: "Puncak Jalil",          region: "C", NL: 16, CT: 4,  SU: 0, ENR: 0 },
  { code: "23", name: "Dataran Puchong Utama", region: "B", NL: 26, CT: 8,  SU: 0, ENR: 0 },
];

const MOCK_MAIN: MainTotals = {
  NL: 538, CT: 138, SU: 6, ENR: 6, BUF: 0,
  convRate:    6 / 538,
  confRate:  138 / 538,
  showUpRate:  6 / 138,
  enrolRate:   6 / 6,
};

const MOCK_REGIONS: Record<Region, RegionTotals> = {
  A: { NL: 210, CT: 55, SU: 3, ENR: 3 },
  B: { NL: 188, CT: 50, SU: 2, ENR: 2 },
  C: { NL: 140, CT: 33, SU: 1, ENR: 1 },
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function pct(v: number): string {
  if (!isFinite(v) || isNaN(v) || v === 0) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function LeadsDashboard() {
  const [preset, setPreset] = useState<Preset>("this_week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [branchId,   setBranchId]   = useState("");

  const customReady = preset === "custom" && !!customFrom && !!customTo;
  const rangeLabel  = "22 Jun 2026 – 28 Jun 2026"; // replaced by API later

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-screen-xl px-6 py-6 space-y-6">

        {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/crm" className="hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded">
            CNS
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-700">Lead</span>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Dashboard</span>
        </nav>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Leads Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {rangeLabel} · NL by created · CT by trial date · SU / ENR by stage entry
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Branch picker */}
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All branches</option>
              {MOCK_BRANCHES.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code} {b.name}
                </option>
              ))}
            </select>

            {/* Date preset pill tabs */}
            <div className="flex items-center gap-0.5 rounded-full bg-slate-100 p-1">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPreset(p.key)}
                  className={[
                    "rounded-full px-3 py-1 text-sm transition-all",
                    preset === p.key
                      ? "bg-white font-medium text-blue-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900",
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
            <span className="text-xs font-medium text-slate-500">From</span>
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs font-medium text-slate-500">to</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {!customReady && (
              <span className="text-xs italic text-slate-400">
                Pick both dates to apply.
              </span>
            )}
          </div>
        )}

        {/* ── Main pipeline block ─────────────────────────────────────────── */}
        <MainBlock data={MOCK_MAIN} />

        {/* ── Regional cards ──────────────────────────────────────────────── */}
        <div className="grid gap-5 sm:grid-cols-3">
          <RegionCard
            title="Region A"
            accent="sky"
            branches={REGION_BRANCHES.A}
            data={MOCK_REGIONS.A}
          />
          <RegionCard
            title="Region B"
            accent="amber"
            branches={REGION_BRANCHES.B}
            data={MOCK_REGIONS.B}
          />
          <RegionCard
            title="Region C"
            accent="emerald"
            branches={REGION_BRANCHES.C}
            data={MOCK_REGIONS.C}
          />
        </div>

        {/* ── New Leads by Branch ─────────────────────────────────────────── */}
        <BranchBarChart branches={MOCK_BRANCHES} />

        {/* ── Per-branch table ─────────────────────────────────────────────── */}
        <BranchTable branches={MOCK_BRANCHES} />

      </div>
    </div>
  );
}

// ─── Main pipeline block ──────────────────────────────────────────────────────

function MainBlock({ data }: { data: MainTotals }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* Section title */}
      <div className="mb-5">
        <h2 className="text-base font-bold text-blue-600">Main</h2>
        <p className="text-xs text-slate-500">Overall pipeline</p>
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
        <div className="lg:border-l lg:border-slate-200 lg:pl-5">
          <div className="flex h-full min-w-28 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-6 py-4 text-center">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Buffer
            </span>
            <span className="mt-1.5 text-4xl font-bold text-slate-800">
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
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          {label}
        </p>
        <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
      </div>
      {/* Rate */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          {rateLabel}
        </p>
        <p className="mt-1 text-xl font-semibold text-slate-800">{rateValue}</p>
        <p className="mt-0.5 text-[10px] text-slate-400">{rateHint}</p>
      </div>
    </div>
  );
}

// ─── Region card ──────────────────────────────────────────────────────────────

const ACCENT_TITLE: Record<string, string> = {
  sky:     "text-sky-600",
  amber:   "text-amber-600",
  emerald: "text-emerald-600",
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-bold text-slate-900">{value}</p>
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
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">
          New Leads by Branch
        </h2>
        <div className="flex items-center gap-4 text-[11px] text-slate-500">
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
              <span className="w-40 truncate text-xs text-slate-700">
                {b.name}
              </span>
              <div className="flex-1 rounded-full bg-slate-100" style={{ height: 20 }}>
                <div
                  className={`${color} h-full rounded-full transition-all duration-500`}
                  style={{ width }}
                />
              </div>
              <span className="w-8 text-right font-mono text-xs font-semibold tabular-nums text-slate-800">
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
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
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
          <tbody className="divide-y divide-slate-100">
            {branches.map((b) => {
              const conv  = b.NL > 0 ? b.ENR / b.NL : 0;
              const enrol = b.SU > 0 ? b.ENR / b.SU : 0;
              return (
                <tr
                  key={b.code}
                  className="text-slate-800 transition-colors hover:bg-slate-50"
                >
                  <td className="px-5 py-3 font-medium">{b.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {b.code}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{b.NL}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{b.CT}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{b.SU}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{b.ENR}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-blue-600">
                    {pct(conv)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-600">
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
