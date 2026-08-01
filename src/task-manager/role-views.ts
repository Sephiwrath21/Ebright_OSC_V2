// ---------------------------------------------------------------------------
// THE single source of truth for role → visible sections (2026-07-29).
//
// Both the Home overview (app/home/scoped-overview-section.tsx) and the Task
// Manager page (app/task-manager/page.tsx + ui/task-manager-view.tsx) render
// PURELY by consulting this config — no scattered per-component role checks.
// To change what a role sees, edit its entry here; both pages follow, and
// they can never disagree with each other.
//
// This module is PURE (no prisma/server imports) so client components can
// read it. Authorization stays in the data layer (analytics/_lib
// canViewOrg/canViewEntity/...) — this file only decides what the UI shows;
// the server still enforces what data a role may fetch.
// ---------------------------------------------------------------------------

/** UI view identity. Finer-grained than the raw Role enum: MEMBER splits by
 *  branch membership, DEPT_SITE splits by elevation. */
export type ViewRole =
  | "ADMIN" // Superadmin (od@)
  | "CEO"
  | "OPS" // Nurul — org role, personal-staff page
  | "HOD"
  | "ELEVATED_DEPT_SITE" // Operations / Optimisation — superadmin-equivalent
  | "DEPT_SITE" // Finance / Marketing / Academy / HR department accounts
  | "BRANCH_MANAGER" // role BRANCH
  | "BRANCH_SITE" // view-only branch login
  | "DEPT_MEMBER" // Intern / Full Time / HQ Exec / Part Time (department side)
  | "BRANCH_MEMBER" // Branch Exec — Daily ONLY, Tue–Sun
  | "COACH"; // FT/PT Coach — Daily ONLY, Wed–Sun (2026-07-29 final spec)

export type SectionKey =
  // org-level overviews
  | "orgGrids" // all-departments + branch-regions (+ ad hoc regions) grids
  | "entityDropdowns" // /task-manager dropdown-driven entity overview
  | "departmentOverview" // own-department detail (chips + donut + roster)
  | "branchOverview" // own-branch detail (same component as department)
  | "adhocOversight" // branch-wide all-time ad hoc card (Manager oversight)
  | "manpowerLink" // Manpower Schedule link card
  // personal donut cards
  | "personalDaily"
  | "personalMonthly"
  | "personalAdhoc" // Branch Manager's own ad hoc card (all-time)
  | "ceoAssigned" // dedicated "CEO assigned tasks" card (?cdate=)
  | "hodAssigned" // dedicated "HOD assigned tasks" card (?hdate=)
  | "assignerStreams" // generic non-dedicated assigner-stream cards
  | "delegated" // "Tasks I Assigned" card
  // personal lists / boards
  | "myTasksDaily"
  | "myTasksMonthly"
  | "myTasksAdhoc" // Branch Manager's always-rendered ad hoc list
  | "myBoard" // HOD's personal Kanban
  // CEO-specific sections
  | "ceoCombinedList"
  | "ceoTaskTable"
  | "ceoKanban";

/** Daily weekday sidebar range — three distinct ranges per the 2026-07-29
 *  final spec: department-side Tue–Sat; Branch Manager + Branch Exec
 *  Tue–Sun; Coaches Wed–Sun. */
export type WeekdayRange = "tue-sat" | "tue-sun" | "wed-sun";

export interface RoleViewConfig {
  /** Sections on the HOME page overview, in render order. */
  home: readonly SectionKey[];
  /** Sections on the TASK MANAGER page, in render order. */
  taskManager: readonly SectionKey[];
  weekdayRange: WeekdayRange;
  /** "+ Task" button in the Task Manager page header. */
  addTaskHeader: boolean;
}

export const ROLE_VIEWS: Record<ViewRole, RoleViewConfig> = {
  ADMIN: {
    home: ["orgGrids"],
    taskManager: ["entityDropdowns"],
    weekdayRange: "tue-sat",
    addTaskHeader: true,
  },
  // CEO redesign (2026-08-01, user spec): Home = OWN tasks first (the same
  // personal donut pair every staff role uses), then the DRAGGABLE pinned-
  // department dashboards (ceoKanban — add/reorder/remove, persisted
  // per-CEO in CeoDashboardConfig) replacing the fixed org grids. The
  // dashboards live on HOME ONLY (relocated off /task-manager, same-day
  // follow-up); Task Manager = own tasks + the superadmin-style
  // Department|Branch dropdown overview (entityDropdowns) below them.
  // CEO (2026-08-01, latest): Task Manager "My Tasks" = the SAME weekday-
  // sidebar Daily table view every other role uses (myTasksDaily — the
  // old un-windowed combined list is gone); Home keeps the ONE combined
  // "My Tasks" card (ceoCombinedList) with its date filter.
  CEO: {
    home: ["ceoCombinedList", "ceoKanban"],
    taskManager: ["myTasksDaily", "ceoTaskTable", "entityDropdowns"],
    weekdayRange: "tue-sat",
    addTaskHeader: true,
  },
  OPS: {
    home: ["orgGrids"],
    taskManager: ["personalDaily", "personalMonthly", "assignerStreams", "myTasksDaily", "myTasksMonthly"],
    weekdayRange: "tue-sat",
    addTaskHeader: true,
  },
  HOD: {
    home: ["personalDaily", "personalMonthly", "ceoAssigned", "departmentOverview"],
    taskManager: [
      "personalDaily",
      "personalMonthly",
      "ceoAssigned",
      "myTasksDaily",
      "myTasksMonthly",
      "myBoard",
      "departmentOverview",
    ],
    weekdayRange: "tue-sat",
    addTaskHeader: true,
  },
  // Superadmin-equivalent (2026-07-29 final spec): full org grids on Home
  // (departments + branches + ad hoc regions) and the Department | Branch
  // dropdown toggle on the Task Manager page.
  ELEVATED_DEPT_SITE: {
    home: ["orgGrids"],
    taskManager: ["entityDropdowns"],
    weekdayRange: "tue-sat",
    addTaskHeader: true,
  },
  DEPT_SITE: {
    home: ["departmentOverview"],
    taskManager: ["departmentOverview"],
    weekdayRange: "tue-sat",
    addTaskHeader: false,
  },
  BRANCH_MANAGER: {
    home: ["personalDaily", "personalMonthly", "personalAdhoc", "branchOverview"],
    taskManager: [
      "personalDaily",
      "personalMonthly",
      "personalAdhoc",
      "myTasksDaily",
      "myTasksMonthly",
      "myTasksAdhoc",
      "branchOverview",
      "adhocOversight",
      "manpowerLink",
    ],
    weekdayRange: "tue-sun",
    addTaskHeader: false,
  },
  // Branch sites see Daily, Monthly AND the branch-wide ad hoc set
  // (read-only) — 2026-07-29 final spec.
  BRANCH_SITE: {
    home: ["branchOverview", "adhocOversight"],
    taskManager: ["branchOverview", "adhocOversight"],
    weekdayRange: "tue-sat",
    addTaskHeader: false,
  },
  // Personal ONLY: Daily, Monthly, HOD Assigned — exactly the 2026-07-29
  // final spec (no generic stream/delegated cards).
  DEPT_MEMBER: {
    home: ["personalDaily", "personalMonthly", "hodAssigned"],
    taskManager: ["personalDaily", "personalMonthly", "hodAssigned", "myTasksDaily", "myTasksMonthly"],
    weekdayRange: "tue-sat",
    addTaskHeader: false,
  },
  // Branch Exec — Daily ONLY, Tue–Sun (2026-07-29 final spec).
  BRANCH_MEMBER: {
    home: ["personalDaily"],
    taskManager: ["personalDaily", "myTasksDaily"],
    weekdayRange: "tue-sun",
    addTaskHeader: false,
  },
  // FT/PT Coach — Daily ONLY, Wed–SUN (the THIRD distinct range,
  // 2026-07-29 final spec).
  COACH: {
    home: ["personalDaily"],
    taskManager: ["personalDaily", "myTasksDaily"],
    weekdayRange: "wed-sun",
    addTaskHeader: false,
  },
};

/** Department-site accounts with org-wide DEPARTMENT visibility (still no
 *  branch data) AND the unrestricted "+ Task" assign form: Operations and
 *  Optimisation — per the 2026-07-24 product decision. Every other
 *  DEPT_SITE stays locked to its own department. Lives here (pure module)
 *  so client components can resolve view roles; analytics/_lib re-exports
 *  it for the data layer's authorization checks. */
export const ELEVATED_DEPT_SITE_DEPARTMENTS = ["Operations", "Optimisation"] as const;

export function isElevatedDeptSite(user: {
  role: string;
  department: string | null;
}): boolean {
  return (
    user.role === "DEPT_SITE" &&
    user.department !== null &&
    (ELEVATED_DEPT_SITE_DEPARTMENTS as readonly string[]).includes(user.department)
  );
}

/** Raw role (+ department/branch/employmentType) → UI view identity. */
export function resolveViewRole(user: {
  role: string;
  department: string | null;
  branch: string | null;
  employmentType?: string | null;
}): ViewRole {
  switch (user.role) {
    case "ADMIN":
      return "ADMIN";
    case "CEO":
      return "CEO";
    case "OPS":
      return "OPS";
    case "HOD":
      return "HOD";
    case "DEPT_SITE":
      return isElevatedDeptSite(user) ? "ELEVATED_DEPT_SITE" : "DEPT_SITE";
    case "BRANCH":
      return "BRANCH_MANAGER";
    case "BRANCH_SITE":
      return "BRANCH_SITE";
    default:
      // MEMBER (and any future unknown role degrades to the member view):
      // branch membership decides the branch-side vs department-side
      // split, and Coaches split off branch members for their own
      // Wed–Sun weekday range (2026-07-29 final spec).
      if (user.branch === null) return "DEPT_MEMBER";
      return user.employmentType === "Coach" ? "COACH" : "BRANCH_MEMBER";
  }
}

/** Does this view show `key` on `page`? The ONE question every render gate
 *  asks. */
export function shows(view: ViewRole, page: "home" | "taskManager", key: SectionKey): boolean {
  return ROLE_VIEWS[view][page].includes(key);
}

export function weekdayRangeOf(view: ViewRole): WeekdayRange {
  return ROLE_VIEWS[view].weekdayRange;
}

export function showsAddTaskHeader(view: ViewRole): boolean {
  return ROLE_VIEWS[view].addTaskHeader;
}
