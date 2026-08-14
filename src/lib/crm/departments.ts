/**
 * Ebright internal departments that receive **directed tickets**.
 *
 * Routing model (matches the existing New-Ticket form): a branch submits under
 * the **"Others"** platform and picks a department; the chosen department is
 * stored as the ticket's `sub_type` (e.g. `finance`, `marketing`). So a
 * department is identified by a ticket **sub_type**, NOT a separate platform.
 *
 * A scoped department account (platform_admin role, no platform link) is then
 * restricted — in the kanban, the ticket list, and status changes — to tickets
 * whose `sub_type` matches its department. Aone / Lead / Process Street /
 * ClickUp tickets stay Super-Admin-only.
 *
 * `subType` values mirror DEPARTMENT_CARDS in components/crm/tickets/TicketForm.tsx.
 */

export interface DepartmentDef {
  /** tkt_ticket.sub_type value for tickets directed to this department. */
  subType: string
  /** Display name. */
  name: string
  /** The account that triages this department's tickets. */
  email: string
  /**
   * Can this department use the lead CRM?
   *
   * Marketing and Optimisation own a branch/pipeline; Operation is an elevated
   * all-branches oversight account (no branch of its own but full lead access).
   * Human Resource, Finance, Academy and CEO are tickets-only — the lead module
   * sends THEM to /crm/no-nexus rather than an empty board.
   */
  hasLeadSystem: boolean
  /**
   * Exact crm_branch.name this department owns, when it has one.
   *
   * These are internal branches, not real centres — they're kept OUT of the
   * topbar's branch list and reached through the Departments row instead, so
   * "all accounts" only ever lists actual branches. null for departments with
   * no CRM branch (Finance, Academy, CEO, Operation): tickets are their only
   * surface.
   */
  branchName: string | null
  /**
   * true  → provisioned as a sub_type-scoped triage admin (sees only its dept).
   * false → stays a global Super Admin (od@ is the owner) and views departments
   *         via the topbar switcher rather than being scoped down.
   */
  scopedAccount: boolean
  /**
   * tkt_branch.branch_number this department files tickets under.
   *
   * Departments share the numbering space with the centres (00-23). "00" (OD)
   * and "28" (HR) already existed; the rest were added. A ticket identifies its
   * submitter by branch, so a department with no tkt_branch row cannot raise
   * one at all — which is exactly why Marketing's tickets used to land on OD.
   */
  tktBranchNumber: string
  /** tkt_branch.code — unique per tenant. */
  tktCode: string
}

export const DEPARTMENTS: readonly DepartmentDef[] = [
  { subType: 'marketing',      name: 'Marketing',      email: 'marketing@ebright.my', hasLeadSystem: true,  scopedAccount: true,  branchName: 'Ebright Marketing', tktBranchNumber: '24', tktCode: 'MKT'  },
  { subType: 'operation',      name: 'Operation',      email: 'operation@ebright.my', hasLeadSystem: true,  scopedAccount: true,  branchName: null,                tktBranchNumber: '25', tktCode: 'OPS'  },
  { subType: 'optimisation',   name: 'Optimisation',   email: 'od@ebright.my',        hasLeadSystem: true,  scopedAccount: false, branchName: '00 Ebright (OD)',   tktBranchNumber: '00', tktCode: 'OD'   },
  { subType: 'human_resource', name: 'Human Resource', email: 'hr@gmail.com',         hasLeadSystem: false, scopedAccount: true,  branchName: 'Ebright HR',        tktBranchNumber: '28', tktCode: 'HR'   },
  { subType: 'finance',        name: 'Finance',        email: 'finance@ebright.my',   hasLeadSystem: false, scopedAccount: true,  branchName: null,                tktBranchNumber: '26', tktCode: 'FIN'  },
  { subType: 'academy',        name: 'Academy',        email: 'academy@gmail.com',    hasLeadSystem: false, scopedAccount: true,  branchName: null,                tktBranchNumber: '27', tktCode: 'ACAD' },
  { subType: 'ceo',            name: 'CEO',            email: 'kevinkhoo@ebright.my', hasLeadSystem: false, scopedAccount: true,  branchName: null,                tktBranchNumber: '29', tktCode: 'CEO'  },
] as const

/**
 * crm_branch names owned by a department. These are filtered out of every
 * "all accounts" branch list — they're reached via the Departments row so the
 * branch list stays a list of real centres.
 */
export const DEPARTMENT_BRANCH_NAMES: ReadonlySet<string> = new Set(
  DEPARTMENTS.map((d) => d.branchName).filter((n): n is string => !!n),
)

/**
 * tkt_branch.branch_number values that belong to a DEPARTMENT (incl. OD "00"),
 * not a real centre. Used to tell a "branch account" (files against a real
 * centre → may raise any platform ticket) apart from a department / HQ account
 * (may only raise internal "Others → department" tickets).
 */
export const DEPARTMENT_TKT_BRANCH_NUMBERS: ReadonlySet<string> = new Set(
  DEPARTMENTS.map((d) => d.tktBranchNumber),
)

/** True when a ticket branch_number is a department/HQ branch, not a centre. */
export function isDepartmentTktBranchNumber(branchNumber: string | null | undefined): boolean {
  return !!branchNumber && DEPARTMENT_TKT_BRANCH_NUMBERS.has(branchNumber)
}

/** True when a branch belongs to a department rather than being a real centre. */
export function isDepartmentBranch(branchName: string | null | undefined): boolean {
  return !!branchName && DEPARTMENT_BRANCH_NAMES.has(branchName.trim())
}

/** The department that owns this branch name, or null. */
export function departmentForBranchName(branchName: string | null | undefined): DepartmentDef | null {
  if (!branchName) return null
  const n = branchName.trim()
  return DEPARTMENTS.find((d) => d.branchName === n) ?? null
}

const byEmail = (email: string | null | undefined) =>
  email ? DEPARTMENTS.find((d) => d.email.toLowerCase() === email.toLowerCase()) ?? null : null

/** Any of the 7 departments matching this email (incl. the owner od@). */
export function departmentForEmail(email: string | null | undefined): DepartmentDef | null {
  return byEmail(email)
}

/** Only the sub_type-SCOPED department accounts (excludes the owner od@). */
export function scopedDepartmentForEmail(email: string | null | undefined): DepartmentDef | null {
  const d = byEmail(email)
  return d && d.scopedAccount ? d : null
}

/** The sub_type a scoped account triages, or null. Drives ticket scoping. */
export function departmentSubTypeForEmail(email: string | null | undefined): string | null {
  return scopedDepartmentForEmail(email)?.subType ?? null
}

/** Department subType → display name (for labelling the triage board). */
export function departmentNameForSubType(subType: string | null | undefined): string | null {
  if (!subType) return null
  return DEPARTMENTS.find((d) => d.subType === subType)?.name ?? null
}

/** The department definition for a ticket sub_type, or null. */
export function departmentForSubType(subType: string | null | undefined): DepartmentDef | null {
  if (!subType) return null
  return DEPARTMENTS.find((d) => d.subType === subType) ?? null
}
