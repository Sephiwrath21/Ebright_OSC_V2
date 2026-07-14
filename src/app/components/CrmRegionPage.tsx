"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Home, ChevronRight, RefreshCw, MapPinned } from "lucide-react";

const BRAND = "#ED1C24";

type Region = "A" | "B" | "C";
type TrialDay = "WED" | "THU" | "FRI" | "SAT" | "SUN";
const DAYS: TrialDay[] = ["WED", "THU", "FRI", "SAT", "SUN"];

interface DayCounts { CT: number; ENR: number }
interface BranchRow {
  id: string;
  name: string;
  shortName: string;
  region: Region;
  totals: DayCounts;
  days: Record<TrialDay, DayCounts>;
}

const PRESETS = [
  { id: "today",      label: "Today" },
  { id: "yesterday",  label: "Yesterday" },
  { id: "this_week",  label: "This Week" },
  { id: "last_week",  label: "Last Week" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
] as const;
type Preset = (typeof PRESETS)[number]["id"];

// ─── Mock data ─────────────────────────────────────────────────────────────────

const ALL_BRANCHES: BranchRow[] = [
  {
    id: "1", name: "02 Subang Taipan", shortName: "Subang Taipan", region: "A",
    totals: { CT: 12, ENR: 7 },
    days: { WED: { CT: 3, ENR: 2 }, THU: { CT: 2, ENR: 1 }, FRI: { CT: 1, ENR: 1 }, SAT: { CT: 4, ENR: 2 }, SUN: { CT: 2, ENR: 1 } },
  },
  {
    id: "2", name: "04 Sri Petaling", shortName: "Sri Petaling", region: "A",
    totals: { CT: 9, ENR: 5 },
    days: { WED: { CT: 2, ENR: 1 }, THU: { CT: 1, ENR: 1 }, FRI: { CT: 2, ENR: 0 }, SAT: { CT: 3, ENR: 2 }, SUN: { CT: 1, ENR: 1 } },
  },
  {
    id: "3", name: "07 Ampang", shortName: "Ampang", region: "A",
    totals: { CT: 7, ENR: 3 },
    days: { WED: { CT: 2, ENR: 0 }, THU: { CT: 1, ENR: 1 }, FRI: { CT: 1, ENR: 1 }, SAT: { CT: 2, ENR: 1 }, SUN: { CT: 1, ENR: 0 } },
  },
  {
    id: "4", name: "03 Setia Alam", shortName: "Setia Alam", region: "B",
    totals: { CT: 15, ENR: 10 },
    days: { WED: { CT: 3, ENR: 2 }, THU: { CT: 4, ENR: 3 }, FRI: { CT: 2, ENR: 1 }, SAT: { CT: 4, ENR: 3 }, SUN: { CT: 2, ENR: 1 } },
  },
  {
    id: "5", name: "05 Kota Damansara", shortName: "Kota Damansara", region: "B",
    totals: { CT: 8, ENR: 4 },
    days: { WED: { CT: 2, ENR: 1 }, THU: { CT: 2, ENR: 1 }, FRI: { CT: 1, ENR: 0 }, SAT: { CT: 2, ENR: 1 }, SUN: { CT: 1, ENR: 1 } },
  },
  {
    id: "6", name: "09 Klang", shortName: "Klang", region: "B",
    totals: { CT: 6, ENR: 3 },
    days: { WED: { CT: 1, ENR: 1 }, THU: { CT: 2, ENR: 0 }, FRI: { CT: 1, ENR: 1 }, SAT: { CT: 1, ENR: 1 }, SUN: { CT: 1, ENR: 0 } },
  },
  {
    id: "7", name: "06 Putrajaya", shortName: "Putrajaya", region: "C",
    totals: { CT: 6, ENR: 3 },
    days: { WED: { CT: 1, ENR: 0 }, THU: { CT: 1, ENR: 1 }, FRI: { CT: 2, ENR: 1 }, SAT: { CT: 1, ENR: 1 }, SUN: { CT: 1, ENR: 0 } },
  },
  {
    id: "8", name: "08 Cyberjaya", shortName: "Cyberjaya", region: "C",
    totals: { CT: 5, ENR: 2 },
    days: { WED: { CT: 1, ENR: 0 }, THU: { CT: 1, ENR: 1 }, FRI: { CT: 1, ENR: 0 }, SAT: { CT: 2, ENR: 1 }, SUN: { CT: 0, ENR: 0 } },
  },
  {
    id: "9", name: "11 Bandar Baru Bangi", shortName: "Bandar Baru Bangi", region: "C",
    totals: { CT: 4, ENR: 2 },
    days: { WED: { CT: 1, ENR: 0 }, THU: { CT: 1, ENR: 1 }, FRI: { CT: 0, ENR: 0 }, SAT: { CT: 1, ENR: 1 }, SUN: { CT: 1, ENR: 0 } },
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Pill({
  active,
  onClick,
  children,
  size = "md",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-3 py-1 text-[11px]" : "px-4 py-1.5 text-xs";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full font-medium transition-all ${pad} ${
        active
          ? "text-white shadow-sm ring-1 ring-black/10"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
      style={active ? { backgroundColor: BRAND } : undefined}
    >
      {children}
    </button>
  );
}

function DayCell({ day, counts }: { day: TrialDay; counts: DayCounts }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{day}</div>
      <div className="mt-2 flex items-center justify-center gap-1.5 text-xl font-bold tabular-nums leading-none">
        <span
          className={counts.CT > 0 ? "" : "text-slate-300"}
          style={counts.CT > 0 ? { color: BRAND } : undefined}
        >
          {counts.CT}
        </span>
        <span className="text-slate-300 font-light">|</span>
        <span
          className={counts.ENR > 0 ? "" : "text-slate-300"}
          style={counts.ENR > 0 ? { color: BRAND } : undefined}
        >
          {counts.ENR}
        </span>
      </div>
    </div>
  );
}

function GridRow({
  label,
  totals,
  days,
  emphasis,
}: {
  label: string;
  totals: DayCounts;
  days: Record<TrialDay, DayCounts>;
  emphasis?: boolean;
}) {
  const hasAny = totals.CT > 0 || totals.ENR > 0;
  return (
    <div
      className={`grid items-start gap-3 rounded-xl border bg-white p-4 shadow-sm transition-colors ${
        emphasis
          ? "border-l-4 border-slate-200"
          : "border-slate-200 hover:border-slate-300"
      }`}
      style={{
        gridTemplateColumns: "minmax(160px,200px) repeat(5,1fr)",
        borderLeftColor: emphasis ? BRAND : undefined,
      }}
    >
      <div className="px-1">
        <div
          className={`truncate ${
            emphasis
              ? "text-lg font-bold text-slate-900"
              : "text-base font-semibold text-slate-800"
          }`}
        >
          {label}
        </div>
        <div className="mt-1.5 flex items-center gap-1 font-mono text-[11px]">
          <span className="text-slate-400">[</span>
          <span
            className={totals.CT > 0 ? "font-semibold" : "text-slate-400"}
            style={totals.CT > 0 ? { color: BRAND } : undefined}
          >
            {totals.CT}
          </span>
          <span className="text-slate-400">|</span>
          <span
            className={totals.ENR > 0 ? "font-semibold" : "text-slate-400"}
            style={totals.ENR > 0 ? { color: BRAND } : undefined}
          >
            {totals.ENR}
          </span>
          <span className="text-slate-400">]</span>
          {!hasAny && (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-400">
              no bookings
            </span>
          )}
        </div>
      </div>
      {DAYS.map(d => (
        <DayCell key={d} day={d} counts={days[d]} />
      ))}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function CrmRegionPage() {
  const [preset,   setPreset]   = useState<Preset>("this_week");
  const [region,   setRegion]   = useState<"all" | Region>("all");
  const [branchId, setBranchId] = useState<string>("all");
  const [spin,     setSpin]     = useState(false);

  function chooseRegion(r: "all" | Region) {
    setRegion(r);
    setBranchId("all");
  }

  function handleRefresh() {
    setSpin(true);
    setTimeout(() => setSpin(false), 700);
  }

  const branchesInRegion = useMemo(
    () => region === "all" ? ALL_BRANCHES : ALL_BRANCHES.filter(b => b.region === region),
    [region],
  );

  const rowsToRender = useMemo(
    () => branchId === "all" ? branchesInRegion : branchesInRegion.filter(b => b.id === branchId),
    [branchesInRegion, branchId],
  );

  const overall = useMemo(() => {
    const totals: DayCounts = { CT: 0, ENR: 0 };
    const days = Object.fromEntries(
      DAYS.map(d => [d, { CT: 0, ENR: 0 }])
    ) as Record<TrialDay, DayCounts>;
    for (const b of rowsToRender) {
      totals.CT  += b.totals.CT;
      totals.ENR += b.totals.ENR;
      for (const d of DAYS) {
        days[d].CT  += b.days[d].CT;
        days[d].ENR += b.days[d].ENR;
      }
    }
    return { totals, days };
  }, [rowsToRender]);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-10">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors rounded">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/crm" className="hover:text-slate-900 transition-colors rounded">CNS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-700">Lead</span>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Region</span>
        </nav>

        {/* Page header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm shrink-0"
              style={{ backgroundColor: BRAND }}
            >
              <MapPinned className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Day Distribution</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                CT bookings by preferred trial day · Each cell shows{" "}
                <span className="font-medium" style={{ color: BRAND }}>CT</span>
                <span className="text-slate-400"> | </span>
                <span className="font-medium" style={{ color: BRAND }}>ENR</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={spin}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${spin ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Filter card */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm mb-6">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Date range</p>
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map(p => (
                <Pill key={p.id} active={preset === p.id} onClick={() => setPreset(p.id)}>
                  {p.label}
                </Pill>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Region</p>
            <div className="flex flex-wrap items-center gap-2">
              <Pill active={region === "all"} onClick={() => chooseRegion("all")}>All Regions</Pill>
              {(["A", "B", "C"] as const).map(r => (
                <Pill key={r} active={region === r} onClick={() => chooseRegion(r)}>
                  Region {r}
                </Pill>
              ))}
            </div>
          </div>

          {branchesInRegion.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Branch</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill active={branchId === "all"} onClick={() => setBranchId("all")} size="sm">
                  All ({branchesInRegion.length})
                </Pill>
                {branchesInRegion.map(b => (
                  <Pill key={b.id} active={branchId === b.id} onClick={() => setBranchId(b.id)} size="sm">
                    {b.shortName}
                  </Pill>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Column header labels */}
        <div
          className="grid items-center gap-3 px-4 mb-2"
          style={{ gridTemplateColumns: "minmax(160px,200px) repeat(5,1fr)" }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 px-1">
            Branch
          </div>
          {DAYS.map(d => (
            <div key={d} className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 text-center">
              {d}
            </div>
          ))}
        </div>

        {/* Grid rows */}
        {rowsToRender.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm shadow-sm">
            <p className="text-slate-500">No branches match the current filters.</p>
            <p className="mt-1 text-xs text-slate-400">
              Make sure branches have a region assigned (A / B / C) under Settings → Branches.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <GridRow label="Overall" totals={overall.totals} days={overall.days} emphasis />
            {rowsToRender.map(b => (
              <GridRow key={b.id} label={b.shortName} totals={b.totals} days={b.days} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
