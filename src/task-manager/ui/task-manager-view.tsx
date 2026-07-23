"use client";

// OSC integration package — the "ClickUp Tasks" page body. The top of the page
// is a row of OVERVIEW DONUTS whose composition follows the mockup sites:
//   Staff (MEMBER):  My Status Daily · My Status Monthly · {HOD/CEO/…} Assigned
//   HOD:             My Daily · My Monthly · CEO Assigned · Department D + M
//   BRANCH:          Branch Status Daily · Monthly · Ad hoc tasks
//   CEO:             CEO Tasks (assigned by me) · all-departments D + M grids
//   OPS/ADMIN:       as CEO + all-branches grids
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
  FlowAssignInput,
  FlowDetailResponse,
  FlowEntityRollup,
  FlowMemberRollup,
  FlowPeriod,
  FlowTaskRow,
} from "./types";
import {
  flowBucketize,
  flowBucketTotal,
  flowCompletionPct,
  flowDedupeTasks,
  flowStreamLabel,
  visibleAssignerStreams,
} from "./types";
import { AddTaskButton } from "./add-task-button";
import { CeoDashboardSection } from "./ceo-dashboard";
import { CeoTaskTable } from "./ceo-task-table";
import { HodKanban, type HodKanbanActions } from "./hod-kanban";
import {
  BUCKET_META,
  CompletionMeter,
  EntityDrillModal,
  InitialAvatar,
  ResizableTaskList,
  StatusDonut,
  StatusOverviewCard,
} from "./bits";

/** Page-level divider between the read-only Overview and the action-oriented
 *  Details area (superadmin/OPS: department+branch grids vs. the assign form). */
function PageSectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-2 border-b border-gray-200 pb-2 text-sm font-semibold uppercase tracking-widest text-gray-500">
      {children}
    </h2>
  );
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface DayGroup {
  /** Weekday index (0=Sun..6=Sat) as a string, or "unscheduled". */
  key: string;
  label: string;
  tasks: FlowTaskRow[];
}

/** Groups tasks by the weekday their OWN dueAt falls on — NOT a stored "day"
 *  field (there isn't one; see the comment on DailyTasksByDay below) — so
 *  each task lands in exactly one group. Ordered starting from today (today
 *  first, then tomorrow, ... wrapping around), matching "what's coming up"
 *  reading order; "Unscheduled" (no dueAt at all — a Daily-tagged task with
 *  no due date ever set) sorts last so it's never silently dropped. Only
 *  weekdays that actually have a task appear at all — no empty tabs. */
function groupTasksByWeekday(tasks: FlowTaskRow[]): DayGroup[] {
  const byWeekday = new Map<number, FlowTaskRow[]>();
  const unscheduled: FlowTaskRow[] = [];
  for (const t of tasks) {
    if (!t.dueAt) {
      unscheduled.push(t);
      continue;
    }
    const idx = new Date(t.dueAt).getDay();
    const bucket = byWeekday.get(idx);
    if (bucket) bucket.push(t);
    else byWeekday.set(idx, [t]);
  }

  const todayIdx = new Date().getDay();
  const groups: DayGroup[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const idx = (todayIdx + offset) % 7;
    const bucket = byWeekday.get(idx);
    if (bucket && bucket.length > 0) {
      groups.push({ key: String(idx), label: WEEKDAY_NAMES[idx], tasks: bucket });
    }
  }
  if (unscheduled.length > 0) {
    groups.push({ key: "unscheduled", label: "Unscheduled", tasks: unscheduled });
  }
  return groups;
}

/** Collapsed pill showing the active day + its open count ("Wednesday 5 ▾");
 *  click opens a list of every day that currently has a task (plus
 *  "Unscheduled" when relevant) — same hand-rolled popover pattern as
 *  StatusDropdown/BulkActionsButton (outside-click/Escape to close). */
function DayDropdown({
  groups,
  activeKey,
  onSelect,
  openCount,
}: {
  groups: DayGroup[];
  activeKey: string;
  onSelect: (key: string) => void;
  openCount: (g: DayGroup) => number;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const active = groups.find((g) => g.key === activeKey) ?? groups[0];

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative mb-3 inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-blue-600 bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        {active.label} {openCount(active)}
        <span className="text-xs">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-10 z-20 w-48 rounded-lg border border-gray-200 bg-white py-1.5 shadow-md"
        >
          {groups.map((g) => {
            const isActive = g.key === active.key;
            return (
              <button
                key={g.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  onSelect(g.key);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${
                  isActive ? "bg-blue-50 font-semibold text-blue-700" : "text-gray-700"
                }`}
              >
                <span>{g.label}</span>
                <span className={isActive ? "text-blue-700" : "text-gray-400"}>{openCount(g)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * "My Tasks — Daily" ONLY (Monthly/Ad hoc stay flat lists — they don't have
 * a comparable per-weekday shape). A DayDropdown collapsed pill ("{Weekday}
 * {open count} ▾") that expands into a list of every weekday that actually
 * has a task (DONE/SKIPPED excluded from the count — matches what's visible
 * by default), filtering the list to one day at a time; today's weekday is
 * the default selection, falling back to the earliest upcoming day if today
 * has nothing. Reuses ResizableTaskList unmodified for the active day's
 * rows, so completion/N-A/resize/"Show Completed" all keep working exactly
 * as they do elsewhere.
 *
 * NOTE: this is a DERIVED grouping, not a stored one — RunBlock/FlowTaskRow
 * has no "day"/"days" field. The assign form's "Day" picker (still single-
 * select) is consumed once at creation to produce a single concrete dueAt;
 * nothing about "which weekday(s) this task belongs to" survives past that.
 * A task therefore always lands in exactly one day here, never several.
 */
function DailyTasksByDay({
  tasks,
  myUserId,
  onComplete,
  onSkip,
  onReopen,
  emptyLabel,
}: {
  tasks: FlowTaskRow[];
  myUserId?: string;
  onComplete?: (runBlockId: string) => Promise<void>;
  onSkip?: (runBlockId: string) => Promise<void>;
  onReopen?: (runBlockId: string) => Promise<void>;
  emptyLabel: string;
}) {
  const groups = React.useMemo(() => groupTasksByWeekday(tasks), [tasks]);
  const todayKey = String(new Date().getDay());
  // No tasks at all yet — still show a single "today" pill (count 0) rather
  // than dropping the day-tab row entirely, so the tab UI (and its "which
  // day am I looking at" context) is always present, not just once a task
  // happens to exist.
  const displayGroups = groups.length > 0 ? groups : [{ key: todayKey, label: WEEKDAY_NAMES[Number(todayKey)], tasks: [] }];
  const defaultKey = displayGroups.some((g) => g.key === todayKey) ? todayKey : displayGroups[0].key;
  const [activeKey, setActiveKey] = React.useState(defaultKey);

  // Re-pick a valid tab if the active one disappears (e.g. its last task was
  // just completed/marked N/A and removed from `tasks` entirely on refetch).
  const groupKeys = displayGroups.map((g) => g.key).join(",");
  React.useEffect(() => {
    if (!displayGroups.some((g) => g.key === activeKey)) {
      setActiveKey(displayGroups.some((g) => g.key === todayKey) ? todayKey : displayGroups[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKeys]);

  const active = displayGroups.find((g) => g.key === activeKey) ?? displayGroups[0];
  const dayOpenCount = (g: DayGroup) => g.tasks.filter((t) => t.status !== "DONE" && t.status !== "SKIPPED").length;

  return (
    <div>
      <DayDropdown
        groups={displayGroups}
        activeKey={active.key}
        onSelect={setActiveKey}
        openCount={dayOpenCount}
      />
      <ResizableTaskList
        tasks={active.tasks}
        myUserId={myUserId}
        onComplete={onComplete}
        onSkip={onSkip}
        onReopen={onReopen}
        emptyLabel={emptyLabel}
        hideCompleted
      />
    </div>
  );
}

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

/** Fallback for entities with no `tasks` data (undrillable — see `drillable`
 *  below), so EntityDrillModal always gets a valid (empty) shape. */
const EMPTY_DRILL_TASKS: Record<import("./bits").BucketKey, import("./types").FlowDrillTask[]> = {
  completed: [],
  pending: [],
  na: [],
};

/** Mini donut block for the all-departments / all-branches overview grids.
 *  Clicking a segment (or a legend count) pops out that bucket's tasks. */
function MiniDonutBlock({
  entity,
  nameHref,
}: {
  entity: FlowEntityRollup;
  /** When given, the entity's name links out (e.g. to its full Department
   *  Overview page) instead of being plain text. */
  nameHref?: string;
}) {
  const [drill, setDrill] = React.useState<"completed" | "pending" | "na" | null>(null);
  const drillable = Boolean(entity.tasks);

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 p-4 shadow-sm">
      {nameHref ? (
        <a
          href={nameHref}
          className="w-full truncate text-center text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline"
        >
          {entity.name}
        </a>
      ) : (
        <p className="w-full truncate text-center text-sm font-semibold text-gray-900">
          {entity.name}
        </p>
      )}
      <StatusDonut
        totals={entity}
        size={88}
        strokeWidth={12}
        onSegmentClick={drillable ? setDrill : undefined}
      >
        <span className="text-sm font-bold text-gray-900">
          {flowCompletionPct(entity)}%
        </span>
      </StatusDonut>
      <div className="flex gap-3 text-xs text-gray-500">
        {BUCKET_META.map((b) =>
          drillable ? (
            <button
              key={b.key}
              type="button"
              onClick={() => setDrill(b.key)}
              className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-gray-100"
            >
              <span className={`size-2 rounded-full ${b.dot}`} />
              {entity[b.key]}
            </button>
          ) : (
            <span key={b.key} className="flex items-center gap-1">
              <span className={`size-2 rounded-full ${b.dot}`} />
              {entity[b.key]}
            </span>
          ),
        )}
      </div>
      {drill && (
        <EntityDrillModal
          name={entity.name}
          tasks={entity.tasks ?? EMPTY_DRILL_TASKS}
          bucketKey={drill}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

function EntityDonutGrid({
  title,
  entities,
  nameHref,
}: {
  title: string;
  entities: FlowEntityRollup[];
  /** Builds each entity's link-out URL (e.g. Department Overview), by name. */
  nameHref?: (name: string) => string;
}) {
  return (
    <SectionCard title={title}>
      {entities.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No activity.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {entities.map((e) => (
            <MiniDonutBlock key={e.name} entity={e} nameHref={nameHref?.(e.name)} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/**
 * Superadmin's branch view: donut grids grouped under Region A / B / C. When
 * `roleVariants` is given, pills (All / Manager / Branch Exec / Coach) filter
 * the grids to that staff role's tasks — "daily separate to manager,
 * exec, coach".
 */
function RegionDonutGrids({
  title,
  regions,
  roleVariants,
}: {
  title: string;
  regions: { name: string; branches: FlowEntityRollup[] }[];
  roleVariants?: {
    role: string;
    regions: { name: string; branches: FlowEntityRollup[] }[];
  }[];
}) {
  const [selectedRole, setSelectedRole] = React.useState("All");
  const shown =
    selectedRole === "All"
      ? regions
      : (roleVariants?.find((v) => v.role === selectedRole)?.regions ?? []);

  return (
    <SectionCard
      title={title}
      action={
        roleVariants && (
          <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-medium">
            {["All", ...roleVariants.map((v) => v.role)].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedRole(r)}
                className={`rounded-md px-2.5 py-1 ${
                  selectedRole === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        )
      }
    >
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          No {selectedRole === "All" ? "" : `${selectedRole.toLowerCase()} `}activity.
        </p>
      ) : (
        shown.map((region) => (
          <div key={region.name} className="mb-5 last:mb-0">
            <p className="mb-2 text-sm font-semibold text-gray-700">{region.name}</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {region.branches.map((b) => (
                <MiniDonutBlock key={b.name} entity={b} />
              ))}
            </div>
          </div>
        ))
      )}
    </SectionCard>
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
  manpowerScheduleHref,
  departmentOverviewHref,
  ceoDashboard,
  staff,
  hodKanban,
}: {
  daily: FlowDetailResponse;
  monthly: FlowDetailResponse;
  /** Drives the toggled sections (assigned-task cards, My Tasks, roster). */
  period: FlowPeriod;
  dailyHref: string;
  monthlyHref: string;
  /** Server action for the "+ Assigned task" forms (superadmin/OPS only). */
  assignAction?: (input: FlowAssignInput) => Promise<{ created: number }>;
  /** "Click the status dot to complete" — a task row only ever renders a
   *  clickable dot when it's quick-completable AND assigned to the current
   *  viewer; omit to keep every dot on the page read-only. */
  completeTaskAction?: (runBlockId: string) => Promise<void>;
  /** Status dropdown's "N/A" option — unlike completeTaskAction, offered on
   *  ANY of the viewer's own non-terminal tasks (not gated on
   *  quickCompletable); omit to hide the option everywhere. */
  skipTaskAction?: (runBlockId: string) => Promise<void>;
  /** Status dropdown's "Pending" option — only actionable on an already-
   *  Completed/N-A task (reopen); omit to disable reopening everywhere. */
  reopenTaskAction?: (runBlockId: string) => Promise<void>;
  /** Assignable staff directory — enables the department assign form (superadmin). */
  staff?: import("./types").FlowStaffMember[];
  /** Link to the Manpower Schedule page (branch manager only) — the host app
   *  owns routing, so this package just needs a URL to point at. */
  manpowerScheduleHref?: string;
  /** BASE URL for the Department Overview page (no `&department=` yet) — a
   *  plain string, not a function: Server Components can't pass functions as
   *  props to Client Components, so the per-department URL is built here,
   *  client-side, from this base. Used on the HOD's own "Department Status"
   *  cards and on every entity in the "All Departments" grid. */
  departmentOverviewHref?: string;
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
  const deptHref = departmentOverviewHref
    ? (department: string) =>
        `${departmentOverviewHref}&department=${encodeURIComponent(department)}`
    : undefined;
  // Branch-side MEMBER (Branch Exec/Coach — Manager is role BRANCH, handled
  // separately) sees Daily only, never Monthly: no Monthly "My Status" donut,
  // no "My Tasks — Monthly" list. Department-side MEMBER/HOD/OPS keep both.
  const branchSideMember = me.me.role === "MEMBER" && me.me.branch !== null;
  // The Operation department-site account is the one DEPT_SITE that also
  // gets the "+ Task" button (same staff pool as ADMIN/OPS) — every other
  // DEPT_SITE/BRANCH_SITE login has no assign capability at all.
  const isOperationDeptSite = me.me.role === "DEPT_SITE" && me.me.department === "Operation";
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
    />
  );

  const dailyRoster =
    current.kind === "department" ? daily.department : current.kind === "branch" ? daily.branch : undefined;
  const monthlyRoster =
    current.kind === "department" ? monthly.department : current.kind === "branch" ? monthly.branch : undefined;

  return (
    <div className="flex flex-col gap-5">
      {/* No toggle for any role — every donut/list/roster below shows Daily
          AND Monthly simultaneously, side by side. Superadmin/CEO's grids
          already worked this way; OPS/Branch/HOD/Member are now consistent
          with them too. */}

      {/* ---- Overview donuts (composition per role/site) ---- */}
      {(current.kind === "member" || current.kind === "department") && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {/* Personal cards — MEMBER always, HOD but NOT its view-only
              DEPT_SITE counterpart (a "Department account" has no personal
              tasks at all, only the Department Status cards below). */}
          {(current.kind === "member" || me.me.role === "HOD") && (
            <>
              <StatusOverviewCard
                title="Daily"
                totals={daily.me.totals}
                tasks={flowBucketize(daily.me.tasks)}
                {...completeProps}
              />
              {/* Branch-side MEMBER (Branch Exec/Coach) — Daily donut only, no
                  Monthly. Department-side MEMBER and HOD keep both. */}
              {!branchSideMember && (
                <StatusOverviewCard
                  title="Monthly"
                  totals={monthly.me.totals}
                  tasks={flowBucketize(monthly.me.tasks)}
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
          {current.kind === "department" && daily.department && (
            <StatusOverviewCard
              title="Daily"
              totals={daily.department.totals}
              tasks={daily.department.tasks}
            />
          )}
          {current.kind === "department" && monthly.department && (
            <StatusOverviewCard
              title="Monthly"
              totals={monthly.department.totals}
              tasks={monthly.department.tasks}
            />
          )}
        </div>
      )}

      {/* ---- Details: full Department Overview page (HOD + DEPT_SITE both
          get this — "same as what HOD sees"), Assign Task form (HOD only,
          restricted; Operation's DEPT_SITE only, unrestricted — every other
          DEPT_SITE gets no assign capability), and HOD's own personal
          Kanban (HOD only). ---- */}
      {current.kind === "department" && daily.department && deptHref && (
        <>
          <PageSectionHeading>Details</PageSectionHeading>
          <a
            href={deptHref(daily.department.name)}
            className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-300 hover:bg-blue-50"
          >
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Department Overview
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Chips, status donut, and a click-through member roster for {daily.department.name}.
              </p>
            </div>
            <span className="text-sm font-medium text-blue-600">Open →</span>
          </a>
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
          {assignAction && staff && isOperationDeptSite && (
            <div className="flex justify-end">
              <AddTaskButton staff={staff} action={assignAction} />
            </div>
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
              />
            )}
            {monthly.branch && (
              <StatusOverviewCard
                title="Monthly"
                totals={monthly.branch.totals}
                tasks={monthly.branch.tasks}
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
              completion. No day-of-week grouping (that's Daily-only,
              DailyTasksByDay) since this list mixes cadences. */}
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
          {/* Superadmin (ADMIN) gets NO personal cards — just the
              department + branch status grids and the assign form below. OPS
              is a regular individual staff member for THIS section — her own
              Daily/Monthly status + assigner streams (incl. "HOD assigned
              tasks"), same pattern as any other staff member's personal
              overview, and NOTHING else on this page: no Ad hoc card (Branch/
              Manager context), no Department/Branch status grids (Superadmin-
              only, see below) — her org page is deliberately scoped down to
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

          {/* ---- Overview: read-only department/branch status grids ---- */}
          <PageSectionHeading>Overview</PageSectionHeading>

          {/* All-departments grid: Superadmin ONLY. OPS's org page is scoped
              down to just her own Daily/Monthly + assigner streams (above)
              and the assign form (below) — no org-wide oversight grids. */}
          {me.me.role === "ADMIN" && daily.org && (
            <EntityDonutGrid
              title="All Departments — Daily"
              entities={daily.org.departments}
              nameHref={deptHref}
            />
          )}
          {me.me.role === "ADMIN" && monthly.org && (
            <EntityDonutGrid
              title="All Departments — Monthly"
              entities={monthly.org.departments}
              nameHref={deptHref}
            />
          )}
          {/* Superadmin only: branch status grouped by region — Daily
              combines all three staff roles (Manager/Branch Exec/Coach);
              Monthly is Manager only. No role-filter buttons — each grid is
              fixed to its rule. */}
          {me.me.role === "ADMIN" && daily.org && (
            <RegionDonutGrids
              title="Branch Status by Region — Daily"
              regions={daily.org.regions}
            />
          )}
          {me.me.role === "ADMIN" && monthly.org && (
            <RegionDonutGrids
              title="Branch Status by Region — Monthly (Manager)"
              regions={
                monthly.org.regionsByRole.find((v) => v.role === "Manager")?.regions ?? []
              }
            />
          )}
          {/* Ad hoc tasks: a branch-level concept (the "+ Assigned task —
              Branch" form's output) — grouped right after branch status, same
              by-region layout, Manager-level staff only. All-time. Superadmin
              only, same as the two grids above. */}
          {me.me.role === "ADMIN" && daily.adhocByRegion && (
            <RegionDonutGrids
              title="Ad hoc Tasks by Region (Manager)"
              regions={daily.adhocByRegion.regions}
            />
          )}

          {/* ---- Details: administrative actions (assign tasks) ---- */}
          {(me.me.role === "ADMIN" || me.me.role === "OPS") && assignAction && staff && (
            <>
              <PageSectionHeading>Details</PageSectionHeading>
              {me.me.role === "ADMIN" && departmentOverviewHref && (
                <a
                  href={departmentOverviewHref}
                  className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-300 hover:bg-blue-50"
                >
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                      Department Overview
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">
                      Pick any department — chips, status donut, and a click-through member
                      roster.
                    </p>
                  </div>
                  <span className="text-sm font-medium text-blue-600">Open →</span>
                </a>
              )}
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
            <SectionCard title="My Tasks — Daily">
              <DailyTasksByDay
                tasks={daily.me.tasks}
                {...completeProps}
                emptyLabel="No tasks assigned to you this period."
              />
            </SectionCard>
            {!branchSideMember && (
              <SectionCard title="My Tasks — Monthly">
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

      {/* ---- Member roster (department or branch scope), Daily + Monthly ---- */}
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
