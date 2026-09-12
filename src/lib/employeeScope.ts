import "server-only";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FINANCE_EMAIL } from "@/app/claim/roles";

// ─── Employee Overview/Record data-access scope ───
//
// Rule, per explicit decision (see conversation — this REVISES the earlier
// "applies uniformly to every account including staff" version below,
// which turned out to give individual staff logins the same department-wide
// visibility as a shared department/branch account; ordinary staff are now
// carved out into their own ownUserId scope instead):
//   - role_type "hr" or "superadmin", or users.is_full_access = true, sees
//     every employee across every department/branch.
//   - role_type "staff" (an individual employee's own login, not a shared
//     department/branch account) is scoped to ONLY their own record —
//     ownUserId below, ignoring department/branch entirely. hod/Branch
//     Manager/regional manager/department/branch accounts are NOT included
//     in this — they keep the department/branch-wide scope below, since
//     only "staff" was named in the request that introduced this.
//   - EXCEPT a real individual Branch Manager (2026-09-08, see conversation
//     — bug fix): a real BM's role_type is "staff" too, the exact same as
//     any rank-and-file employee — distinguished only by
//     employment.position === "BM" (same fact/same exact-match convention
//     already established in pendingOverdueTasksAccess.ts's own
//     isRealBm check). Before this fix, a real BM fell into the plain
//     "staff" branch above and got self-only scope — unable to see their
//     own branch's team at all, unlike HOD, which DOES get department-wide
//     scope for the analogous real-employee case (the generic fallback
//     branch below already covered "hod" correctly; only "staff" needed
//     this carve-out, since BM is the one role that hides behind "staff").
//     Now: a real BM gets branch-wide scope, same treatment HOD gets for
//     department. A GENERIC shared "branch"-role login (role_type
//     "branch", not tied to one real employee) is unaffected by this
//     change — it was never "staff" and already reaches the same
//     branch-wide outcome via the generic fallback branch below.
//   - EXCEPT finance@ebright.my specifically (2026-09-08, see conversation)
//     — company-wide view scope, by exact email match, not by its role_type
//     ("department", the same role_type plenty of other, non-Finance
//     accounts also carry, none of which get this). Finance needs to run
//     payroll/claims across every department, not just its own — the
//     generic department-code fallback below would otherwise cap it to
//     Finance-department employees only. Section-level narrowing (Payroll/
//     Tax Info/Financial Settlement only, everything else hidden) is a
//     separate concern — see employeeSectionAccess.ts.
//   - every other non-full-access account (branch, department, hod, branch
//     manager, regional manager) is scoped to its own active employment's
//     department; branch is only used as the scoping key when that
//     account's employment has no department set (all departments sit
//     under one HQ branch, so branch alone would be too broad whenever a
//     department is also known).
//   - an account with neither a department nor a branch on its own active
//     employment sees zero employees (fail closed, not fail open).

export interface EmployeeScope {
  fullAccess: boolean;
  /** Set only for an individual "staff"-role login — restricts to exactly
   *  this one user_id, taking precedence over departmentCode/branchCode
   *  below (which stay null whenever this is set). */
  ownUserId: number | null;
  /** Set only when fullAccess is false, ownUserId is null, and this account
   *  has a department on its own active employment — takes precedence over
   *  branchCode below. */
  departmentCode: string | null;
  /** Set only when fullAccess is false, ownUserId is null, and
   *  departmentCode is null. */
  branchCode: string | null;
}

/** Minimal shape any scope-checked row must have — matches the fields
 *  already present on EmployeeOverviewRow/EmployeeDetailFull. id is needed
 *  for the ownUserId (self-only) check. */
export interface ScopableRow {
  id: number;
  departmentCode: string | null;
  branchCode: string | null;
}

const FULL_ACCESS_ROLE_TYPES = new Set(["hr", "superadmin"]);
const CEO_ROLE_TYPE = "ceo";
const STAFF_ROLE_TYPE = "staff";
// Exact-match convention, not fuzzy (2026-09-08, see conversation) — same
// reasoning as pendingOverdueTasksAccess.ts's own BM_POSITION: live
// employment.position data is messy free text, so this only ever matches
// the one clean "BM" value real Branch Manager rows actually carry.
const BM_POSITION = "BM";

/** Resolves the current session's own scope. Returns null if there is no
 *  authenticated session — callers must already be gating on auth() before
 *  reaching any code that needs a scope, same as everywhere else in the app. */
export async function getCurrentEmployeeScope(): Promise<EmployeeScope | null> {
  const session = await auth();
  if (!session?.user?.email) return null;
  return getEmployeeScopeForEmail(session.user.email);
}

export async function getEmployeeScopeForEmail(email: string): Promise<EmployeeScope | null> {
  const me = await prisma.users.findUnique({
    where: { email },
    select: {
      user_id: true,
      is_full_access: true,
      role: { select: { role_type: true } },
      employment: {
        where: { status: "active" },
        include: { department: true, branch: true },
        orderBy: { employment_id: "desc" },
        take: 1,
      },
    },
  });
  if (!me) return null;

  // Finance (2026-09-08, see conversation) — company-wide VIEW scope for
  // finance@ebright.my specifically, by exact email match, NOT a blanket
  // rule for role_type "department" (finance@ebright.my's own role_type):
  // every other "department" account (HR's own included, historically) is
  // still scoped to its own department below. A code-level email check was
  // chosen over flipping users.is_full_access in the database for this
  // account, since the latter would be a real DB write, and this repo's
  // standing rule is no DB writes without explicit one-off permission — an
  // email match here needs none. Row-level access only; section-level
  // narrowing (Payroll/Tax Info/Financial Settlement only) is a separate
  // concern, applied by employeeSectionAccess.ts, not here.
  if (email.trim().toLowerCase() === FINANCE_EMAIL.trim().toLowerCase()) {
    return { fullAccess: true, ownUserId: null, departmentCode: null, branchCode: null };
  }

  if (me.is_full_access || FULL_ACCESS_ROLE_TYPES.has(me.role.role_type.toLowerCase())) {
    return { fullAccess: true, ownUserId: null, departmentCode: null, branchCode: null };
  }

  // CEO gets the same full VIEW scope as HR/Superadmin, per explicit
  // decision (see conversation, 2026-08-11) — sees every employee across
  // every department/branch, not just their own "CEO" department (the
  // pre-existing behavior before this branch existed). Kept separate from
  // FULL_ACCESS_ROLE_TYPES above rather than joining that set, so its name
  // keeps meaning "full access" without implying edit rights: this flag
  // alone grants no write capability — CEO write restriction (own profile
  // only) is enforced independently by requireNotCeoUnlessOwnProfile() in
  // employeeRecordActions.ts, regardless of this scope's fullAccess value.
  if (me.role.role_type.toLowerCase() === CEO_ROLE_TYPE) {
    return { fullAccess: true, ownUserId: null, departmentCode: null, branchCode: null };
  }

  if (me.role.role_type.toLowerCase() === STAFF_ROLE_TYPE) {
    const emp = me.employment[0];
    const isRealBranchManager = (emp?.position ?? "").trim().toUpperCase() === BM_POSITION;
    if (isRealBranchManager && emp?.branch?.branch_code) {
      return { fullAccess: false, ownUserId: null, departmentCode: null, branchCode: emp.branch.branch_code };
    }
    return { fullAccess: false, ownUserId: me.user_id, departmentCode: null, branchCode: null };
  }

  const emp = me.employment[0];
  return {
    fullAccess: false,
    ownUserId: null,
    departmentCode: emp?.department?.department_code ?? null,
    branchCode: emp?.department ? null : emp?.branch?.branch_code ?? null,
  };
}

export function isRowInScope(scope: EmployeeScope, row: ScopableRow): boolean {
  if (scope.fullAccess) return true;
  if (scope.ownUserId != null) return row.id === scope.ownUserId;
  if (scope.departmentCode) return row.departmentCode === scope.departmentCode;
  if (scope.branchCode) return row.branchCode === scope.branchCode;
  return false;
}

export function filterRowsByScope<T extends ScopableRow>(scope: EmployeeScope, rows: T[]): T[] {
  if (scope.fullAccess) return rows;
  return rows.filter((r) => isRowInScope(scope, r));
}
