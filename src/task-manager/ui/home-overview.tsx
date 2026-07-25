"use client";

// Superadmin's org-wide Task Manager overview, rendered on the OSC HOME page
// (moved off /task-manager): all-departments Daily + Monthly donut grids,
// branch status by Region A/B/C Daily + Monthly, and ad hoc tasks by region.
// Same components and drill-down modals as the Task Manager page used —
// read-only rollups, so no server actions are needed here.

import type { FlowDetailResponse } from "./types";
import { PageSectionHeading } from "./bits";
import { EntityDonutGrid, RegionDonutGrids } from "./overview-grids";

export function HomeTaskOverview({
  dailyOrg,
  monthlyOrg,
  adhocByRegion,
  departmentOverviewHref,
}: {
  dailyOrg: NonNullable<FlowDetailResponse["org"]>;
  monthlyOrg?: FlowDetailResponse["org"];
  adhocByRegion?: FlowDetailResponse["adhocByRegion"];
  /** Base URL of the Department Overview page — each department's name links
   *  out to `?department=<name>` on it (same separator handling as
   *  task-manager-view's deptHref). */
  departmentOverviewHref: string;
}) {
  const sep = departmentOverviewHref.includes("?") ? "&" : "?";
  const deptHref = (department: string) =>
    `${departmentOverviewHref}${sep}department=${encodeURIComponent(department)}`;

  return (
    <div className="flex flex-col gap-5">
      <PageSectionHeading>Task Manager — Overview</PageSectionHeading>
      <EntityDonutGrid
        title="All Departments — Daily"
        entities={dailyOrg.departments}
        nameHref={deptHref}
      />
      {monthlyOrg && (
        <EntityDonutGrid
          title="All Departments — Monthly"
          entities={monthlyOrg.departments}
          nameHref={deptHref}
        />
      )}
      {/* Branch status grouped by region — Daily combines all three staff
          roles (Manager/Branch Exec/Coach); Monthly is Manager only. Same
          fixed rules as the grids had on /task-manager. */}
      <RegionDonutGrids
        title="Branch Status by Region — Daily"
        regions={dailyOrg.regions}
      />
      {monthlyOrg && (
        <RegionDonutGrids
          title="Branch Status by Region — Monthly (Manager)"
          regions={
            monthlyOrg.regionsByRole.find((v) => v.role === "Manager")?.regions ?? []
          }
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
