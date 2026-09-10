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
// page they see (and, as of 2026-09-09, whether they can write at all).
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

// The one role-classification cascade every section/write decision in this
// file is built on (2026-09-09, see conversation — extracted so
// resolveEmployeeSectionRestriction's VIEW decision and
// isHodTierViewingSomeoneElse's WRITE decision can never drift apart by
// each re-deriving "what tier is this viewer" slightly differently).
// Self-check always runs first and short-circuits everything below it,
// for every role including HR/CEO — matches applySelfViewRestriction's own
// "replaces, does not stack with, the role-specific rules" contract.
type ViewerRelationship =
  | { kind: "unauthenticated" }
  | { kind: "self" }
  | { kind: "finance" }
  | { kind: "ceo" }
  | { kind: "hr"; subjectIsHr: boolean }
  | { kind: "no-restriction" }
  | { kind: "hod-tier" };

async function classifyViewerRelationship(subjectUserId: number): Promise<ViewerRelationship> {
  const session = await auth();
  if (!session?.user?.email) return { kind: "unauthenticated" };

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { user_id: true, is_full_access: true, role: { select: { role_type: true } } },
  });
  if (!me) return { kind: "unauthenticated" };

  if (me.user_id === subjectUserId) return { kind: "self" };

  const email = session.user.email.trim().toLowerCase();
  if (email === FINANCE_EMAIL.trim().toLowerCase()) return { kind: "finance" };

  const roleType = me.role.role_type.toLowerCase();
  if (roleType === CEO_ROLE_TYPE) return { kind: "ceo" };

  if (me.is_full_access || FULL_ACCESS_ROLE_TYPES.has(roleType)) {
    const subject = await prisma.users.findUnique({
      where: { user_id: subjectUserId },
      select: { role: { select: { role_type: true } } },
    });
    const subjectRoleType = subject?.role?.role_type?.toLowerCase();
    return { kind: "hr", subjectIsHr: subjectRoleType === "hr" || subjectRoleType === "superadmin" };
  }

  if (NO_RESTRICTION_ROLE_TYPES.has(roleType)) return { kind: "no-restriction" };

  // HOD, "od", a real Branch Manager (role_type "staff", position "BM" —
  // same fact employeeScope.ts's own BM carve-out and
  // pendingOverdueTasksAccess.ts's isRealBm rely on), generic branch/
  // department logins other than Finance, "admin", and any other/future
  // role_type not named above — all default to HOD's tier (2026-09-08, see
  // conversation — explicit decision: unlisted roles get HOD's tier, not
  // full visibility). Row-level scope in employeeScope.ts already prevents
  // a plain rank-and-file "staff" account from reaching anyone else's
  // record at all, so this default is never actually reached by one in
  // practice — still the correct fallback if that ever changed.
  return { kind: "hod-tier" };
}

/** Narrows an already stage-filtered visibleSectionKeys map for the CURRENT
 *  session's viewer, based on their relationship to `subjectUserId` (self,
 *  Finance, CEO, HR/Superadmin, or everyone else). Returns `stageMap`
 *  unchanged if there's no session (callers already gate on auth() before
 *  reaching here, same convention as getCurrentEmployeeScope). */
export async function resolveEmployeeSectionRestriction(
  stageMap: Record<string, string[]>,
  subjectUserId: number,
): Promise<Record<string, string[]>> {
  const rel = await classifyViewerRelationship(subjectUserId);
  switch (rel.kind) {
    case "unauthenticated":
      return stageMap;
    case "self":
      return applySelfViewRestriction(stageMap);
    case "finance":
      return applyFinanceRestriction(stageMap);
    case "ceo":
      return applyCeoRestriction(stageMap);
    case "hr":
      return applyHrViewingOtherRestriction(stageMap, rel.subjectIsHr);
    case "no-restriction":
      return stageMap;
    case "hod-tier":
      return applyHodTierRestriction(stageMap);
  }
}

/** Whether the CURRENT session's viewer is allowed to write to the
 *  HR/Superadmin-only sections (Disciplinary, Medical Check, Payroll/Tax
 *  Info, NDA/NC — see employeeRecordActions.ts's 22 requireHrOrSuperadmin()
 *  guards, added 2026-09-08). Same is_full_access-or-role_type definition as
 *  that function (kept in sync deliberately — see its own comment for why
 *  is_full_access matters: the real hr@ebright.my account's role_type is
 *  "department", not "hr"). Used ONLY to decide whether to render the
 *  Edit/Save/+Add controls for those sections at all — the actual write
 *  guard is still requireHrOrSuperadmin() in employeeRecordActions.ts; this
 *  is UI-layer only and grants no write capability by itself. */
export async function isCurrentViewerHrOrSuperadmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.email) return false;
  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { is_full_access: true, role: { select: { role_type: true } } },
  });
  if (!me) return false;
  const roleType = me.role.role_type.toLowerCase();
  return me.is_full_access || FULL_ACCESS_ROLE_TYPES.has(roleType);
}

/** Whether the CURRENT session's viewer is HOD-tier AND is looking at
 *  someone ELSE's record (2026-09-09, see conversation — new feature: HOD/
 *  real Branch Manager/"od"/unlisted-role_type accounts become fully
 *  view-only for every other employee, not just the previously-restricted
 *  sections). Self is excluded here the same way classifyViewerRelationship
 *  excludes it from "hod-tier" in the first place — a HOD/BM viewing their
 *  OWN profile always resolves to "self" and this returns false, leaving
 *  their existing self-edit restrictions (Disciplinary/Medical Check/
 *  Payroll-Tax Info/NDA-NC/Active Employment blocked, everything else
 *  editable) completely untouched. Used by requireEmployeeInScope() in
 *  employeeRecordActions.ts (the one gate every write action already calls)
 *  and by canEditProfile() for the matching UI-side button visibility. */
export async function isHodTierViewingSomeoneElse(subjectUserId: number): Promise<boolean> {
  const rel = await classifyViewerRelationship(subjectUserId);
  return rel.kind === "hod-tier";
}
