"use client";

// Superadmin's org-wide Task Manager overview, rendered on the OSC HOME page
// (moved off /task-manager): all-departments Daily + Monthly donut grids,
// branch status by Region A/B/C Daily + Monthly, and ad hoc tasks by region.
// Same components and drill-down modals as the Task Manager page used —
// read-only rollups, so no server actions are needed here.

import type { FlowDetailResponse } from "./types";
import { PageSectionHeading } from "./bits";
import { DailyDatePicker } from "./entity-picker";
import { EntityDonutGrid, RegionDonutGrids } from "./overview-grids";

export function HomeTaskOverview({
  dailyOrg,
  monthlyOrg,
  adhocByRegion,
  departmentOverviewHref,
  dailyDate,
  monthlyDate,
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
  /** The raw ?date=/?mdate= values currently in the URL — each picker
   *  carries the OTHER one along so the two filters stay independent. */
  dateFilterParams?: { date?: string; mdate?: string };
}) {
  const sep = departmentOverviewHref.includes("?") ? "&" : "?";
  const deptHref = (department: string) =>
    `${departmentOverviewHref}${sep}department=${encodeURIComponent(department)}`;
  const raw = dateFilterParams ?? {};

  // One picker per period, mounted on BOTH that period's sections
  // (departments + branch regions). They share a URL param, so the two
  // Daily pickers (and the two Monthly ones) always show the same date and
  // either can drive it.
  const dailyPicker = dailyDate && (
    <DailyDatePicker
      value={dailyDate}
      basePath="/home"
      extraParams={raw.mdate ? { mdate: raw.mdate } : {}}
    />
  );
  const monthlyPicker = monthlyDate && (
    <DailyDatePicker
      value={monthlyDate}
      basePath="/home"
      param="mdate"
      step="month"
      extraParams={raw.date ? { date: raw.date } : {}}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <PageSectionHeading>Task Manager — Overview</PageSectionHeading>
      <EntityDonutGrid
        title="All Departments — Daily"
        entities={dailyOrg.departments}
        nameHref={deptHref}
        action={dailyPicker}
      />
      {monthlyOrg && (
        <EntityDonutGrid
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
        />
      )}
    </div>
  );
}
