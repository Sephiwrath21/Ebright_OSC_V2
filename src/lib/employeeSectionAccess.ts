import "server-only";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FINANCE_EMAIL } from "@/app/claim/roles";
import {
  applySelfViewRestriction,
  applyHrViewingOtherRestriction,
  applyFinanceRestriction,
  applyHodTierRestriction,
  applyCeoRestriction,
} from "@/lib/employeeVisibleSections";

// ─── Role-based section-visibility resolution (2026-09-08, see conversation) ───
//
// A separate, self-contained resolver (own DB lookups, own role
// classification) rather than reusing employeeScope.ts's EmployeeScope —
// same precedent as pendingOverdueTasksAccess.ts's own resolver, whose
// comment explains why: that module's row-level rules don't line up
// one-to-one with what a DIFFERENT feature needs, and coupling them risks a
// change meant for one feature silently changing the other. Row-level
// access (can this viewer reach this employee's record at ALL) stays
// entirely employeeScope.ts's job, unchanged by this file — this only
// decides, for a viewer who already passed that gate, which sections of the
// page they see.
const FULL_ACCESS_ROLE_TYPES = new Set(["hr", "superadmin"]);
const CEO_ROLE_TYPE = "ceo";
// role_type "user": self-only row scope already makes any restriction here
// moot (they can never reach anyone else's record to begin with).
// role_type "regional manager": no real account currently has this
// role_type (confirmed via a live DB check, 2026-09-08), and there's no
// "region" concept anywhere in the schema — employeeScope.ts's own row-level
// scope for it is just the generic department/branch-code fallback, same as
// HOD. Left unrestricted here deliberately, per explicit instruction to wait
// for a decision rather than default it to HOD's tier like every other
// unlisted role_type below.
const NO_RESTRICTION_ROLE_TYPES = new Set(["user", "regional manager"]);

/** Narrows an already stage-filtered visibleSectionKeys map for the CURRENT
 *  session's viewer, based on their relationship to `subjectUserId` (self,
 *  Finance, CEO, HR/Superadmin, or everyone else). Returns `stageMap`
 *  unchanged if there's no session (callers already gate on auth() before
 *  reaching here, same convention as getCurrentEmployeeScope). */
export async function resolveEmployeeSectionRestriction(
  stageMap: Record<string, string[]>,
  subjectUserId: number,
): Promise<Record<string, string[]>> {
  const session = await auth();
  if (!session?.user?.email) return stageMap;

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { user_id: true, is_full_access: true, role: { select: { role_type: true } } },
  });
  if (!me) return stageMap;

  // Self-view REPLACES every role-specific rule below, for every role —
  // checked first, unconditionally.
  if (me.user_id === subjectUserId) return applySelfViewRestriction(stageMap);

  const email = session.user.email.trim().toLowerCase();
  if (email === FINANCE_EMAIL.trim().toLowerCase()) return applyFinanceRestriction(stageMap);

  const roleType = me.role.role_type.toLowerCase();
  if (roleType === CEO_ROLE_TYPE) return applyCeoRestriction(stageMap);

  if (me.is_full_access || FULL_ACCESS_ROLE_TYPES.has(roleType)) {
    const subject = await prisma.users.findUnique({
      where: { user_id: subjectUserId },
      select: { role: { select: { role_type: true } } },
    });
    const subjectRoleType = subject?.role?.role_type?.toLowerCase();
    return applyHrViewingOtherRestriction(stageMap, subjectRoleType === "hr" || subjectRoleType === "superadmin");
  }

  if (NO_RESTRICTION_ROLE_TYPES.has(roleType)) return stageMap;

  // HOD, "od", a real Branch Manager (role_type "staff", position "BM" —
  // same fact employeeScope.ts's own BM carve-out and
  // pendingOverdueTasksAccess.ts's isRealBm rely on), generic branch/
  // department logins other than Finance, "admin", and any other/future
  // role_type not named above — all default to HOD's restriction tier
  // (2026-09-08, see conversation — explicit decision: unlisted roles get
  // HOD's tier, not full visibility). Row-level scope in employeeScope.ts
  // already prevents a plain rank-and-file "staff" account from reaching
  // anyone else's record at all, so this default is never actually reached
  // by one in practice — still the correct fallback if that ever changed.
  return applyHodTierRestriction(stageMap);
}
