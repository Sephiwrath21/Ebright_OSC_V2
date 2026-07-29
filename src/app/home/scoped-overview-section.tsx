// The ONE Task Manager overview section for the Home page — every account
// type gets it (2026-07-28 "no exceptions" requirement), scoped by the data
// layer's role routing and always carrying the date filter(s):
//
//   ADMIN / CEO / OPS ........ org-wide grids (departments + branch regions
//                              + ad hoc when present) — HomeTaskOverview
//   elevated DEPT_SITE ....... ALL departments Daily/Monthly grids (org
//   (Operations/Optimisation)  payload with branch halves stripped — elevated
//                              visibility is departments-only)
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
import { getFlowDetail } from "@/task-manager/data";
import { formatLocalDate, resolveWindow } from "@/task-manager/analytics/_lib";
import {
  DailyDatePicker,
  MonthDropdown,
  MonthRangeDropdown,
} from "@/task-manager/ui/entity-picker";
import { HomeTaskOverview } from "@/task-manager/ui/home-overview";
import { EntityDonutGrid } from "@/task-manager/ui/overview-grids";
import { StatusOverviewCard, PageSectionHeading } from "@/task-manager/ui/bits";
import { flowBucketize, flowStreamLabel, visibleAssignerStreams } from "@/task-manager/ui/types";
import type { ActionResult } from "@/task-manager/ui/types";

export async function HomeScopedOverviewSection({
  email,
  dailyDate,
  monthlyDate,
  monthlyRange,
  adhocDate,
  hodDate,
  ceoDate,
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
  /** Personal-task server actions (complete / N-A / reopen) — wired ONLY
   *  into the PERSONAL cards' drill modals (with the viewer's own userId,
   *  so the status circle is clickable exactly on the viewer's own tasks —
   *  the "assignee only" rule). Aggregate views (org/departments/branch)
   *  stay read-only, same principle as the Task Manager page. */
  actions?: {
    complete: (runBlockId: string) => Promise<ActionResult>;
    skip: (runBlockId: string) => Promise<ActionResult>;
    reopen: (runBlockId: string) => Promise<ActionResult>;
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

    // Org roles (ADMIN/CEO/OPS): the full org-wide overview. CEO has no
    // adhocByRegion (data layer only builds it for ADMIN/OPS) — the ad hoc
    // section and its picker simply don't render for them.
    const role = daily.me.me.role;
    if (daily.org && role !== "DEPT_SITE") {
      return (
        <HomeTaskOverview
          dailyOrg={daily.org}
          monthlyOrg={monthly.org}
          adhocByRegion={daily.adhocByRegion}
          departmentOverviewHref="/task-manager?view=department"
          dailyDate={daily.date}
          monthlyDate={monthly.date}
          adhocDate={adhocAnchor}
          dateFilterParams={raw}
        />
      );
    }

    // Elevated department sites: ALL departments, Daily + Monthly (branch
    // halves are stripped server-side — see getFlowDetail).
    if (daily.org && monthly.org) {
      return (
        <div className="flex flex-col gap-5">
          <PageSectionHeading>Task Manager — Overview</PageSectionHeading>
          <EntityDonutGrid
            title="All Departments — Daily"
            entities={daily.org.departments}
            action={dailyPicker}
          />
          <EntityDonutGrid
            title="All Departments — Monthly"
            entities={monthly.org.departments}
            action={monthlyPicker}
          />
        </div>
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

    // Personal Daily/Monthly cards (clickable, no subtitle — 2026-07-29
    // cleanup) — shared by the MEMBER view and the HOD view's sections 1–2.
    // They ride the same ?date=/?mdate= as the department pair, keeping
    // every Daily surface on one date.
    const personalPair = (
      <>
        <StatusOverviewCard
          key="personal-daily"
          title="Daily"
          totals={daily.me.totals}
          tasks={flowBucketize(daily.me.tasks)}
          action={dailyPicker}
          actionPlacement="row"
          {...completeProps}
        />
        <StatusOverviewCard
          key="personal-monthly"
          title="Monthly"
          totals={monthly.me.totals}
          tasks={flowBucketize(monthly.me.tasks)}
          action={monthlyPicker}
          actionPlacement="row"
          {...completeProps}
        />
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
      // HOD (2026-07-29 layout): TOP ROW = the three personal cards
      // (Daily · Monthly · CEO Assigned, no subtitles); BELOW, clearly
      // separated under its own heading, the Department Overview pair
      // (aggregate, keeps the department-name subtitle). The view-only
      // DEPT_SITE logins have no personal tasks and keep the department
      // pair alone.
      if (role === "HOD") {
        return (
          <div className="flex flex-col gap-5">
            {grid(
              <>
                {personalPair}
                {streamCard("CEO", ceoDate, "cdate")}
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
      // Branch Manager (2026-07-29): personal-first like HOD — top row =
      // personal Daily · Monthly · Ad hoc, then the own-branch status pair
      // below its own heading. The Ad hoc card is a plain ALL-TIME set,
      // deliberately NO date filter (2026-07-29 simplification: ad hoc
      // tasks are one-off/irregular). The view-only BRANCH_SITE login
      // keeps the pair alone.
      if (role === "BRANCH") {
        const adhocBuckets = flowBucketize(daily.me.adhocAll?.tasks ?? []);
        return (
          <div className="flex flex-col gap-5">
            {grid(
              <>
                {personalPair}
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
              </>,
            )}
            <PageSectionHeading>Branch Overview</PageSectionHeading>
            {grid(branchPair)}
          </div>
        );
      }
      return grid(branchPair);
    }

    // MEMBER — personal Daily + Monthly + "HOD assigned tasks" (?hdate=),
    // plus any other visible assigner stream (e.g. CEO) when non-empty;
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
    return grid(
      <>
        {personalPair}
        {streamCard("HOD", hodDate, "hdate", "From HOD")}
        {otherStreamCards}
      </>,
    );
  } catch {
    return null;
  }
}
