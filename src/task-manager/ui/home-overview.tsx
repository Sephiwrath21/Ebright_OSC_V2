"use client";

// Superadmin's org-wide Task Manager overview, rendered on the OSC HOME page
// (moved off /task-manager): all-departments Daily + Monthly stats grids
// (2026-08-15: text-only, ring chart removed — see overview-grids.tsx's
// EntityStatsGrid), branch status by Region A/B/C Daily + Monthly (still
// donut-based, unchanged), and ad hoc tasks by region. Same components and
// drill-down modals as the Task Manager page used — read-only rollups, so
// no server actions are needed here.

import type { FlowDetailResponse } from "./types";
import { PageSectionHeading } from "./bits";
import { DailyDatePicker, MonthDropdown, MonthRangeDropdown } from "./entity-picker";
import { EntityStatsGrid, RegionDonutGrids } from "./overview-grids";

export function HomeTaskOverview({
  dailyOrg,
  monthlyOrg,
  adhocByRegion,
  departmentOverviewHref,
  dailyDate,
  monthlyDate,
  adhocDate,
  dateFilterParams,
}: {
  dailyOrg: NonNullable<FlowDetailResponse["org"]>;
  monthlyOrg?: FlowDetailResponse["org"];
  adhocByRegion?: FlowDetailResponse["adhocByRegion"];
  /** Base URL of the Department Overview page — each department's name links
   *  out to `?department=<name>` on it (same separator handling as
   *  task-manager-view's deptHref). */
  departmentOverviewHref: string;
  /** Resolved Daily anchor date (YYYY-MM-DD) — when given, mounts the date
   *  filter on the Daily grid heading. Both org payloads (departments AND
   *  branch regions) follow their section's anchor. */
  dailyDate?: string;
  /** Resolved Monthly anchor date — filter on the Monthly grid heading;
   *  any picked date selects that date's whole month. */
  monthlyDate?: string;
  /** Resolved Ad hoc anchor date — filter on the Ad hoc regions heading.
   *  One picker only (Ad hoc is its own cadence, no Daily/Monthly split);
   *  the section shows that single day's ad hoc tasks. */
  adhocDate?: string;
  /** The raw ?date=/?mdate=/?mrange=/?adate= values currently in the URL —
   *  each control carries the OTHERS along so the filters stay independent. */
  dateFilterParams?: { date?: string; mdate?: string; mrange?: string; adate?: string };
}) {
  const sep = departmentOverviewHref.includes("?") ? "&" : "?";
  const deptHref = (department: string) =>
    `${departmentOverviewHref}${sep}department=${encodeURIComponent(department)}`;
  const raw = dateFilterParams ?? {};
  // Every picker carries the OTHER filters' raw params along unchanged, so
  // changing one date never resets the others.
  const carry = (...except: string[]) =>
    Object.fromEntries(
      Object.entries(raw).filter(([k, v]) => v && !except.includes(k)),
    ) as Record<string, string>;

  // One picker per period, mounted on BOTH that period's sections
  // (departments + branch regions). They share a URL param, so the two
  // Daily pickers (and the two Monthly ones) always show the same date and
  // either can drive it.
  const dailyPicker = dailyDate && (
    <DailyDatePicker
      key="org-daily-picker"
      value={dailyDate}
      basePath="/home"
      extraParams={carry("date")}
    />
  );
  // Monthly selector (2026-07-29 redesign): compact [Month ▾][Range ▾]
  // pair replaces the calendar picker on every Monthly grid heading.
  const monthlyPicker = monthlyDate && (
    <div key="org-monthly-controls" className="flex items-center gap-1.5">
      <MonthDropdown value={monthlyDate} basePath="/home" extraParams={carry("mdate", "mrange")} />
      <MonthRangeDropdown
        value={monthlyDate}
        range={raw.mrange}
        basePath="/home"
        extraParams={carry("mdate", "mrange")}
      />
    </div>
  );
  const adhocPicker = adhocDate && (
    <DailyDatePicker
      key="org-adhoc-picker"
      value={adhocDate}
      basePath="/home"
      param="adate"
      extraParams={carry("adate")}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <PageSectionHeading>Task Manager — Overview</PageSectionHeading>
      <EntityStatsGrid
        title="All Departments — Daily"
        entities={dailyOrg.departments}
        nameHref={deptHref}
        action={dailyPicker}
      />
      {monthlyOrg && (
        <EntityStatsGrid
          title="All Departments — Monthly"
          entities={monthlyOrg.departments}
          nameHref={deptHref}
          action={monthlyPicker}
        />
      )}
      {/* Branch status grouped by region — Daily combines all three staff
          roles (Manager/Branch Exec/Coach); Monthly is Manager only. Same
          fixed rules as the grids had on /task-manager. */}
      <RegionDonutGrids
        title="Branch Status by Region — Daily"
        regions={dailyOrg.regions}
        action={dailyPicker}
      />
      {monthlyOrg && (
        <RegionDonutGrids
          title="Branch Status by Region — Monthly (Manager)"
          regions={
            monthlyOrg.regionsByRole.find((v) => v.role === "Manager")?.regions ?? []
          }
          action={monthlyPicker}
        />
      )}
      {adhocByRegion && (
        <RegionDonutGrids
          title="Ad hoc Tasks by Region (Manager)"
          regions={adhocByRegion.regions}
          action={adhocPicker}
        />
      )}
    </div>
  );
}
