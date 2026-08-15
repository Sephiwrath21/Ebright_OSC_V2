// Org-wide Task Manager overview, rendered on the OSC HOME page (2026-08-15
// rebuild — see docs/superpowers/specs/2026-08-15-home-org-wide-person-
// list-design.md). Every department/branch is a collapsible section: a
// lightweight rollup card by default, expanding (via ?expand=) into the
// same per-person EntityCardOverview list /task-manager's own dropdown
// view uses. HomeDepartmentOverview and HomeRegionOverview are exported
// separately because ADMIN/OPS/elevated DEPT_SITE (HomeTaskOverview) get
// BOTH, while the CEO's own dashboard (scoped-overview-section.tsx) gets
// ONLY HomeRegionOverview, appended below their draggable department
// dashboards.

import type { ReactNode } from "react";
import type {
  ActionResult,
  FlowCategoryOption,
  FlowDetailResponse,
  FlowEntityDetail,
  ProofRemoveHandler,
  ProofUploadHandler,
} from "./types";
import { PageSectionHeading } from "./bits";
import { DailyDatePicker, MonthDropdown, MonthRangeDropdown } from "./entity-picker";
import { EntityCardOverview } from "./entity-card-overview";
import { AdhocRollupGrid, EntityRollupGrid, RegionRollupGrid } from "./overview-grids";

interface EntityActions {
  complete?: (runBlockId: string) => Promise<ActionResult>;
  skip?: (runBlockId: string) => Promise<ActionResult>;
  reopen?: (runBlockId: string) => Promise<ActionResult>;
  uploadProof?: ProofUploadHandler;
  removeProof?: ProofRemoveHandler;
}

/** One entity's fetched Daily/Monthly detail — only built for entities the
 *  caller has already expanded (parsed from ?expand= by the caller). */
export interface ExpandedEntityDetail {
  daily?: FlowEntityDetail;
  monthly?: FlowEntityDetail;
}

function buildExpandedContent(
  details: Record<string, ExpandedEntityDetail>,
  period: "daily" | "monthly",
  categories: FlowCategoryOption[],
  myUserId: string,
  dateControl: ReactNode,
  actions?: EntityActions,
): Record<string, ReactNode> {
  const out: Record<string, ReactNode> = {};
  for (const [name, detail] of Object.entries(details)) {
    const entity = period === "daily" ? detail.daily : detail.monthly;
    if (!entity) continue;
    out[name] = (
      <EntityCardOverview
        sectionLabel={period === "daily" ? "Daily" : "Monthly"}
        entityName=""
        entity={entity}
        categories={categories}
        myUserId={myUserId}
        dateControl={dateControl}
        showViewToggle
        defaultOnlyMe={false}
        onComplete={actions?.complete}
        onSkip={actions?.skip}
        onReopen={actions?.reopen}
        onUploadProof={actions?.uploadProof}
        onRemoveProof={actions?.removeProof}
      />
    );
  }
  return out;
}

export function HomeDepartmentOverview({
  dailyOrg,
  monthlyOrg,
  expandedDepartmentDetails,
  expandParam,
  categories,
  myUserId,
  dailyPicker,
  monthlyPicker,
  extraParams,
  actions,
}: {
  dailyOrg: NonNullable<FlowDetailResponse["org"]>;
  monthlyOrg?: FlowDetailResponse["org"];
  expandedDepartmentDetails: Record<string, ExpandedEntityDetail>;
  expandParam?: string;
  categories: FlowCategoryOption[];
  myUserId: string;
  dailyPicker: ReactNode;
  monthlyPicker: ReactNode;
  extraParams: Record<string, string>;
  actions?: EntityActions;
}) {
  const expandedNames = new Set(Object.keys(expandedDepartmentDetails));
  return (
    <>
      <EntityRollupGrid
        title="All Departments — Daily"
        entities={dailyOrg.departments}
        kind="dept"
        expandedNames={expandedNames}
        expandedContent={buildExpandedContent(
          expandedDepartmentDetails,
          "daily",
          categories,
          myUserId,
          dailyPicker,
          actions,
        )}
        expandParam={expandParam}
        basePath="/home"
        extraParams={extraParams}
      />
      {monthlyOrg && (
        <EntityRollupGrid
          title="All Departments — Monthly"
          entities={monthlyOrg.departments}
          kind="dept"
          expandedNames={expandedNames}
          expandedContent={buildExpandedContent(
            expandedDepartmentDetails,
            "monthly",
            categories,
            myUserId,
            monthlyPicker,
            actions,
          )}
          expandParam={expandParam}
          basePath="/home"
          extraParams={extraParams}
        />
      )}
    </>
  );
}

export function HomeRegionOverview({
  dailyOrg,
  monthlyOrg,
  adhocByRegion,
  expandedBranchDetails,
  expandParam,
  categories,
  myUserId,
  dailyPicker,
  monthlyPicker,
  adhocPicker,
  extraParams,
  actions,
}: {
  dailyOrg: NonNullable<FlowDetailResponse["org"]>;
  monthlyOrg?: FlowDetailResponse["org"];
  adhocByRegion?: FlowDetailResponse["adhocByRegion"];
  expandedBranchDetails: Record<string, ExpandedEntityDetail>;
  expandParam?: string;
  categories: FlowCategoryOption[];
  myUserId: string;
  dailyPicker: ReactNode;
  monthlyPicker: ReactNode;
  adhocPicker?: ReactNode;
  extraParams: Record<string, string>;
  actions?: EntityActions;
}) {
  const expandedNames = new Set(Object.keys(expandedBranchDetails));
  return (
    <>
      <RegionRollupGrid
        title="Branch Status by Region — Daily"
        regions={dailyOrg.regions}
        expandedNames={expandedNames}
        expandedContent={buildExpandedContent(
          expandedBranchDetails,
          "daily",
          categories,
          myUserId,
          dailyPicker,
          actions,
        )}
        expandParam={expandParam}
        basePath="/home"
        extraParams={extraParams}
      />
      {monthlyOrg && (
        <RegionRollupGrid
          title="Branch Status by Region — Monthly (Manager)"
          regions={monthlyOrg.regionsByRole.find((v) => v.role === "Manager")?.regions ?? []}
          expandedNames={expandedNames}
          expandedContent={buildExpandedContent(
            expandedBranchDetails,
            "monthly",
            categories,
            myUserId,
            monthlyPicker,
            actions,
          )}
          expandParam={expandParam}
          basePath="/home"
          extraParams={extraParams}
        />
      )}
      {adhocByRegion && (
        <AdhocRollupGrid
          title="Ad hoc Tasks by Region (Manager)"
          regions={adhocByRegion.regions}
          action={adhocPicker}
        />
      )}
    </>
  );
}

export function HomeTaskOverview({
  dailyOrg,
  monthlyOrg,
  adhocByRegion,
  dailyDate,
  monthlyDate,
  adhocDate,
  dateFilterParams,
  expandedDepartmentDetails,
  expandedBranchDetails,
  expandParam,
  categories,
  myUserId,
  actions,
}: {
  dailyOrg: NonNullable<FlowDetailResponse["org"]>;
  monthlyOrg?: FlowDetailResponse["org"];
  adhocByRegion?: FlowDetailResponse["adhocByRegion"];
  dailyDate?: string;
  monthlyDate?: string;
  adhocDate?: string;
  dateFilterParams?: { date?: string; mdate?: string; mrange?: string; adate?: string };
  expandedDepartmentDetails: Record<string, ExpandedEntityDetail>;
  expandedBranchDetails: Record<string, ExpandedEntityDetail>;
  expandParam?: string;
  categories: FlowCategoryOption[];
  myUserId: string;
  actions?: EntityActions;
}) {
  const raw = dateFilterParams ?? {};
  const carry = (...except: string[]) =>
    Object.fromEntries(
      Object.entries(raw).filter(([k, v]) => v && !except.includes(k)),
    ) as Record<string, string>;

  const dailyPicker = dailyDate && (
    <DailyDatePicker key="org-daily-picker" value={dailyDate} basePath="/home" extraParams={carry("date")} />
  );
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
    <DailyDatePicker key="org-adhoc-picker" value={adhocDate} basePath="/home" param="adate" extraParams={carry("adate")} />
  );
  // Expand-toggle links carry every current date filter unchanged — no
  // exclusions, since "expand" isn't itself one of the date params in `raw`.
  const expandExtraParams = carry();

  return (
    <div className="flex flex-col gap-5">
      <PageSectionHeading>Task Manager — Overview</PageSectionHeading>
      <HomeDepartmentOverview
        dailyOrg={dailyOrg}
        monthlyOrg={monthlyOrg}
        expandedDepartmentDetails={expandedDepartmentDetails}
        expandParam={expandParam}
        categories={categories}
        myUserId={myUserId}
        dailyPicker={dailyPicker}
        monthlyPicker={monthlyPicker}
        extraParams={expandExtraParams}
        actions={actions}
      />
      <HomeRegionOverview
        dailyOrg={dailyOrg}
        monthlyOrg={monthlyOrg}
        adhocByRegion={adhocByRegion}
        expandedBranchDetails={expandedBranchDetails}
        expandParam={expandParam}
        categories={categories}
        myUserId={myUserId}
        dailyPicker={dailyPicker}
        monthlyPicker={monthlyPicker}
        adhocPicker={adhocPicker}
        extraParams={expandExtraParams}
        actions={actions}
      />
    </div>
  );
}
