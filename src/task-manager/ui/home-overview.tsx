// Org-wide Task Manager overview, rendered on the OSC HOME page.
// "All Departments" (2026-08-15 rebuild #2) is now the SAME single-
// department-dropdown + TaskOverviewStack pattern /task-manager's own
// Department view uses (HomeDepartmentPicker) — Daily + Monthly only, no
// HOD/CEO Assigned, defaulting to the account's own department. "Branch
// Status by Region" keeps the collapsible rollup-card treatment from the
// 2026-08-15 rebuild (HomeRegionOverview) — every branch a rollup card by
// default, expanding via ?expand= into the same per-person list.
// HomeDepartmentPicker and HomeRegionOverview are exported separately
// because HomeTaskOverview's showRegionOverview prop (ADMIN/OPS/elevated
// DEPT_SITE, 2026-08-15 — currently false for all three, config-driven via
// role-views.ts's branchRegionOverview key) decides whether it renders
// HomeRegionOverview alongside its department picker, while the CEO's own
// dashboard (scoped-overview-section.tsx) calls HomeRegionOverview directly,
// appended below their draggable department dashboards.

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

/** "All Departments" (2026-08-15 rebuild #2, locked 2026-08-15) — the SAME
 *  TaskOverviewStack /task-manager's own Department view uses for a single
 *  entity, but with NO department switcher: Home always shows the
 *  account's own department (resolved by the caller, same fallback rule
 *  as /task-manager's own view when there's no owned department), never a
 *  dropdown to view another one. This is a genuinely different component
 *  from /task-manager's Department view, not a shared one with a mode
 *  flag — /task-manager's own page builds its own separate EntityPicker +
 *  TaskOverviewStack inline (task-manager/page.tsx's buildEntityOverview);
 *  this component has exactly one caller (HomeTaskOverview) and never
 *  needs a "free" mode, so there's nothing to toggle. Deliberately no
 *  HOD/CEO Assigned Task sections — Home only ever showed Daily/Monthly
 *  here. */
export function HomeDepartmentPicker({
  department,
  dailyDetail,
  monthlyDetail,
  categories,
  myUserId,
  dailyDate,
  monthlyDate,
  extraParams,
  actions,
}: {
  department: string;
  dailyDetail: FlowEntityDetail;
  monthlyDetail: FlowEntityDetail;
  categories: FlowCategoryOption[];
  myUserId: string;
  dailyDate: string;
  /** The resolved Monthly anchor, YYYY-MM-DD (2026-08-15) — feeds the new
   *  Year/Month filter below; this section previously had no way to view
   *  any month but the current one. */
  monthlyDate: string;
  /** Current date/expand filters to carry along when changing the Daily
   *  date (there's no department switcher here to carry them for). Reused
   *  for the Monthly Year/Month dropdowns too — MonthDropdown always sets
   *  its own ?mdate= explicitly, so a stale mdate/mrange riding along here
   *  is harmless (overwritten). */
  extraParams: Record<string, string>;
  actions?: EntityActions;
}) {
  return (
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
            extraParams={extraParams}
          />
        ),
        showViewToggle: true,
      }}
      monthly={{
        entity: monthlyDetail,
        dateControl: (
          <MonthDropdown
            key="home-dept-monthly-picker"
            value={monthlyDate}
            basePath="/home"
            extraParams={extraParams}
          />
        ),
        showViewToggle: true,
      }}
      onComplete={actions?.complete}
      onSkip={actions?.skip}
      onReopen={actions?.reopen}
      onUploadProof={actions?.uploadProof}
      onRemoveProof={actions?.removeProof}
    />
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
  showRegionOverview,
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
  /** Whether to render "Branch Status by Region" below the department
   *  picker — role-driven (ROLE_VIEWS' branchRegionOverview key, 2026-08-15):
   *  true for ADMIN/OPS, false for ELEVATED_DEPT_SITE (Operations/
   *  Optimisation are department accounts, not branch overseers). */
  showRegionOverview: boolean;
  actions?: EntityActions;
}) {
  const raw = dateFilterParams ?? {};
  // v !== undefined (not the old truthy `v &&`, 2026-08-25 fix) — an
  // explicit Full month's mrange="" must still be carried along, or
  // toggling the department picker/expand state while Full month is
  // selected would silently drop back to "unset" and re-default (see
  // scoped-overview-section.tsx's monthlyRangeParam derivation, the source
  // of this same raw.mrange value, for the full explanation).
  const carry = (...except: string[]) =>
    Object.fromEntries(
      Object.entries(raw).filter(([k, v]) => v !== undefined && !except.includes(k)),
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
      {dailyDate && monthlyDate && (
        <HomeDepartmentPicker
          department={department}
          dailyDetail={departmentDailyDetail}
          monthlyDetail={departmentMonthlyDetail}
          categories={categories}
          myUserId={myUserId}
          dailyDate={dailyDate}
          monthlyDate={monthlyDate}
          extraParams={departmentExtraParams}
          actions={actions}
        />
      )}
      {showRegionOverview && (
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
      )}
    </div>
  );
}
