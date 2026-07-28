import "server-only";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// ─── Employee Overview/Record data-access scope ───
//
// Rule (as confirmed by the user, deliberately NOT keyed on role_type/title
// beyond the hr/superadmin full-access check below):
//   - role_type "hr" or "superadmin", or users.is_full_access = true, sees
//     every employee across every department/branch.
//   - every other account is scoped to its own active employment's
//     department; branch is only used as the scoping key when that
//     account's employment has no department set (all departments sit
//     under one HQ branch, so branch alone would be too broad whenever a
//     department is also known).
//   - an account with neither a department nor a branch on its own active
//     employment sees zero employees (fail closed, not fail open).
// Applies uniformly to every account, including ordinary staff logins —
// not just the dedicated department/branch shared accounts.

export interface EmployeeScope {
  fullAccess: boolean;
  /** Set only when fullAccess is false and this account has a department on
   *  its own active employment — takes precedence over branchCode below. */
  departmentCode: string | null;
  /** Set only when fullAccess is false and departmentCode is null. */
  branchCode: string | null;
}

/** Minimal shape any scope-checked row must have — matches the fields
 *  already present on EmployeeOverviewRow/EmployeeDetailFull. */
export interface ScopableRow {
  departmentCode: string | null;
  branchCode: string | null;
}

const FULL_ACCESS_ROLE_TYPES = new Set(["hr", "superadmin"]);

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
    return { fullAccess: true, departmentCode: null, branchCode: null };
  }

  const emp = me.employment[0];
  return {
    fullAccess: false,
    departmentCode: emp?.department?.department_code ?? null,
    branchCode: emp?.department ? null : emp?.branch?.branch_code ?? null,
  };
}

export function isRowInScope(scope: EmployeeScope, row: ScopableRow): boolean {
  if (scope.fullAccess) return true;
  if (scope.departmentCode) return row.departmentCode === scope.departmentCode;
  if (scope.branchCode) return row.branchCode === scope.branchCode;
  return false;
}

export function filterRowsByScope<T extends ScopableRow>(scope: EmployeeScope, rows: T[]): T[] {
  if (scope.fullAccess) return rows;
  return rows.filter((r) => isRowInScope(scope, r));
}
