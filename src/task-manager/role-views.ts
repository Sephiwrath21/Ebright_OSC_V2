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
  | "orgGrids" // all-departments (+ ad hoc regions) — pair with
  // branchRegionOverview below for roles that also oversee branches
  // collapsible sections (rollup card by default, expands into a
  // per-person list — 2026-08-15 rebuild)
  | "entityDropdowns" // /task-manager dropdown-driven entity overview
  | "departmentOverview" // own-department detail (chips + donut + roster)
  | "branchOverview" // own-branch detail (same component as department)
  | "myOverview" // 2026-08-12: self-scoped 4-section stack (no owned entity)
  | "adhocOversight" // branch-wide all-time ad hoc card (Manager oversight)
  | "manpowerLink" // Manpower Schedule link card
  // personal donut cards
  | "personalDaily"
  | "personalMonthly"
  | "personalAdhoc" // Branch Manager's own ad hoc card (all-time)
  | "ceoAssigned" // dedicated "CEO assigned tasks" card (?cdate=)
  | "hodAssigned" // dedicated "HOD assigned tasks" card (?hdate=)
  | "assignerStreams" // generic non-dedicated assigner-stream cards
  | "delegated" // "Task Assignment" card
  // personal lists / boards
  | "myTasksDaily" // no longer used in any home/taskManager array as of 2026-08-12; retained pending a cleanup task
  | "myTasksMonthly" // no longer used in any home/taskManager array as of 2026-08-12; retained pending a cleanup task
  | "myTasksAdhoc" // Branch Manager's always-rendered ad hoc list
  | "myBoard" // HOD's personal Kanban
  | "assignedByMeList" // HOD's own delegated-out list ("Tasks I Assigned"): every task the HOD
  // personally started, ALL-TIME, read-only Task/Assignee/Status table
  // (getMePayload's delegatedAll) — distinct from "delegated" above, which
  // drives an unused donut card. CEO's equivalent is ceoTaskTable below.
  // Retired from Task Manager 2026-08-12, REVIVED 2026-08-19 (explicit
  // request).
  // CEO-specific sections
  | "ceoCombinedList" // no longer used in any home/taskManager array as of 2026-08-26 (CEO's Home swapped to personalDaily); retained pending a cleanup task
  | "ceoTaskTable" // CEO's own delegated-out list ("CEO Assigned Task"): every task CEO
  // personally started, ALL-TIME, read-only Task/Assignee(HOD)/Status table
  // (getMePayload's delegatedAll — already computed for CEO, just unused
  // until this key was revived 2026-08-19). Same "PIC" table shape
  // assignedByMeList used for HOD.
  | "ceoKanban" // no longer used in any home/taskManager array as of 2026-08-19; retained pending a cleanup task
  | "branchRegionOverview"; // Home-only: Branch Status by Region — Daily/Monthly/Ad hoc. Not currently
  // true for any role (2026-08-19: dropped from CEO, its last user) — the
  // orgGrids branch's own shows() check on this key (scoped-overview-
  // section.tsx) stays wired so a future role can opt back in without
  // touching that file, per its own comment there.

/** Daily weekday sidebar range — per the 2026-07-29 final spec (+ CEO,
 *  2026-08-01): department-side Tue–Sat; Branch Manager + Branch Exec
 *  Tue–Sun; Coaches Wed–Sun; CEO the full Mon–Sun week. */
export type WeekdayRange = "mon-sun" | "tue-sat" | "tue-sun" | "wed-sun";

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
  // No branchRegionOverview on Home (2026-08-15, revised): confirmed
  // removed for ADMIN too, not just ELEVATED_DEPT_SITE — see the
  // ELEVATED_DEPT_SITE comment below for the original reasoning; ADMIN and
  // OPS were pulled into the same removal per an explicit follow-up
  // decision. CEO's own separate branchRegionOverview (below, its own
  // distinct draggable-dashboard layout) is untouched.
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
  // ceoKanban/branchRegionOverview dropped from Home entirely (2026-08-19,
  // explicit request) — the same department/branch drill-down these gave is
  // already reachable via entityDropdowns on CEO's own Task Manager page.
  // Home's "My Tasks" swapped from ceoCombinedList to personalDaily
  // (2026-08-26, user request) — CEO now gets the SAME weekday-sidebar
  // Daily table view (Task/Proof/Due Date/Assign to Others columns) every
  // other role's Home page already has, matching what CEO's own Task
  // Manager page (myOverview, below) already showed all along — the old
  // ceoCombinedList summary-card-plus-modal was Home-only and out of step
  // with that. No personalMonthly (still no Monthly split for CEO
  // anywhere, per the 2026-08-19 explicit request task-manager-view.tsx's
  // myOverview render still honors).
  CEO: {
    home: ["personalDaily"],
    // 2026-08-12 stacked-sections redesign: myOverview replaces
    // myTasksDaily (own Daily/Monthly, now actionable card-grid form).
    // Monthly was new for the CEO here (never had it before this redesign)
    // — DROPPED again 2026-08-19 (explicit request: CEO only needs the
    // weekday view, no Monthly split) — see task-manager-view.tsx's
    // myOverview render, which omits monthly for CEO specifically.
    // ceoTaskTable REVIVED 2026-08-19 (explicit request) — CEO's own
    // delegated-out list, positioned right after myOverview, before
    // entityDropdowns.
    taskManager: ["myOverview", "ceoTaskTable", "entityDropdowns"],
    weekdayRange: "mon-sun",
    addTaskHeader: true,
  },
  // No branchRegionOverview on Home (2026-08-15, revised) — same removal
  // as ADMIN above.
  OPS: {
    home: ["orgGrids"],
    // 2026-08-12: myOverview replaces personalDaily/personalMonthly/
    // myTasksDaily/myTasksMonthly (own Daily/Monthly, now actionable
    // card-grid form). assignerStreams is a different concept (incoming
    // tasks grouped by who assigned them) and is unaffected. OPS has no
    // owned department, so myOverview here renders Daily/Monthly only —
    // no HOD/CEO Assigned Task section (see page.tsx wiring).
    taskManager: ["myOverview", "assignerStreams"],
    weekdayRange: "tue-sat",
    addTaskHeader: true,
  },
  HOD: {
    home: ["personalDaily", "personalMonthly", "ceoAssigned", "departmentOverview"],
    // 2026-08-12 stacked-sections redesign: personalDaily/personalMonthly/
    // ceoAssigned/myTasksDaily/myTasksMonthly are all retired from Task
    // Manager (Home keeps them, unchanged) — every one of them is subsumed
    // into departmentOverview's restructured 4-section stack: the HOD's own
    // card already appears (actionable) inside the whole-department Daily/
    // Monthly grid, and the entity-wide HOD/CEO Assigned Task sections cover
    // what ceoAssigned (personal, day-windowed) used to show, now visible
    // department-wide instead of just to the HOD. myBoard (Kanban) is
    // unrelated and unaffected.
    // assignedByMeList REVIVED 2026-08-19 (explicit request) — HOD's own
    // delegated-out list ("Tasks I Assigned"), positioned right after
    // myBoard, before departmentOverview — the same "PIC" table shape as
    // CEO's ceoTaskTable, sourced from getMePayload's delegatedAll (already
    // computed for HOD, just unused until now).
    taskManager: ["myBoard", "assignedByMeList", "departmentOverview"],
    weekdayRange: "tue-sat",
    addTaskHeader: true,
  },
  // Superadmin-equivalent (2026-07-29 final spec): full org grids on Home
  // (departments + ad hoc regions) and the Department | Branch dropdown
  // toggle on the Task Manager page. No branchRegionOverview on Home
  // (2026-08-15) — originally removed for this role alone, then confirmed
  // to also apply to ADMIN and OPS (see their comments above).
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
    // 2026-08-12: personalDaily/personalMonthly/myTasksDaily/myTasksMonthly
    // are retired — subsumed into branchOverview's restructured 4-section
    // stack, same reasoning as HOD's departmentOverview above. personalAdhoc
    // dropped from Task Manager specifically (2026-08-18) — the personal
    // "Ad hoc" donut was redundant with "My Tasks — Ad hoc" (myTasksAdhoc)
    // right below it; Home's own personal Ad hoc card is untouched
    // (separate `home` array above). branchOverview's own HOD/CEO Assigned
    // sections are ALSO replaced with an "Ad hoc" card grid for this role
    // specifically — see task-manager-view.tsx's branchOverview render (a
    // role check there, not a SectionKey, since Branch Site shares this
    // same key and keeps HOD/CEO Assigned unchanged). adhocOversight
    // dropped too (2026-08-18, same visit) — the branch-wide "Ad hoc Tasks"
    // donut at the bottom of the page became redundant once branchOverview's
    // own new Ad hoc card grid covers the same data with a real per-person
    // breakdown; Branch Site (separate entry below) keeps adhocOversight
    // since it never gets that replacement. manpowerLink dropped too
    // (2026-08-18, same visit, explicit request) — the "Manpower Schedule"
    // Details card at the very bottom of the page.
    taskManager: ["myTasksAdhoc", "branchOverview"],
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
    // 2026-08-12 stacked-sections redesign (corrected per review):
    // myOverview here is NOT self-only for Daily — plain department-side
    // staff now see their WHOLE department's Daily roster (own card
    // actionable, everyone else's read-only, same as HOD's own Daily
    // section), via the new getDepartmentDetail MEMBER-daily exception
    // (queries.ts). Monthly stays self-only (unchanged from personalMonthly
    // today). No HOD Assigned Task section — hodAssigned is dropped here
    // (Home keeps it, unchanged); confirmed correction, not the original
    // "entity-wide, visible to everyone" plan.
    taskManager: ["myOverview"],
    weekdayRange: "tue-sat",
    addTaskHeader: false,
  },
  // Branch Exec — Daily ONLY, Tue–Sun (2026-07-29 final spec).
  BRANCH_MEMBER: {
    home: ["personalDaily"],
    // 2026-08-12: myOverview here renders Daily ONLY (no Monthly prop
    // passed — preserves the Daily-only constraint), whole-branch
    // visibility via the new getBranchDetail MEMBER-daily exception (same
    // rule as DEPT_MEMBER's department, applied symmetrically to the
    // branch side). No HOD/CEO Assigned Task section, same as DEPT_MEMBER.
    taskManager: ["myOverview"],
    weekdayRange: "tue-sun",
    addTaskHeader: false,
  },
  // FT/PT Coach — Daily ONLY, Wed–SUN (the THIRD distinct range,
  // 2026-07-29 final spec).
  COACH: {
    home: ["personalDaily"],
    // Same as BRANCH_MEMBER above — Daily-only whole-branch myOverview.
    taskManager: ["myOverview"],
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

/** The one Finance department login (a DEPT_SITE account) — gates
 *  FinanceDashboard.tsx on Home and, as of 2026-08-18, the "No Claim/
 *  Incentive" list on the Task Manager page. Lives here (not just locally in
 *  home/page.tsx, its original home) so both call sites share one constant
 *  instead of two copies that can drift. */
export const FINANCE_EMAIL = "finance@ebright.my";

/** Task Manager sidebar visibility for Template/Package/Package Table
 *  (2026-08-07 permission matrix, revised 2026-08-11) — View tier only,
 *  separate from edit capability (see canManageTaskTemplateGroups below).
 *  Overview is deliberately NOT covered here — it stays visible to
 *  everyone via Sidebar's existing unconditional rendering, and its own
 *  edit-surface gating is unchanged, still driven entirely by
 *  ROLE_VIEWS/shows() above. Designed to be consumed by BOTH the
 *  sidebar's visibility filter and template-groups.ts's
 *  requireGroupViewAccess, so the two can never drift apart — a role
 *  hidden from the sidebar will always also be rejected server-side, and
 *  vice versa.
 *
 *  2026-08-11 change: Branch Manager (role BRANCH) now sees Template too,
 *  same as Package/Package Table already did — HOD and Branch Manager are
 *  now the same view-only tier across all three pages. Full Time/Intern/
 *  HQ Exec/Part Time/Regional Manager (role MEMBER, branch null), Coach,
 *  and Branch Exec (role MEMBER, branch set) get none of the three — this
 *  was already true before this change (role MEMBER was never in
 *  `manage`/`orgViewer`/`branchManagerViewer`) and needed no code change,
 *  confirmed against live data (2026-08-11) rather than assumed. CEO's
 *  access is unchanged (explicit product decision, 2026-08-11 — the
 *  revised matrix's table omitted a CEO row, but that wasn't a removal).
 *
 *  (2026-08-12 added, then removed 2026-08-15: a standalone /task-manager/
 *  categories admin page briefly existed; categories are now managed
 *  exclusively inline from the Assign Task form's Type dropdown, gated by
 *  canManageTaskTemplateGroups on that dropdown's "+ Add new type" option
 *  directly — see assign-task-form.tsx and createTaskCategory — so there's
 *  no separate sidebar surface or nav-access key for it anymore.)
 *
 *  (2026-08-13 added, then removed 2026-08-15: a standalone /task-manager/
 *  my-week page + "myWeek" nav key briefly existed; the same weekday-tab
 *  view is now embedded directly in the Overview page's own "My Tasks"
 *  Daily card instead — see entity-card-overview.tsx — so there's no
 *  separate sidebar surface or nav-access key for it anymore either.) */
export function taskManagerNavAccess(user: {
  role: string;
  department: string | null;
  email?: string;
}): { template: boolean; package: boolean; packageTable: boolean } {
  const manage = canManageTaskTemplateGroups(user);
  const orgViewer = user.role === "CEO" || user.role === "HOD";
  const branchManagerViewer = user.role === "BRANCH";
  const viewer = manage || orgViewer || branchManagerViewer;
  return {
    template: viewer,
    package: viewer,
    packageTable: viewer,
  };
}

/** Extra per-user grants (2026-08-22) — narrow, explicit exceptions to the
 *  role-based Template/Package/Package Table edit rule below, for a
 *  specific person who needs edit access their role wouldn't otherwise
 *  grant. Keyed by (lowercased) email — a stable identifier, not name
 *  (this session hit repeated name-matching/casing issues) or role. Add
 *  future exceptions here; no other code changes needed.
 *
 *  IMPORTANT: this is a GLOBAL grant, same as any elevated dept-site
 *  account already gets — TaskTemplateGroup has no `department` column,
 *  so Template/Package/Package Table access has never been per-department
 *  scoped for anyone. A listed email gets full edit access to every
 *  department's templates/packages, not just their own. */
export const EXTRA_TEMPLATE_GROUP_EDITOR_EMAILS: readonly string[] = [
  // Wan Nuraihan Hanisah Binti Wan Abdul Hadi — Optimisation dept exec
  // (role MEMBER, so she doesn't otherwise qualify) — 2026-08-22 request.
  "nuraihanhanisah2002@gmail.com",
];

/** Task Manager Template/Package/Package Table EDIT capability
 *  (create/edit/delete/assign) — identical for all three pages under the
 *  2026-08-07 matrix (unchanged by the 2026-08-11 revision): Super Admin
 *  (ADMIN), the elevated Operations/Optimisation dept-site accounts, and
 *  anyone in EXTRA_TEMPLATE_GROUP_EDITOR_EMAILS above (2026-08-22).
 *  Everyone else who can still VIEW (HOD, CEO, Branch Manager, per
 *  taskManagerNavAccess above) is read-only across all three pages. */
export function canManageTaskTemplateGroups(user: {
  role: string;
  department: string | null;
  email?: string;
}): boolean {
  return (
    user.role === "ADMIN" ||
    isElevatedDeptSite(user) ||
    (user.email != null && EXTRA_TEMPLATE_GROUP_EDITOR_EMAILS.includes(user.email.trim().toLowerCase()))
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

/** Is this view an individual PERSON's login, vs a shared/site account
 *  (DEPT_SITE, BRANCH_SITE, ELEVATED_DEPT_SITE — e.g. finance@/od@ style
 *  logins nobody "personally" owns, whoever's on duty signs in)? Drives the
 *  Department/Branch Overview's default View toggle (2026-08-15): a real
 *  person landing on their own team's overview should see "Only Me" first
 *  (they have actual personal tasks to check); a site account has none, so
 *  "View All" (the whole roster) is the only view that makes sense for it. */
export function isPersonalAccountView(view: ViewRole): boolean {
  return view !== "DEPT_SITE" && view !== "BRANCH_SITE" && view !== "ELEVATED_DEPT_SITE";
}

/** Does this view show `key` on `page`? The ONE question every render gate
 *  asks. */
export function shows(view: ViewRole, page: "home" | "taskManager", key: SectionKey): boolean {
  return ROLE_VIEWS[view][page].includes(key);
}

export function weekdayRangeOf(view: ViewRole): WeekdayRange {
  return ROLE_VIEWS[view].weekdayRange;
}

/** { startOffset, endOffset } as days-from-Monday, inclusive, for each
 *  WeekdayRange value — e.g. "tue-sat" starts the day after Monday and
 *  ends 4 days after that (Saturday). */
const WEEKDAY_RANGE_BOUNDS: Record<WeekdayRange, { startOffset: number; endOffset: number }> = {
  "mon-sun": { startOffset: 0, endOffset: 6 },
  "tue-sat": { startOffset: 1, endOffset: 5 },
  "tue-sun": { startOffset: 1, endOffset: 6 },
  "wed-sun": { startOffset: 2, endOffset: 6 },
};

const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** Formats a Date as local YYYY-MM-DD. Deliberately NOT imported from
 *  analytics/_lib.ts's formatLocalDate — this file is pure (no server
 *  imports, see the file header), and _lib.ts transitively constructs a
 *  real Prisma client at import time (same reasoning documented in
 *  hrfs-map.ts's header for a similar import-boundary decision). */
function formatLocalDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** This week's actual calendar dates for every weekday in `range`,
 *  Monday-anchored (the week containing `today` runs Monday..Sunday
 *  regardless of what day `today` itself is — a Sunday reference date
 *  still resolves to THAT week's Monday, not the next one). Pure —
 *  `today` defaults to `new Date()` but is always passed explicitly by
 *  callers in practice (a bare `new Date()` default is only for tests /
 *  convenience, not relied on in the request path — pages pass their own
 *  captured `Date` so a single request sees one consistent "now"). */
export function thisWeekDatesForRange(
  range: WeekdayRange,
  today: Date = new Date(),
): { weekday: string; date: string }[] {
  const day = today.getDay(); // 0 = Sunday .. 6 = Saturday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + mondayOffset);

  const { startOffset, endOffset } = WEEKDAY_RANGE_BOUNDS[range];
  const result: { weekday: string; date: string }[] = [];
  for (let offset = startOffset; offset <= endOffset; offset++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
    result.push({ weekday: WEEKDAY_NAMES[offset], date: formatLocalDateString(d) });
  }
  return result;
}

export function showsAddTaskHeader(view: ViewRole): boolean {
  return ROLE_VIEWS[view].addTaskHeader;
}
