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
  FlowCategoryOption,
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
import { TaskOverviewStack } from "./task-overview-stack";
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
  removeProofAction,
  reassign,
  manpowerScheduleHref,
  staff,
  hodKanban,
  departmentDaily,
  departmentDailyControl,
  hodAssignedDepartment,
  hodAssignedBranch,
  ceoAssignedDepartment,
  ceoAssignedBranch,
  categoryList,
  myOverview,
  personalDailyControl,
  personalMonthlyControl,
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
  /** The Proof gallery's per-photo remove (2026-08-08) — same personal-only
   *  wiring as uploadProofAction. */
  removeProofAction?: import("./types").ProofRemoveHandler;
  /** "Assign to Others" control for every Pending drill modal on this page —
   *  the page only provides it to the 5 assign-capable identities. */
  reassign?: ReassignControl;
  /** HOD/DEPT_SITE only: replaces daily.department in the inline Details
   *  Daily section — the page re-fetches it for the selected ?date=. */
  departmentDaily?: FlowEntityDetail;
  /** The Daily date filter, rendered on that section's heading row. */
  departmentDailyControl?: React.ReactNode;
  /** EntityCardOverview's "HOD Assigned Task" filter mode (Overview card
   *  redesign, 2026-08-12) — all-time, HOD-assigned-only entity payload,
   *  fetched server-side alongside daily/monthly. Null when the viewer has
   *  no department/branch to fetch it for, or the fetch failed; the section
   *  is omitted entirely in that case (TaskOverviewStack's hodAssigned prop
   *  is left undefined) rather than falling back to other data. */
  hodAssignedDepartment?: { department: FlowEntityDetail } | null;
  hodAssignedBranch?: { branch: FlowEntityDetail } | null;
  /** CEO Assigned Task equivalent of hodAssignedDepartment/hodAssignedBranch
   *  above — same shape, same omit-on-null behavior. */
  ceoAssignedDepartment?: { department: FlowEntityDetail } | null;
  ceoAssignedBranch?: { branch: FlowEntityDetail } | null;
  /** Active task categories — feeds EntityCardOverview's "Sort: Type" mode. */
  categoryList?: FlowCategoryOption[];
  /** Self-scoped 4-section stack (2026-08-12 stacked-sections redesign) —
   *  OPS, CEO, and every MEMBER-role viewer (DEPT_MEMBER/BRANCH_MEMBER/
   *  COACH) with no owned entity. `daily`/`monthly`/`hodAssigned`/
   *  `ceoAssigned` mirror TaskOverviewStack's own optional per-section
   *  props exactly — omit a section to omit it (e.g. no monthly for
   *  BRANCH_MEMBER/COACH, no hodAssigned/ceoAssigned for OPS/CEO). */
  myOverview?: {
    entityName: string;
    daily?: { entity: FlowEntityDetail; dateControl?: React.ReactNode; showViewToggle: boolean };
    monthly?: { entity: FlowEntityDetail; dateControl?: React.ReactNode; showViewToggle: boolean };
    hodAssigned?: { entity: FlowEntityDetail; showViewToggle: boolean };
    ceoAssigned?: { entity: FlowEntityDetail; showViewToggle: boolean };
  };
  /** Personal date filters (2026-07-28, ?date=/?mdate=): each is mounted on
   *  BOTH its period's personal surfaces — the top Daily/Monthly donut card
   *  and the matching "My Tasks" heading — so one selection drives the donut
   *  AND the list. The daily one shares ?date= with departmentDailyControl,
   *  keeping every Daily surface on the page on the same day. */
  personalDailyControl?: React.ReactNode;
  personalMonthlyControl?: React.ReactNode;
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
    onRemoveProof: removeProofAction,
    reassign,
  };


  // Assigner streams (e.g. "HOD assigned tasks" for staff, "CEO assigned
  // tasks" for an HOD): ALL-TIME, deliberately not daily/monthly — the whole
  // stream at a glance, like the mockups' single-frame stream overviews.
  // Admin/Ops assigned tasks do NOT get their own card (visibleAssignerStreams)
  // — those tasks still land in the normal Daily/Monthly/Ad hoc lists via
  // their Cadence tag, just without a separate "assigned by admin" badge.
  const assignedCards = visibleAssignerStreams(me.streamsAll)
    .map((s) => (
      <StatusOverviewCard
        key={s.key}
        title={flowStreamLabel(s.key)}
        totals={s.totals}
        tasks={flowBucketize(s.tasks)}
        {...completeProps}
      />
    ));

  // "Task Assignment" ("delegated" SectionKey) — dropped 2026-08-12: no
  // role's taskManager array has ever listed "delegated" (grep-confirmed
  // against role-views.ts), so this donut card was already unreachable
  // before this task; its sole render site (inside the retired personalDaily
  // block, Step 1 of the stacked-sections redesign) is gone now too.

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

  // Rosters render inside EntityCardOverview for BOTH scopes (2026-08-12
  // redesign, replacing EntityOverviewSection) — no separately-styled
  // roster cards remain.

  return (
    <div className="flex flex-col gap-5">
      {/* No toggle for any role — every donut/list/roster below shows Daily
          AND Monthly simultaneously, side by side. Superadmin/CEO's grids
          already worked this way; OPS/Branch/HOD/Member are now consistent
          with them too. */}

      {/* ---- Overview donuts: personal cards row. Which cards render is
          decided ENTIRELY by role-views.ts — site accounts list no
          personal sections, so nothing renders for them here. ---- */}
      {/* Branch Manager's personal "Ad hoc" card (2026-08-12: no longer
          nested under personalDaily, which is retired for every role —
          Ad hoc itself is untouched by this redesign, just needed a new
          home now that its old parent gate is always false). */}
      {shows(view, "taskManager", "personalAdhoc") && personalAdhoc && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <StatusOverviewCard
            title="Ad hoc"
            totals={personalAdhoc.totals}
            tasks={personalAdhoc.tasks}
            {...completeProps}
          />
        </div>
      )}

      {/* OPS's generic incoming assigner-stream cards (2026-08-12: same
          reason as above — assignerStreams is a different concept from the
          retired personal Daily/Monthly cards and stays untouched). */}
      {shows(view, "taskManager", "assignerStreams") && assignedCards.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{assignedCards}</div>
      )}

      {/* Personal-first order (2026-07-29, all roles): the department /
          branch overview blocks that used to sit here render at the BOTTOM
          of the page now — below My Tasks and My Board. */}

      {/* Branch Manager's always-rendered "My Tasks — Ad hoc" list
          (2026-08-12: no longer nested under myTasksDaily, which is
          retired for every role — Ad hoc itself is untouched). */}
      {shows(view, "taskManager", "myTasksAdhoc") && personalAdhoc && (
        <SectionCard title="My Tasks — Ad hoc">
          <ResizableTaskList
            tasks={personalAdhoc.flatTasks ?? []}
            {...completeProps}
            emptyLabel="No ad hoc tasks assigned to you."
            hideCompleted
          />
        </SectionCard>
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
          <TaskOverviewStack
            entityName={daily.department.name}
            categories={categoryList ?? []}
            myUserId={me.me.userId}
            daily={{ entity: departmentDaily ?? daily.department, dateControl: departmentDailyControl, showViewToggle: true }}
            monthly={{ entity: monthly.department, showViewToggle: true }}
            hodAssigned={
              hodAssignedDepartment ? { entity: hodAssignedDepartment.department, showViewToggle: true } : undefined
            }
            ceoAssigned={
              ceoAssignedDepartment ? { entity: ceoAssignedDepartment.department, showViewToggle: true } : undefined
            }
            onComplete={completeTaskAction}
            onSkip={skipTaskAction}
            onReopen={reopenTaskAction}
            onUploadProof={uploadProofAction}
            onRemoveProof={removeProofAction}
          />
        </>
      )}

      {/* ---- Branch Overview (branch kind) — below My Tasks since the
          2026-07-29 personal-first reorder. SAME component as Department
          Overview (TaskOverviewStack, 2026-08-12 redesign): "{branch} —
          Overview" heading + Filter/Date/Sort/View controls, and
          person/type-grouped task cards (Manager → Branch Exec →
          FT Coach → PT Coach sort, applied by the data layer). ---- */}
      {shows(view, "taskManager", "branchOverview") && daily.branch && monthly.branch && (
        <>
          <PageSectionHeading>Branch Overview</PageSectionHeading>
          <TaskOverviewStack
            entityName={daily.branch.name}
            categories={categoryList ?? []}
            myUserId={me.me.userId}
            daily={{ entity: daily.branch, dateControl: personalDailyControl, showViewToggle: true }}
            monthly={{ entity: monthly.branch, dateControl: personalMonthlyControl, showViewToggle: true }}
            hodAssigned={hodAssignedBranch ? { entity: hodAssignedBranch.branch, showViewToggle: true } : undefined}
            ceoAssigned={ceoAssignedBranch ? { entity: ceoAssignedBranch.branch, showViewToggle: true } : undefined}
            onComplete={completeTaskAction}
            onSkip={skipTaskAction}
            onReopen={reopenTaskAction}
            onUploadProof={uploadProofAction}
            onRemoveProof={removeProofAction}
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

      {/* ---- myOverview (2026-08-12 stacked-sections redesign): the
          self-scoped 4-section stack for roles with no owned entity — OPS,
          CEO, and every MEMBER-role viewer (DEPT_MEMBER/BRANCH_MEMBER/
          COACH). Replaces personalDaily/personalMonthly/ceoAssigned/
          hodAssigned/myTasksDaily/myTasksMonthly/assignedByMeList/
          ceoTaskTable for these roles (see role-views.ts). ---- */}
      {shows(view, "taskManager", "myOverview") && myOverview && (
        <TaskOverviewStack
          entityName={myOverview.entityName}
          categories={categoryList ?? []}
          myUserId={me.me.userId}
          daily={myOverview.daily}
          monthly={myOverview.monthly}
          hodAssigned={myOverview.hodAssigned}
          ceoAssigned={myOverview.ceoAssigned}
          onComplete={completeTaskAction}
          onSkip={skipTaskAction}
          onReopen={reopenTaskAction}
          onUploadProof={uploadProofAction}
          onRemoveProof={removeProofAction}
        />
      )}

      {/* OPS's assign form: "+ Task" renders in the PAGE HEADER (2026-07-29
          consistency requirement) — the old bottom "Details" block is gone. */}

    </div>
  );
}
