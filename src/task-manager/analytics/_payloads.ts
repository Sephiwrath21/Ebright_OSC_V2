// Payload assembly shared by the public /api/analytics* routes and the
// /api/internal/* OSC bridge (same response shapes, different auth). Each
// builder resolves its own period window and data so both callers stay in
// lock-step — change a shape here and every consumer moves together.

import { getUsersByIds } from "@/task-manager/lib/users";
import { prisma } from "@/task-manager/prisma";
import type { NoClaimGroup, NoClaimIncentivePayload, NoClaimPerson } from "../ui/types";
import {
  BRANCH_STAFF_ROLES,
  bucketOf,
  clampWindowToMonthDays,
  countBuckets,
  fetchPeriodBlocks,
  formatLocalDate,
  getAssigneeMap,
  groupBranchesByRegion,
  groupByAssignerRole,
  groupByDimension,
  memberSortRank,
  withAllDepartments,
  resolveWindow,
  sortTaskRows,
  toTaskRow,
  UNASSIGNED,
  type Bucket,
  type BucketCounts,
  type EntityCounts,
  type Period,
  type PeriodWindow,
  type TaskRow,
} from "./_lib";

/** The `date` echoed back in every payload: the request's or today's. */
export function resolvedDate(date?: string): string {
  return date ?? formatLocalDate(new Date());
}

export interface MemberRollup {
  userId: string;
  name: string;
  employmentType: string | null;
  department: string | null;
  branch: string | null;
  done: number;
  notDone: number;
}

export interface MeUser {
  id: string;
  name: string;
  role: import("@/generated/task-manager-client").Role;
  department: string | null;
  branch: string | null;
  employmentType: string | null;
}

export interface TaskStreamPayload {
  key: import("@/generated/task-manager-client").Role | "self";
  totals: BucketCounts;
  tasks: DrillTaskRow[];
}

export interface MePayload {
  me: {
    userId: string;
    name: string;
    role: MeUser["role"];
    department: string | null;
    branch: string | null;
    employmentType: string | null;
  };
  totals: BucketCounts;
  /** These rows are always assigned to `me` — `assigneeName` is just my own
   *  name, filled in for free (no query) so the drill modal's "by {who}"
   *  line always has something to show, same as every other donut. */
  tasks: DrillTaskRow[];
  streams: TaskStreamPayload[];
  /** Delegated rows carry the ASSIGNEE's name (unlike `tasks`/`streams`,
   *  where the assignee is always `me`) — the CEO's task table's "PIC"
   *  column, and HOD's "Task Assignment" card, both need to show who. */
  delegated: { totals: BucketCounts; tasks: DrillTaskRow[] } | null;
  /** Same as streams/delegated but ALL-TIME — the un-periodized overview
   *  cards ("CEO Tasks", "HOD assigned tasks": not daily or monthly). */
  streamsAll: TaskStreamPayload[];
  delegatedAll: { totals: BucketCounts; tasks: DrillTaskRow[] } | null;
  /** MY OWN tasks tagged ADHOC (see RunBlock.cadence) — "My Tasks — Ad hoc".
   *  Routed by MY role as assignee, never by who assigned it — a Superadmin-
   *  or CEO-assigned task tagged ADHOC (only possible when the assignee is a
   *  Branch Manager, per assign/route.ts's allowedCadenceOptions) shows up
   *  here exactly the same as a Branch-Manager-started one. null when empty,
   *  same convention as delegatedAll. All-time, not period-windowed — same
   *  as every other Ad hoc view in this app. */
  adhocAll: { totals: BucketCounts; tasks: DrillTaskRow[] } | null;
}

/** Personal overview: my blocks, split by assigner role, plus delegated work.
 *
 *  `strictWindow` (2026-07-28, the personal view's date filters): the
 *  periodized `mine`/`delegated` sets must belong to the SELECTED day/month
 *  (dueAt-else-startedAt), not to every day — same rule as the entity/org
 *  payloads. The all-time sets (`streamsAll`/`delegatedAll`/`adhocAll`) are
 *  never windowed either way. Off = the original wide semantics (all
 *  same-cadence blocks) — kept for the CEO's combined list and the Home
 *  dashboard's personal progress card. */
export async function getMePayload(
  user: MeUser,
  period: Period,
  date?: string,
  opts: { strictWindow?: boolean; monthDays?: { from: number; to: number } } = {},
): Promise<MePayload> {
  let window = resolveWindow(period, date);
  if (opts.monthDays) {
    window = clampWindowToMonthDays(window, opts.monthDays.from, opts.monthDays.to);
  }
  const strictWindow = opts.strictWindow ?? false;
  const [mine, delegatedBlocks, mineAll, delegatedAllBlocks] = await Promise.all([
    fetchPeriodBlocks(window, { assigneeId: user.id, strictWindow }),
    fetchPeriodBlocks(window, { startedById: user.id, excludeAssigneeId: user.id, strictWindow }),
    fetchPeriodBlocks(null, { assigneeId: user.id }),
    fetchPeriodBlocks(null, { startedById: user.id, excludeAssigneeId: user.id }),
  ]);

  const [starters, delegatedAssignees] = await Promise.all([
    getUsersByIds(mineAll.map((b) => b.run.startedById)),
    getAssigneeMap([...delegatedBlocks, ...delegatedAllBlocks]),
  ]);
  // `mine`/`mineAll` are always assigned to `user` — no lookup needed for
  // the assignee; the ASSIGNER's name (the "Assigned by" column,
  // 2026-07-30) resolves via the starters map (built from mineAll, a
  // superset of every windowed subset).
  const toMine = (blocks: typeof mine): DrillTaskRow[] =>
    sortTaskRows(
      blocks.map((b) => ({
        ...toTaskRow(b),
        assigneeName: user.name,
        assignerName: starters.get(b.run.startedById)?.name ?? null,
        assignerRole: starters.get(b.run.startedById)?.role ?? null,
      })),
    );
  const toStreams = (blocks: typeof mine) =>
    groupByAssignerRole(blocks, user.id, (id) => starters.get(id)?.role).map((s) => ({
      key: s.key,
      totals: countBuckets(s.blocks),
      tasks: toMine(s.blocks),
    }));
  const toDelegated = (blocks: typeof mine): { totals: BucketCounts; tasks: DrillTaskRow[] } | null =>
    blocks.length > 0
      ? {
          totals: countBuckets(blocks),
          tasks: sortTaskRows(blocks.map(toTaskRow)).map((t) => ({
            ...t,
            assigneeName: delegatedAssignees.get(t.assigneeId)?.name ?? t.assigneeId,
            // These rows are always started by `user` themselves (delegatedAll
            // is filtered to startedById: user.id) — no lookup needed, unlike
            // toMine/buildEntityPayload above.
            assignerRole: user.role,
          })),
        }
      : null;
  const toAdhocAll = (blocks: typeof mine): { totals: BucketCounts; tasks: DrillTaskRow[] } | null => {
    const adhoc = blocks.filter((b) => b.cadence === "ADHOC");
    return adhoc.length > 0 ? { totals: countBuckets(adhoc), tasks: toMine(adhoc) } : null;
  };
  // HOD/CEO-assigned tasks belong exclusively to their own personal "HOD/CEO
  // Assigned Task" card (2026-08-19) — the streams/streamsAll breakdown
  // below (built from the UNFILTERED mine/mineAll) is what actually powers
  // that card (see personalStreamEntity, page.tsx), so only the plain
  // Daily/Monthly totals/tasks here are filtered, not streams — filtering
  // both would empty out the HOD/CEO Assigned card this is meant to keep,
  // not just deduplicate the Daily one.
  const excludeHodCeoStarted = (blocks: typeof mine) =>
    blocks.filter((b) => {
      const r = starters.get(b.run.startedById)?.role;
      return r !== "HOD" && r !== "CEO";
    });
  const mineForDaily = excludeHodCeoStarted(mine);

  return {
    me: {
      userId: user.id,
      name: user.name,
      role: user.role,
      department: user.department,
      branch: user.branch,
      employmentType: user.employmentType,
    },
    totals: countBuckets(mineForDaily),
    tasks: toMine(mineForDaily),
    streams: toStreams(mine),
    delegated: toDelegated(delegatedBlocks),
    streamsAll: toStreams(mineAll),
    delegatedAll: toDelegated(delegatedAllBlocks),
    adhocAll: toAdhocAll(mineAll),
  };
}

export interface EntityPayload {
  totals: BucketCounts;
  /** Rows carry the assignee's name — the Kanban department cards' drill
   *  modal (and the "All Departments" grid's) both show "by {who}". */
  tasks: Record<Bucket, DrillTaskRow[]>;
  members: MemberRollup[];
}

/** Shared core: entity-scoped task list + roster-first member rollups, for
 *  ANY window (a real Daily/Monthly date window, or `null` for all-time —
 *  see getEntityHodAssignedPayload below). `assignerRole`, when given,
 *  further restricts to blocks whose run was started by a user with that
 *  exact role (2026-08-12, powers the "HOD Assigned Task" filter) — applied
 *  AFTER entity-membership scoping, via the same getUsersByIds lookup
 *  pattern getMePayload's delegated sets already use for assigner info. */
/** Branch Exec/Coach are Daily-ONLY roles app-wide (2026-07-29 final spec —
 *  see role-views.ts's BRANCH_MEMBER/COACH weekdayRange) — they never have
 *  Monthly or Ad hoc obligations, by design. `excludeDailyOnlyBranchRoles`
 *  (2026-08-18) keeps them out of the Monthly/Ad hoc ROSTER too (branch
 *  type only), so the manager's own Branch Overview grid doesn't show an
 *  always-empty "No tasks this period" card for a role that structurally
 *  can't have any there — Daily is unaffected, they still appear there. */
const DAILY_ONLY_BRANCH_EMPLOYMENT_TYPES = ["Branch Exec", "Coach"] as const;

async function buildEntityPayload(
  type: "branch" | "department",
  name: string,
  window: PeriodWindow | null,
  opts: {
    strictWindow?: boolean;
    assignerRole?: string;
    adhocOnly?: boolean;
    excludeDailyOnlyBranchRoles?: boolean;
    /** Narrow the roster to exactly this role (2026-08-18, "CEO Assigned
     *  Task" — CEO only ever assigns to HOD, so no other department member
     *  is ever a valid recipient; showing the whole roster zero-filled for
     *  everyone else was confusing clutter, not a real "no tasks" state).
     *  Overrides the default DEPT_SITE/BRANCH_SITE-exclusion role filter
     *  entirely rather than combining with it. */
    restrictRosterToRole?: import("@/generated/task-manager-client").Role;
    /** Exclude HOD/CEO-started blocks (2026-08-19, getEntityPayload's Daily/
     *  Monthly only) — those tasks belong EXCLUSIVELY to their own "HOD/CEO
     *  Assigned Task" section (getEntityHodAssignedPayload/
     *  getEntityCeoAssignedPayload's assignerRole filter), not duplicated
     *  into the recipient's regular Daily/Monthly list too. Never set by the
     *  all-time assigned-task/ad-hoc callers — they WANT HOD/CEO-started
     *  blocks, this option would be self-defeating there. */
    excludeHodCeoAssigned?: boolean;
  } = {},
): Promise<EntityPayload> {
  const excludeDailyOnly = type === "branch" && opts.excludeDailyOnlyBranchRoles;
  const roleFilter: {
    role:
      | import("@/generated/task-manager-client").Role
      | { notIn: import("@/generated/task-manager-client").Role[] };
  } = opts.restrictRosterToRole
    ? { role: opts.restrictRosterToRole }
    : { role: { notIn: ["DEPT_SITE", "BRANCH_SITE"] } };
  let assigneeIdIn: string[] | undefined;
  if (window === null) {
    const rosterIds = await prisma.user.findMany({
      where: {
        ...(type === "branch"
          ? { branch: name === UNASSIGNED ? null : name }
          : { department: name === UNASSIGNED ? null : name }),
        ...roleFilter,
        ...(excludeDailyOnly ? { employmentType: { notIn: [...DAILY_ONLY_BRANCH_EMPLOYMENT_TYPES] } } : {}),
      },
      select: { id: true },
    });
    assigneeIdIn = rosterIds.map((u) => u.id);
  }
  const all = await fetchPeriodBlocks(window, { strictWindow: opts.strictWindow ?? false, assigneeIdIn });
  const users = await getAssigneeMap(all);

  // Scope to this entity via the assignee's branch/department (null → Unassigned).
  let blocks = all.filter((b) => (users.get(b.assigneeId)?.[type] || UNASSIGNED) === name);

  // Starters (assigner) lookup — hoisted unconditionally (2026-08-19, was
  // only fetched conditionally for the assignerRole/adhocOnly filters below)
  // so every row can carry assignerRole for isDueDayLockExemptRole, not just
  // the two filtered call shapes.
  const starters = await getUsersByIds(blocks.map((b) => b.run.startedById));
  if (opts.assignerRole) {
    blocks = blocks.filter((b) => starters.get(b.run.startedById)?.role === opts.assignerRole);
  }
  if (opts.excludeHodCeoAssigned) {
    blocks = blocks.filter((b) => {
      const r = starters.get(b.run.startedById)?.role;
      return r !== "HOD" && r !== "CEO";
    });
  }
  // Same OR-based criteria as getAdhocPayload below (started by a Branch
  // Manager, OR explicitly cadence-tagged ADHOC) — applied after entity-
  // membership scoping, same layering as the assignerRole filter above.
  if (opts.adhocOnly) {
    blocks = blocks.filter((b) => starters.get(b.run.startedById)?.role === "BRANCH" || b.cadence === "ADHOC");
  }
  // Real (non-null) windows skip the assigneeIdIn pre-filter above (it's
  // only computed for window === null), so Monthly needs its own pass here.
  if (excludeDailyOnly && window !== null) {
    blocks = blocks.filter((b) => {
      const et = users.get(b.assigneeId)?.employmentType;
      return et !== "Branch Exec" && et !== "Coach";
    });
  }

  const tasks: Record<Bucket, DrillTaskRow[]> = { completed: [], pending: [], na: [] };
  for (const b of blocks) {
    tasks[bucketOf(b.status)].push({
      ...toTaskRow(b),
      assigneeName: users.get(b.assigneeId)?.name ?? b.assigneeId,
      assignerRole: starters.get(b.run.startedById)?.role ?? null,
    });
  }
  tasks.completed = sortTaskRows(tasks.completed);
  tasks.pending = sortTaskRows(tasks.pending);
  tasks.na = sortTaskRows(tasks.na);

  // Member rollups: done = Completed count, notDone = Pending count (NA excluded).
  //
  // ROSTER-FIRST (2026-07-25): seed the map with EVERY real staff member of
  // this entity, zero-filled, then overlay the task tallies. Previously
  // members were derived from the period's task assignees only, so a
  // task-less roster rendered completely empty — invisible while the demo
  // data existed (it always had tasks) but glaring right after the real
  // HRFS import landed 201 people and zero tasks. Site logins
  // (DEPT_SITE/BRANCH_SITE) are view accounts, not people — excluded.
  const roster = await prisma.user.findMany({
    where: {
      ...(type === "branch"
        ? { branch: name === UNASSIGNED ? null : name }
        : { department: name === UNASSIGNED ? null : name }),
      ...roleFilter,
      ...(excludeDailyOnly ? { employmentType: { notIn: [...DAILY_ONLY_BRANCH_EMPLOYMENT_TYPES] } } : {}),
    },
  });
  const rosterById = new Map(roster.map((u) => [u.id, u]));
  const byMember = new Map<string, { done: number; notDone: number }>();
  for (const u of roster) byMember.set(u.id, { done: 0, notDone: 0 });
  for (const b of blocks) {
    // Subtasks don't count separately (2026-08-29) — see countBuckets' own
    // doc comment in _lib.ts for why (this loop predates that shared
    // helper and tallies done/notDone by hand, so it needs the same guard
    // repeated here rather than inheriting it for free).
    if (b.parentId != null) continue;
    const tally = byMember.get(b.assigneeId) ?? { done: 0, notDone: 0 };
    const bucket = bucketOf(b.status);
    if (bucket === "completed") tally.done += 1;
    else if (bucket === "pending") tally.notDone += 1;
    byMember.set(b.assigneeId, tally);
  }
  const members = [...byMember.entries()]
    .map(([userId, tally]) => {
      const u = users.get(userId) ?? rosterById.get(userId);
      return {
        userId,
        name: u?.name ?? userId,
        employmentType: u?.employmentType ?? null,
        department: u?.department ?? null,
        branch: u?.branch ?? null,
        // Not emitted on the wire — sort key only (see the sort below).
        _rank: memberSortRank(u?.employmentType, u?.coachSchedule),
        done: tally.done,
        notDone: tally.notDone,
      };
    })
    // Role priority first (HOD → HQ Exec → Full Time → Part Time → Intern;
    // Manager → Branch Exec → FT Coach → PT Coach), then name — the
    // 2026-07-25 roster-ordering decision. memberSortRank in _lib.ts.
    .sort((a, b) => a._rank - b._rank || a.name.localeCompare(b.name))
    .map(({ _rank, ...member }) => member);

  return { totals: countBuckets(blocks), tasks, members };
}

/** Entity detail: per-bucket task lists + member rollups for one branch/
 *  department, for a real Daily/Monthly date window. */
export async function getEntityPayload(
  type: "branch" | "department",
  name: string,
  period: Period,
  date?: string,
  monthDays?: { from: number; to: number },
): Promise<EntityPayload> {
  let window = resolveWindow(period, date);
  if (monthDays) window = clampWindowToMonthDays(window, monthDays.from, monthDays.to);
  // strictWindow: this payload feeds the date-filterable entity overviews —
  // a DAILY-tagged task must belong to the SELECTED day (dueAt, else
  // startedAt), not to every day; see PeriodBlockFilter.strictWindow.
  return buildEntityPayload(type, name, window, {
    strictWindow: true,
    // Branch Exec/Coach are Daily-only app-wide (2026-08-18) — every
    // Branch Monthly view (not just Branch Manager's own) drops them from
    // the roster; Daily is unaffected, they still appear there.
    excludeDailyOnlyBranchRoles: period === "monthly",
    // HOD/CEO-assigned tasks belong exclusively to their own "HOD/CEO
    // Assigned Task" section (2026-08-19) — never duplicated into the
    // regular Daily/Monthly list too.
    excludeHodCeoAssigned: true,
  });
}

/** "HOD Assigned Task" filter mode (2026-08-12): every task in this entity
 *  whose assigner is an HOD, ALL-TIME — same "all-time, no date filter"
 *  convention as the existing "Task Assignment"/delegatedAll view
 *  (getMePayload), not a real Daily/Monthly window. */
export async function getEntityHodAssignedPayload(
  type: "branch" | "department",
  name: string,
): Promise<EntityPayload> {
  return buildEntityPayload(type, name, null, { assignerRole: "HOD" });
}

/** "CEO Assigned Task" section (2026-08-12 stacked-sections redesign):
 *  every task in this entity whose assigner is the CEO, ALL-TIME — same
 *  shape and convention as getEntityHodAssignedPayload above, just a
 *  different assignerRole. restrictRosterToRole: "HOD" (2026-08-18) — CEO
 *  only ever assigns to the HOD, so the roster shows just that one member
 *  instead of the whole department zero-filled around them. */
export async function getEntityCeoAssignedPayload(
  type: "branch" | "department",
  name: string,
): Promise<EntityPayload> {
  return buildEntityPayload(type, name, null, { assignerRole: "CEO", restrictRosterToRole: "HOD" });
}

/** Roster-shaped "Ad hoc" section for Branch Overview (2026-08-18,
 *  Branch Manager's own Task Manager page only — replaces HOD/CEO Assigned
 *  there): every task in this branch matching the SAME ad hoc criteria as
 *  getAdhocPayload below (started by a Branch Manager, OR explicitly
 *  cadence-tagged ADHOC), ALL-TIME, broken down per member — same roster-
 *  first shape as getEntityHodAssignedPayload/getEntityCeoAssignedPayload,
 *  just a different (OR-based) filter instead of a single assignerRole.
 *  Branch-only — Department has no ad hoc concept in this app (ad hoc
 *  tasks are fundamentally Branch Manager/branch-context work). Branch
 *  Exec/Coach are excluded from the roster (2026-08-18) — Daily-only roles
 *  app-wide, they never have ad hoc obligations either.
 *  restrictRosterToRole: "BRANCH" (2026-08-22) — ad hoc tasks are
 *  fundamentally the Branch Manager's own work (see this function's own
 *  "started by a Branch Manager" filter above); the roster used to
 *  zero-fill around every non-site-login branch member instead of just
 *  them, which was clutter every OTHER role can never have real data in —
 *  same fix getEntityCeoAssignedPayload's own restrictRosterToRole already
 *  applied for its single-recipient (HOD) case. */
export async function getEntityAdhocAssignedPayload(branch: string): Promise<EntityPayload> {
  return buildEntityPayload("branch", branch, null, {
    adhocOnly: true,
    excludeDailyOnlyBranchRoles: true,
    restrictRosterToRole: "BRANCH",
  });
}

/**
 * "Ad hoc tasks" overview (ALL-TIME, un-periodized): blocks from runs started
 * by a Branch Manager (role BRANCH) — reserved EXCLUSIVELY for Manager/
 * branch-context tasks (e.g. the Manpower Schedule's slot-sync) — OR blocks
 * explicitly tagged `cadence` ADHOC (the "+ Add Task" form's
 * Cadence option, offered only when the assignee is a Branch Manager — see
 * assign/route.ts's allowedCadenceOptions). ADMIN/OPS/CEO/HOD each assign
 * through their OWN distinct flow (see /api/internal/assign/route.ts)
 * specifically so their tasks are never counted here UNLESS explicitly
 * tagged. Scope to one branch's members (Branch site) or pass null for
 * org-wide (superadmin).
 */
export async function getAdhocPayload(
  branch: string | null,
): Promise<{ totals: BucketCounts; tasks: DrillTaskRow[] }> {
  const all = await fetchPeriodBlocks(null);
  const [users, starters] = await Promise.all([
    getAssigneeMap(all),
    getUsersByIds(all.map((b) => b.run.startedById)),
  ]);
  const blocks = all.filter((b) => {
    if (branch && (users.get(b.assigneeId)?.branch || UNASSIGNED) !== branch) {
      return false;
    }
    return starters.get(b.run.startedById)?.role === "BRANCH" || b.cadence === "ADHOC";
  });
  return {
    totals: countBuckets(blocks),
    tasks: sortTaskRows(blocks.map(toTaskRow)).map((t) => ({
      ...t,
      assigneeName: users.get(t.assigneeId)?.name ?? t.assigneeId,
    })),
  };
}

/** Task row with the assignee's display name — the mini-donut drill's "by who". */
export interface DrillTaskRow extends TaskRow {
  assigneeName: string;
}

export interface EntityCountsDetailed extends EntityCounts {
  tasks: Record<Bucket, DrillTaskRow[]>;
}

type UserMap = Awaited<ReturnType<typeof getAssigneeMap>>;

/** Attach per-bucket task lists (with assignee names) to entity rollups.
 *  Blocks with no dimension value are skipped — `rollups` never carries an
 *  "Unassigned" entry (see groupByDimension), so there'd be nothing to
 *  attach them to. */
function attachEntityTasks(
  rollups: EntityCounts[],
  blocks: Awaited<ReturnType<typeof fetchPeriodBlocks>>,
  users: UserMap,
  dimension: "branch" | "department",
): EntityCountsDetailed[] {
  const byEntity = new Map<string, Record<Bucket, DrillTaskRow[]>>();
  for (const b of blocks) {
    const name = users.get(b.assigneeId)?.[dimension];
    if (!name) continue;
    const buckets = byEntity.get(name) ?? { completed: [], pending: [], na: [] };
    buckets[bucketOf(b.status)].push({
      ...toTaskRow(b),
      assigneeName: users.get(b.assigneeId)?.name ?? b.assigneeId,
    });
    byEntity.set(name, buckets);
  }
  return rollups.map((r) => {
    const t = byEntity.get(r.name) ?? { completed: [], pending: [], na: [] };
    return {
      ...r,
      tasks: {
        completed: sortTaskRows(t.completed) as DrillTaskRow[],
        pending: sortTaskRows(t.pending) as DrillTaskRow[],
        na: sortTaskRows(t.na) as DrillTaskRow[],
      },
    };
  });
}

export interface AdhocRegionsPayload {
  totals: BucketCounts;
  regions: { name: string; branches: EntityCountsDetailed[] }[];
}

/**
 * Ad hoc tasks broken down like branch status (superadmin's "Ad hoc Tasks by
 * Region"): blocks from BRANCH (Manager)-started runs, OR explicitly ADHOC-
 * tagged (see getAdhocPayload's doc comment) — scoped to Manager-level staff
 * only (ANALYTICS_BRIEF.md — mirrors the Monthly branch-status Manager
 * rule). This restriction stays unchanged for tagged blocks too: the ADHOC
 * tag is only ever offered when the assignee IS a Branch Manager (employ-
 * mentType "Manager" — allowedCadenceOptions in assign/route.ts), so every
 * tagged block already satisfies it; Coach/Branch Exec assignees never see
 * the Ad hoc Cadence option at all. Grouped by branch then Region A/B/C.
 *
 * `date` (YYYY-MM-DD, 2026-07-28): window to that single day by the
 * dueAt-else-startedAt rule — the Home overview's Ad hoc date filter.
 * Omitted = ALL-TIME (the original semantics; the /task-manager payloads
 * still use this). The ADHOC cadence tag never binds a block to a period,
 * so the day window is applied here in JS, not via fetchPeriodBlocks'
 * tag-aware window query.
 */
export async function getAdhocRegionsPayload(date?: string): Promise<AdhocRegionsPayload> {
  const window = date ? resolveWindow("daily", date) : null;
  const all = await fetchPeriodBlocks(null);
  const [users, starters] = await Promise.all([
    getAssigneeMap(all),
    getUsersByIds(all.map((b) => b.run.startedById)),
  ]);
  const blocks = all.filter((b) => {
    const isAdhoc = starters.get(b.run.startedById)?.role === "BRANCH" || b.cadence === "ADHOC";
    if (!isAdhoc) return false;
    if (window) {
      const ts = b.dueAt ?? b.startedAt;
      if (!ts || ts < window.start || ts >= window.end) return false;
    }
    return users.get(b.assigneeId)?.employmentType === "Manager";
  });
  const branches = attachEntityTasks(
    groupByDimension(blocks, (id) => users.get(id)?.branch),
    blocks,
    users,
    "branch",
  );
  return {
    totals: countBuckets(blocks),
    regions: groupBranchesByRegion(branches).map((r) => ({
      name: r.name,
      branches: r.branches as EntityCountsDetailed[],
    })),
  };
}

export interface OrgPayload {
  totals: BucketCounts;
  branches: EntityCountsDetailed[];
  departments: EntityCountsDetailed[];
  /** Branch rollups grouped by the fixed Region A/B/C mapping (superadmin). */
  regions: { name: string; branches: EntityCounts[] }[];
  /** Same region grouping, one entry per branch staff role (Manager /
   *  Branch Exec / Coach) — the superadmin daily view's role filter. */
  regionsByRole: { role: string; regions: { name: string; branches: EntityCounts[] }[] }[];
}

/** Org overview: totals + per-branch and per-department bucket counts, each
 *  entity carrying its per-bucket task lists (mini-donut drill-downs). */
export async function getOrgPayload(
  period: Period,
  date?: string,
  monthDays?: { from: number; to: number },
): Promise<OrgPayload> {
  let window = resolveWindow(period, date);
  if (monthDays) window = clampWindowToMonthDays(window, monthDays.from, monthDays.to);
  // strictWindow: the org grids are date-filterable (Home overview's Daily/
  // Monthly pickers, 2026-07-28) — same rule as getEntityPayload, otherwise
  // cadence-tagged tasks appear identically on every selected date.
  const allBlocks = await fetchPeriodBlocks(window, { strictWindow: true });
  // HOD/CEO-assigned tasks belong exclusively to their own "HOD/CEO
  // Assigned Task" section (2026-08-19), not duplicated into the org-wide
  // Daily/Monthly grids too — same rule as getEntityPayload's own
  // excludeHodCeoAssigned, applied here directly since these grids build
  // their own blocks set instead of going through buildEntityPayload.
  const starters = await getUsersByIds(allBlocks.map((b) => b.run.startedById));
  const blocks = allBlocks.filter((b) => {
    const r = starters.get(b.run.startedById)?.role;
    return r !== "HOD" && r !== "CEO";
  });
  const users = await getAssigneeMap(blocks);
  const branches = attachEntityTasks(
    groupByDimension(blocks, (id) => users.get(id)?.branch),
    blocks,
    users,
    "branch",
  );
  return {
    totals: countBuckets(blocks),
    branches,
    // All six official departments always present (zero-filled when idle).
    departments: attachEntityTasks(
      withAllDepartments(groupByDimension(blocks, (id) => users.get(id)?.department)),
      blocks,
      users,
      "department",
    ),
    regions: groupBranchesByRegion(branches),
    regionsByRole: BRANCH_STAFF_ROLES.map((role) => {
      const roleBlocks = blocks.filter(
        (b) => users.get(b.assigneeId)?.employmentType === role,
      );
      return {
        role,
        regions: groupBranchesByRegion(
          attachEntityTasks(
            groupByDimension(roleBlocks, (id) => users.get(id)?.branch),
            roleBlocks,
            users,
            "branch",
          ),
        ),
      };
    }),
  };
}

/** "No Claim/Incentive" list (2026-08-18, month filter added same day; day
 *  granularity added 2026-08-26 for the /employee-folder "Not Clicked Task"
 *  card — see getScopedNoClaimIncentiveList): a company-wide roster of
 *  everyone with at least one open task, grouped by Department or Branch.
 *  `date` (YYYY-MM-DD) scopes this to one calendar month or one single day
 *  depending on `period` — matched against `dueAt`, falling back to
 *  `startedAt` for undated tasks (same fallback getAdhocRegionsPayload above
 *  already uses), NOT the cadence-aware Monthly-period rule fetchPeriodBlocks'
 *  own `window` param would apply — this list deliberately keeps "every task
 *  type, any not-done status" (Daily/Monthly/Ad hoc/HOD/CEO Assigned alike)
 *  regardless of period, so e.g. a real Daily task due that day still counts
 *  under a monthly window too. Omitting `date` keeps the original all-time
 *  behavior; `period` defaults to "monthly" — the original CEO/Finance ⋮ menu
 *  never passes it explicitly, so its own month-by-month behavior is
 *  unchanged. Authorization (Finance/CEO only) is the caller's job
 *  (queries.ts) — this builder itself has no scope restriction, mirroring
 *  getOrgPayload above. */
export async function getNoClaimIncentivePayload(
  date?: string,
  period: Period = "monthly",
): Promise<NoClaimIncentivePayload> {
  const window = date ? resolveWindow(period, date) : null;
  const all = await fetchPeriodBlocks(null);
  const openBlocks = all
    .filter((b) => bucketOf(b.status) === "pending")
    .filter((b) => {
      if (!window) return true;
      const ts = b.dueAt ?? b.startedAt;
      return ts !== null && ts >= window.start && ts < window.end;
    });
  const users = await getAssigneeMap(openBlocks);

  const openCounts = new Map<string, number>();
  for (const b of openBlocks) {
    openCounts.set(b.assigneeId, (openCounts.get(b.assigneeId) ?? 0) + 1);
  }

  const byDepartment = new Map<string, NoClaimPerson[]>();
  const byBranch = new Map<string, NoClaimPerson[]>();
  for (const [userId, openCount] of openCounts) {
    const user = users.get(userId);
    if (!user) continue;
    const person: NoClaimPerson = { userId, name: user.name, openCount };
    // department/branch are mutually exclusive per resolveViewRole's own
    // convention (department-side vs branch-side staff) — a person lands in
    // exactly one map, never both.
    if (user.department) {
      const list = byDepartment.get(user.department) ?? [];
      list.push(person);
      byDepartment.set(user.department, list);
    } else if (user.branch) {
      const list = byBranch.get(user.branch) ?? [];
      list.push(person);
      byBranch.set(user.branch, list);
    }
  }

  const toSortedGroups = (groups: Map<string, NoClaimPerson[]>): NoClaimGroup[] =>
    [...groups.entries()]
      .map(([name, people]) => ({
        name,
        people: [...people].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

  return {
    departments: toSortedGroups(byDepartment),
    branches: toSortedGroups(byBranch),
  };
}
