// Org-wide Task Manager overview, rendered on the OSC HOME page.
// "All Departments" (2026-08-15 rebuild #2) is now the SAME single-
// department-dropdown + TaskOverviewStack pattern /task-manager's own
// Department view uses (HomeDepartmentPicker) — Daily + Monthly only, no
// HOD/CEO Assigned, defaulting to the account's own department. "Branch
// Status by Region" keeps the collapsible rollup-card treatment from the
// 2026-08-15 rebuild (HomeRegionOverview) — every branch a rollup card by
// default, expanding via ?expand= into the same per-person list.
// HomeDepartmentPicker and HomeRegionOverview are exported separately
// because ADMIN/OPS/elevated DEPT_SITE (HomeTaskOverview) get BOTH, while
// the CEO's own dashboard (scoped-overview-section.tsx) gets ONLY
// HomeRegionOverview, appended below their draggable department
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
import { FLOW_DEPARTMENTS } from "./types";
import { PageSectionHeading } from "./bits";
import { DailyDatePicker, EntityPicker, MonthDropdown, MonthRangeDropdown } from "./entity-picker";
import { EntityCardOverview } from "./entity-card-overview";
import { TaskOverviewStack } from "./task-overview-stack";
import { AdhocRollupGrid, RegionRollupGrid } from "./overview-grids";

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

/** "All Departments" (2026-08-15 rebuild #2) — the SAME single-department-
 *  dropdown + TaskOverviewStack pattern /task-manager's own Department view
 *  uses (page.tsx's buildEntityOverview), reused as-is rather than
 *  reimplemented: an EntityPicker to switch departments (defaulting to the
 *  account's own, resolved by the caller) and a TaskOverviewStack showing
 *  Daily + Monthly for whichever one is selected. Deliberately no HOD/CEO
 *  Assigned Task sections — Home only ever showed Daily/Monthly here. */
export function HomeDepartmentPicker({
  department,
  dailyDetail,
  monthlyDetail,
  categories,
  myUserId,
  dailyDate,
  extraParams,
  actions,
}: {
  department: string;
  dailyDetail: FlowEntityDetail;
  monthlyDetail: FlowEntityDetail;
  categories: FlowCategoryOption[];
  myUserId: string;
  dailyDate: string;
  /** Current date/expand filters to carry along when switching departments
   *  or changing the Daily date (NOT including "department" itself, which
   *  each control adds on its own). */
  extraParams: Record<string, string>;
  actions?: EntityActions;
}) {
  return (
    <>
      <EntityPicker
        label="Department"
        value={department}
        groups={[{ options: FLOW_DEPARTMENTS }]}
        param="department"
        basePath="/home"
        extraParams={extraParams}
      />
      <TaskOverviewStack
        entityName={department}
        categories={categories}
        myUserId={myUserId}
        daily={{
          entity: dailyDetail,
          dateControl: (
            <DailyDatePicker
              key="home-dept-daily-picker"
              value={dailyDate}
              basePath="/home"
              extraParams={{ ...extraParams, department }}
            />
          ),
          showViewToggle: true,
        }}
        monthly={{ entity: monthlyDetail, showViewToggle: true }}
        onComplete={actions?.complete}
        onSkip={actions?.skip}
        onReopen={actions?.reopen}
        onUploadProof={actions?.uploadProof}
        onRemoveProof={actions?.removeProof}
      />
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
        action={dailyPicker}
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
          action={monthlyPicker}
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
  department,
  departmentDailyDetail,
  departmentMonthlyDetail,
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
  /** Currently selected department (already resolved/validated by the
   *  caller — own department, or FLOW_DEPARTMENTS[0] as a last resort). */
  department: string;
  departmentDailyDetail: FlowEntityDetail;
  departmentMonthlyDetail: FlowEntityDetail;
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
  // Date pickers must carry the CURRENT ?expand= unchanged (so changing the
  // date doesn't collapse whatever's already expanded) — but the expand-
  // toggle links themselves (expandExtraParams below) must NOT carry a
  // stale expand value, since EntityRollupCard computes its own new one.
  const dateExtraParams = (...except: string[]) => ({
    ...carry(...except),
    ...(expandParam ? { expand: expandParam } : {}),
  });

  const dailyPicker = dailyDate && (
    <DailyDatePicker key="org-daily-picker" value={dailyDate} basePath="/home" extraParams={dateExtraParams("date")} />
  );
  const monthlyPicker = monthlyDate && (
    <div key="org-monthly-controls" className="flex items-center gap-1.5">
      <MonthDropdown value={monthlyDate} basePath="/home" extraParams={dateExtraParams("mdate", "mrange")} />
      <MonthRangeDropdown
        value={monthlyDate}
        range={raw.mrange}
        basePath="/home"
        extraParams={dateExtraParams("mdate", "mrange")}
      />
    </div>
  );
  const adhocPicker = adhocDate && (
    <DailyDatePicker key="org-adhoc-picker" value={adhocDate} basePath="/home" param="adate" extraParams={dateExtraParams("adate")} />
  );
  // Expand-toggle links (and the department picker below) carry every
  // current date filter unchanged — no exclusions, since "expand" isn't
  // itself one of the date params in `raw`.
  const expandExtraParams = carry();
  const departmentExtraParams = dateExtraParams();

  return (
    <div className="flex flex-col gap-5">
      <PageSectionHeading>Task Manager — Overview</PageSectionHeading>
      {dailyDate && (
        <HomeDepartmentPicker
          department={department}
          dailyDetail={departmentDailyDetail}
          monthlyDetail={departmentMonthlyDetail}
          categories={categories}
          myUserId={myUserId}
          dailyDate={dailyDate}
          extraParams={departmentExtraParams}
          actions={actions}
        />
      )}
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
