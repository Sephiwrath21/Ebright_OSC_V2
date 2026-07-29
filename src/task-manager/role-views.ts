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
  | "ELEVATED_DEPT_SITE" // Operations / Optimisation department accounts
  | "DEPT_SITE" // Finance / Marketing / Academy / HR department accounts
  | "BRANCH_MANAGER" // role BRANCH
  | "BRANCH_SITE" // view-only branch login
  | "DEPT_MEMBER" // Intern / Full Time / HQ Exec / Part Time (department side)
  | "BRANCH_MEMBER"; // Branch Exec / FT Coach / PT Coach — Daily ONLY

export type SectionKey =
  // org-level overviews
  | "orgGrids" // all-departments + branch-regions (+ ad hoc regions) grids
  | "allDeptGrids" // elevated sites: all-departments Daily/Monthly only
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

export interface RoleViewConfig {
  /** Sections on the HOME page overview, in render order. */
  home: readonly SectionKey[];
  /** Sections on the TASK MANAGER page, in render order. */
  taskManager: readonly SectionKey[];
  /** Daily weekday sidebar range — branch-side staff work weekends. */
  weekdayRange: "tue-sat" | "tue-sun";
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
  CEO: {
    home: ["orgGrids"],
    taskManager: ["ceoCombinedList", "ceoTaskTable", "ceoKanban"],
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
  ELEVATED_DEPT_SITE: {
    home: ["allDeptGrids"],
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
      "assignerStreams",
      "delegated",
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
  BRANCH_SITE: {
    home: ["branchOverview"],
    taskManager: ["branchOverview"],
    weekdayRange: "tue-sat",
    addTaskHeader: false,
  },
  DEPT_MEMBER: {
    home: ["personalDaily", "personalMonthly", "hodAssigned", "assignerStreams"],
    taskManager: [
      "personalDaily",
      "personalMonthly",
      "hodAssigned",
      "assignerStreams",
      "delegated",
      "myTasksDaily",
      "myTasksMonthly",
    ],
    weekdayRange: "tue-sat",
    addTaskHeader: false,
  },
  // Branch Exec / FT Coach / PT Coach — Daily ONLY, nothing else
  // (2026-07-29 final spec, Branch Exec grouped with coaches per the
  // original role spec).
  BRANCH_MEMBER: {
    home: ["personalDaily"],
    taskManager: ["personalDaily", "myTasksDaily"],
    weekdayRange: "tue-sun",
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

/** Raw role (+ department/branch) → UI view identity. */
export function resolveViewRole(user: {
  role: string;
  department: string | null;
  branch: string | null;
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
      // branch membership decides the branch-side vs department-side split.
      return user.branch !== null ? "BRANCH_MEMBER" : "DEPT_MEMBER";
  }
}

/** Does this view show `key` on `page`? The ONE question every render gate
 *  asks. */
export function shows(view: ViewRole, page: "home" | "taskManager", key: SectionKey): boolean {
  return ROLE_VIEWS[view][page].includes(key);
}

export function weekdayIncludesSunday(view: ViewRole): boolean {
  return ROLE_VIEWS[view].weekdayRange === "tue-sun";
}

export function showsAddTaskHeader(view: ViewRole): boolean {
  return ROLE_VIEWS[view].addTaskHeader;
}
