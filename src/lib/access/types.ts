// ─────────────────────────────────────────────────────────────
// Access RBAC — shared types + the code-defined feature taxonomy.
//
// Capability (which actions) and scope (whose data) are stored per
// (role, subtype, feature, action) in the `role_permission` table and edited
// from the Access Management UI. The MODULE/FEATURE list and ACTIONS below are
// code-defined (each must be backed by real enforcement) — extend here when the
// app gains a new area.
// ─────────────────────────────────────────────────────────────

export type PermAction = "view" | "add" | "update" | "delete" | "export";
export type Scope = "global" | "region" | "branch" | "team" | "own";

export const ACTIONS: PermAction[] = ["view", "add", "update", "delete", "export"];
export const SCOPES: Scope[] = ["global", "region", "branch", "team", "own"];

// Most-permissive wins when two grants overlap.
export const SCOPE_RANK: Record<Scope, number> = {
  own: 0,
  team: 1,
  branch: 2,
  region: 3,
  global: 4,
};

export const SCOPE_LABEL: Record<Scope, string> = {
  global: "Global",
  region: "Region",
  branch: "Branch",
  team: "Team",
  own: "Own",
};

export type FeatureDef = {
  key: string;
  label: string;
  group: string;
  /** Actions that apply to this feature (matrix columns; others render N/A). */
  actions: PermAction[];
};

const CRUDX: PermAction[] = ["view", "add", "update", "delete", "export"];
// Every feature exposes the full action set — all cells are tickable (no N/A).
const CRUD = CRUDX;
const REPORT = CRUDX;

export const FEATURES: FeatureDef[] = [
  // HRMS
  { key: "employee_dashboard", label: "Employee Dashboard", group: "HRMS", actions: CRUDX },
  { key: "employee_folder", label: "Employee Folder", group: "HRMS", actions: CRUDX },
  { key: "staff_directory", label: "Staff Directory", group: "HRMS", actions: REPORT },
  { key: "hr_dashboard", label: "HR Dashboard", group: "HRMS", actions: REPORT },

  // Attendance
  { key: "attendance_overview", label: "Attendance · Overview", group: "Attendance", actions: REPORT },
  { key: "attendance_report", label: "Attendance · Report", group: "Attendance", actions: REPORT },
  { key: "attendance_summary", label: "Attendance · Summary", group: "Attendance", actions: REPORT },
  { key: "attendance_justifications", label: "Attendance · Justifications", group: "Attendance", actions: CRUD },

  // Manpower
  { key: "manpower_plan", label: "Manpower · Plan", group: "Manpower", actions: CRUD },
  { key: "manpower_update", label: "Manpower · Update", group: "Manpower", actions: CRUD },
  { key: "manpower_archive", label: "Manpower · Archive", group: "Manpower", actions: CRUD },
  { key: "manpower_cost", label: "Manpower · Cost Report", group: "Manpower", actions: REPORT },

  // CNS — Lead
  { key: "cns_dashboard", label: "CNS · Lead Dashboard", group: "CNS", actions: REPORT },
  { key: "cns_contacts", label: "CNS · Contacts", group: "CNS", actions: CRUDX },
  { key: "cns_opportunities", label: "CNS · Opportunities", group: "CNS", actions: CRUDX },
  { key: "cns_forms", label: "CNS · Forms", group: "CNS", actions: CRUD },
  { key: "cns_branches", label: "CNS · Branches", group: "CNS", actions: CRUD },
  { key: "cns_region", label: "CNS · Region", group: "CNS", actions: CRUD },
  { key: "cns_automations", label: "CNS · Automations", group: "CNS", actions: CRUD },
  { key: "cns_analytics", label: "CNS · Analytics", group: "CNS", actions: REPORT },
  { key: "cns_integrations", label: "CNS · Integrations", group: "CNS", actions: CRUD },
  // CNS — Ticket
  { key: "cns_ticket_dashboard", label: "CNS · Ticket Dashboard", group: "CNS", actions: REPORT },
  { key: "cns_ticket_opportunities", label: "CNS · Ticket Opportunities", group: "CNS", actions: CRUDX },
  { key: "cns_ticket_my", label: "CNS · My Tickets", group: "CNS", actions: CRUD },
  { key: "cns_ticket_new", label: "CNS · New Ticket", group: "CNS", actions: CRUD },
  { key: "cns_ticket_platforms", label: "CNS · Ticket Platforms", group: "CNS", actions: CRUD },

  // FA System
  { key: "fa_dashboard", label: "FA · Dashboard", group: "FA System", actions: REPORT },
  { key: "fa_events", label: "FA · Events", group: "FA System", actions: CRUDX },
  { key: "fa_inventory", label: "FA · Inventory", group: "FA System", actions: CRUDX },
  { key: "fa_student_list", label: "FA · Student List", group: "FA System", actions: CRUDX },
  { key: "fa_reports", label: "FA · Reports", group: "FA System", actions: REPORT },
  { key: "fa_attendance", label: "FA · Attendance", group: "FA System", actions: CRUD },

  // PCM System
  { key: "pcm_dashboard", label: "PCM · Dashboard", group: "PCM System", actions: REPORT },
  { key: "pcm_events", label: "PCM · Events", group: "PCM System", actions: CRUDX },
  { key: "pcm_student_list", label: "PCM · Student List", group: "PCM System", actions: CRUDX },
  { key: "pcm_invitations", label: "PCM · Invitations", group: "PCM System", actions: CRUD },
  { key: "pcm_reports", label: "PCM · Reports", group: "PCM System", actions: REPORT },
  { key: "pcm_attendance", label: "PCM · Attendance", group: "PCM System", actions: CRUD },

  // SMS
  { key: "sms_student", label: "SMS · Student", group: "SMS", actions: CRUDX },
  { key: "sms_package", label: "SMS · Package", group: "SMS", actions: CRUD },
  { key: "sms_age_group", label: "SMS · Age Group", group: "SMS", actions: CRUD },

  // Self-service
  { key: "claim", label: "Claims", group: "Self-service", actions: CRUD },
  { key: "leave", label: "Leave", group: "Self-service", actions: CRUD },

  // Flowghan (embedded workflow / process tracker — apps/doomtracker)
  { key: "flowghan", label: "Flowghan", group: "Flowghan", actions: CRUDX },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);

export function featureApplies(featureKey: string, action: PermAction): boolean {
  return FEATURES.find((f) => f.key === featureKey)?.actions.includes(action) ?? false;
}

// Superadmin-only ceiling — hardcoded, enforced before any role grant, never
// editable from the UI. (None yet for the coarse feature set; add as needed.)
export const ACTION_CEILINGS: ReadonlySet<string> = new Set<string>();

export function isCeilingLocked(featureKey: string, action: PermAction): boolean {
  return ACTION_CEILINGS.has(`${featureKey}.${action}`);
}

/**
 * The sub-type key that discriminates a role's permissions:
 *   department role → department_code (MKT/FNC/…)
 *   staff role      → position (FT COACH/…)
 *   everything else → "" (whole role)
 */
export function subtypeFor(
  roleType: string,
  departmentCode: string | null,
  position: string | null,
): string {
  const r = roleType.toLowerCase();
  if (r === "department") return (departmentCode ?? "").toUpperCase();
  if (r === "staff") return (position ?? "").trim().toUpperCase();
  return "";
}
