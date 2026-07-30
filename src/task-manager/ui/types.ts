// OSC integration package — response types for the Ebright Flow internal
// bridge (/api/internal/*). This folder (src/osc) is designed to be copied
// into the OSC repo as-is: it imports nothing from the rest of Ebright Flow.

export type FlowPeriod = "daily" | "monthly";

/** Server-action result — expected errors are returned, never thrown, because
 *  Next.js masks thrown action error messages in production. */
export type ActionResult = { ok: true } | { ok: false; message: string };
export type AssignActionResult = { ok: true; created: number } | { ok: false; message: string };

export type FlowRole =
  | "ADMIN"
  | "CEO"
  | "OPS"
  | "BRANCH"
  | "HOD"
  | "MEMBER"
  | "DEPT_SITE"
  | "BRANCH_SITE";

/** Task status buckets, exactly the Flow mapping (DONE / open / SKIPPED). */
export interface FlowBucketTotals {
  completed: number;
  pending: number;
  na: number;
}

export interface FlowTaskRow {
  runBlockId: string;
  runId: string;
  blockTitle: string;
  runName: string;
  flowName: string;
  assigneeId: string;
  dueAt: string | null; // ISO
  status: "PENDING" | "ACTIVE" | "OVERDUE" | "ESCALATED" | "DONE" | "SKIPPED";
  /** True when this task was created by a Manpower Schedule slot sync
   *  (vs. a manual/ad hoc assignment) — drives the "Scheduled" badge. */
  fromSchedule: boolean;
  /** Assigner-attached SOP reference (2026-07-30) — drives the 📎 icon +
   *  viewer; image served by /api/task-manager/guideline-image/[id]. */
  guideline?: { id: string; url: string | null; hasImage: boolean } | null;
  /** Who assigned the task — the "Assigned by" column in the personal My
   *  Tasks lists (2026-07-30). Resolved only by the personal payloads;
   *  undefined elsewhere (column shows a dash). */
  assignerName?: string | null;
  /** Structural eligibility ONLY for the "click the status dot to
   *  complete" action (not viewer-aware — the caller must ALSO check
   *  `assigneeId` against the viewer's own id before treating a dot as
   *  clickable). True when the task isn't already closed and has exactly
   *  one required item, a checkbox. */
  quickCompletable: boolean;
}

export interface FlowUserInfo {
  userId: string;
  name: string;
  role: FlowRole;
  department: string | null;
  branch: string | null;
  employmentType: string | null;
}

/** One "assigner stream": my tasks grouped by who started the run. */
export interface FlowTaskStream {
  key: FlowRole | "self";
  totals: FlowBucketTotals;
  tasks: FlowDrillTask[];
}

/** Personal progress payload (the dashboard card's data). */
export interface FlowPersonal {
  me: FlowUserInfo;
  totals: FlowBucketTotals;
  /** These rows are always assigned to `me` — `assigneeName` is just my own
   *  name, filled in for free so the drill modal's "by {who}" line always
   *  has something to show, same as every other donut. */
  tasks: FlowDrillTask[];
  streams: FlowTaskStream[];
  /** Delegated rows carry the assignee's name (unlike `tasks`/`streams`,
   *  where the assignee is always `me`) — the CEO's task table's "PIC"
   *  column, and HOD's "Tasks I Assigned" card, both need to show who. */
  delegated: { totals: FlowBucketTotals; tasks: FlowDrillTask[] } | null;
  /** ALL-TIME variants — the un-periodized overview cards ("CEO Tasks",
   *  "HOD assigned tasks": not daily or monthly). */
  streamsAll: FlowTaskStream[];
  delegatedAll: { totals: FlowBucketTotals; tasks: FlowDrillTask[] } | null;
  /** MY OWN ADHOC-tagged tasks — "My Tasks — Ad hoc". Routed by MY role as
   *  assignee, never by who assigned it; null when empty. */
  adhocAll: { totals: FlowBucketTotals; tasks: FlowDrillTask[] } | null;
}

export type FlowOverviewResponse = FlowPersonal & {
  period: FlowPeriod;
  date: string;
};

export interface FlowMemberRollup {
  userId: string;
  name: string;
  employmentType: string | null;
  department: string | null;
  branch: string | null;
  done: number;
  notDone: number;
}

/** Task row with the assignee's name — the entity drill-down's "by who". */
export interface FlowDrillTask extends FlowTaskRow {
  assigneeName: string;
}

export interface FlowEntityRollup extends FlowBucketTotals {
  name: string;
  /** Per-bucket task lists (present on org dept/branch rollups) — clicking a
   *  mini-donut segment pops these out. */
  tasks?: {
    completed: FlowDrillTask[];
    pending: FlowDrillTask[];
    na: FlowDrillTask[];
  };
}

export interface FlowEntityDetail {
  name: string;
  totals: FlowBucketTotals;
  tasks: { completed: FlowDrillTask[]; pending: FlowDrillTask[]; na: FlowDrillTask[] };
  members: FlowMemberRollup[];
}

/** GET /api/internal/department-detail — same shape as FlowDetailResponse's
 *  `department` field, but fetchable for ANY official department by name
 *  (not just the caller's own), for the Department Overview page. */
export interface FlowDepartmentDetailResponse {
  period: FlowPeriod;
  date: string;
  department: FlowEntityDetail;
}

/** Same shape as FlowDepartmentDetailResponse but for ONE branch by name —
 *  the Task Manager page's Branch mode (org roles any; BRANCH/BRANCH_SITE
 *  own branch only). */
export interface FlowBranchDetailResponse {
  period: FlowPeriod;
  date: string;
  branch: FlowEntityDetail;
}

/** Role-scoped detail payload (the ClickUp Tasks page's data). */
export interface FlowDetailResponse {
  kind: "org" | "department" | "branch" | "member";
  period: FlowPeriod;
  date: string;
  me: FlowPersonal;
  /** HOD only: their department's buckets + member roster. */
  department?: FlowEntityDetail;
  /** BRANCH only: their branch's buckets + member roster. */
  branch?: FlowEntityDetail;
  /** BRANCH (own branch) / org roles (org-wide): ALL-TIME ad hoc tasks —
   *  runs started by OPS/Admin. */
  adhoc?: { totals: FlowBucketTotals; tasks: FlowDrillTask[] };
  /** ADMIN/OPS only: ad hoc tasks broken down like branch status —
   *  Manager-level staff only, grouped by Region A/B/C. All-time, not
   *  period-split. */
  adhocByRegion?: {
    totals: FlowBucketTotals;
    regions: { name: string; branches: FlowEntityRollup[] }[];
  };
  /** ADMIN/CEO/OPS only: org-wide rollups. */
  org?: {
    totals: FlowBucketTotals;
    branches: FlowEntityRollup[];
    departments: FlowEntityRollup[];
    /** Branch rollups grouped by Region A/B/C (superadmin's by-region view). */
    regions: { name: string; branches: FlowEntityRollup[] }[];
    /** Region grouping per staff role (Manager/Executive/Coach) — the daily
     *  view's role filter. */
    regionsByRole: {
      role: string;
      regions: { name: string; branches: FlowEntityRollup[] }[];
    }[];
  };
}

// ---------- org reference data (mirrors the Flow side) ----------

export const FLOW_BRANCH_REGIONS = [
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
] as const;

export const FLOW_STAFF_ROLES = ["Manager", "Branch Exec", "Coach"] as const;
export const FLOW_DAYS = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const FLOW_DEPARTMENTS = [
  // Renamed from "Operation" 2026-07-25 (user spelling correction). The
  // SOURCE systems (portal hrfs department table, HRFS markers) still say
  // "Operation" — hrfs-map.ts's normalizeSourceDepartment shims imports.
  "Operations",
  "Academy",
  "Marketing",
  "Optimisation",
  "Human Resource",
  "Finance",
] as const;

/** Input for the "+ Assigned task" quick forms (POST /api/internal/assign).
 *  Branch form: branches + role + day. Department form: userIds (overrides). */
export interface FlowAssignInput {
  title: string;
  /** Empty = all branches. */
  branches?: string[];
  role?: "All" | (typeof FLOW_STAFF_ROLES)[number];
  /** Multi-select — empty/omitted = no specific day (old "All"). Since a
   *  RunBlock has exactly one dueAt (and the "My Tasks — Daily" day grouping
   *  is derived from that single date, not a stored days field — see
   *  clickup-tasks-view.tsx), each selected day becomes its OWN separate
   *  RunBlock per recipient rather than one task tagged with several days —
   *  see assign/route.ts. They're independent, separately-completable
   *  instances that happen to share a title, not one recurring task. */
  days?: (typeof FLOW_DAYS)[number][];
  /** RETIRED (2026-07-25 final decision): every Daily task auto-recurs
   *  weekly, system-wide — nothing sends this anymore; the server accepts
   *  and ignores it for API stability. */
  repeatWeekly?: boolean;
  /** Optional Guideline (2026-07-30): SOP link and/or reference image
   *  (png/jpeg/webp, ≤ 2 MB, base64) — both optional, never block
   *  submission. */
  guidelineUrl?: string;
  guidelineImage?: { mime: "image/png" | "image/jpeg" | "image/webp"; dataBase64: string };
  /** Department form: the exact members to assign ("who"). */
  userIds?: string[];
  dueDate?: string; // YYYY-MM-DD
  /** Required, single-select — decides which ONE "My Tasks" list (Daily,
   *  Monthly, or Ad hoc) the created task appears in; never more than one —
   *  dueDate/starter-role no longer decide that for tasks created through
   *  this form. Which options are even choosable depends on the targeted
   *  assignee(s) — see visibleCadenceOptions. */
  cadence: CadenceOption;
}

export type CadenceOption = FlowPeriod | "adhoc";

/** Which Cadence pills the "+ Add Task" form should offer, given the
 *  currently-selected recipient(s) — Branch Manager keeps all 3 (the one
 *  branch-side role Ad hoc applies to); Coach/Branch Exec are restricted to
 *  Daily only (Monthly/Ad hoc aren't just hidden by default, they're not
 *  valid choices for these roles at all); everyone else keeps the original
 *  Daily/Monthly pair. A mixed selection resolves by this same precedence
 *  (Branch Manager > Coach/Branch Exec > default) — mirrored server-side in
 *  assign/route.ts for enforcement, not just client display. */
export function visibleCadenceOptions(
  selected: { employmentType: string | null }[],
): CadenceOption[] {
  if (selected.some((s) => s.employmentType === "Manager")) return ["daily", "monthly", "adhoc"];
  if (selected.some((s) => s.employmentType === "Coach" || s.employmentType === "Branch Exec")) {
    return ["daily"];
  }
  return ["daily", "monthly"];
}

/** Assignable staff directory entry (GET /api/internal/staff). */
export interface FlowStaffMember {
  id: string;
  name: string;
  role: FlowRole;
  department: string | null;
  branch: string | null;
  employmentType: string | null;
  /** Full Time | Part Time — sub-split of employmentType "Coach" only. */
  coachSchedule: string | null;
}

// ---------- Manpower Schedule (the branch staffing grid) ----------

export type FlowScheduleStatus = "PLANNING" | "PUBLISHED";

/** One grid cell: a (time row × role column) pair. */
export interface FlowScheduleCell {
  slotId: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  roleColumn: string; // "Manager" | "Coach 1" | "Exec 1" | ...
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  /** True once this cell's assignment has a linked task (published + assigned). */
  synced: boolean;
}

export interface FlowManpowerSchedule {
  id: string;
  branch: string;
  date: string;
  status: FlowScheduleStatus;
  cells: FlowScheduleCell[];
}

export interface FlowManpowerScheduleResponse {
  schedule: FlowManpowerSchedule | null;
  /** True only for the branch manager who owns this branch. */
  canEdit: boolean;
}

// ---------- HOD's own personal board (freeform notes, NOT the task engine) ----------

/** Preset title-color palette for a board column — a curated key, never a
 *  raw hex/CSS value, so the picker UI and validation both stay closed-set. */
export const HOD_KANBAN_COLORS = [
  "blue",
  "indigo",
  "violet",
  "pink",
  "orange",
  "teal",
  "rose",
] as const;

export type FlowKanbanColumnColor = (typeof HOD_KANBAN_COLORS)[number];

/** Every column on an HOD's board is an equal, ordinary row — fully
 *  renamable, deletable, and reorderable, including the initial Pending/In
 *  Progress/Completed set a new HOD starts with (a server-side seeding
 *  detail, not a frontend concept — see /api/internal/hod-kanban's GET). */
export interface FlowKanbanColumnDef {
  id: string;
  label: string;
  order: number;
  /** null = default neutral title color. */
  color: FlowKanbanColumnColor | null;
}

export interface FlowKanbanCard {
  id: string;
  /** A FlowKanbanColumnDef's own id. */
  column: string;
  title: string;
  order: number;
}

// ---------- CEO dashboard customization ----------

/** GET/PUT /api/internal/ceo-dashboard — an ordered list of official
 *  department names the CEO has pinned to their own overview. Personal to
 *  that CEO; doesn't affect Superadmin's or anyone else's view. */
export interface FlowCeoDashboardConfig {
  departments: string[];
}

/** Which real-world role a grid column expects, or null if it doesn't match
 *  the "Manager" / "Coach N" / "Exec N" convention. Mirrors the (server-only)
 *  copy in src/app/api/internal/_manpower.ts — duplicated deliberately, same
 *  as the rest of this file, so src/osc stays import-free of the app. */
export function flowRoleForColumn(roleColumn: string): "Manager" | "Coach" | "Branch Exec" | null {
  if (roleColumn === "Manager") return "Manager";
  if (/^Coach \d+$/.test(roleColumn)) return "Coach";
  if (/^Exec \d+$/.test(roleColumn)) return "Branch Exec";
  return null;
}

/** "18:00" -> "6:00 PM". */
export function flowFormatTime12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** The assign-task recipient picker's "By Group" dropdown options. Department
 *  needs a second dropdown (which department); the rest resolve straight to
 *  a name list. Full Time Coach / Part Time Coach are back (previously
 *  removed, then re-added once Cadence gained a role-conditional Ad hoc
 *  option that needs a way to target coaches directly) — coachSchedule was
 *  already carrying this exact split. "Executive" is gone, replaced by two
 *  distinct groups (HQ Exec / Branch Exec — see the Executive-role-split
 *  migration, 20260721041500_split_executive_role). Branch is deliberately
 *  NOT offered — branch doesn't appear anywhere in the assigned-tasks/Task
 *  Manager section (no grouping option, no field/tag on task cards), per
 *  the user's request. */
export const FLOW_GROUPS = [
  "CEO",
  "HOD",
  "Branch Manager",
  "Regional Manager",
  "HQ Exec",
  "Branch Exec",
  "Full Time Coach",
  "Part Time Coach",
  "Intern",
  "Department",
] as const;

export type FlowGroup = (typeof FLOW_GROUPS)[number];

export const FLOW_GROUPS_NEEDING_SUBVALUE: readonly FlowGroup[] = ["Department"];

/** Groups whose member list can OPTIONALLY be narrowed by department —
 *  unlike FLOW_GROUPS_NEEDING_SUBVALUE no sub-pick is required; the default
 *  ("All departments") behaves exactly like the flat group did.
 *  2026-07-25 user decision: Intern only, deliberately not the other
 *  department-side roles. */
export const FLOW_GROUPS_WITH_OPTIONAL_DEPARTMENT: readonly FlowGroup[] = ["Intern"];
export const FLOW_GROUP_DEPT_ALL = "All departments";
/** Real option, not just a label: 65 imported staff currently have no
 *  department assigned — a plain department filter would never reach them. */
export const FLOW_GROUP_DEPT_NONE = "No department yet";

/** Resolve a "By Group" selection (+ optional department sub-value) into the
 *  matching staff members. */
export function flowGroupMembers(
  staff: FlowStaffMember[],
  group: FlowGroup,
  subValue?: string,
): FlowStaffMember[] {
  switch (group) {
    case "CEO":
      return staff.filter((s) => s.role === "CEO");
    case "HOD":
      return staff.filter((s) => s.role === "HOD");
    case "Branch Manager":
      return staff.filter((s) => s.employmentType === "Manager");
    case "Regional Manager":
      return staff.filter((s) => s.employmentType === "Regional Manager");
    case "HQ Exec":
      return staff.filter((s) => s.employmentType === "HQ Exec");
    case "Branch Exec":
      return staff.filter((s) => s.employmentType === "Branch Exec");
    case "Full Time Coach":
      return staff.filter((s) => s.employmentType === "Coach" && s.coachSchedule === "Full Time");
    case "Part Time Coach":
      return staff.filter((s) => s.employmentType === "Coach" && s.coachSchedule === "Part Time");
    case "Intern": {
      // Optional department drill-down (see FLOW_GROUPS_WITH_OPTIONAL_DEPARTMENT).
      const interns = staff.filter((s) => s.employmentType === "Intern");
      if (!subValue || subValue === FLOW_GROUP_DEPT_ALL) return interns;
      if (subValue === FLOW_GROUP_DEPT_NONE) return interns.filter((s) => !s.department);
      return interns.filter((s) => s.department === subValue);
    }
    case "Department":
      return subValue ? staff.filter((s) => s.department === subValue) : [];
  }
}

/** De-dupe by runBlockId, keeping the first occurrence — for merging several
 *  task lists (e.g. daily + monthly + ad hoc) that can overlap when a task's
 *  dueAt/startedAt falls in more than one period's window (an untagged block
 *  due "today" is inside both the daily window and the current month's). */
export function flowDedupeTasks<T extends FlowTaskRow>(tasks: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of tasks) {
    if (seen.has(t.runBlockId)) continue;
    seen.add(t.runBlockId);
    out.push(t);
  }
  return out;
}

/** Group a flat task list into the three status buckets (for drillable donuts). */
export function flowBucketize<T extends FlowTaskRow>(
  tasks: T[],
): { completed: T[]; pending: T[]; na: T[] } {
  const out = { completed: [] as T[], pending: [] as T[], na: [] as T[] };
  for (const t of tasks) {
    if (t.status === "DONE") out.completed.push(t);
    else if (t.status === "SKIPPED") out.na.push(t);
    else out.pending.push(t);
  }
  return out;
}

/** Human label for an assigner stream ("CEO assigned tasks" per the mockups). */
export function flowStreamLabel(key: FlowRole | "self"): string {
  if (key === "self") return "Started by me";
  const names: Record<FlowRole, string> = {
    ADMIN: "Admin",
    CEO: "CEO",
    OPS: "Ops",
    BRANCH: "Branch",
    HOD: "HOD",
    MEMBER: "Peer",
    DEPT_SITE: "Department",
    BRANCH_SITE: "Branch Site",
  };
  return `${names[key]} assigned tasks`;
}

/** Which assigner-stream cards to actually render — CEO/HOD assigned tasks
 *  keep their own badge/section; Admin (Superadmin) and Ops do NOT, per the
 *  "no special Admin Assigned Task category" spec — those tasks still land
 *  in the normal Daily/Monthly/Ad hoc lists via their Cadence tag, they just
 *  don't ALSO get a separate "Admin assigned tasks"/"Ops assigned tasks"
 *  card. Operation dept-site assignments follow the same rule — their
 *  stream key is the literal "DEPT_SITE" (startedById stores the site
 *  account's own id; the shared ADMIN utility flow does not change the
 *  stream key), so it's excluded here explicitly. "self"
 *  (tasks I started myself) was never meant to show here either — every
 *  caller already excluded it before this helper existed. */
export function visibleAssignerStreams<T extends { key: FlowRole | "self" }>(streams: T[]): T[] {
  return streams.filter((s) => s.key !== "self" && s.key !== "ADMIN" && s.key !== "OPS" && s.key !== "DEPT_SITE");
}

export function flowBucketTotal(t: FlowBucketTotals): number {
  return t.completed + t.pending + t.na;
}

export function flowCompletionPct(t: FlowBucketTotals): number {
  const total = flowBucketTotal(t);
  return total > 0 ? Math.round((t.completed / total) * 100) : 0;
}

export interface DueDateDisplay {
  text: string;
  className: string;
}

/** Due-date label: a "D/M" date followed by a relative qualifier — "25/7
 *  5 days ago" / "29/7 Yesterday" (red, overdue), "30/7 Today" (amber), a
 *  short weekday for the next 6 days ("2/8 Sun", neutral gray), or the bare
 *  "15/8" date beyond a week (also neutral gray). Calendar-day difference,
 *  not a raw ms delta — a dueAt of 17:00 today still reads as "Today"
 *  regardless of the current time of day. Returns null for no due date —
 *  callers keep rendering their own "—". */
export function formatDueDate(due: Date | null): DueDateDisplay | null {
  if (!due) return null;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfDay(due).getTime() - startOfDay(new Date()).getTime()) / 86_400_000);
  const dm = `${due.getDate()}/${due.getMonth() + 1}`;

  if (diffDays < -1) return { text: `${dm} ${-diffDays} days ago`, className: "text-red-500 font-medium" };
  if (diffDays === -1) return { text: `${dm} Yesterday`, className: "text-red-500 font-medium" };
  if (diffDays === 0) return { text: `${dm} Today`, className: "text-amber-600 font-medium" };
  if (diffDays <= 6)
    return {
      text: `${dm} ${due.toLocaleDateString(undefined, { weekday: "short" })}`,
      className: "text-gray-400",
    };
  return { text: dm, className: "text-gray-400" };
}
