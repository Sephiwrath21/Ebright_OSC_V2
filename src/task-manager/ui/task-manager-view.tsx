"use client";

// OSC integration package — the "ClickUp Tasks" page body. The top of the page
// is a row of OVERVIEW DONUTS whose composition follows the mockup sites:
//   Staff (MEMBER):  My Status Daily · My Status Monthly · {HOD/CEO/…} Assigned
//   HOD:             My Daily · My Monthly · CEO Assigned · inline full
//                    department detail (chips/donut/roster — the folded-in
//                    Department Overview page) · Kanban
//   BRANCH:          Branch Status Daily · Monthly · Ad hoc tasks
//   CEO:             CEO Tasks (assigned by me) · pinned-department boards
//   OPS:             own Daily/Monthly + assign form (no org grids)
//   ADMIN:           assign form only — the org-wide overview grids
//                    (all-departments + branch-by-region, overview-grids.tsx)
//                    render on the OSC Home page instead (home-overview.tsx)
// No role has a Daily/Monthly toggle anywhere on this page — every donut,
// list, and roster shows BOTH periods simultaneously, side by side (or
// stacked, for the longer list-style sections). Every drillable donut opens
// its bucket's task list in a modal (EntityDrillModal, via StatusOverviewCard).
// Below the overview: My Tasks and the member roster (dept/branch), also
// always both periods.
//
// Callers fetch BOTH periods (getFlowDetail ×2) so every Daily/Monthly pair
// can render together. `period`/`dailyHref`/`monthlyHref` are accepted but no
// longer drive any visible toggle — kept for prop-signature stability.

import * as React from "react";
import type {
  ActionResult,
  AssignActionResult,
  FlowAssignInput,
  FlowBucketTotals,
  FlowDetailResponse,
  FlowDrillTask,
  FlowEntityDetail,
  FlowPeriod,
  FlowTaskRow,
} from "./types";
import {
  flowBucketize,
  flowBucketTotal,
  flowDedupeTasks,
  flowStreamLabel,
  visibleAssignerStreams,
} from "./types";
import { resolveViewRole, shows } from "../role-views";
import { CeoDashboardSection } from "./ceo-dashboard";
import { CeoTaskTable } from "./ceo-task-table";
import { EntityOverviewSection } from "./department-overview";
import { HodKanban, type HodKanbanActions } from "./hod-kanban";
import {
  PageSectionHeading,
  ResizableTaskList,
  SectionCard,
  StatusOverviewCard,
  type ReassignControl,
} from "./bits";

export function TaskManagerView({
  daily,
  monthly,
  period,
  dailyHref,
  monthlyHref,
  assignAction,
  completeTaskAction,
  skipTaskAction,
  reopenTaskAction,
  uploadProofAction,
  reassign,
  manpowerScheduleHref,
  ceoDashboard,
  staff,
  hodKanban,
  departmentDaily,
  departmentDailyControl,
  personalDailyControl,
  personalMonthlyControl,
  personalMonthlyMonthControl,
  personalMonthlySidebar,
  personalDailyDaySidebar,
  personalCeo,
  personalHod,
  personalAdhoc,
}: {
  daily: FlowDetailResponse;
  monthly: FlowDetailResponse;
  /** Drives the toggled sections (assigned-task cards, My Tasks, roster). */
  period: FlowPeriod;
  dailyHref: string;
  monthlyHref: string;
  /** Server action for the "+ Assigned task" forms (superadmin/OPS only).
   *  Returns a typed result rather than throwing — Next.js masks thrown
   *  server-action error messages in production. */
  assignAction?: (input: FlowAssignInput) => Promise<AssignActionResult>;
  /** "Click the status dot to complete" — a task row only ever renders a
   *  clickable dot when it's quick-completable AND assigned to the current
   *  viewer; omit to keep every dot on the page read-only. */
  completeTaskAction?: (runBlockId: string) => Promise<ActionResult>;
  /** Status dropdown's "N/A" option — unlike completeTaskAction, offered on
   *  ANY of the viewer's own non-terminal tasks (not gated on
   *  quickCompletable); omit to hide the option everywhere. */
  skipTaskAction?: (runBlockId: string) => Promise<ActionResult>;
  /** Status dropdown's "Pending" option — only actionable on an already-
   *  Completed/N-A task (reopen); omit to disable reopening everywhere. */
  reopenTaskAction?: (runBlockId: string) => Promise<ActionResult>;
  /** The Proof column's upload (2026-07-30) — assignee-only completion
   *  evidence; optional, never gates completion. Wired to the same personal
   *  surfaces as the status actions (see completeProps note below). */
  uploadProofAction?: import("./types").ProofUploadHandler;
  /** "Assign to Others" control for every Pending drill modal on this page —
   *  the page only provides it to the 5 assign-capable identities. */
  reassign?: ReassignControl;
  /** HOD/DEPT_SITE only: replaces daily.department in the inline Details
   *  Daily section — the page re-fetches it for the selected ?date=. */
  departmentDaily?: FlowEntityDetail;
  /** The Daily date filter, rendered on that section's heading row. */
  departmentDailyControl?: React.ReactNode;
  /** Personal date filters (2026-07-28, ?date=/?mdate=): each is mounted on
   *  BOTH its period's personal surfaces — the top Daily/Monthly donut card
   *  and the matching "My Tasks" heading — so one selection drives the donut
   *  AND the list. The daily one shares ?date= with departmentDailyControl,
   *  keeping every Daily surface on the page on the same day. */
  personalDailyControl?: React.ReactNode;
  personalMonthlyControl?: React.ReactNode;
  /** Vertical Tue–Sat weekday sidebar (WeekdaySidebar) rendered BESIDE the
   *  "My Tasks — Daily" list — switches days within the anchored week via
   *  the same shared ?date= the date picker (the master control) drives. */
  personalDailyDaySidebar?: React.ReactNode;
  /** Monthly selector (2026-07-30 layout): the compact [Month ▾] dropdown
   *  for the "My Tasks — Monthly" section heading, and the vertical range
   *  sidebar (MonthRangeSidebar — Full month + four chunks with pending
   *  counts) rendered beside that list, driving the shared
   *  ?mdate=/?mrange=. */
  personalMonthlyMonthControl?: React.ReactNode;
  personalMonthlySidebar?: React.ReactNode;
  /** HOD's "CEO assigned tasks" card (2026-07-29) — same behavior as the
   *  Home version: pre-windowed to the ?cdate= day server-side, always
   *  rendered (zero-filled), no subtitle; `control` is its date picker.
   *  When present, the generic assigner-stream CEO card is suppressed so
   *  the card never appears twice. */
  personalCeo?: {
    totals: FlowBucketTotals;
    tasks: Record<"completed" | "pending" | "na", FlowDrillTask[]>;
    control?: React.ReactNode;
  };
  /** Staff's "HOD assigned tasks" card (2026-07-29) — same contract as
   *  personalCeo, windowed by ?hdate=; suppresses the generic HOD stream
   *  card when present. */
  personalHod?: {
    totals: FlowBucketTotals;
    tasks: Record<"completed" | "pending" | "na", FlowDrillTask[]>;
    control?: React.ReactNode;
  };
  /** Branch Manager's personal "Ad hoc" card + list (2026-07-29): plain
   *  ALL-TIME set, deliberately NO date filter — ad hoc tasks are one-off/
   *  irregular. `flatTasks` feeds the ALWAYS-rendered "My Tasks — Ad hoc"
   *  list; `tasks` (bucketized) feeds the donut card. */
  personalAdhoc?: {
    totals: FlowBucketTotals;
    tasks: Record<"completed" | "pending" | "na", FlowDrillTask[]>;
    flatTasks?: FlowTaskRow[];
  };
  /** Assignable staff directory — enables the department assign form (superadmin). */
  staff?: import("./types").FlowStaffMember[];
  /** Link to the Manpower Schedule page (branch manager only) — the host app
   *  owns routing, so this package just needs a URL to point at. */
  manpowerScheduleHref?: string;
  /** CEO's customizable pinned-department dashboards (CEO role only) — Daily
   *  and Monthly are FULLY INDEPENDENT (separate saved list/order, separate
   *  actions bound to that cadence). Actions are Server Actions ("use
   *  server" functions), which — unlike plain closures — CAN cross the
   *  Server-to-Client-Component boundary. */
  ceoDashboard?: {
    daily: {
      departments: import("./types").FlowEntityDetail[];
      availableToAdd: string[];
      actions: import("./ceo-dashboard").CeoDashboardActions;
    };
    monthly: {
      departments: import("./types").FlowEntityDetail[];
      availableToAdd: string[];
      actions: import("./ceo-dashboard").CeoDashboardActions;
    };
  };
  /** HOD's own freeform personal Kanban (HOD role only — not the DEPT_SITE
   *  view-only login) — already-fetched cards + Server Action-backed
   *  create/move/remove. */
  hodKanban?: {
    cards: import("./types").FlowKanbanCard[];
    columns: import("./types").FlowKanbanColumnDef[];
    actions: HodKanbanActions;
  };
}) {
  const current = period === "daily" ? daily : monthly;
  const me = current.me;
  // ALL role gates below read role-views.ts (the single source of truth,
  // 2026-07-29 centralization) via shows(view, "taskManager", key) — e.g.
  // BRANCH_MEMBER (Branch Exec/Coach) = Daily only.
  const view = resolveViewRole(me.me);
  // NOTE: elevated department sites (Operation/Optimisation) never reach
  // this view — the page routes them to the dropdown entity overview, where
  // their "+ Task" button lives in the page header.
  // Spread ONLY into the viewer's own personal-status cards, incoming
  // assigner streams (e.g. "My Status", "HOD Status", "CEO assigned tasks"),
  // and the flat "My Tasks — Daily/Monthly" row lists — deliberately NOT
  // passed to any aggregate/multi-person view (Department Status, Branch
  // Status, the org-wide grids, CEO's Kanban boards, the roster drill-down's
  // TaskRowLine rows in MemberRow) or any delegated-work view ("Tasks I
  // Assigned", "Ad hoc Tasks", CEO Task Overview), even though the assignee
  // check would harmlessly no-op there too — a single person shouldn't
  // complete a task from a screen showing many people's work, so those cards
  // don't even wire the capability.
  const completeProps = {
    myUserId: me.me.userId,
    onComplete: completeTaskAction,
    onSkip: skipTaskAction,
    onReopen: reopenTaskAction,
    onUploadProof: uploadProofAction,
    reassign,
  };


  // Assigner streams (e.g. "HOD assigned tasks" for staff, "CEO assigned
  // tasks" for an HOD): ALL-TIME, deliberately not daily/monthly — the whole
  // stream at a glance, like the mockups' single-frame stream overviews.
  // Admin/Ops assigned tasks do NOT get their own card (visibleAssignerStreams)
  // — those tasks still land in the normal Daily/Monthly/Ad hoc lists via
  // their Cadence tag, just without a separate "assigned by admin" badge.
  const assignedCards = visibleAssignerStreams(me.streamsAll)
    // The dedicated (date-filtered, always-rendered) CEO/HOD cards replace
    // the generic all-time stream cards when the page provides them.
    .filter((s) => !(personalCeo && s.key === "CEO") && !(personalHod && s.key === "HOD"))
    .map((s) => (
      <StatusOverviewCard
        key={s.key}
        title={flowStreamLabel(s.key)}
        totals={s.totals}
        tasks={flowBucketize(s.tasks)}
        {...completeProps}
      />
    ));

  // "Tasks I Assigned" (HOD's own delegated-work card) — all-time, no period
  // split. The CEO's equivalent is a table now (CeoTaskTable, below), not
  // this donut — current.kind is always "org" for CEO, so this card (only
  // rendered under the member/department overview block) never reaches them.
  // No click-to-complete here: every row is delegated TO someone else, so
  // the viewer is never the assignee — not a personal task list.
  const delegatedCard = me.delegatedAll && (
    <StatusOverviewCard
      title="Tasks I Assigned"
      totals={me.delegatedAll.totals}
      tasks={flowBucketize(me.delegatedAll.tasks)}
      reassign={reassign}
    />
  );

  // Ad hoc tasks — all-time, branch-wide oversight (Branch Manager AND the
  // view-only branch site since the 2026-07-29 final spec). Always rendered
  // when the payload carries it (zero-filled, never a missing section). No
  // click-to-complete: this is oversight across the whole branch's staff,
  // not a personal task list.
  const adhocCard = current.adhoc && (
    <StatusOverviewCard
      title="Ad hoc Tasks"
      totals={current.adhoc.totals}
      tasks={flowBucketize(current.adhoc.tasks)}
      reassign={reassign}
    />
  );

  // Rosters render inside EntityOverviewSection for BOTH scopes since
  // 2026-07-29 (branch adopted the Department Overview pattern) — no
  // separately-styled roster cards remain.

  return (
    <div className="flex flex-col gap-5">
      {/* No toggle for any role — every donut/list/roster below shows Daily
          AND Monthly simultaneously, side by side. Superadmin/CEO's grids
          already worked this way; OPS/Branch/HOD/Member are now consistent
          with them too. */}

      {/* ---- Overview donuts: personal cards row. Which cards render is
          decided ENTIRELY by role-views.ts — site accounts list no
          personal sections, so nothing renders for them here. ---- */}
      {current.kind !== "org" && shows(view, "taskManager", "personalDaily") && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <StatusOverviewCard
            title="Daily"
            totals={daily.me.totals}
            tasks={flowBucketize(daily.me.tasks)}
            action={personalDailyControl}
            actionPlacement="row"
            {...completeProps}
          />
          {shows(view, "taskManager", "personalMonthly") && (
            <StatusOverviewCard
              title="Monthly"
              totals={monthly.me.totals}
              tasks={flowBucketize(monthly.me.tasks)}
              action={personalMonthlyControl}
              actionPlacement="row"
              {...completeProps}
            />
          )}
          {/* Dedicated "CEO assigned tasks" card (HOD) — same as the Home
              version (own ?cdate= filter, always rendered). */}
          {shows(view, "taskManager", "ceoAssigned") && personalCeo && (
            <StatusOverviewCard
              title="CEO assigned tasks"
              totals={personalCeo.totals}
              tasks={personalCeo.tasks}
              action={personalCeo.control}
              actionPlacement="row"
              {...completeProps}
            />
          )}
          {/* Dedicated "HOD assigned tasks" card (department-side staff) —
              same as the Home version (own ?hdate= filter, always
              rendered). */}
          {shows(view, "taskManager", "hodAssigned") && personalHod && (
            <StatusOverviewCard
              title="HOD assigned tasks"
              totals={personalHod.totals}
              tasks={personalHod.tasks}
              action={personalHod.control}
              actionPlacement="row"
              {...completeProps}
            />
          )}
          {/* Branch Manager's personal "Ad hoc" card — always rendered,
              ALL-TIME, no date filter. */}
          {shows(view, "taskManager", "personalAdhoc") && personalAdhoc && (
            <StatusOverviewCard
              title="Ad hoc"
              totals={personalAdhoc.totals}
              tasks={personalAdhoc.tasks}
              {...completeProps}
            />
          )}
          {shows(view, "taskManager", "assignerStreams") && assignedCards}
          {shows(view, "taskManager", "delegated") && delegatedCard}
        </div>
      )}

      {/* Personal-first order (2026-07-29, all roles): the department /
          branch overview blocks that used to sit here render at the BOTTOM
          of the page now — below My Tasks and My Board. */}

      {current.kind === "org" && shows(view, "taskManager", "ceoTaskTable") && (
        <>
          {/* CEO's OWN tasks render through the standard myTasksDaily
              block below (2026-08-01: the old un-windowed combined list
              was replaced by the same weekday-sidebar Daily view every
              role uses). */}

          {/* ---- CEO Task Overview — grouped table, not a donut (status
              groups, Task/PIC/Due date columns). Tasks the CEO delegated
              OUT to others — the opposite direction from My Tasks. ---- */}
          {me.delegatedAll && <CeoTaskTable tasks={flowBucketize(me.delegatedAll.tasks)} />}

          {/* ---- Section 3: Department Daily Overview — Kanban (own
              independent department list/order, never shared with Monthly) ---- */}
          {ceoDashboard && (
            <>
              <PageSectionHeading>Department Daily Overview</PageSectionHeading>
              <CeoDashboardSection
                periodLabel="Daily"
                departments={ceoDashboard.daily.departments}
                availableToAdd={ceoDashboard.daily.availableToAdd}
                actions={ceoDashboard.daily.actions}
              />
            </>
          )}

          {/* ---- Section 4: Department Monthly Overview — Kanban (own
              independent department list/order, never shared with Daily) ---- */}
          {ceoDashboard && (
            <>
              <PageSectionHeading>Department Monthly Overview</PageSectionHeading>
              <CeoDashboardSection
                periodLabel="Monthly"
                departments={ceoDashboard.monthly.departments}
                availableToAdd={ceoDashboard.monthly.availableToAdd}
                actions={ceoDashboard.monthly.actions}
              />
            </>
          )}
        </>
      )}

      {/* OPS (org kind, but a regular individual staff member for THIS
          section): her own Daily/Monthly status + assigner streams —
          per role-views.ts. ADMIN and CEO configs list no personal cards,
          so this renders for OPS only. The org-wide overview grids render
          on the OSC Home page (ui/home-overview.tsx). */}
      {current.kind === "org" && shows(view, "taskManager", "personalDaily") && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <StatusOverviewCard
            title="Daily"
            totals={daily.me.totals}
            tasks={flowBucketize(daily.me.tasks)}
            {...completeProps}
          />
          {shows(view, "taskManager", "personalMonthly") && (
            <StatusOverviewCard
              title="Monthly"
              totals={monthly.me.totals}
              tasks={flowBucketize(monthly.me.tasks)}
              {...completeProps}
            />
          )}
          {shows(view, "taskManager", "assignerStreams") && assignedCards}
        </div>
      )}

      {/* ---- My Tasks lists — which lists render is decided ENTIRELY by
          role-views.ts (superadmin/CEO/site logins list none). ---- */}
      {shows(view, "taskManager", "myTasksDaily") && (
          <>
            {/* The weekday dropdown (DailyTasksByDay) was replaced by the
                shared ?date= picker (2026-07-28): the payload is now windowed
                to the selected single day, so a week-tab grouping has nothing
                to group — the picker's ◀ ▶ arrows step days instead. */}
            <SectionCard title="My Tasks — Daily" action={personalDailyControl}>
              {/* ClickUp-reference layout (2026-07-28): weekday sidebar on
                  the left, task list on the right; stacked on small
                  screens. */}
              <div className="flex flex-col gap-4 sm:flex-row">
                {personalDailyDaySidebar && (
                  <div className="shrink-0 sm:w-40">{personalDailyDaySidebar}</div>
                )}
                <div className="min-w-0 flex-1">
                  <ResizableTaskList
                    tasks={daily.me.tasks}
                    {...completeProps}
                    emptyLabel="No tasks assigned to you this period."
                    hideCompleted
                  />
                </div>
              </div>
            </SectionCard>
            {shows(view, "taskManager", "myTasksMonthly") && (
              <SectionCard title="My Tasks — Monthly" action={personalMonthlyMonthControl}>
                {/* Month dropdown in the heading; range sidebar beside the
                    list (2026-07-30 layout), mirroring Daily's weekday
                    sidebar. */}
                <div className="flex flex-col gap-4 sm:flex-row">
                  {personalMonthlySidebar && (
                    <div className="shrink-0 sm:w-40">{personalMonthlySidebar}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <ResizableTaskList
                      tasks={monthly.me.tasks}
                      {...completeProps}
                      emptyLabel="No tasks assigned to you this period."
                      hideCompleted
                    />
                  </div>
                </div>
              </SectionCard>
            )}
            {/* Ad hoc: routed by MY role as assignee (RunBlock.cadence),
                never by who assigned it. Branch Manager: ALWAYS rendered —
                Daily/Monthly/Ad hoc is their confirmed 3-section My Tasks
                set — as a plain ALL-TIME list, deliberately NO date filter
                (2026-07-29 simplification: ad hoc tasks are one-off/
                irregular; each row shows its due date). Other roles keep
                the old hidden-when-empty list (only Branch Manager
                assignees can ever be tagged ADHOC, per assign/route.ts's
                allowedCadenceOptions, so it's empty for almost everyone). */}
            {shows(view, "taskManager", "myTasksAdhoc") && personalAdhoc ? (
              <SectionCard title="My Tasks — Ad hoc">
                <ResizableTaskList
                  tasks={personalAdhoc.flatTasks ?? []}
                  {...completeProps}
                  emptyLabel="No ad hoc tasks assigned to you."
                  hideCompleted
                />
              </SectionCard>
            ) : (
              me.adhocAll && (
                <SectionCard title="My Tasks — Ad hoc">
                  <ResizableTaskList
                    tasks={me.adhocAll.tasks}
                    {...completeProps}
                    emptyLabel="No ad hoc tasks assigned to you."
                    hideCompleted
                  />
                </SectionCard>
              )
            )}
          </>
        )}

      {/* ---- My Board: HOD's personal drag-and-drop Kanban — ABOVE the
          department overview, per the 2026-07-29 personal-first order.
          ("+ Task" renders in the PAGE HEADER, not here.) ---- */}
      {shows(view, "taskManager", "myBoard") && hodKanban && (
        <>
          <PageSectionHeading>My Board</PageSectionHeading>
          <HodKanban
            cards={hodKanban.cards}
            columns={hodKanban.columns}
            actions={hodKanban.actions}
          />
        </>
      )}

      {/* ---- Tasks I Assigned (2026-08-05): HOD's delegated-OUT work —
          the SAME shared My Tasks table (Task / Assigned To / Proof of
          Completion / Due Date), reused read-only exactly like department-
          overview.tsx's member drill-down (no myUserId/actions, so status
          circles are static and Proof is view-only). The table's
          Assignee column actually renders `assignerName` under the hood
          (it's "who assigned this to me" in the normal My Tasks context)
          — here every row's assigner is always "me", so it's remapped to
          the row's real assignee instead, the useful direction for a
          delegated-OUT list — labeled "Assigned To" here (via
          assigneeColumnLabel) rather than "Assignee" for clarity, since
          it means the opposite thing in this context. CEO's equivalent
          stays the separate, unchanged CeoTaskTable (grouped sections)
          below — this list is HOD-only by design. ---- */}
      {shows(view, "taskManager", "assignedByMeList") && me.delegatedAll && (
        // Card wrapper (2026-08-05) — matches My Board's own card styling
        // (hod-kanban.tsx's root div) so this section reads as one
        // distinct card like every other bordered section on this page,
        // instead of floating on the bare page background.
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <PageSectionHeading hideBorder>Tasks I Assigned</PageSectionHeading>
          <ResizableTaskList
            tasks={me.delegatedAll.tasks.map((t) => ({ ...t, assignerName: t.assigneeName }))}
            emptyLabel="You haven't assigned any tasks yet."
            hideCompleted
            assigneeColumnLabel="Assigned To"
            hideRowResizeDivider
          />
        </div>
      )}

      {/* ---- Department Overview: the full department view (chips + donut
          + click-through member roster) rendered INLINE for HOD and
          DEPT_SITE — the standalone Department Overview page was folded in
          here by the 2026-07-24 redesign. LAST section on the page since
          the 2026-07-29 personal-first reorder. Elevated department sites
          (Operations/Optimisation) never reach this view — the page routes
          them to the dropdown entity overview instead. ---- */}
      {shows(view, "taskManager", "departmentOverview") &&
        daily.department &&
        monthly.department && (
        <>
          <PageSectionHeading>Department Overview</PageSectionHeading>
          <EntityOverviewSection
            label="Daily"
            entity={departmentDaily ?? daily.department}
            kind="department"
            reassign={reassign}
            headerControl={departmentDailyControl}
          />
          <EntityOverviewSection
            label="Monthly"
            entity={monthly.department}
            kind="department"
            reassign={reassign}
          />
        </>
      )}

      {/* ---- Branch Overview (branch kind) — below My Tasks since the
          2026-07-29 personal-first reorder. SAME component as Department
          Overview (EntityOverviewSection, 2026-07-29 request): "{branch} —
          Daily/Monthly" heading + date filter, stat chips, donut, and the
          integrated click-through member roster (Manager → Branch Exec →
          FT Coach → PT Coach sort, applied by the data layer). ---- */}
      {shows(view, "taskManager", "branchOverview") && daily.branch && monthly.branch && (
        <>
          <PageSectionHeading>Branch Overview</PageSectionHeading>
          <EntityOverviewSection
            label="Daily"
            entity={daily.branch}
            kind="branch"
            reassign={reassign}
            headerControl={personalDailyControl}
          />
          <EntityOverviewSection
            label="Monthly"
            entity={monthly.branch}
            kind="branch"
            reassign={reassign}
            headerControl={personalMonthlyControl}
          />
          {/* Ad hoc oversight (branch-wide, ALL-TIME by design) — Branch
              Manager only, not the view-only BRANCH_SITE login. The
              manager's PERSONAL ad hoc card lives in the top row. */}
          {shows(view, "taskManager", "adhocOversight") && adhocCard && (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{adhocCard}</div>
          )}

          {/* ---- Details: manpower schedule (branch manager only, not
              BRANCH_SITE) ---- */}
          {shows(view, "taskManager", "manpowerLink") && manpowerScheduleHref && (
            <>
              <PageSectionHeading>Details</PageSectionHeading>
              <a
                href={manpowerScheduleHref}
                className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:bg-blue-50"
              >
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Manpower Schedule
                  </h3>
                  <p className="mt-1 text-sm text-gray-600">
                    Plan today's staffing grid — assignments sync straight to each coach's task list.
                  </p>
                </div>
                <span className="text-sm font-medium text-blue-600">Open →</span>
              </a>
            </>
          )}
        </>
      )}

      {/* OPS's assign form: "+ Task" renders in the PAGE HEADER (2026-07-29
          consistency requirement) — the old bottom "Details" block is gone. */}

    </div>
  );
}
