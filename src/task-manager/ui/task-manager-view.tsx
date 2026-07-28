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
  FlowDetailResponse,
  FlowEntityDetail,
  FlowMemberRollup,
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
import { AddTaskButton } from "./add-task-button";
import { CeoDashboardSection } from "./ceo-dashboard";
import { CeoTaskTable } from "./ceo-task-table";
import { EntityOverviewSection } from "./department-overview";
import { HodKanban, type HodKanbanActions } from "./hod-kanban";
import {
  CompletionMeter,
  InitialAvatar,
  PageSectionHeading,
  ResizableTaskList,
  SectionCard,
  StatusOverviewCard,
  type ReassignControl,
} from "./bits";

function MemberRow({
  member,
  tasks,
}: {
  member: FlowMemberRollup;
  tasks: FlowTaskRow[];
}) {
  const [open, setOpen] = React.useState(false);
  const total = member.done + member.notDone;
  const allDone = total > 0 && member.notDone === 0;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 py-3 text-left"
      >
        <InitialAvatar name={member.name} id={member.userId} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{member.name}</p>
          <p className="truncate text-xs text-gray-500">{member.employmentType || "—"}</p>
        </div>
        <div className="hidden w-32 shrink-0 sm:block">
          <CompletionMeter done={member.done} total={total} />
        </div>
        <span className="w-24 shrink-0 text-right text-xs text-gray-500">
          {member.done} done · {member.notDone} open
        </span>
        <span
          className={`inline-flex w-24 shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium ${
            allDone ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
          }`}
        >
          {allDone ? "Completed" : "Pending"}
        </span>
        <span className="shrink-0 text-gray-300">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mb-2 rounded-xl bg-gray-50 px-4 py-1">
          <ResizableTaskList tasks={tasks} emptyLabel="No tasks this period." />
        </div>
      )}
    </div>
  );
}

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
  reassign,
  manpowerScheduleHref,
  ceoDashboard,
  staff,
  hodKanban,
  departmentDaily,
  departmentDailyControl,
  personalDailyControl,
  personalMonthlyControl,
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
  // Branch-side MEMBER (Branch Exec/Coach — Manager is role BRANCH, handled
  // separately) sees Daily only, never Monthly: no Monthly "My Status" donut,
  // no "My Tasks — Monthly" list. Department-side MEMBER/HOD/OPS keep both.
  const branchSideMember = me.me.role === "MEMBER" && me.me.branch !== null;
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
    reassign,
  };


  // Assigner streams (e.g. "HOD assigned tasks" for staff, "CEO assigned
  // tasks" for an HOD): ALL-TIME, deliberately not daily/monthly — the whole
  // stream at a glance, like the mockups' single-frame stream overviews.
  // Admin/Ops assigned tasks do NOT get their own card (visibleAssignerStreams)
  // — those tasks still land in the normal Daily/Monthly/Ad hoc lists via
  // their Cadence tag, just without a separate "assigned by admin" badge.
  const assignedCards = visibleAssignerStreams(me.streamsAll).map((s) => (
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

  // Ad hoc tasks — all-time (Branch site + superadmin/OPS org view). No
  // click-to-complete: this is the branch manager's oversight view across
  // her whole branch's staff, not her own personal task list.
  const adhocCard = current.adhoc && flowBucketTotal(current.adhoc.totals) > 0 && (
    <StatusOverviewCard
      title="Ad hoc Tasks"
      totals={current.adhoc.totals}
      tasks={flowBucketize(current.adhoc.tasks)}
      reassign={reassign}
    />
  );

  // Branch scope only since the 2026-07-24 redesign — department rosters now
  // render inside the inline EntityOverviewSection (Details area) instead.
  const dailyRoster = current.kind === "branch" ? daily.branch : undefined;
  const monthlyRoster = current.kind === "branch" ? monthly.branch : undefined;

  return (
    <div className="flex flex-col gap-5">
      {/* No toggle for any role — every donut/list/roster below shows Daily
          AND Monthly simultaneously, side by side. Superadmin/CEO's grids
          already worked this way; OPS/Branch/HOD/Member are now consistent
          with them too. */}

      {/* ---- Overview donuts (composition per role/site) ---- */}
      {(current.kind === "member" || (current.kind === "department" && me.me.role === "HOD")) && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {/* Personal cards — MEMBER always, HOD but NOT its view-only
              DEPT_SITE counterpart (a "Department account" has no personal
              tasks at all — its full department detail renders below). */}
          {(current.kind === "member" || me.me.role === "HOD") && (
            <>
              <StatusOverviewCard
                title="Daily"
                totals={daily.me.totals}
                tasks={flowBucketize(daily.me.tasks)}
                action={personalDailyControl}
                actionPlacement="row"
                {...completeProps}
              />
              {/* Branch-side MEMBER (Branch Exec/Coach) — Daily donut only, no
                  Monthly. Department-side MEMBER and HOD keep both. */}
              {!branchSideMember && (
                <StatusOverviewCard
                  title="Monthly"
                  totals={monthly.me.totals}
                  tasks={flowBucketize(monthly.me.tasks)}
                  action={personalMonthlyControl}
                  actionPlacement="row"
                  {...completeProps}
                />
              )}
              {assignedCards}
              {/* Removed for HOD specifically — "Tasks I Assigned" stays
                  available for MEMBER (the only other role that can reach
                  this block) since the underlying StatusOverviewCard/
                  delegatedCard pattern is shared, not HOD-specific. */}
              {me.me.role !== "HOD" && delegatedCard}
            </>
          )}
        </div>
      )}

      {/* ---- Details: the full department view (chips + donut + click-
          through member roster) rendered INLINE for HOD and DEPT_SITE — the
          standalone Department Overview page was folded in here by the
          2026-07-24 redesign (its old route now redirects to /task-manager).
          Assign Task form + personal Kanban stay HOD-only; elevated
          department sites (Operation/Optimisation) never reach this view —
          the page routes them to the dropdown entity overview instead. ---- */}
      {current.kind === "department" && daily.department && monthly.department && (
        <>
          <PageSectionHeading>Details</PageSectionHeading>
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
          {assignAction && staff && me.me.role === "HOD" && (
            <div className="flex justify-end">
              <AddTaskButton staff={staff} action={assignAction} />
            </div>
          )}
          {me.me.role === "HOD" && hodKanban && (
            <HodKanban
              cards={hodKanban.cards}
              columns={hodKanban.columns}
              actions={hodKanban.actions}
            />
          )}
        </>
      )}

      {current.kind === "branch" && (
        <>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {daily.branch && (
              <StatusOverviewCard
                title="Daily"
                totals={daily.branch.totals}
                tasks={daily.branch.tasks}
                reassign={reassign}
              />
            )}
            {monthly.branch && (
              <StatusOverviewCard
                title="Monthly"
                totals={monthly.branch.totals}
                tasks={monthly.branch.tasks}
                reassign={reassign}
              />
            )}
            {/* Ad hoc oversight — Branch Manager only, not the view-only
                BRANCH_SITE login (spec only gives it Branch Status). */}
            {me.me.role === "BRANCH" && adhocCard}
            {/* CEO/HOD assigned-task cards — Branch Manager only, same as
                every other role with a personal "My Task" view (this block
                is kind-gated, unlike the role-gated "My Tasks —
                Daily/Monthly/Ad hoc" section below, which already covers
                BRANCH on its own). BRANCH_SITE stays view-only. */}
            {me.me.role === "BRANCH" && assignedCards}
          </div>

          {/* ---- Details: manpower schedule (branch manager only, not
              BRANCH_SITE) ---- */}
          {me.me.role === "BRANCH" && manpowerScheduleHref && (
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

      {current.kind === "org" && me.me.role === "CEO" && (
        <>
          {assignAction && staff && (
            <div className="flex justify-end">
              <AddTaskButton staff={staff} action={assignAction} />
            </div>
          )}

          {/* ---- Section 1: My Tasks — tasks assigned TO the CEO by any of
              the 5 assign-capable roles (Superadmin, Operation, Ops, HOD —
              the CEO can't assign to themself). Unlike every other role,
              this is ONE combined list, not separate Daily/Monthly/Ad hoc
              cards — cadence is just a per-row tag here, not a way to split
              the view. Ad hoc-tagged blocks never appear in daily/monthly
              (fetchPeriodBlocks excludes them there), but an UNTAGGED block
              due "today" is inside both the daily window and the current
              month's, so daily.me.tasks and monthly.me.tasks can share a row
              — flowDedupeTasks collapses that before render. Same
              ResizableTaskList as every other "My Tasks" list — single-line
              rows, fixed due date, status-dropdown circle, checkbox/select-
              all/bulk actions, Show Completed toggle, assignee-only
              completion. No date filter here either — the CEO's me-payload
              deliberately stays un-windowed (see getFlowDetail), since this
              single list mixes cadences and shows everything at once. */}
          <SectionCard title="My Tasks">
            <ResizableTaskList
              tasks={flowDedupeTasks([
                ...daily.me.tasks,
                ...monthly.me.tasks,
                ...(me.adhocAll?.tasks ?? []),
              ])}
              {...completeProps}
              emptyLabel="No tasks assigned to you."
              hideCompleted
            />
          </SectionCard>

          {/* ---- Section 2: CEO Task Overview — grouped table, not a donut
              (status groups, Task/PIC/Due date columns).
              Tasks the CEO delegated OUT to others — the opposite direction
              from Section 1 above. ---- */}
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

      {current.kind === "org" && me.me.role !== "CEO" && (
        <>
          {/* Superadmin (ADMIN) gets NO personal cards — just the assign
              form below (its org-wide status grids render on the OSC Home
              page now — ui/home-overview.tsx). OPS
              is a regular individual staff member for THIS section — her own
              Daily/Monthly status + assigner streams (incl. "HOD assigned
              tasks"), same pattern as any other staff member's personal
              overview, and NOTHING else on this page: no Ad hoc card (Branch/
              Manager context), no Department/Branch status grids (Superadmin-
              only, on Home) — her org page is deliberately scoped down to
              just her own tasks + the assign form. Daily/Monthly always
              render as a pair (matching Member/HOD's own status, which is
              never data-gated either) — an empty one just shows a 0/0/0 ring
              instead of disappearing, so the pair doesn't silently go
              asymmetric when only one period has tasks. */}
          {me.me.role !== "ADMIN" && (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              <StatusOverviewCard
                title="Daily"
                totals={daily.me.totals}
                tasks={flowBucketize(daily.me.tasks)}
                {...completeProps}
              />
              <StatusOverviewCard
                title="Monthly"
                totals={monthly.me.totals}
                tasks={flowBucketize(monthly.me.tasks)}
                {...completeProps}
              />
              {assignedCards}
            </div>
          )}

          {/* The org-wide overview grids (all-departments + branch-by-region
              + ad hoc by region, Superadmin only) moved to the OSC Home page
              — see ui/home-overview.tsx. This page keeps the assign form. */}

          {/* ---- Details: administrative actions (assign tasks) — OPS only
              now: ADMIN no longer renders this view at all (the page routes
              superadmin to the dropdown entity overview, with + Task in the
              page header). ---- */}
          {me.me.role === "OPS" && assignAction && staff && (
            <>
              <PageSectionHeading>Details</PageSectionHeading>
              <div className="flex justify-end">
                <AddTaskButton staff={staff} action={assignAction} />
              </div>
            </>
          )}
        </>
      )}

      {/* ---- My tasks (Daily + Monthly, always both unless branch-side
          MEMBER; Ad hoc only when non-empty) — not for superadmin, the CEO
          (whose dashboard is exactly the 3 sections above), or the view-only
          DEPT_SITE/BRANCH_SITE logins (no personal tasks at all). Same role
          gate covers every role that's supposed to have a personal "My
          Task" view (HOD, MEMBER incl. Intern/Full Time/HQ Exec/Branch Exec/
          Coach, OPS, and BRANCH — Farid gets these too, this block isn't
          gated by `current.kind`). ---- */}
      {me.me.role !== "ADMIN" &&
        me.me.role !== "CEO" &&
        me.me.role !== "DEPT_SITE" &&
        me.me.role !== "BRANCH_SITE" && (
          <>
            {/* The weekday dropdown (DailyTasksByDay) was replaced by the
                shared ?date= picker (2026-07-28): the payload is now windowed
                to the selected single day, so a week-tab grouping has nothing
                to group — the picker's ◀ ▶ arrows step days instead. */}
            <SectionCard title="My Tasks — Daily" action={personalDailyControl}>
              <ResizableTaskList
                tasks={daily.me.tasks}
                {...completeProps}
                emptyLabel="No tasks assigned to you this period."
                hideCompleted
              />
            </SectionCard>
            {!branchSideMember && (
              <SectionCard title="My Tasks — Monthly" action={personalMonthlyControl}>
                <ResizableTaskList
                  tasks={monthly.me.tasks}
                  {...completeProps}
                  emptyLabel="No tasks assigned to you this period."
                  hideCompleted
                />
              </SectionCard>
            )}
            {/* Ad hoc: routed by MY role as assignee (RunBlock.cadence),
                never by who assigned it — hidden entirely when empty (only
                Branch Manager assignees can ever be tagged ADHOC, per
                assign/route.ts's allowedCadenceOptions, so this is empty for
                almost everyone). All-time, like every other Ad hoc view. */}
            {me.adhocAll && (
              <SectionCard title="My Tasks — Ad hoc">
                <ResizableTaskList
                  tasks={me.adhocAll.tasks}
                  {...completeProps}
                  emptyLabel="No ad hoc tasks assigned to you."
                  hideCompleted
                />
              </SectionCard>
            )}
          </>
        )}

      {/* ---- Member roster (branch scope), Daily + Monthly ---- */}
      {[
        { period: "Daily", roster: dailyRoster },
        { period: "Monthly", roster: monthlyRoster },
      ].map(
        ({ period: label, roster }) =>
          roster && (
            <SectionCard
              key={label}
              title={`Members — ${roster.name} (${label})`}
              action={
                <span className="text-xs text-gray-400">
                  {roster.members.length} members
                </span>
              }
            >
              {roster.members.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">
                  No member activity this period.
                </p>
              ) : (
                roster.members.map((m) => {
                  const memberTasks = [
                    ...roster.tasks.completed,
                    ...roster.tasks.pending,
                    ...roster.tasks.na,
                  ].filter((t) => t.assigneeId === m.userId);
                  return <MemberRow key={m.userId} member={m} tasks={memberTasks} />;
                })
              )}
            </SectionCard>
          ),
      )}
    </div>
  );
}
