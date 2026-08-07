import "server-only";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
const STAFF_ROLE_TYPE = "staff";

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

  if (me.is_full_access || FULL_ACCESS_ROLE_TYPES.has(me.role.role_type.toLowerCase())) {
    return { fullAccess: true, ownUserId: null, departmentCode: null, branchCode: null };
  }

  if (me.role.role_type.toLowerCase() === STAFF_ROLE_TYPE) {
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
