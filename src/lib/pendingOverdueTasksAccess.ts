import "server-only";
import { prisma } from "@/lib/prisma";
import { FINANCE_EMAIL } from "@/app/claim/roles";

// ─── Access/scope for the "Pending & Overdue Tasks Overview" page
// (2026-08-27, see conversation) ───
//
// Deliberately its OWN resolver, not a reuse of employeeScope.ts's
// EmployeeScope — that module's existing rule sends every role_type
// "staff" account (including a REAL Branch Manager employee, see below)
// into a self-only ownUserId scope, which is correct everywhere else
// EmployeeScope is used but wrong for this specific page's spec (CEO/
// Finance/HOD/BM see company-wide/branch-wide/department-wide data; plain
// staff see nothing at all). Extending the shared EmployeeScope type to
// carry this page's one-off BM exception would leak a narrow concern into
// a broadly-reused module, so this stays separate.
export type TaskOverviewAccess =
  | { kind: "full" }
  | { kind: "department"; departmentCode: string }
  | { kind: "branch"; branchCode: string }
  | { kind: "denied" };

// "superadmin" deliberately EXCLUDED here (2026-08-27, see conversation —
// explicit correction of an earlier version of this file, which included it
// alongside "hr"/"ceo" on the assumption that full view access everywhere
// else in this app — see employeeScope.ts's own FULL_ACCESS_ROLE_TYPES —
// should carry over here too). Confirmed via a real DB query: the real
// Super Admin account (od@ebright.my) has is_full_access=false and an
// active employment row in the Optimisation Department — its full access
// on every OTHER page came ENTIRELY from role_type "superadmin" being in
// this set, not from is_full_access. On THIS page specifically, Super Admin
// must be scoped exactly like a regular HOD (see the "hod" branch below,
// which "superadmin" now shares) — full stop, per explicit instruction.
// "hr" stays here (still full access) — that's still real: hr@ebright.my's
// own is_full_access=true independently grants it "full" a few lines down
// regardless of whether "hr" is even in this Set (confirmed via the same DB
// query — hr@ebright.my's role_type is actually "department", not "hr" at
// all, per employeeQueries.ts's own comment on this account, so "hr" in
// this Set is pure defensive future-proofing, never live-hit today). This
// file has NOT been told to change HR's own access — flagging that
// distinction explicitly rather than silently touching it, since the
// instruction that prompted this edit was scoped to Super Admin only.
const FULL_ACCESS_ROLE_TYPES = new Set(["hr", "ceo"]);

// Real individual Branch Manager employees have role_type "staff" — the
// exact same role_type as any rank-and-file employee — distinguished only
// by employment.position === "BM" (see
// docs/superpowers/plans/2026-08-13-task-manager-hrfs-exclusive-bootstrap.md).
// role_type "branch" is a DIFFERENT thing: a generic shared per-branch login
// account, not a real employee — it gets the same branch-wide access here
// for the same reason employeeScope.ts's own catch-all bucket already would.
const BM_POSITION = "BM";

// Explicit position-based exclusion (2026-08-27, see conversation) — checked
// BEFORE role_type resolution, unconditionally, regardless of what role_type
// this account otherwise has: a position in this set means no access at all.
// This is intentionally a hard-coded exact-match list, not a fuzzy/heuristic
// one — live employment.position data is genuinely messy free text (e.g.
// "Coach / Executive", "PT Coach", "MARKETING INTERN", "Excecutive" [sic],
// "Facilitator", dozens of one-off variants — confirmed via a real DB query,
// see conversation), and every one of those variants already resolves to
// "denied" anyway via the role_type "staff" catch-all a few lines down (none
// of them are CEO/HOD/a real BM/a generic branch login), so this exact list
// only matters as a defensive backstop for a role_type OTHER than "staff"
// that might carry one of these exact position values — guessing at further
// fuzzy matches here risks silently denying/granting access based on a
// typo or phrasing variant rather than a real, deliberate decision.
const EXCLUDED_POSITIONS = new Set(["INTERN", "PT COACH", "FT COACH", "FT EXEC", "PROTEGE INTERN"]);

export async function resolveTaskOverviewAccess(email: string): Promise<TaskOverviewAccess> {
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
  if (!me) return { kind: "denied" };

  const emp = me.employment[0];
  const position = (emp?.position ?? "").trim().toUpperCase();
  if (EXCLUDED_POSITIONS.has(position)) return { kind: "denied" };

  const roleType = me.role.role_type.toLowerCase();
  if (me.is_full_access || FULL_ACCESS_ROLE_TYPES.has(roleType) || email.trim().toLowerCase() === FINANCE_EMAIL) {
    return { kind: "full" };
  }

  const isRealBm = roleType === "staff" && position === BM_POSITION;
  const isGenericBranchLogin = roleType === "branch";
  if (isRealBm || isGenericBranchLogin) {
    const branchCode = emp?.branch?.branch_code ?? null;
    return branchCode ? { kind: "branch", branchCode } : { kind: "denied" };
  }

  // Every other role_type "staff" account (a real, non-BM employee) — no
  // access at all, per explicit decision. Checked before the "hod" branch
  // below so a "staff" row can never accidentally fall through to it.
  if (roleType === "staff") return { kind: "denied" };

  // "superadmin" deliberately shares this branch with "hod" (2026-08-27,
  // see conversation) — an explicit, intentional rule for THIS page only,
  // not a coincidence of the generic "hod" check happening to also catch
  // it: Super Admin gets scoped to their own department exactly like any
  // other HOD, never full access, regardless of what role_type
  // "superadmin" means on every other page in this app.
  if (roleType === "hod" || roleType === "superadmin") {
    const departmentCode = emp?.department?.department_code ?? null;
    return departmentCode ? { kind: "department", departmentCode } : { kind: "denied" };
  }

  // Every other role_type (department, regional manager, etc.) isn't named
  // in the spec (CEO/Finance/HOD/BM only) — denied by default, fail closed,
  // same convention employeeScope.ts already follows.
  return { kind: "denied" };
}
