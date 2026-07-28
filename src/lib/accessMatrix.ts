// ─────────────────────────────────────────────────────────────
// Access-control matrix registry
//
// This is the CLIENT-SIDE feature taxonomy + applicable-action map +
// superadmin-only ceilings for the Access Management UI.
//
// IMPORTANT (per the RBAC spec, Part 3):
//   - Regular grants (allowed / not-allowed) are ROLE-LEVEL, editable data.
//     They are NOT in this file — they live per-role (future `role_permissions`).
//   - The superadmin-only "ceiling" is a HARDCODED system rule. It lives here
//     (and must be mirrored in the server authorization layer when built). It is
//     never stored as a role-permission row and is never editable from the UI.
//
// The module/feature taxonomy is derived from the real sidebar nav
// (src/app/components/Sidebar.tsx) and real routes. Per-feature applicable
// actions are grounded in the manpower API routes; for other modules they are
// reasonable defaults and SHOULD be confirmed with each module's owner before
// this drives real enforcement. Ceilings beyond manpower are intentionally empty
// until specified.
// ─────────────────────────────────────────────────────────────

export type PermAction =
  | "view"
  | "add"
  | "update"
  | "delete"
  | "export"
  | "import";

/** Fixed global columns. `import` is only rendered for modules that need it. */
export const ACTION_COLUMNS: { key: PermAction; label: string }[] = [
  { key: "view", label: "View" },
  { key: "add", label: "Add" },
  { key: "update", label: "Update" },
  { key: "delete", label: "Delete" },
  { key: "export", label: "Export" },
];

export type FeatureDef = {
  /** Stable dotted key, e.g. "manpower.update". Shared with future overrides table. */
  key: string;
  label: string;
  /** Actions that genuinely apply to this feature. Anything else renders as N/A. */
  applies: PermAction[];
};

export type ModuleDef = {
  key: string;
  label: string;
  features: FeatureDef[];
};

// action-set shorthands
const VIEW: PermAction[] = ["view"];
const RO: PermAction[] = ["view", "export"]; // read + export
const MANAGE: PermAction[] = ["view", "add", "update", "delete"];
const MANAGE_X: PermAction[] = ["view", "add", "update", "delete", "export"];
const SETTINGS: PermAction[] = ["view", "update"];

export const MODULES: ModuleDef[] = [
  {
    key: "manpower",
    label: "Manpower Planning",
    features: [
      { key: "manpower.dashboard", label: "Manpower Dashboard", applies: VIEW },
      { key: "manpower.plan", label: "Plan New Week", applies: ["view", "add", "update"] },
      // Delete on "Update Week" is superadmin-only — see ACTION_CEILINGS below.
      { key: "manpower.update", label: "Update Week", applies: ["view", "update", "delete"] },
      { key: "manpower.archive", label: "Archive Week", applies: ["view", "update", "export"] },
      { key: "manpower.settings", label: "Schedule Settings", applies: ["view", "add", "update"] },
    ],
  },
  {
    key: "hrms",
    label: "HRMS",
    features: [
      { key: "hrms.overview", label: "Overview", applies: RO },
      { key: "hrms.employees", label: "Employee Dashboard", applies: MANAGE_X },
      { key: "hrms.claims", label: "Claims", applies: MANAGE_X },
      { key: "hrms.attendance", label: "Attendance · Overview", applies: RO },
      { key: "hrms.attendance_leave", label: "Attendance · Leave", applies: MANAGE },
      { key: "hrms.attendance_report", label: "Attendance · Report", applies: RO },
      { key: "hrms.attendance_summary", label: "Attendance · Summary", applies: RO },
      { key: "hrms.hr_dashboard", label: "HR Dashboard", applies: RO },
      { key: "hrms.cost_report", label: "Manpower Cost Report", applies: RO },
      { key: "hrms.staff_directory", label: "Staff Directory", applies: RO },
    ],
  },
  {
    key: "cns",
    label: "CNS",
    features: [
      { key: "cns.lead_dashboard", label: "Lead · Dashboard", applies: RO },
      { key: "cns.contacts", label: "Lead · Contacts", applies: MANAGE_X },
      { key: "cns.opportunities", label: "Lead · Opportunities", applies: MANAGE_X },
      { key: "cns.forms", label: "Lead · Forms", applies: MANAGE },
      { key: "cns.branches", label: "Lead · Branches", applies: SETTINGS },
      { key: "cns.region", label: "Lead · Region", applies: SETTINGS },
      { key: "cns.automations", label: "Lead · Automations", applies: MANAGE },
      { key: "cns.analytics", label: "Lead · Analytics", applies: RO },
      { key: "cns.integrations", label: "Lead · Integrations", applies: SETTINGS },
      { key: "cns.ticket_dashboard", label: "Ticket · Dashboard", applies: RO },
      { key: "cns.ticket_opportunities", label: "Ticket · Opportunities", applies: MANAGE },
      { key: "cns.my_tickets", label: "Ticket · My Tickets", applies: ["view", "add", "update"] },
      { key: "cns.new_ticket", label: "Ticket · New Ticket", applies: ["view", "add"] },
      { key: "cns.platforms", label: "Ticket · Platforms", applies: SETTINGS },
    ],
  },
  {
    key: "sms",
    label: "SMS",
    features: [
      { key: "sms.student", label: "Student", applies: MANAGE_X },
      { key: "sms.package", label: "Package", applies: MANAGE },
      { key: "sms.age_group", label: "Age Group", applies: MANAGE },
    ],
  },
  {
    key: "fa",
    label: "FA System",
    features: [
      { key: "fa.dashboard", label: "Dashboard", applies: RO },
      { key: "fa.events", label: "Events", applies: MANAGE },
      { key: "fa.inventory", label: "Inventory", applies: MANAGE },
      { key: "fa.student_list", label: "Student List", applies: RO },
      { key: "fa.reports", label: "Reports", applies: RO },
      { key: "fa.attendance", label: "Attendance", applies: ["view", "update", "export"] },
    ],
  },
  {
    key: "pcm",
    label: "PCM System",
    features: [
      { key: "pcm.dashboard", label: "Dashboard", applies: RO },
      { key: "pcm.events", label: "Events", applies: MANAGE },
      { key: "pcm.student_list", label: "Student List", applies: RO },
      { key: "pcm.invitations", label: "Invitations", applies: MANAGE },
      { key: "pcm.reports", label: "Reports", applies: RO },
      { key: "pcm.attendance", label: "Attendance", applies: ["view", "update", "export"] },
    ],
  },
  {
    key: "task_manager",
    label: "Task Manager",
    features: [
      { key: "task.board", label: "Task Board", applies: MANAGE },
      { key: "task.manpower_schedule", label: "Manpower Schedule", applies: SETTINGS },
      { key: "task.department_overview", label: "Department Overview", applies: RO },
    ],
  },
  {
    key: "academy",
    label: "Academy",
    features: [{ key: "academy.home", label: "Academy", applies: VIEW }],
  },
  {
    key: "account",
    label: "Account & Access",
    features: [
      { key: "account.accounts", label: "User Accounts", applies: MANAGE },
      { key: "account.access", label: "Access Management", applies: SETTINGS },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// Superadmin-only ceilings — hardcoded system rule.
// Keyed `${featureKey}.${action}`. NOT part of role-permission data.
// The server authorization layer must check this FIRST, before role grants.
// ─────────────────────────────────────────────────────────────
export const ACTION_CEILINGS: ReadonlySet<string> = new Set<string>([
  "manpower.update.delete",
  // "manpower.planning.delete" from the spec is expressed here as the concrete
  // feature that owns delete within the manpower module (Update Week). The
  // module ("planning") parent then rolls up to locked automatically.
]);

export function isCeilingLocked(featureKey: string, action: PermAction): boolean {
  return ACTION_CEILINGS.has(`${featureKey}.${action}`);
}
