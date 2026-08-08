// Shared logic for the three /api/analytics endpoints (ANALYTICS_BRIEF.md §API):
// period-window resolution, the RunBlock period rule, status→bucket mapping,
// branch/department grouping, TaskRow shaping, and the single runBlock query
// every request makes. The pure helpers up top take no Prisma types at runtime,
// so `_lib.test.ts` exercises them with the DB modules mocked.

import { z } from "zod";
import type { BlockStatus, Cadence, ItemType, Role, RunStatus } from "@/generated/task-manager-client";
import { prisma } from "@/task-manager/prisma";
import { getUsersByIds } from "@/task-manager/lib/users";
import { isElevatedDeptSite } from "../role-views";

// ---------- query validation ----------

export const periodSchema = z.enum(["daily", "monthly"]);
export type Period = z.infer<typeof periodSchema>;

/** YYYY-MM-DD and a REAL calendar date — "2026-02-30" is a 400, not a rollover. */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }, "not a valid calendar date");

/** Base query for every analytics endpoint. Period defaults to daily (brief §Screens). */
export const analyticsQuerySchema = z.object({
  period: periodSchema.default("daily"),
  date: dateSchema.optional(),
});

/** Collect the given searchParams keys into a plain object (empty/missing → omitted). */
export function readQuery(sp: URLSearchParams, keys: string[]): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const key of keys) {
    const value = sp.get(key);
    if (value) raw[key] = value;
  }
  return raw;
}

// ---------- period window resolution ----------

/** Pure date range — what `inWindow`'s date-only rule needs. */
export interface DateWindow {
  start: Date; // inclusive
  end: Date; // exclusive
}

export interface PeriodWindow extends DateWindow {
  /** Which Cadence tag this window corresponds to, for fetchPeriodBlocks'
   *  explicit-tag branch — see Cadence on the RunBlock model. */
  period: Period;
}

/** RunBlock.cadence enum value for a given period — DAILY for "daily",
 *  MONTHLY for "monthly". Ad hoc has no Cadence value here; it's classified
 *  by starter role elsewhere, never by this field. */
export const CADENCE_FOR_PERIOD: Record<Period, Cadence> = {
  daily: "DAILY",
  monthly: "MONTHLY",
};

/** Parse YYYY-MM-DD in LOCAL server time (`new Date("YYYY-MM-DD")` would be UTC midnight). */
export function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Format a Date as local YYYY-MM-DD (echoed back as the resolved `date`). */
export function formatLocalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * daily   → [startOfDay, startOfNextDay) of the anchor date (local server time);
 * monthly → [1st of the anchor's month, 1st of the next month).
 * Anchor = the optional `date` param, defaulting to `now` (today).
 */
export function resolveWindow(period: Period, date?: string, now: Date = new Date()): PeriodWindow {
  const anchor = date ? parseLocalDate(date) : now;
  if (period === "daily") {
    return {
      start: new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()),
      end: new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 1),
      period,
    };
  }
  return {
    start: new Date(anchor.getFullYear(), anchor.getMonth(), 1),
    end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1),
    period,
  };
}

/** Clamp a MONTHLY window to a day-of-month range — the Monthly 7-day range
 *  dropdown (2026-07-29): "1-7" → [1st, 8th), "29-31" → [29th, next month).
 *  No-op for daily windows. Out-of-range values can only shrink the window
 *  (never widen it), so an invalid range yields an empty result, not a leak. */
export function clampWindowToMonthDays(
  window: PeriodWindow,
  fromDay: number,
  toDay: number,
): PeriodWindow {
  if (window.period !== "monthly") return window;
  const start = new Date(window.start.getFullYear(), window.start.getMonth(), fromDay);
  const end = new Date(window.start.getFullYear(), window.start.getMonth(), toDay + 1);
  return {
    period: window.period,
    start: start < window.start ? window.start : start,
    end: end > window.end ? window.end : end,
  };
}

// ---------- status buckets (brief §Status buckets — confirmed mapping) ----------

export type Bucket = "completed" | "pending" | "na";

export interface BucketCounts {
  completed: number;
  pending: number;
  na: number;
}

/** Completed = DONE; NA = SKIPPED; Pending = PENDING | ACTIVE | OVERDUE | ESCALATED. */
export function bucketOf(status: BlockStatus): Bucket {
  if (status === "DONE") return "completed";
  if (status === "SKIPPED") return "na";
  return "pending";
}

export function countBuckets(blocks: { status: BlockStatus }[]): BucketCounts {
  const totals: BucketCounts = { completed: 0, pending: 0, na: 0 };
  for (const b of blocks) totals[bucketOf(b.status)] += 1;
  return totals;
}

// ---------- the period rule ----------

/**
 * "Period task set" (brief): a block belongs to the period if its dueAt falls in
 * the window; blocks with NO dueAt fall back to startedAt. A dueAt OUTSIDE the
 * window does not fall back — dueAt wins whenever it is set. This is the
 * FALLBACK rule only — it never looks at `cadence`; a tagged block's period
 * membership is decided entirely in fetchPeriodBlocks' WHERE clause instead.
 */
export function inWindow(
  block: { dueAt: Date | null; startedAt: Date | null },
  window: DateWindow,
): boolean {
  const anchor = block.dueAt ?? block.startedAt;
  if (!anchor) return false;
  return anchor >= window.start && anchor < window.end;
}

// ---------- grouping by assignee branch/department ----------

export const UNASSIGNED = "Unassigned";

export interface EntityCounts extends BucketCounts {
  name: string;
}

/**
 * Group blocks into named bucket counts via the assignee's branch/department.
 * Blocks with a null/empty dimension (or unknown assignee) are dropped from
 * the breakdown entirely — no "Unassigned" bucket is ever produced. This is
 * the ONE shared grouping function behind every department/branch grid (All
 * Departments, All Branches, Branch Status by Region, Ad hoc Tasks by
 * Region), so every consumer excludes "Unassigned" for free. Dropped blocks
 * still count toward each payload's separately-computed overall `totals` —
 * only the per-entity breakdown omits them.
 */
export function groupByDimension(
  blocks: { assigneeId: string; status: BlockStatus }[],
  dimensionOf: (assigneeId: string) => string | null | undefined,
): EntityCounts[] {
  const groups = new Map<string, EntityCounts>();
  for (const b of blocks) {
    const name = dimensionOf(b.assigneeId);
    if (!name) continue;
    let group = groups.get(name);
    if (!group) {
      group = { name, completed: 0, pending: 0, na: 0 };
      groups.set(name, group);
    }
    group[bucketOf(b.status)] += 1;
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- role scoping (brief §Authorization matrix) ----------

export interface ScopeUser {
  id: string;
  role: Role;
  department: string | null;
  branch?: string | null;
}

/** Org-wide analytics (overview, any entity, any member): ADMIN / CEO / OPS. */
export function canViewOrg(role: Role): boolean {
  return role === "ADMIN" || role === "CEO" || role === "OPS";
}

// Elevated-department-site rule: MOVED to role-views.ts (the pure, client-
// safe role-config module — 2026-07-29 centralization) and re-exported here
// so the data layer's authorization checks and existing imports keep
// working unchanged.
export { ELEVATED_DEPT_SITE_DEPARTMENTS, isElevatedDeptSite } from "../role-views";

/**
 * Entity detail: org roles see any; HOD/DEPT_SITE only their own department
 * — EXCEPT the elevated department sites (Operations/Optimisation), which
 * see ANY department AND ANY branch (superadmin-equivalent visibility per
 * the 2026-07-29 final role spec, reversing the earlier departments-only
 * rule); BRANCH/BRANCH_SITE only their own branch; MEMBER none. DEPT_SITE
 * and BRANCH_SITE are the view-only department/branch logins (see Role enum
 * comment in schema.prisma) — this is the ONLY authorization boundary for
 * them (unlike the donor, which additionally gated everything behind a
 * shared internal secret), so they must resolve their own entity here
 * exactly like HOD/BRANCH rather than falling through to deny.
 */
export function canViewEntity(
  user: ScopeUser,
  type: "branch" | "department",
  name: string,
): boolean {
  if (canViewOrg(user.role)) return true;
  if (user.role === "HOD") {
    return type === "department" && name === (user.department ?? UNASSIGNED);
  }
  if (user.role === "DEPT_SITE") {
    if (isElevatedDeptSite(user)) return true;
    return type === "department" && name === (user.department ?? UNASSIGNED);
  }
  if (user.role === "BRANCH") {
    return type === "branch" && name === (user.branch ?? UNASSIGNED);
  }
  if (user.role === "BRANCH_SITE") {
    return type === "branch" && name === (user.branch ?? UNASSIGNED);
  }
  return false;
}

/**
 * Member detail: self always; HOD/DEPT_SITE their own department's members —
 * EXCEPT the elevated department sites (Operation/Optimisation), which see
 * any DEPARTMENT member (never branch-side staff, whose department is null);
 * BRANCH/BRANCH_SITE their own branch's members; org roles any. See
 * canViewEntity's comment — DEPT_SITE/BRANCH_SITE must resolve here exactly
 * like HOD/BRANCH; this helper is the actual authorization boundary now.
 */
export function canViewMember(
  user: ScopeUser,
  member: { id: string; department: string | null; branch?: string | null },
): boolean {
  if (user.id === member.id) return true;
  if (canViewOrg(user.role)) return true;
  if (user.role === "HOD") {
    return (member.department ?? UNASSIGNED) === (user.department ?? UNASSIGNED);
  }
  if (user.role === "DEPT_SITE") {
    if (isElevatedDeptSite(user)) return member.department !== null;
    return (member.department ?? UNASSIGNED) === (user.department ?? UNASSIGNED);
  }
  if (user.role === "BRANCH") {
    return (member.branch ?? UNASSIGNED) === (user.branch ?? UNASSIGNED);
  }
  if (user.role === "BRANCH_SITE") {
    return (member.branch ?? UNASSIGNED) === (user.branch ?? UNASSIGNED);
  }
  return false;
}

// ---------- member roster ordering (2026-07-25 user decision) ----------

/**
 * Role-priority rank for member rosters — the primary sort key of every
 * department/branch Members list (names alphabetical within a group).
 * Department side: HOD → HQ Exec → Full Time → Part Time → Intern.
 * Branch side: Manager → Branch Exec → Full Time Coach → Part Time Coach.
 * One combined ranking serves both (the two pools' types never mix in one
 * roster); anything unrecognized sorts last.
 */
export function memberSortRank(
  employmentType: string | null | undefined,
  coachSchedule: string | null | undefined,
): number {
  switch (employmentType) {
    case "HOD":
      return 0;
    case "Manager":
      return 1;
    case "HQ Exec":
      return 2;
    case "Branch Exec":
      return 3;
    case "Full Time":
      return 4;
    case "Coach":
      return coachSchedule === "Full Time" ? 5 : 6;
    case "Part Time":
      return 7;
    case "Intern":
      return 8;
    case "Regional Manager":
      return 9;
    default:
      return 99;
  }
}

// ---------- assigner streams (brief §Task streams) ----------

export interface AssignerStream<B> {
  /** Role of the user who started the run ("assigner"); "self" = I started it. */
  key: Role | "self";
  blocks: B[];
}

/**
 * Split MY blocks by who assigned them: the role of each block's run starter.
 * Self-started runs group under "self"; unknown starters fall back to MEMBER.
 * Order: CEO, OPS, ADMIN, DEPT_SITE, BRANCH, HOD, MEMBER, self — mirrors the
 * org hierarchy so "CEO Assigned" renders first for an HOD, "HOD Assigned"
 * first for staff. DEPT_SITE gets its own slot rather than falling through
 * to MEMBER: the Operation department-site account is the one DEPT_SITE
 * login with unrestricted assign, same as Superadmin (donor
 * assign/route.ts's isOperationDeptSite) — donor osc/types.ts's
 * flowStreamLabel already has a display case for a "DEPT_SITE" stream key,
 * so surfacing it here (instead of silently dropping it, as the un-listed
 * key previously did) is the shape the wire contract already expects.
 */
export function groupByAssignerRole<B extends { run: { startedById: string } }>(
  blocks: B[],
  selfId: string,
  roleOf: (userId: string) => Role | undefined,
): AssignerStream<B>[] {
  const order: AssignerStream<B>["key"][] = [
    "CEO",
    "OPS",
    "ADMIN",
    "DEPT_SITE",
    "BRANCH",
    "HOD",
    "MEMBER",
    "self",
  ];
  const groups = new Map<AssignerStream<B>["key"], B[]>();
  for (const b of blocks) {
    const key: AssignerStream<B>["key"] =
      b.run.startedById === selfId ? "self" : (roleOf(b.run.startedById) ?? "MEMBER");
    const list = groups.get(key);
    if (list) list.push(b);
    else groups.set(key, [b]);
  }
  return order
    .filter((key) => groups.has(key))
    .map((key) => ({ key, blocks: groups.get(key)! }));
}

// ---------- org reference data: departments ----------

/** The official department list — org overviews always show all six.
 *  ("Operations" since the 2026-07-25 rename; mirrors ui/types.ts's
 *  FLOW_DEPARTMENTS.) */
export const DEPARTMENTS = [
  "Operations",
  "Academy",
  "Marketing",
  "Optimisation",
  "Human Resource",
  "Finance",
];

/**
 * Ensure every official department appears in a rollup list (zero-filled when
 * it has no tasks), in the official order; unknown names (e.g. Unassigned)
 * keep their rollups and follow after.
 */
export function withAllDepartments(rollups: EntityCounts[]): EntityCounts[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const byName = new Map(rollups.map((r) => [norm(r.name), r]));
  const fixed = DEPARTMENTS.map(
    (d) => byName.get(norm(d)) ?? { name: d, completed: 0, pending: 0, na: 0 },
  );
  const extras = rollups.filter((r) => !DEPARTMENTS.some((d) => norm(d) === norm(r.name)));
  return [...fixed, ...extras];
}

/** Branch staff employment types (mockups' ST roster + the assign form).
 *  Branch and department membership are mutually exclusive — a person with
 *  one of these employmentTypes should always have `branch` set and
 *  `department` null (Coach in particular is branch-only, never a
 *  department "member"). "Branch Exec" (formerly the shared "Executive"
 *  value, split per-pool — see migration 20260721041500_split_executive_role)
 *  is exclusively this pool's now; a department's own execs are "HQ Exec"
 *  (DEPARTMENT_EMPLOYMENT_TYPES below), never this value. */
export const BRANCH_STAFF_ROLES = ["Manager", "Branch Exec", "Coach"] as const;

/** Department staff employment types — the department-side counterpart to
 *  BRANCH_STAFF_ROLES. Same mutual-exclusivity rule, reversed: `department`
 *  set, `branch` null. "HQ Exec" (formerly the shared "Executive" value) is
 *  exclusively this pool's now — capped at one per department same as one
 *  Branch Exec per branch. */
export const DEPARTMENT_EMPLOYMENT_TYPES = ["HOD", "HQ Exec", "Full Time", "Intern"] as const;

// ---------- regions (org reference data — superadmin branch grouping) ----------

export const REGIONS: { name: string; branches: string[] }[] = [
  {
    name: "Region A",
    branches: [
      "Anggun City Rawang",
      "Bandar Rimbayu",
      "Denai Alam",
      "Eco Grandeur",
      "Klang",
      "Setia Alam",
      "Shah Alam",
      "Subang Taipan",
      "Tropicana Sungai Buloh",
    ],
  },
  {
    name: "Region B",
    branches: [
      "Ampang",
      "Bandar Tun Hussein Onn",
      "Danau Kota",
      "Desa Sri Hartamas",
      "Kajang TTDI Groove",
      "Kota Damansara",
      "Puncak Jalil",
      "Selayang",
      "Sri Petaling",
      "Taman Sri Gombak",
    ],
  },
  {
    name: "Region C",
    branches: [
      "Bandar Baru Bangi",
      "Bandar Seri Putra",
      "Cyberjaya",
      "Kota Warisan",
      "Online",
      "Puchong Utama",
      "Putrajaya",
      "Senawang Taipan",
      "Seremban",
    ],
  },
];

/**
 * Group branch rollups into the fixed regions (case-insensitive name match).
 * EVERY mapped branch is listed — zero-filled when it has no tasks ("show
 * all"). Branches outside the mapping land in "Other", last.
 */
export function groupBranchesByRegion(
  branches: EntityCounts[],
): { name: string; branches: EntityCounts[] }[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const byName = new Map(branches.map((b) => [norm(b.name), b]));
  const grouped = REGIONS.map((r) => ({
    name: r.name,
    branches: r.branches.map(
      (rb) => byName.get(norm(rb)) ?? { name: rb, completed: 0, pending: 0, na: 0 },
    ),
  }));
  const known = new Set(REGIONS.flatMap((r) => r.branches.map(norm)));
  const other = branches.filter((b) => !known.has(norm(b.name)));
  if (other.length > 0) grouped.push({ name: "Other", branches: other });
  return grouped;
}

// ---------- TaskRow (brief §API contract shape) ----------

export interface TaskRow {
  runBlockId: string;
  runId: string;
  blockTitle: string;
  runName: string;
  flowName: string;
  assigneeId: string;
  dueAt: string | null; // ISO — converted from the RunBlock's Date in toTaskRow.
  // (The donor's NextResponse.json did this conversion implicitly at the HTTP
  // boundary; native()'s in-process data layer has no such boundary, so it
  // happens explicitly here instead — see data/core.ts's file-header comment.)
  status: BlockStatus;
  fromSchedule: boolean;
  /** Explicit Daily/Monthly/Ad hoc tag (2026-08-05: drives the past-day
   *  completion/proof lock, mirrored on FlowTaskRow for the client). */
  cadence: Cadence | null;
  /** Assigner-attached SOP reference (2026-07-30) — null when none. The
   *  image itself is served by /api/task-manager/guideline-image/[id]. */
  guideline: { id: string; url: string | null; hasImage: boolean } | null;
  /** Who assigned the task (the run's starter) — id always present;
   *  the display NAME is resolved only by the personal payloads
   *  (getMePayload), which drive the "Assigned by" column (2026-07-30). */
  assignerId: string;
  assignerName?: string | null;
  /** Assignee-uploaded completion evidence (2026-07-30, the "Proof"
   *  column; multi-photo 2026-08-08) — empty array until any are uploaded,
   *  oldest-first. Each image is served by
   *  /api/task-manager/proof-image/[id]. */
  proofIds: string[];
  /** Main Task ↔ Subtask link (2026-07-30) — the parent RunBlock's id, or
   *  null for a top-level task. Drives the My Tasks tree display. */
  parentId: string | null;
  /** Checklist-builder position within the parent (2026-07-31) — null on
   *  parents and pre-column rows (UI falls back to id order). */
  subtaskOrder: number | null;
  /** Structural eligibility ONLY (not viewer-aware) — true when this block
   *  isn't already closed and has exactly one required item, a CHECKBOX.
   *  Anything else (multiple required items, or a non-checkbox required
   *  item) can't be safely completed with a single click without bypassing
   *  the real required-item validation completeBlock enforces — those stay
   *  read-only and need the full run view. The "assignee only" rule is
   *  enforced separately (by the caller, comparing assigneeId against the
   *  viewer's own id) — this flag alone does not grant permission. */
  quickCompletable: boolean;
}

function isQuickCompletable(b: PeriodBlock): boolean {
  if (b.status === "DONE" || b.status === "SKIPPED") return false;
  const required = b.runItems.filter((it) => it.required);
  return required.length === 1 && required[0].type === "CHECKBOX";
}

export function toTaskRow(b: PeriodBlock): TaskRow {
  return {
    runBlockId: b.id,
    runId: b.runId,
    blockTitle: b.title,
    runName: b.run.name,
    flowName: b.run.flow.name,
    assigneeId: b.assigneeId,
    dueAt: b.dueAt ? b.dueAt.toISOString() : null,
    status: b.status,
    cadence: b.cadence,
    fromSchedule: b.scheduleSlotId !== null,
    guideline: b.guideline
      ? { id: b.guideline.id, url: b.guideline.url, hasImage: b.guideline.imageMime !== null }
      : null,
    assignerId: b.run.startedById,
    proofIds: b.proofs.map((p) => p.id),
    parentId: b.parentId,
    subtaskOrder: b.subtaskOrder,
    quickCompletable: isQuickCompletable(b),
  };
}

/** dueAt asc, nulls last (sort is stable — equal keys keep incoming order).
 *  dueAt is an ISO string (toTaskRow's conversion) — fixed-width ISO 8601
 *  with a "Z" suffix sorts lexicographically in the same order as the
 *  underlying instant, so a plain string comparison is correct here. */
export function sortTaskRows<T extends TaskRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.dueAt === null && b.dueAt === null) return 0;
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0;
  });
}

// ---------- data access (ONE runBlock findMany per request) ----------

export interface PeriodBlock {
  id: string;
  runId: string;
  title: string;
  assigneeId: string;
  status: BlockStatus;
  dueAt: Date | null;
  startedAt: Date | null;
  scheduleSlotId: string | null;
  cadence: Cadence | null;
  /** Assigner-attached SOP reference (2026-07-30) — url/mime only, the
   *  image BYTES are never selected here (served by their own route). */
  guideline: { id: string; url: string | null; imageMime: string | null } | null;
  /** Assignee-uploaded proofs (2026-08-08: multi-photo) — id only, oldest
   *  first, bytes served by their own route. */
  proofs: { id: string }[];
  /** Parent RunBlock id for subtasks, null for top-level tasks. */
  parentId: string | null;
  subtaskOrder: number | null;
  /** Minimal shape — just enough to compute quick-complete eligibility,
   *  not the full item (label/config/value aren't needed here). */
  runItems: { required: boolean; type: ItemType }[];
  run: {
    id: string;
    name: string;
    status: RunStatus;
    flowId: string;
    startedById: string;
    flow: { name: string };
  };
}

export interface PeriodBlockFilter {
  /** Scope to a single assignee (member endpoint, "my tasks"). */
  assigneeId?: string;
  /** Scope to runs started by this user ("tasks I assigned"). */
  startedById?: string;
  /** Drop blocks assigned to this user (delegated view excludes self-work). */
  excludeAssigneeId?: string;
  /** Cadence-TAGGED blocks normally belong to their period UNCONDITIONALLY
   *  (the personal "My Tasks — Daily" weekday tabs need the whole week's
   *  DAILY tasks at once). Date-filtered surfaces (the entity overviews'
   *  Daily date picker, 2026-07-25) set this so tagged blocks must ALSO
   *  fall inside the window, by the same dueAt-else-startedAt rule
   *  untagged blocks use — otherwise "+ Task"-created (always-tagged)
   *  tasks appear identically on every selected date. */
  strictWindow?: boolean;
}

/**
 * All RunBlocks in the period window (SQL mirror of `inWindow`, PLUS the
 * explicit-tag override: a block with a non-null `cadence` belongs to the
 * period iff the tag equals it — dueAt/startedAt are not consulted at all
 * for tagged blocks; only untagged (null) blocks fall back to the date-
 * window rule), excluding blocks of CANCELLED runs. Pass `window: null` for
 * an ALL-TIME query (the un-periodized overview cards) — cadence tags are
 * irrelevant there too, same as dueAt.
 */
export async function fetchPeriodBlocks(
  window: PeriodWindow | null,
  filter: PeriodBlockFilter = {},
): Promise<PeriodBlock[]> {
  return prisma.runBlock.findMany({
    where: {
      ...(filter.assigneeId ? { assigneeId: filter.assigneeId } : {}),
      ...(filter.excludeAssigneeId ? { assigneeId: { not: filter.excludeAssigneeId } } : {}),
      run: {
        status: { not: "CANCELLED" },
        // Archived runs (2026-07-31) are hidden from EVERY active view —
        // this is the one gate all lists/donuts/counts read through.
        archivedAt: null,
        ...(filter.startedById ? { startedById: filter.startedById } : {}),
      },
      ...(window
        ? {
            OR: [
              filter.strictWindow
                ? {
                    cadence: CADENCE_FOR_PERIOD[window.period],
                    OR: [
                      { dueAt: { gte: window.start, lt: window.end } },
                      { dueAt: null, startedAt: { gte: window.start, lt: window.end } },
                    ],
                  }
                : { cadence: CADENCE_FOR_PERIOD[window.period] },
              { cadence: null, dueAt: { gte: window.start, lt: window.end } },
              { cadence: null, dueAt: null, startedAt: { gte: window.start, lt: window.end } },
            ],
          }
        : {}),
    },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    select: {
      id: true,
      runId: true,
      title: true,
      assigneeId: true,
      status: true,
      dueAt: true,
      startedAt: true,
      scheduleSlotId: true,
      cadence: true,
      guideline: { select: { id: true, url: true, imageMime: true } },
      proofs: { select: { id: true }, orderBy: { createdAt: "asc" } },
      parentId: true,
      subtaskOrder: true,
      runItems: { select: { required: true, type: true } },
      run: {
        select: {
          id: true,
          name: true,
          status: true,
          flowId: true,
          startedById: true,
          flow: { select: { name: true } },
        },
      },
    },
  });
}

/** Resolve every distinct assignee on the blocks in one user query (lib/users). */
export function getAssigneeMap(blocks: { assigneeId: string }[]) {
  return getUsersByIds(blocks.map((b) => b.assigneeId));
}
