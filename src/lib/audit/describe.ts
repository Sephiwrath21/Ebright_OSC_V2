// ─────────────────────────────────────────────────────────────
// Audit log — the human-readable one-liner stored in `audit_log.summary`.
//
// Pure string building, kept out of the extension so it can be tested without
// a database (see describe.test.ts) and tweaked without touching capture.
// ─────────────────────────────────────────────────────────────

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "LOGIN_FAILED"
  | "EXPORT"
  | "DOWNLOAD";

/** Every action the audit log can record — drives the UI's action filter. */
export const AUDIT_ACTIONS: AuditAction[] = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
  "LOGIN_FAILED",
  "EXPORT",
  "DOWNLOAD",
];

const ACTION_VERB: Record<string, string> = {
  CREATE: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  LOGIN: "Logged in",
  LOGOUT: "Logged out",
  LOGIN_FAILED: "Failed login",
  EXPORT: "Exported",
  DOWNLOAD: "Downloaded",
};

/**
 * Friendly names for the Prisma models a person actually edits. Anything not
 * listed falls back to the de-underscored model name, so a new table is
 * readable in the log from day one without a code change here.
 */
const ENTITY_LABEL: Record<string, string> = {
  users: "user account",
  user_profile: "employee profile",
  role: "role",
  role_permission: "permission",
  employment: "employment record",
  employment_schedule_version: "work schedule",
  branch: "branch",
  department: "department",
  attendance: "attendance record",
  attendance_justification: "attendance justification",
  leave_request: "leave request",
  leave_types: "leave type",
  claim: "claim",
  payroll: "payroll record",
  payslip: "payslip",
  salary_revision: "salary revision",
  employee_rate_history: "pay rate",
  bank_details: "bank details",
  payment_info: "payment info",
  promotion: "promotion",
  transfer: "transfer",
  training: "training record",
  achievement: "achievement",
  probation: "probation record",
  performance_review: "performance review",
  pip: "performance improvement plan",
  suspension_letter: "suspension letter",
  showcause_warning_letter: "show-cause / warning letter",
  domestic_inquiry: "domestic inquiry",
  resignation: "resignation",
  reference_letter: "reference letter",
  exit_interview_note: "exit interview note",
  offboarding_case: "offboarding case",
  offboarding_checklist_item: "offboarding checklist item",
  induction_profile: "induction profile",
  induction_step: "induction step",
  induction_request: "induction request",
  onboarding_candidate: "onboarding candidate",
  announcement: "announcement",
  manpower_schedule: "manpower schedule",
  manpower_schedule_attendance: "manpower attendance",
  manpower_cost_report: "manpower cost report",
  branch_position: "branch position",
  branch_operating_day: "branch operating day",
  workflow_template: "workflow template",
  workflow_assignment: "workflow assignment",
  emergency_contact: "emergency contact",
  guardian_info: "guardian info",
  documents: "document",
  resume: "resume",
  nda: "NDA",
  non_compete: "non-compete agreement",
  medical_check: "medical check",
  reference_check: "reference check",
  interview_assessment: "interview assessment",
  department_chat_message: "department message",
  password_reset_token: "password reset token",
  audit_log: "audit entry",
};

export function entityLabel(entity: string): string {
  return ENTITY_LABEL[entity] ?? entity.replace(/_/g, " ");
}

/** "3 leave requests" / "1 leave request" */
function pluralise(label: string, count: number): string {
  if (count === 1) return label;
  // Only the head noun pluralises: "manpower cost report" → "manpower cost reports".
  return `${label}s`;
}

export type DescribeInput = {
  action: AuditAction | string;
  entity: string;
  entityId?: string | null;
  /** Field names that changed — appended in parentheses on UPDATE. */
  changed?: string[];
  /** Rows affected; >1 only for updateMany/deleteMany/createMany. */
  rowCount?: number;
  /** Free-form detail for the non-DB actions (EXPORT/LOGIN/...). */
  detail?: string | null;
};

const MAX_LISTED_FIELDS = 6;

/**
 * Build the sentence shown in the audit table's "What happened" column.
 *
 *   "Updated leave request #412 (status, approved_by)"
 *   "Deleted 3 attendance records"
 *   "Exported claims to CSV"
 */
export function describeAudit(input: DescribeInput): string {
  const { action, entity, entityId, changed, rowCount = 1, detail } = input;
  const verb = ACTION_VERB[action] ?? action;

  // Non-row actions carry their own wording; the entity is the context.
  if (action === "LOGIN" || action === "LOGOUT" || action === "LOGIN_FAILED") {
    return detail ? `${verb} (${detail})` : verb;
  }
  if (action === "EXPORT" || action === "DOWNLOAD") {
    return detail ? `${verb} ${detail}` : `${verb} ${entityLabel(entity)}`;
  }

  const label = entityLabel(entity);

  if (rowCount > 1) {
    return `${verb} ${rowCount} ${pluralise(label, rowCount)}`;
  }

  const target = entityId ? `${label} #${entityId}` : label;

  if (action === "UPDATE" && changed?.length) {
    const shown = changed.slice(0, MAX_LISTED_FIELDS).join(", ");
    const extra = changed.length - MAX_LISTED_FIELDS;
    const fields = extra > 0 ? `${shown} +${extra} more` : shown;
    return `${verb} ${target} (${fields})`;
  }

  return `${verb} ${target}`;
}
