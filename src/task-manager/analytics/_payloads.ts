// Payload assembly shared by the public /api/analytics* routes and the
// /api/internal/* OSC bridge (same response shapes, different auth). Each
// builder resolves its own period window and data so both callers stay in
// lock-step — change a shape here and every consumer moves together.

import { getUsersByIds } from "@/task-manager/lib/users";
import { prisma } from "@/task-manager/prisma";
import {
  BRANCH_STAFF_ROLES,
  bucketOf,
  countBuckets,
  fetchPeriodBlocks,
  formatLocalDate,
  getAssigneeMap,
  groupBranchesByRegion,
  groupByAssignerRole,
  groupByDimension,
  withAllDepartments,
  resolveWindow,
  sortTaskRows,
  toTaskRow,
  UNASSIGNED,
  type Bucket,
  type BucketCounts,
  type EntityCounts,
  type Period,
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
   *  column, and HOD's "Tasks I Assigned" card, both need to show who. */
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

/** Personal overview: my blocks, split by assigner role, plus delegated work. */
export async function getMePayload(
  user: MeUser,
  period: Period,
  date?: string,
): Promise<MePayload> {
  const window = resolveWindow(period, date);
  const [mine, delegatedBlocks, mineAll, delegatedAllBlocks] = await Promise.all([
    fetchPeriodBlocks(window, { assigneeId: user.id }),
    fetchPeriodBlocks(window, { startedById: user.id, excludeAssigneeId: user.id }),
    fetchPeriodBlocks(null, { assigneeId: user.id }),
    fetchPeriodBlocks(null, { startedById: user.id, excludeAssigneeId: user.id }),
  ]);

  const [starters, delegatedAssignees] = await Promise.all([
    getUsersByIds(mineAll.map((b) => b.run.startedById)),
    getAssigneeMap([...delegatedBlocks, ...delegatedAllBlocks]),
  ]);
  // `mine`/`mineAll` are always assigned to `user` — no lookup needed.
  const toMine = (blocks: typeof mine): DrillTaskRow[] =>
    sortTaskRows(blocks.map(toTaskRow)).map((t) => ({ ...t, assigneeName: user.name }));
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
          })),
        }
      : null;
  const toAdhocAll = (blocks: typeof mine): { totals: BucketCounts; tasks: DrillTaskRow[] } | null => {
    const adhoc = blocks.filter((b) => b.cadence === "ADHOC");
    return adhoc.length > 0 ? { totals: countBuckets(adhoc), tasks: toMine(adhoc) } : null;
  };

  return {
    me: {
      userId: user.id,
      name: user.name,
      role: user.role,
      department: user.department,
      branch: user.branch,
      employmentType: user.employmentType,
    },
    totals: countBuckets(mine),
    tasks: toMine(mine),
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

/** Entity detail: per-bucket task lists + member rollups for one branch/department. */
export async function getEntityPayload(
  type: "branch" | "department",
  name: string,
  period: Period,
  date?: string,
): Promise<EntityPayload> {
  const window = resolveWindow(period, date);
  // strictWindow: this payload feeds the date-filterable entity overviews —
  // a DAILY-tagged task must belong to the SELECTED day (dueAt, else
  // startedAt), not to every day; see PeriodBlockFilter.strictWindow.
  const all = await fetchPeriodBlocks(window, { strictWindow: true });
  const users = await getAssigneeMap(all);

  // Scope to this entity via the assignee's branch/department (null → Unassigned).
  const blocks = all.filter(
    (b) => (users.get(b.assigneeId)?.[type] || UNASSIGNED) === name,
  );

  const tasks: Record<Bucket, DrillTaskRow[]> = { completed: [], pending: [], na: [] };
  for (const b of blocks) {
    tasks[bucketOf(b.status)].push({
      ...toTaskRow(b),
      assigneeName: users.get(b.assigneeId)?.name ?? b.assigneeId,
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
      role: { notIn: ["DEPT_SITE", "BRANCH_SITE"] },
    },
  });
  const rosterById = new Map(roster.map((u) => [u.id, u]));
  const byMember = new Map<string, { done: number; notDone: number }>();
  for (const u of roster) byMember.set(u.id, { done: 0, notDone: 0 });
  for (const b of blocks) {
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
        done: tally.done,
        notDone: tally.notDone,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { totals: countBuckets(blocks), tasks, members };
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
 * All-time, not period-windowed.
 */
export async function getAdhocRegionsPayload(): Promise<AdhocRegionsPayload> {
  const all = await fetchPeriodBlocks(null);
  const [users, starters] = await Promise.all([
    getAssigneeMap(all),
    getUsersByIds(all.map((b) => b.run.startedById)),
  ]);
  const blocks = all.filter((b) => {
    const isAdhoc = starters.get(b.run.startedById)?.role === "BRANCH" || b.cadence === "ADHOC";
    if (!isAdhoc) return false;
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
export async function getOrgPayload(period: Period, date?: string): Promise<OrgPayload> {
  const window = resolveWindow(period, date);
  const blocks = await fetchPeriodBlocks(window);
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
