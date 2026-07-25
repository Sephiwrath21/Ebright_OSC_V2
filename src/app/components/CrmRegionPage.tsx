"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  region: Region | null;
  totals: DayCounts;
  days: Record<TrialDay, DayCounts>;
}

// Shape returned by /api/crm/region/day-distribution
interface ApiBranch {
  branchId: string;
  branchName: string;
  shortName: string;
  region: Region | null;
  totals: DayCounts;
  days: Record<TrialDay, DayCounts>;
}
interface RegionResponse {
  range: { from: string; to: string };
  availableRegions: Region[];
  overall: { totals: DayCounts; days: Record<TrialDay, DayCounts> };
  branches: ApiBranch[];
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
  const [rows,     setRows]     = useState<BranchRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [nonce,    setNonce]    = useState(0); // bumped by Refresh to refetch

  function chooseRegion(r: "all" | Region) {
    setRegion(r);
    setBranchId("all");
  }

  function handleRefresh() {
    setSpin(true);
    setNonce((n) => n + 1);
  }

  // Fetch real Day Distribution from ebright_crm (read-only). Server does the
  // region filtering + per-branch CT/ENR tally; branch drill stays client-side.
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    const qs = new URLSearchParams({ preset });
    if (region !== "all") qs.set("region", region);
    fetch(`/api/crm/region/day-distribution?${qs.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `Request failed (${r.status})`);
        }
        return r.json() as Promise<RegionResponse>;
      })
      .then((d) => {
        if (ignore) return;
        setRows(d.branches.map((b) => ({
          id: b.branchId,
          name: b.branchName,
          shortName: b.shortName,
          region: b.region,
          totals: b.totals,
          days: b.days,
        })));
        setError(null);
      })
      .catch((e) => { if (!ignore) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!ignore) { setLoading(false); setSpin(false); } });
    return () => { ignore = true; };
  }, [preset, region, nonce]);

  const branchesInRegion = rows;

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
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">

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
          {/* Date range + Region share one row (Region to the right) */}
          <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
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

            <div className="sm:ml-auto">
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
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm shadow-sm">
            <div className="mx-auto mb-2 h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-[#ED1C24]" />
            <p className="text-slate-400">Loading day distribution…</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-12 text-center text-sm shadow-sm">
            <p className="text-red-600">Couldn&apos;t load day distribution: {error}</p>
          </div>
        ) : rowsToRender.length === 0 ? (
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
