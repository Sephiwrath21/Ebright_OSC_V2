// The ONE Task Manager overview section for the Home page — every account
// type gets it (2026-07-28 "no exceptions" requirement), scoped by the data
// layer's role routing and always carrying the date filter(s):
//
//   ADMIN / CEO / OPS ........ org-wide grids (departments + branch regions
//                              + ad hoc when present) — HomeTaskOverview
//   elevated DEPT_SITE ....... ALL departments Daily/Monthly grids (org
//   (Operations/Optimisation)  payload with branch halves stripped — elevated
//                              visibility is departments-only)
//   other DEPT_SITE / HOD .... own department Daily + Monthly donuts
//   BRANCH / BRANCH_SITE ..... own branch Daily + Monthly donuts
//   MEMBER (any staff) ....... personal Daily + Monthly donuts
//
// Daily rides ?date=, Monthly ?mdate= (whole-month), Ad hoc ?adate= (org
// view only) — independent, each picker carries the others along. Fail-safe
// like its predecessors: any Task Manager problem (database not connected,
// no account, bridge failure) renders nothing — Home must never break
// because of Task Manager state.
import { getFlowDetail } from "@/task-manager/data";
import { formatLocalDate, resolveWindow } from "@/task-manager/analytics/_lib";
import { DailyDatePicker } from "@/task-manager/ui/entity-picker";
import { HomeTaskOverview } from "@/task-manager/ui/home-overview";
import { EntityDonutGrid } from "@/task-manager/ui/overview-grids";
import { StatusOverviewCard, PageSectionHeading } from "@/task-manager/ui/bits";
import { flowBucketize, flowStreamLabel, visibleAssignerStreams } from "@/task-manager/ui/types";
import type { ActionResult, FlowBucketTotals, FlowDrillTask } from "@/task-manager/ui/types";

export async function HomeScopedOverviewSection({
  email,
  dailyDate,
  monthlyDate,
  adhocDate,
  hodDate,
  actions,
}: {
  email: string;
  /** Raw YYYY-MM-DD values from ?date= / ?mdate= / ?adate= (already
   *  format-validated by the page). Omitted = today / current month. */
  dailyDate?: string;
  monthlyDate?: string;
  adhocDate?: string;
  hodDate?: string;
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
    const [daily, monthly] = await Promise.all([
      getFlowDetail(email, "daily", dailyDate, { adhocDate: adhocAnchor }),
      getFlowDetail(email, "monthly", monthlyDate),
    ]);

    const raw = { date: dailyDate, mdate: monthlyDate, adate: adhocDate, hdate: hodDate };
    const carry = (except: string) =>
      Object.fromEntries(
        Object.entries(raw).filter(([k, v]) => v && k !== except),
      ) as Record<string, string>;
    const dailyPicker = (
      <DailyDatePicker
        key="home-daily-picker"
        value={daily.date}
        basePath="/home"
        extraParams={carry("date")}
      />
    );
    const monthlyPicker = (
      <DailyDatePicker
        key="home-monthly-picker"
        value={monthly.date}
        basePath="/home"
        param="mdate"
        step="month"
        extraParams={carry("mdate")}
      />
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

    // Scoped pair (department / branch / personal): two donut cards with
    // their date pickers in the flow-row header slot (no-overlap layout).
    // auto-fit off the CONTAINER width: side by side in wide dashboards,
    // stacked in narrow columns.
    const pair = (
      d: { totals: FlowBucketTotals; tasks: Record<"completed" | "pending" | "na", FlowDrillTask[]> },
      m: { totals: FlowBucketTotals; tasks: Record<"completed" | "pending" | "na", FlowDrillTask[]> },
      subtitle: string,
    ) => (
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        <StatusOverviewCard
          title="Daily"
          subtitle={subtitle}
          totals={d.totals}
          tasks={d.tasks}
          action={dailyPicker}
          actionPlacement="row"
        />
        <StatusOverviewCard
          title="Monthly"
          subtitle={subtitle}
          totals={m.totals}
          tasks={m.tasks}
          action={monthlyPicker}
          actionPlacement="row"
        />
      </div>
    );

    if (daily.department && monthly.department) {
      return pair(daily.department, monthly.department, daily.department.name);
    }
    if (daily.branch && monthly.branch) {
      return pair(daily.branch, monthly.branch, daily.branch.name);
    }

    // MEMBER — personal cards, clickable per the "assignee only" rule: the
    // viewer's own userId + the complete/N-A/reopen actions make their own
    // tasks' status circles live in the drill modal, same as /task-manager.
    const completeProps = actions && {
      myUserId: daily.me.me.userId,
      onComplete: actions.complete,
      onSkip: actions.skip,
      onReopen: actions.reopen,
    };
    // Third section — "HOD assigned tasks": ALWAYS present for staff (the
    // 3-section requirement: Daily · Monthly · HOD Assigned), zero-filled
    // when this person has no HOD-assigned tasks yet. streamsAll only
    // carries streams that HAVE tasks, so the card must not depend on the
    // stream existing. Day-windowed by its OWN ?hdate= filter (2026-07-28,
    // default today) on each task's due date — cadence-agnostic, so daily-
    // AND monthly-cadence HOD assignments due that day both count; tasks
    // with no due date at all only match no specific day.
    const hodAnchor = hodDate ?? formatLocalDate(new Date());
    const hodWin = resolveWindow("daily", hodAnchor);
    const hodStream = daily.me.streamsAll.find((s) => s.key === "HOD");
    const hodBuckets = flowBucketize(
      (hodStream?.tasks ?? []).filter((t) => {
        if (!t.dueAt) return false;
        const due = new Date(t.dueAt);
        return due >= hodWin.start && due < hodWin.end;
      }),
    );
    const hodCard = (
      <StatusOverviewCard
        title={flowStreamLabel("HOD")}
        subtitle="From HOD"
        totals={{
          completed: hodBuckets.completed.length,
          pending: hodBuckets.pending.length,
          na: hodBuckets.na.length,
        }}
        tasks={hodBuckets}
        action={
          <DailyDatePicker
            key="home-hod-picker"
            value={hodAnchor}
            basePath="/home"
            param="hdate"
            extraParams={carry("hdate")}
          />
        }
        actionPlacement="row"
        {...completeProps}
      />
    );
    // Any other visible assigner stream (e.g. "CEO assigned tasks") appends
    // when non-empty; Admin/Ops streams stay hidden per the "no special
    // Admin Assigned Task category" spec (visibleAssignerStreams).
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
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        <StatusOverviewCard
          title="Daily"
          subtitle="My Tasks"
          totals={daily.me.totals}
          tasks={flowBucketize(daily.me.tasks)}
          action={dailyPicker}
          actionPlacement="row"
          {...completeProps}
        />
        <StatusOverviewCard
          title="Monthly"
          subtitle="My Tasks"
          totals={monthly.me.totals}
          tasks={flowBucketize(monthly.me.tasks)}
          action={monthlyPicker}
          actionPlacement="row"
          {...completeProps}
        />
        {hodCard}
        {otherStreamCards}
      </div>
    );
  } catch {
    return null;
  }
}
