// The ONE Task Manager overview section for the Home page — every account
// type gets it (2026-07-28 "no exceptions" requirement), scoped by the data
// layer's role routing and always carrying the date filter(s):
//
//   ADMIN / OPS / elevated DEPT_SITE ... nothing (2026-08-15: the org-wide
//                              "All Departments" + "Branch Status by Region"
//                              grids were removed from Home entirely per
//                              request — still viewable in full on the
//                              Department Overview / Task Manager pages)
//   CEO ...................... draggable department dashboards only (Branch
//                              Status by Region removed alongside the above,
//                              2026-08-15 — same donut grid, same request)
//   other DEPT_SITE .......... own department Daily + Monthly donuts
//   HOD ...................... FOUR sections (2026-07-29): personal Daily +
//                              Monthly, CEO Assigned Tasks (?cdate=), and
//                              own department status pair
//   BRANCH / BRANCH_SITE ..... own branch Daily + Monthly donuts
//   MEMBER (any staff) ....... personal Daily + Monthly + HOD Assigned
//
// Daily rides ?date=, Monthly ?mdate= (whole-month), Ad hoc ?adate= (org
// view only) — independent, each picker carries the others along. Fail-safe
// like its predecessors: any Task Manager problem (database not connected,
// no account, bridge failure) renders nothing — Home must never break
// because of Task Manager state.
import type { ReactNode } from "react";
import { revalidatePath } from "next/cache";
import { requireLiveSession } from "@/task-manager/action-session";
import {
  getBranchDetail,
  getCeoDashboardConfig,
  getDepartmentDetail,
  getFlowDetail,
  listActiveTaskCategories,
  saveCeoDashboardConfig,
  FlowBridgeError,
} from "@/task-manager/data";
import { formatLocalDate, resolveWindow } from "@/task-manager/analytics/_lib";
import { resolveViewRole, shows } from "@/task-manager/role-views";
import {
  DailyDatePicker,
  MonthDropdown,
  MonthRangeDropdown,
} from "@/task-manager/ui/entity-picker";
import { CeoDashboardSection } from "@/task-manager/ui/ceo-dashboard";
import { StatusOverviewCard, PageSectionHeading } from "@/task-manager/ui/bits";
import { parseExpandParam } from "@/task-manager/ui/expand-param";
import { HomeRegionOverview, HomeTaskOverview } from "@/task-manager/ui/home-overview";
import {
  flowBucketize,
  flowStreamLabel,
  visibleAssignerStreams,
  FLOW_DEPARTMENTS,
} from "@/task-manager/ui/types";
import type { ActionResult } from "@/task-manager/ui/types";

export async function HomeScopedOverviewSection({
  email,
  dailyDate,
  monthlyDate,
  monthlyRange,
  adhocDate,
  hodDate,
  ceoDate,
  expand,
  actions,
}: {
  email: string;
  /** Raw YYYY-MM-DD values from ?date= / ?mdate= / ?adate= (already
   *  format-validated by the page). Omitted = today / current month. */
  dailyDate?: string;
  monthlyDate?: string;
  /** Monthly 7-day chunk within the anchor month (?mrange=, 2026-07-29).
   *  Undefined = Full month. */
  monthlyRange?: { from: number; to: number };
  adhocDate?: string;
  hodDate?: string;
  /** HOD view's "CEO Assigned Tasks" day anchor (?cdate=). */
  ceoDate?: string;
  /** Raw ?expand= value (2026-08-15) — which org-wide department/branch
   *  sections show their full per-person list instead of a rollup card.
   *  See expand-param.ts. */
  expand?: string;
  /** Personal-task server actions (complete / N-A / reopen) — wired ONLY
   *  into the PERSONAL cards' drill modals (with the viewer's own userId,
   *  so the status circle is clickable exactly on the viewer's own tasks —
   *  the "assignee only" rule). Aggregate views (org/departments/branch)
   *  stay read-only, same principle as the Task Manager page. */
  actions?: {
    complete: (runBlockId: string) => Promise<ActionResult>;
    skip: (runBlockId: string) => Promise<ActionResult>;
    reopen: (runBlockId: string) => Promise<ActionResult>;
    /** The Proof column's upload (2026-07-30) — same personal-only wiring
     *  as the status actions. */
    uploadProof?: import("@/task-manager/ui/types").ProofUploadHandler;
    /** The Proof gallery's per-photo remove (2026-08-08) — same
     *  personal-only wiring as the status actions. */
    removeProof?: import("@/task-manager/ui/types").ProofRemoveHandler;
  };
}) {
  try {
    const adhocAnchor = adhocDate ?? formatLocalDate(new Date());
    const monthlyRangeParam = monthlyRange ? `${monthlyRange.from}-${monthlyRange.to}` : undefined;
    const [daily, monthly] = await Promise.all([
      getFlowDetail(email, "daily", dailyDate, { adhocDate: adhocAnchor }),
      getFlowDetail(email, "monthly", monthlyDate, monthlyRange ? { monthDays: monthlyRange } : undefined),
    ]);

    const raw = {
      date: dailyDate,
      mdate: monthlyDate,
      mrange: monthlyRangeParam,
      adate: adhocDate,
      hdate: hodDate,
      cdate: ceoDate,
    };
    const carry = (...except: string[]) =>
      Object.fromEntries(
        Object.entries(raw).filter(([k, v]) => v && !except.includes(k)),
      ) as Record<string, string>;
    const dailyPicker = (
      <DailyDatePicker
        key="home-daily-picker"
        value={daily.date}
        basePath="/home"
        extraParams={carry("date")}
      />
    );
    // Monthly selector (2026-07-29 redesign): compact [Month ▾][Range ▾]
    // pair — the calendar picker is gone from every Monthly surface. Month
    // and range controls both exclude mdate/mrange from the carried params
    // (they own them; changing month resets to Full month).
    const monthlyPicker = (
      <div key="home-monthly-controls" className="flex items-center gap-1.5">
        <MonthDropdown value={monthly.date} basePath="/home" extraParams={carry("mdate", "mrange")} />
        <MonthRangeDropdown
          value={monthly.date}
          range={monthlyRangeParam}
          basePath="/home"
          extraParams={carry("mdate", "mrange")}
        />
      </div>
    );
    const adhocPicker = (
      <DailyDatePicker
        key="home-adhoc-picker"
        value={adhocAnchor}
        basePath="/home"
        param="adate"
        extraParams={carry("adate")}
      />
    );

    // ALL role gates below read role-views.ts (the single source of truth,
    // 2026-07-29 centralization) — this section renders purely from the
    // config via shows(view, "home", key).
    const view = resolveViewRole(daily.me.me);

    // Org roles (ADMIN/OPS/elevated DEPT_SITE): 2026-08-15 rebuild — every
    // department/branch is a collapsible rollup card; only names present in
    // ?expand= get a real getDepartmentDetail/getBranchDetail fetch (see
    // docs/superpowers/specs/2026-08-15-home-org-wide-person-list-design.md).
    if (daily.org && shows(view, "home", "orgGrids")) {
      const { departments: expandedDepts, branches: expandedBranches } = parseExpandParam(expand);
      const categories = await listActiveTaskCategories(email).catch(() => []);
      const [expandedDepartmentDetails, expandedBranchDetails] = await Promise.all([
        Promise.all(
          expandedDepts.map(async (name) => {
            const [d, m] = await Promise.all([
              getDepartmentDetail(email, name, "daily", dailyDate).catch(() => null),
              getDepartmentDetail(email, name, "monthly", monthlyDate).catch(() => null),
            ]);
            return [name, { daily: d?.department, monthly: m?.department }] as const;
          }),
        ),
        Promise.all(
          expandedBranches.map(async (name) => {
            const [d, m] = await Promise.all([
              getBranchDetail(email, name, "daily", dailyDate).catch(() => null),
              getBranchDetail(email, name, "monthly", monthlyDate).catch(() => null),
            ]);
            return [name, { daily: d?.branch, monthly: m?.branch }] as const;
          }),
        ),
      ]).then(([d, b]) => [Object.fromEntries(d), Object.fromEntries(b)] as const);
      return (
        <HomeTaskOverview
          dailyOrg={daily.org}
          monthlyOrg={monthly.org}
          adhocByRegion={daily.adhocByRegion}
          dailyDate={daily.date}
          monthlyDate={monthly.date}
          adhocDate={adhocAnchor}
          dateFilterParams={raw}
          expandedDepartmentDetails={expandedDepartmentDetails}
          expandedBranchDetails={expandedBranchDetails}
          expandParam={expand}
          categories={categories}
          myUserId={daily.me.me.userId}
          actions={
            actions && {
              complete: actions.complete,
              skip: actions.skip,
              reopen: actions.reopen,
              uploadProof: actions.uploadProof,
              removeProof: actions.removeProof,
            }
          }
        />
      );
    }

    // "Assignee only" rule: the viewer's own userId + the complete/N-A/
    // reopen actions make their own tasks' status circles live in the drill
    // modal, same as /task-manager. Aggregate dept/branch cards never get
    // these.
    const completeProps = actions && {
      myUserId: daily.me.me.userId,
      onComplete: actions.complete,
      onSkip: actions.skip,
      onReopen: actions.reopen,
      onUploadProof: actions.uploadProof,
      onRemoveProof: actions.removeProof,
    };

    // Assigner-stream card ("HOD assigned tasks" for staff, "CEO assigned
    // tasks" for HODs) — ALWAYS rendered for its role (zero-filled when the
    // stream doesn't exist yet; streamsAll only carries streams that HAVE
    // tasks). Day-windowed by its OWN date param (default today) on each
    // task's due date — cadence-agnostic, so daily- AND monthly-cadence
    // assignments due that day both count; tasks with no due date at all
    // match no specific day.
    const streamCard = (
      streamKey: "HOD" | "CEO",
      rawAnchor: string | undefined,
      param: string,
      subtitle?: string,
    ) => {
      const anchor = rawAnchor ?? formatLocalDate(new Date());
      const win = resolveWindow("daily", anchor);
      const stream = daily.me.streamsAll.find((s) => s.key === streamKey);
      const buckets = flowBucketize(
        (stream?.tasks ?? []).filter((t) => {
          if (!t.dueAt) return false;
          const due = new Date(t.dueAt);
          return due >= win.start && due < win.end;
        }),
      );
      return (
        <StatusOverviewCard
          key={`stream-${streamKey}`}
          title={flowStreamLabel(streamKey)}
          subtitle={subtitle}
          totals={{
            completed: buckets.completed.length,
            pending: buckets.pending.length,
            na: buckets.na.length,
          }}
          tasks={buckets}
          action={
            <DailyDatePicker
              key={`home-${param}-picker`}
              value={anchor}
              basePath="/home"
              param={param}
              extraParams={carry(param)}
            />
          }
          actionPlacement="row"
          {...completeProps}
        />
      );
    };

    // Personal Daily/Monthly cards (clickable, no subtitle) — shared by
    // every view whose config lists them. Which cards render is decided
    // ENTIRELY by role-views.ts (e.g. BRANCH_MEMBER = Daily only).
    const personalPair = (
      <>
        {shows(view, "home", "personalDaily") && (
          <StatusOverviewCard
            key="personal-daily"
            title="Daily"
            totals={daily.me.totals}
            tasks={flowBucketize(daily.me.tasks)}
            action={dailyPicker}
            actionPlacement="row"
            hideChart
            {...completeProps}
          />
        )}
        {shows(view, "home", "personalMonthly") && (
          <StatusOverviewCard
            key="personal-monthly"
            title="Monthly"
            totals={monthly.me.totals}
            tasks={flowBucketize(monthly.me.tasks)}
            action={monthlyPicker}
            actionPlacement="row"
            hideChart
            {...completeProps}
          />
        )}
      </>
    );

    const grid = (children: ReactNode) => (
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {children}
      </div>
    );

    if (daily.department && monthly.department) {
      const deptPair = (
        <>
          <StatusOverviewCard
            key="dept-daily"
            title="Daily"
            subtitle={daily.department.name}
            totals={daily.department.totals}
            tasks={daily.department.tasks}
            action={dailyPicker}
            actionPlacement="row"
          />
          <StatusOverviewCard
            key="dept-monthly"
            title="Monthly"
            subtitle={monthly.department.name}
            totals={monthly.department.totals}
            tasks={monthly.department.tasks}
            action={monthlyPicker}
            actionPlacement="row"
          />
        </>
      );
      // HOD layout: TOP ROW = personal cards (per config) + CEO Assigned;
      // BELOW, clearly separated under its own heading, the Department
      // Overview pair. View-only DEPT_SITE logins (no personal sections in
      // their config) keep the department pair alone.
      if (shows(view, "home", "personalDaily")) {
        return (
          <div className="flex flex-col gap-5">
            {grid(
              <>
                {personalPair}
                {shows(view, "home", "ceoAssigned") && streamCard("CEO", ceoDate, "cdate")}
              </>,
            )}
            <PageSectionHeading>Department Overview</PageSectionHeading>
            {grid(deptPair)}
          </div>
        );
      }
      return grid(deptPair);
    }

    if (daily.branch && monthly.branch) {
      const branchPair = (
        <>
          <StatusOverviewCard
            key="branch-daily"
            title="Daily"
            subtitle={daily.branch.name}
            totals={daily.branch.totals}
            tasks={daily.branch.tasks}
            action={dailyPicker}
            actionPlacement="row"
          />
          <StatusOverviewCard
            key="branch-monthly"
            title="Monthly"
            subtitle={monthly.branch.name}
            totals={monthly.branch.totals}
            tasks={monthly.branch.tasks}
            action={monthlyPicker}
            actionPlacement="row"
          />
        </>
      );
      // Branch-site Ad hoc card (2026-07-29 final spec): the branch-wide
      // ALL-TIME ad hoc set, read-only — rendered with the pair for the
      // view-only site login.
      const siteAdhocCard = shows(view, "home", "adhocOversight") && daily.adhoc && (
        <StatusOverviewCard
          key="site-adhoc"
          title="Ad hoc"
          subtitle={daily.branch.name}
          totals={daily.adhoc.totals}
          tasks={flowBucketize(daily.adhoc.tasks)}
        />
      );

      // Branch Manager layout: personal-first — top row = personal cards
      // (per config) + Ad hoc (plain ALL-TIME set, deliberately no date
      // filter: ad hoc tasks are one-off/irregular), then the own-branch
      // status pair below its own heading. View-only BRANCH_SITE logins
      // (no personal sections in their config) keep the pair alone.
      if (shows(view, "home", "personalDaily")) {
        const adhocBuckets = flowBucketize(daily.me.adhocAll?.tasks ?? []);
        return (
          <div className="flex flex-col gap-5">
            {grid(
              <>
                {personalPair}
                {shows(view, "home", "personalAdhoc") && (
                  <StatusOverviewCard
                    key="personal-adhoc"
                    title="Ad hoc"
                    totals={{
                      completed: adhocBuckets.completed.length,
                      pending: adhocBuckets.pending.length,
                      na: adhocBuckets.na.length,
                    }}
                    tasks={adhocBuckets}
                    {...completeProps}
                  />
                )}
              </>,
            )}
            <PageSectionHeading>Branch Overview</PageSectionHeading>
            {grid(branchPair)}
          </div>
        );
      }
      return grid(
        <>
          {branchPair}
          {siteAdhocCard}
        </>,
      );
    }

    // CEO (2026-08-01 redesign): below the personal pair, the DRAGGABLE
    // pinned-department dashboards — the SAME CeoDashboardSection the Task
    // Manager page uses (add / drag-reorder / ✕-remove, per-CEO persisted
    // in CeoDashboardConfig; removing a card only hides it from this
    // dashboard, never touches the department). Actions revalidate /home.
    let ceoDashboards: ReactNode = null;
    if (shows(view, "home", "ceoKanban")) {
      const FALLBACK = "Something went wrong — please try again";
      const makeCeoActions = (cadence: "daily" | "monthly") => {
        async function add(department: string): Promise<ActionResult> {
          "use server";
          const stale = await requireLiveSession(email);
          if (stale) return stale;
          try {
            const { departments } = await getCeoDashboardConfig(email, cadence);
            if (!departments.includes(department)) {
              await saveCeoDashboardConfig(email, cadence, [...departments, department]);
            }
            revalidatePath("/home");
            return { ok: true };
          } catch (err) {
            return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK };
          }
        }
        async function remove(department: string): Promise<ActionResult> {
          "use server";
          const stale = await requireLiveSession(email);
          if (stale) return stale;
          try {
            const { departments } = await getCeoDashboardConfig(email, cadence);
            await saveCeoDashboardConfig(email, cadence, departments.filter((d) => d !== department));
            revalidatePath("/home");
            return { ok: true };
          } catch (err) {
            return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK };
          }
        }
        async function reorder(orderedNames: string[]): Promise<ActionResult> {
          "use server";
          const stale = await requireLiveSession(email);
          if (stale) return stale;
          try {
            await saveCeoDashboardConfig(email, cadence, orderedNames);
            revalidatePath("/home");
            return { ok: true };
          } catch (err) {
            return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK };
          }
        }
        return { add, remove, reorder };
      };

      const [dailyConfig, monthlyConfig] = await Promise.all([
        getCeoDashboardConfig(email, "daily"),
        getCeoDashboardConfig(email, "monthly"),
      ]);
      const [dailyDetails, monthlyDetails] = await Promise.all([
        Promise.all(dailyConfig.departments.map((n) => getDepartmentDetail(email, n, "daily", dailyDate))),
        Promise.all(monthlyConfig.departments.map((n) => getDepartmentDetail(email, n, "monthly", monthlyDate))),
      ]);
      ceoDashboards = (
        <>
          <PageSectionHeading action={dailyPicker}>Department Daily Overview</PageSectionHeading>
          <CeoDashboardSection
            periodLabel="Daily"
            departments={dailyDetails.map((r) => r.department)}
            availableToAdd={FLOW_DEPARTMENTS.filter((d) => !dailyConfig.departments.includes(d))}
            actions={makeCeoActions("daily")}
          />
          <PageSectionHeading action={monthlyPicker}>Department Monthly Overview</PageSectionHeading>
          <CeoDashboardSection
            periodLabel="Monthly"
            departments={monthlyDetails.map((r) => r.department)}
            availableToAdd={FLOW_DEPARTMENTS.filter((d) => !monthlyConfig.departments.includes(d))}
            actions={makeCeoActions("monthly")}
          />
        </>
      );
    }

    // MEMBER — which cards render is decided ENTIRELY by role-views.ts:
    // DEPT_MEMBER gets Daily + Monthly + HOD Assigned + streams;
    // BRANCH_MEMBER (Branch Exec / Coaches) gets ONLY the Daily card.
    // Admin/Ops streams stay hidden per the "no special Admin Assigned
    // Task category" spec (visibleAssignerStreams).
    const otherStreamCards = visibleAssignerStreams(daily.me.streamsAll)
      .filter((s) => s.key !== "HOD")
      .map((s) => (
        <StatusOverviewCard
          key={s.key}
          title={flowStreamLabel(s.key)}
          totals={s.totals}
          tasks={flowBucketize(s.tasks)}
          {...completeProps}
        />
      ));
    return (
      <div className="flex flex-col gap-5">
        {grid(
          <>
            {/* CEO (2026-08-01): ONE combined "My Tasks" card — no
                Daily/Monthly split — with the shared ?date= filter
                windowing it by DUE date (undated tasks always show). */}
            {shows(view, "home", "ceoCombinedList") &&
              (() => {
                const win = resolveWindow("daily", dailyDate ?? formatLocalDate(new Date()));
                const windowed = daily.me.tasks.filter((t) => {
                  if (!t.dueAt) return true;
                  const due = new Date(t.dueAt);
                  return due >= win.start && due < win.end;
                });
                const buckets = flowBucketize(windowed);
                return (
                  <StatusOverviewCard
                    key="ceo-own-tasks"
                    title="My Tasks"
                    totals={{
                      completed: buckets.completed.length,
                      pending: buckets.pending.length,
                      na: buckets.na.length,
                    }}
                    tasks={buckets}
                    action={dailyPicker}
                    actionPlacement="row"
                    {...completeProps}
                  />
                );
              })()}
            {personalPair}
            {shows(view, "home", "hodAssigned") && streamCard("HOD", hodDate, "hdate", "From HOD")}
            {shows(view, "home", "assignerStreams") && otherStreamCards}
          </>,
        )}
        {ceoDashboards}
      </div>
    );
  } catch {
    return null;
  }
}
