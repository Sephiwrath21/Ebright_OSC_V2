"use client";

// OSC integration package — the "ClickUp Tasks" page body. Per-role layout,
// current as of the 2026-08-12 stacked-sections redesign (Tasks 1-11): the
// old personal donut row (Daily/Monthly/ceoAssigned/hodAssigned donuts) and
// "My Tasks — Daily/Monthly" lists were retired — each subsumed into
// TaskOverviewStack, a shared component that stacks up to four
// EntityCardOverview sections (Daily · Monthly · HOD Assigned Task · CEO
// Assigned Task) for a given entity, with the viewer's own row actionable
// and everyone else's read-only. The CEO's ceoTaskTable and HOD's
// assignedByMeList (each entity's own delegated-out list) were retired the
// same day, then REVIVED 2026-08-19 as their own separate flat-table
// sections, not folded into TaskOverviewStack:
//   Staff (DEPT_MEMBER/BRANCH_MEMBER/COACH): myOverview — a self-scoped
//                    TaskOverviewStack with no HOD/CEO Assigned sections.
//                    DEPT_MEMBER/BRANCH_MEMBER/COACH see their WHOLE
//                    department/branch's Daily roster (own row actionable);
//                    Monthly (DEPT_MEMBER only) stays self-only.
//                    BRANCH_MEMBER/COACH are Daily-only.
//   HOD/DEPT_SITE:   myBoard (HOD's own freeform Kanban, HOD only) ·
//                    assignedByMeList ("Tasks I Assigned", HOD only) ·
//                    departmentOverview — a TaskOverviewStack for the HOD's
//                    own department (Daily/Monthly/HOD Assigned/CEO
//                    Assigned), inline (the folded-in Department Overview
//                    page).
//   BRANCH_MANAGER:  myTasksAdhoc (own ad hoc list) · branchOverview — a
//                    TaskOverviewStack for the branch, Ad hoc in place of
//                    HOD/CEO Assigned (2026-08-18: personalAdhoc/
//                    adhocOversight/manpowerLink all dropped).
//   BRANCH_SITE:     branchOverview — same TaskOverviewStack, view-only, but
//                    HOD/CEO Assigned unchanged AND its own Ad hoc section
//                    (adhocAssigned slot, 2026-08-18 — folded in from a
//                    standalone donut card).
//   CEO:             myOverview (self-scoped Daily/Monthly stack, no HOD/CEO
//                    Assigned) · entityDropdowns (the Department|Branch
//                    dropdown TaskOverviewStack, appended below own
//                    sections).
//   OPS:             myOverview (self-scoped Daily/Monthly) ·
//                    assignerStreams (generic incoming-assigner cards; no
//                    org grids).
//   ADMIN/ELEVATED_DEPT_SITE: entityDropdowns only — the Department|Branch
//                    dropdown overview IS the whole page. The org-wide
//                    overview grids (all-departments + branch-by-region,
//                    overview-grids.tsx) used to render on the OSC Home page
//                    (home-overview.tsx) — both removed entirely, 2026-08-15.
// No role has a Daily/Monthly toggle anywhere on this page — every
// TaskOverviewStack shows BOTH periods simultaneously, stacked top to
// bottom. No donut cards remain anywhere on this page (2026-08-18 donut
// sweep — Ad hoc and assigner streams were the last two): every section is
// now an EntityCardOverview card grid with inline rows, no drill-in modal.
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
  toSelfEntityDetail,
  visibleAssignerStreams,
} from "./types";
import { isPersonalAccountView, resolveViewRole, shows } from "../role-views";
import { TaskOverviewStack } from "./task-overview-stack";
import { EntityCardOverview, type MyMonthConfig, type MyWeekConfig } from "./entity-card-overview";
import { HodKanban, type HodKanbanActions } from "./hod-kanban";
import {
  PageSectionHeading,
  ResizableTaskList,
  SectionCard,
  type ReassignControl,
} from "./bits";
import { CardModeProvider, CardModeToggle } from "./card-mode-context";

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
  cardReassign,
  manpowerScheduleHref,
  staff,
  hodKanban,
  departmentDaily,
  departmentDailyControl,
  hodAssignedDepartment,
  hodAssignedBranch,
  ceoAssignedDepartment,
  adhocAssignedBranch,
  categoryList,
  myOverview,
  myWeek,
  myMonth,
  personalDailyControl,
  personalMonthlyControl,
  personalAdhoc,
  ceoDelegatedAll,
  hodDelegatedAll,
  updateDueDateAction,
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
  /** "Assign to Others" self-service handoff (2026-08-13) for the
   *  TaskOverviewStack card grids (departmentOverview/branchOverview/
   *  myOverview) — DELIBERATELY separate from `reassign` above: this one is
   *  built unconditionally (every role, since self-service only ever lets
   *  the viewer hand off their OWN pending task), while `reassign` stays
   *  gated to the 5 manager identities for the delegated/ad hoc oversight
   *  cards elsewhere on this page, unchanged. reassignFlowTask (the shared
   *  underlying action both ultimately call) re-enforces the correct scope
   *  server-side either way. */
  cardReassign?: ReassignControl;
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
  /** CEO Assigned Task — HOD only (2026-08-18: CEO only ever assigns tasks
   *  to HODs, so no branch entity ever has data here — there is no
   *  ceoAssignedBranch prop anymore). Same shape/omit-on-null behavior as
   *  hodAssignedDepartment above. */
  ceoAssignedDepartment?: { department: FlowEntityDetail } | null;
  /** "Ad hoc" section (2026-08-18, Branch Manager's own page + Branch Site's
   *  own former donut card) — same shape/omit-on-null convention as
   *  hodAssignedBranch above, fetched via getBranchAdhocAssigned instead. */
  adhocAssignedBranch?: { branch: FlowEntityDetail } | null;
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
    daily?: {
      entity: FlowEntityDetail;
      dateControl?: React.ReactNode;
      showViewToggle: boolean;
      myWeek?: MyWeekConfig;
    };
    monthly?: {
      entity: FlowEntityDetail;
      dateControl?: React.ReactNode;
      showViewToggle: boolean;
      /** Month-range-chunk tab view for the own card (2026-08-21) — same
       *  shape/behavior as Branch Overview's own myMonth (below), now also
       *  wired for myOverview's Monthly section (OPS/DEPT_MEMBER). */
      myMonth?: MyMonthConfig;
    };
    hodAssigned?: { entity: FlowEntityDetail; dateControl?: React.ReactNode; showViewToggle: boolean };
    ceoAssigned?: { entity: FlowEntityDetail; showViewToggle: boolean };
  };
  /** Weekday-tab view for the own card (2026-08-15) — Department/Branch
   *  Overview's OWN Daily section only (myOverview's Daily gets it via
   *  myOverview.daily.myWeek instead, since that section is built entirely
   *  by the caller). See EntityCardOverview's `myWeek` prop doc comment. */
  myWeek?: MyWeekConfig;
  /** Month-range-chunk tab view for the own card (2026-08-18) — Branch
   *  Overview's OWN Monthly section only, mirroring myWeek above exactly
   *  (was Home-only before this; Department Overview and entityDropdowns'
   *  Monthly sections are unaffected, still the plain range dropdown). */
  myMonth?: MyMonthConfig;
  /** Personal date filters (2026-07-28, ?date=/?mdate=; repurposed
   *  2026-08-12 as TaskOverviewStack's dateControl): feed the Daily/Monthly
   *  section headings inside myOverview/departmentOverview/branchOverview's
   *  TaskOverviewStack — the daily one shares ?date= with
   *  departmentDailyControl, keeping every Daily surface on the page on the
   *  same day. */
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
  /** CEO's own delegated-out list ("CEO Assigned Task", ceoTaskTable
   *  SectionKey, 2026-08-19) — every task CEO personally started, ALL-TIME,
   *  read-only. Same getMePayload.delegatedAll shape used elsewhere;
   *  `assigneeName` on each row is already the recipient HOD's name. null
   *  when CEO hasn't assigned anything yet; undefined for every other role. */
  ceoDelegatedAll?: { totals: FlowBucketTotals; tasks: FlowDrillTask[] } | null;
  /** HOD's own delegated-out list ("Tasks I Assigned", assignedByMeList
   *  SectionKey, revived 2026-08-19) — every task the HOD personally
   *  started, ALL-TIME, read-only. Same getMePayload.delegatedAll shape as
   *  ceoDelegatedAll above; `assigneeName` on each row is already the
   *  recipient department member's name. null when the HOD hasn't assigned
   *  anything yet; undefined for every other role. */
  hodDelegatedAll?: { totals: FlowBucketTotals; tasks: FlowDrillTask[] } | null;
  /** Editable Due Date (2026-08-19), scoped ONLY to "Tasks I Assigned"/"CEO
   *  Assigned Task" — see ResizableTaskList's own `onDueAtChange` doc
   *  comment. Omit to leave the Due Date cells in those two sections
   *  read-only. */
  updateDueDateAction?: (runBlockId: string, newDueAtIso: string) => Promise<ActionResult>;
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
  // Department/Branch Overview's View toggle default (2026-08-15): a real
  // person (HOD, Branch Manager) lands on "Only Me" first — they have
  // actual personal tasks to check before browsing the whole roster; a
  // shared/site account (DEPT_SITE, BRANCH_SITE) has none, so it still
  // defaults to "View All". See isPersonalAccountView's doc comment.
  const defaultOnlyMe = isPersonalAccountView(view);
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
  // Card-grid format (2026-08-18 donut sweep): one EntityCardOverview per
  // stream, each wrapping the viewer's own totals/tasks into a synthetic
  // one-member roster (toSelfEntityDetail) — this is OPS's own personal
  // tasks grouped by assigner, not a real multi-person roster, so
  // TaskOverviewStack's fixed named slots (hodAssigned/ceoAssigned/
  // adhocAssigned) don't fit an arbitrary/dynamic list of streams; reusing
  // EntityCardOverview directly, one per stream, keeps the same Person-sort
  // card look without forcing a roster shape that doesn't apply.
  const assignedCards = visibleAssignerStreams(me.streamsAll)
    .map((s) => (
      <EntityCardOverview
        key={s.key}
        sectionLabel={flowStreamLabel(s.key)}
        entityName=""
        entity={toSelfEntityDetail(me.me, { totals: s.totals, tasks: s.tasks })}
        categories={categoryList ?? []}
        showViewToggle={false}
        {...completeProps}
      />
    ));

  // "Task Assignment" ("delegated" SectionKey) — dropped 2026-08-12: no
  // role's taskManager array has ever listed "delegated" (grep-confirmed
  // against role-views.ts), so this donut card was already unreachable
  // before this task; its sole render site (inside the retired personalDaily
  // block, Step 1 of the stacked-sections redesign) is gone now too.

  // Rosters render inside EntityCardOverview for BOTH scopes (2026-08-12
  // redesign, replacing EntityOverviewSection) — no separately-styled
  // roster cards remain. Ad hoc oversight (branch-wide, all-time) now
  // renders inside branchOverview's own TaskOverviewStack via its
  // adhocAssigned slot (2026-08-18 donut sweep) — no standalone card here.

  // Shared page-level List/Donut toggle (2026-08-22, personal/HOD/Branch
  // pages — mirrors the admin Department/Branch/All Departments page's own
  // CardModeProvider, page.tsx) — ONE control at the top of the page
  // governs every EntityCardOverview section below (myOverview's Daily +
  // Monthly, departmentOverview's, branchOverview's) instead of each
  // section owning its own independent toggle. Only shown when at least
  // one of those sections actually renders for this role — a role with
  // none of them (pure Kanban/table sections) gets no inert toggle.
  const showCardModeToggle =
    shows(view, "taskManager", "myOverview") ||
    shows(view, "taskManager", "departmentOverview") ||
    shows(view, "taskManager", "branchOverview");

  return (
    <CardModeProvider userId={me.me.userId}>
    <div className="flex flex-col gap-5">
      {showCardModeToggle && (
        <div className="flex justify-end">
          <CardModeToggle />
        </div>
      )}
      {/* No Daily/Monthly toggle for any role — every donut/list/roster
          below shows Daily AND Monthly simultaneously, side by side.
          Superadmin/CEO's grids already worked this way; OPS/Branch/HOD/
          Member are now consistent with them too. */}

      {/* personalAdhoc's own donut card (Branch Manager's Task Manager page)
          is gone (2026-08-18 donut sweep) — no role's taskManager config
          has listed "personalAdhoc" since Branch Manager's Ad hoc moved to
          myTasksAdhoc below, so this section was already dead; removed for
          real. */}

      {/* OPS's generic incoming assigner-stream cards (2026-08-12: same
          reason as above — assignerStreams is a different concept from the
          retired personal Daily/Monthly cards and stays untouched). Stacked
          vertically (2026-08-18 donut sweep), not a side-by-side grid — each
          card is now a full EntityCardOverview section, not a compact tile. */}
      {shows(view, "taskManager", "assignerStreams") && assignedCards.length > 0 && (
        <div className="flex flex-col gap-5">{assignedCards}</div>
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

      {/* ---- Tasks I Assigned (assignedByMeList, revived 2026-08-19): HOD's
          own delegated-out list — every task the HOD personally started,
          ALL-TIME, read-only. Same flat Task/Assignee/Status table shape as
          CEO's ceoTaskTable above (assigneeName is already the recipient
          department member's name on each row, per getMePayload's
          delegatedAll). Positioned right after My Board, before Department
          Overview — mirrors CEO's own-tasks-first ordering. Collapsible
          (2026-08-19) + hideCompleted's Pending/Completed/N-A grouping —
          each group has its own chevron; no master "Show Completed" toggle
          here (removed 2026-08-19, per-group chevrons alone are enough) —
          see ResizableTaskList's own doc comments for both. ---- */}
      {shows(view, "taskManager", "assignedByMeList") && hodDelegatedAll && (
        <SectionCard title="Tasks I Assigned" collapsible>
          <ResizableTaskList
            tasks={hodDelegatedAll.tasks}
            myUserId={me.me.userId}
            emptyLabel="No tasks assigned to your team yet."
            hideCompleted
            assigneeSource="assignee"
            onDueAtChange={updateDueDateAction}
            reassign={cardReassign}
            reassignAsMenu
            reassignAnyOwner
          />
        </SectionCard>
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
            daily={{
              entity: departmentDaily ?? daily.department,
              dateControl: departmentDailyControl,
              showViewToggle: true,
              defaultOnlyMe,
              myWeek,
            }}
            // Month + range dropdown (2026-08-21, matching Branch
            // Overview's own Monthly exactly — same personalMonthlyControl/
            // myMonth props) — previously had NO date-range filtering at
            // all here, always showing the whole month. dateControl drives
            // ?mrange= for the WHOLE roster; myMonth is the bonus per-card
            // tab strip, only ever visible when the viewer narrows to
            // "Only Me" (their own single card) — see EntityCardOverview's
            // showMyMonth gate (isOwnCard && personCards.length === 1).
            monthly={{
              entity: monthly.department,
              dateControl: personalMonthlyControl,
              showViewToggle: true,
              defaultOnlyMe,
              myMonth,
            }}
            hodAssigned={
              hodAssignedDepartment
                ? { entity: hodAssignedDepartment.department, showViewToggle: true, defaultOnlyMe }
                : undefined
            }
            // CEO Assigned Task (2026-08-18): visible on any department view
            // (HOD and DEPT_SITE both reach departmentOverview) — the roster
            // inside is restricted to HOD only (getEntityCeoAssignedPayload's
            // restrictRosterToRole), since CEO only ever assigns to the HOD,
            // rather than hiding the section for non-HOD viewers.
            ceoAssigned={
              ceoAssignedDepartment
                ? { entity: ceoAssignedDepartment.department, showViewToggle: true, defaultOnlyMe }
                : undefined
            }
            onComplete={completeTaskAction}
            onSkip={skipTaskAction}
            onReopen={reopenTaskAction}
            onUploadProof={uploadProofAction}
            onRemoveProof={removeProofAction}
            reassign={cardReassign}
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
            daily={{
              entity: daily.branch,
              dateControl: personalDailyControl,
              showViewToggle: true,
              defaultOnlyMe,
              myWeek,
            }}
            monthly={{
              entity: monthly.branch,
              dateControl: personalMonthlyControl,
              showViewToggle: true,
              defaultOnlyMe,
              myMonth,
            }}
            // Branch Manager's own page swaps HOD Assigned for Ad hoc
            // (2026-08-18, explicit product decision) — Branch Site (the
            // view-only login, same branchOverview section) keeps HOD
            // Assigned unchanged. No ceoAssigned prop at all here (2026-08-18
            // HOD-only restriction) — no branch role is ever an HOD, so a
            // branch entity's "CEO Assigned Task" section could never have
            // shown anything but empty.
            hodAssigned={
              view === "BRANCH_MANAGER"
                ? undefined
                : hodAssignedBranch
                  ? { entity: hodAssignedBranch.branch, showViewToggle: true, defaultOnlyMe }
                  : undefined
            }
            // Ad hoc oversight (branch-wide, ALL-TIME by design): Branch
            // Manager AND the view-only Branch Site login (2026-08-18 donut
            // sweep — Branch Site's old standalone "Ad hoc Tasks" donut card
            // was folded into this same roster card-grid slot instead of a
            // separate section below).
            adhocAssigned={
              (view === "BRANCH_MANAGER" || view === "BRANCH_SITE") && adhocAssignedBranch
                ? { entity: adhocAssignedBranch.branch, showViewToggle: true, defaultOnlyMe }
                : undefined
            }
            onComplete={completeTaskAction}
            onSkip={skipTaskAction}
            onReopen={reopenTaskAction}
            onUploadProof={uploadProofAction}
            onRemoveProof={removeProofAction}
            reassign={cardReassign}
          />

          {/* ---- Details: manpower schedule (branch manager only, not
              BRANCH_SITE) ---- */}
          {shows(view, "taskManager", "manpowerLink") && manpowerScheduleHref && (
            <>
              <PageSectionHeading>Details</PageSectionHeading>
              <a
                href={manpowerScheduleHref}
                className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700 dark:hover:bg-blue-900"
              >
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-400">
                    Manpower Schedule
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">
                    Plan today's staffing grid — assignments sync straight to each coach's task list.
                  </p>
                </div>
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">Open →</span>
              </a>
            </>
          )}
        </>
      )}

      {/* ---- myOverview (2026-08-12 stacked-sections redesign): the
          self-scoped 4-section stack for roles with no owned entity — OPS,
          CEO, and every MEMBER-role viewer (DEPT_MEMBER/BRANCH_MEMBER/
          COACH). Replaces personalDaily/personalMonthly/ceoAssigned/
          hodAssigned/myTasksDaily/myTasksMonthly/assignedByMeList for these
          roles (see role-views.ts). ceoTaskTable is CEO's own separate
          section, rendered right below, not folded into this stack. ---- */}
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
          reassign={cardReassign}
        />
      )}

      {/* ---- CEO Assigned Task (ceoTaskTable, revived 2026-08-19): CEO's
          own delegated-out list — every task CEO personally started,
          ALL-TIME, read-only. Same flat Task/Assignee/Status table shape as
          "My Tasks — Ad hoc" below (assigneeName is already the recipient
          HOD's name on each row, per getMePayload's delegatedAll).
          Collapsible (2026-08-19) + hideCompleted's Pending/Completed/N-A
          grouping — each group has its own chevron; no master "Show
          Completed" toggle here (removed 2026-08-19, same as "Tasks I
          Assigned" above) — see ResizableTaskList's own doc comments for
          both. Card ALWAYS renders now (2026-08-26, user request) even with
          zero delegated tasks — ceoDelegatedAll is null in that case, so
          ResizableTaskList gets an empty array and shows its own
          emptyLabel; previously the whole card (border included) was
          omitted, which read as "does the CEO even have this section?" ---- */}
      {shows(view, "taskManager", "ceoTaskTable") && (
        <SectionCard title="CEO Assigned Task" collapsible>
          <ResizableTaskList
            tasks={ceoDelegatedAll?.tasks ?? []}
            myUserId={me.me.userId}
            emptyLabel="No tasks assigned to any HOD yet."
            hideCompleted
            assigneeSource="assignee"
            onDueAtChange={updateDueDateAction}
            reassign={cardReassign}
            reassignAsMenu
            reassignAnyOwner
          />
        </SectionCard>
      )}

      {/* OPS's assign form: "+ Task" renders in the PAGE HEADER (2026-07-29
          consistency requirement) — the old bottom "Details" block is gone. */}

    </div>
    </CardModeProvider>
  );
}
