// Pure mapping config + mapper for the HRFS-driven bootstrap (bootstrap.ts).
// NO db access, NO side effects — safe to import from a unit test. Everything
// here only ever touches its own module-level config objects and the
// argument passed to mapHrfsUser().
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS (see docs/superpowers/plans/2026-07-23-task-manager-native-
// merge.md, Task 19): Task Manager originally planned a hand-maintained
// roster.csv. The user redirected: real staff already live in the
// `ebright_hrfs` database's `User` table, on the SAME Postgres server as
// TASK_MANAGER_DATABASE_URL. That table has no `department` column, no
// CEO/OPS role values, and no site-login accounts — and its `role` column
// mixes what OUR schema splits into role/employmentType/department. This
// file is the checked-in translation from "whatever HRFS happens to store"
// to our Role/employmentType/department/branch/coachSchedule vocabulary
// (prisma/task-manager/schema.prisma's Role enum + the BRANCH_STAFF_ROLES /
// DEPARTMENT_EMPLOYMENT_TYPES / FLOW_BRANCH_REGIONS reference data).
//
// DATA PROVENANCE: ROLE_MAP's 14 keys and BRANCH_MAP's short codes were
// derived against a live, read-only query of ebright_hrfs.User run on
// 2026-07-24 (183 ACTIVE rows; see the per-key comments below). Real staff
// data changes over time — if a future bootstrap run reports "unknown HRFS
// role" or "unresolved branch code" for something not covered here, that's
// this file falling behind reality, not a bug; extend ROLE_MAP/BRANCH_MAP
// (shared, systemic fixes) or add a targeted OVERRIDES entry (per-person
// fixes) as appropriate — see the guidance below each map.
//
// A DELIBERATE ASYMMETRY (matches the task spec exactly): branch-resolution
// failures are NEVER rescued by OVERRIDES — a role that requires a branch and
// gets an unresolved branchName is skipped immediately, full stop. The fix
// for an unresolved branch CODE belongs in BRANCH_MAP (it's a systemic
// mapping concern — one fix helps everyone who carries that code). HOD's
// missing-department check, by contrast, runs AFTER OVERRIDES are applied,
// because department assignment is inherently a per-person concern HRFS
// cannot supply at all (there's no department column to normalize from).
import {
  FLOW_BRANCH_REGIONS,
  FLOW_DEPARTMENTS,
  FLOW_STAFF_ROLES,
  type FlowRole,
} from "../../src/task-manager/ui/types";

/** Mirrors prisma/task-manager/schema.prisma's Role enum. Reused from
 *  ui/types.ts (which hand-rolls the same union, import-free) rather than
 *  importing the generated Prisma client's Role type here — that module
 *  isn't safe to pull into a "no db access" pure file (its sibling,
 *  src/task-manager/prisma.ts, constructs a real pg Pool at import time). */
type Role = FlowRole;

// ---------------------------------------------------------------------------
// ROLE_MAP
// ---------------------------------------------------------------------------

export interface RoleMapEntry {
  role: Role;
  employmentType: string | null;
  coachSchedule: string | null;
  /** Only for roles whose department is intrinsic to the HRFS role value
   *  itself (ACADEMY, HR) — always applied unless an OVERRIDE explicitly
   *  changes it. Every other role's department comes from OVERRIDES only
   *  (see departmentPolicy below) or is not applicable at all. */
  department?: string;
}

// Verified against a live `select role, count(*) from "User" where status =
// 'ACTIVE' group by role` on 2026-07-24 — exactly these 14 values, no more:
//   ACADEMY(1) BM(14) BRANCH_MANAGER(28) "FT Coach"(1) "FT EXEC"(4)
//   Full_Time(2) HOD(1) HR(1) INT(12) INTERN(2) "PT Coach"(71) Part_Time(32)
//   REGIONAL_MANAGER(4) SUPER_ADMIN(10)                     — total 183.
//
// employmentType/coachSchedule strings below are copied EXACTLY from
// src/task-manager/analytics/_lib.ts's BRANCH_STAFF_ROLES (["Manager",
// "Branch Exec", "Coach"]) and DEPARTMENT_EMPLOYMENT_TYPES (["HOD", "HQ
// Exec", "Full Time", "Intern"]), and from the coachSchedule/"Regional
// Manager"/"Part Time" literals used throughout src/task-manager/ui/types.ts
// (flowGroupMembers, FLOW_GROUPS). "Part Time" as a plain (non-Coach)
// employmentType is not itself one of DEPARTMENT_EMPLOYMENT_TYPES's four
// values (that array has no part-time-specific entry) — HRFS's Part_Time
// role genuinely has no closer match, so it's carried through as-is; nothing
// in the app enforces employmentType against a closed enum (it's a plain
// String? column), so this is safe, just not one of the "officially
// recognised" FLOW_GROUPS filters.
export const ROLE_MAP: Record<string, RoleMapEntry> = {
  SUPER_ADMIN: { role: "ADMIN", employmentType: null, coachSchedule: null },

  // Department comes ENTIRELY from OVERRIDES (HRFS has no department
  // column) — mapHrfsUser skips an HOD with no department post-overrides,
  // loudly, because an HOD without a department would break dept-scoped
  // analytics (canViewEntity/canViewMember key off it). Exactly 1 ACTIVE
  // HOD row exists today; ship ONE override for them before cutover.
  HOD: { role: "HOD", employmentType: "HOD", coachSchedule: null },

  BRANCH_MANAGER: { role: "BRANCH", employmentType: "Manager", coachSchedule: null },
  BM: { role: "BRANCH", employmentType: "Manager", coachSchedule: null },

  "FT Coach": { role: "MEMBER", employmentType: "Coach", coachSchedule: "Full Time" },
  "PT Coach": { role: "MEMBER", employmentType: "Coach", coachSchedule: "Part Time" },

  // NOTE (see the header's data-provenance comment): in the live data, ALL 4
  // "FT EXEC" rows carry a non-branch branchName (HQ x2, MKT, OD) — none of
  // them has a resolvable branch. That's suspicious: it suggests "FT EXEC"
  // might actually mean an HQ/department-level executive (closer to
  // DEPARTMENT_EMPLOYMENT_TYPES's "HQ Exec") rather than a branch's own
  // "Branch Exec". The task spec is explicit about this mapping though, and
  // branch-resolution failures are deliberately NOT overridable (see header)
  // — so, AS SPECIFIED, these 4 people skip today with "unresolved branch
  // code" until a human confirms which is right: (a) add the real branch via
  // a BRANCH_MAP entry if HQ/MKT/OD do turn out to be unlisted branch codes,
  // or (b) re-map "FT EXEC" here to MEMBER/"HQ Exec" (department-side) if
  // they're actually HQ staff — see the dry-run summary for exactly who.
  "FT EXEC": { role: "MEMBER", employmentType: "Branch Exec", coachSchedule: null },

  REGIONAL_MANAGER: { role: "MEMBER", employmentType: "Regional Manager", coachSchedule: null },

  // Department staff: department from OVERRIDES; if still absent after
  // overrides, IMPORT ANYWAY with department = null (never skip) — they
  // still get a personal task list, just no department rollup until an
  // override fills it in. See also the header's data-provenance comment:
  // Full_Time/Part_Time's branchName values are overwhelmingly real,
  // resolvable branch codes in the live data (33 of 34 rows) — possibly
  // meaning these are actually branch-level general staff, not HQ/dept
  // staff. Kept as department-staff exactly per spec (and to preserve the
  // app-wide branch/department mutual-exclusivity invariant — see
  // BRANCH_STAFF_ROLES's doc comment in _lib.ts); flagged for a human to
  // confirm, same as FT EXEC above.
  Full_Time: { role: "MEMBER", employmentType: "Full Time", coachSchedule: null },
  Part_Time: { role: "MEMBER", employmentType: "Part Time", coachSchedule: null },
  INTERN: { role: "MEMBER", employmentType: "Intern", coachSchedule: null },
  INT: { role: "MEMBER", employmentType: "Intern", coachSchedule: null },

  // Department fixed by the role value itself — no override required.
  // "Academy" / "Human Resource" verified against FLOW_DEPARTMENTS below
  // (self-check at module load, not just a comment).
  ACADEMY: { role: "MEMBER", employmentType: "Full Time", coachSchedule: null, department: "Academy" },
  HR: { role: "MEMBER", employmentType: "Full Time", coachSchedule: null, department: "Human Resource" },
};

if (!(FLOW_DEPARTMENTS as readonly string[]).includes("Academy")) {
  throw new Error('hrfs-map.ts: "Academy" is not in FLOW_DEPARTMENTS — update the ACADEMY entry in ROLE_MAP.');
}
if (!(FLOW_DEPARTMENTS as readonly string[]).includes("Human Resource")) {
  throw new Error('hrfs-map.ts: "Human Resource" is not in FLOW_DEPARTMENTS — update the HR entry in ROLE_MAP.');
}

/** Department staff whose department is NOT fixed by the role itself —
 *  department comes from OVERRIDES, and its absence is a warning, not a
 *  skip. (ACADEMY/HR are excluded: they carry a fixed `department` in their
 *  ROLE_MAP entry, checked first — see departmentPolicy.) */
const DEPT_GENERIC_EMPLOYMENT_TYPES = new Set(["Full Time", "Part Time", "Intern"]);

type DepartmentPolicy = "required-override" | "optional-override" | "fixed" | "none";

function departmentPolicy(user: Pick<MappedUser, "role" | "employmentType" | "department">): DepartmentPolicy {
  if (user.role === "HOD") return "required-override";
  if (user.department) return "fixed";
  if (user.employmentType && DEPT_GENERIC_EMPLOYMENT_TYPES.has(user.employmentType)) return "optional-override";
  return "none";
}

/** Branch-pool employment types (FLOW_STAFF_ROLES === BRANCH_STAFF_ROLES's
 *  values — see _lib.ts) always REQUIRE a resolvable branch; "Regional
 *  Manager" resolves one OPTIONALLY (never blocks import); everything else
 *  never even looks at branchName. */
type BranchPolicy = "required" | "optional" | "none";

function branchPolicy(entry: RoleMapEntry): BranchPolicy {
  if (entry.employmentType && (FLOW_STAFF_ROLES as readonly string[]).includes(entry.employmentType)) {
    return "required";
  }
  if (entry.employmentType === "Regional Manager") return "optional";
  return "none";
}

// ---------------------------------------------------------------------------
// BRANCH_MAP
// ---------------------------------------------------------------------------

const ALL_BRANCH_NAMES: readonly string[] = FLOW_BRANCH_REGIONS.flatMap((r) => r.branches);

/** Every canonical branch name passes through as its own identity, so a
 *  branchName that's already the full name (as roughly half of HRFS's rows
 *  are) always resolves. */
const IDENTITY_BRANCH_MAP: Record<string, string> = Object.fromEntries(
  ALL_BRANCH_NAMES.map((name) => [name, name]),
);

// Short codes actually observed in ebright_hrfs.User (live query, 2026-07-24,
// 53 distinct branchName values across 183 ACTIVE rows). Two confidence
// tiers, kept in one map because BRANCH_MAP's contract doesn't distinguish
// them — but commented individually so a future maintainer can tell which is
// which:
//
//  - CONFIRMED (given directly, not inferred): AMP, BBB, BSP, BTHO, CJY, DK,
//    DA, EGR.
//  - DERIVED (pattern-matched against the confirmed set, then cross-checked
//    against the FULL live distribution — every code below actually appears
//    on real ACTIVE rows, and the derived codes account for every one of the
//    53 distinct values except the ones listed in UNRESOLVED_BRANCH_CODES):
//      - pure initials, same pattern as the confirmed DK/DA:
//        KD=Kota Damansara, KTG=Kajang TTDI Groove, KW=Kota Warisan,
//        SA=Setia Alam (disambiguated from Shah Alam by SHA existing
//        separately), SP=Sri Petaling, ST=Subang Taipan,
//        TSG=Taman Sri Gombak.
//      - first letters / consonant abbreviation, same pattern as the
//        confirmed AMP: ONL=Online, SHA=Shah Alam, KLG=Klang.
//      - "<first letter>+JY" suffix, same pattern as the confirmed CJY:
//        PJY=Putrajaya.
//      - RBY=Bandar Rimbayu, plus the bare "Rimbayu" HRFS also uses in place
//        of the full "Bandar Rimbayu" (not a code, a dropped-prefix name).
const SHORT_CODE_BRANCH_MAP: Record<string, string> = {
  // ---- confirmed ----
  AMP: "Ampang",
  BBB: "Bandar Baru Bangi",
  BSP: "Bandar Seri Putra",
  BTHO: "Bandar Tun Hussein Onn",
  CJY: "Cyberjaya",
  DK: "Danau Kota",
  DA: "Denai Alam",
  EGR: "Eco Grandeur",
  // ---- derived (see the block comment above) ----
  KD: "Kota Damansara",
  KLG: "Klang",
  KTG: "Kajang TTDI Groove",
  KW: "Kota Warisan",
  ONL: "Online",
  PJY: "Putrajaya",
  RBY: "Bandar Rimbayu",
  Rimbayu: "Bandar Rimbayu",
  SA: "Setia Alam",
  SHA: "Shah Alam",
  SP: "Sri Petaling",
  ST: "Subang Taipan",
  TSG: "Taman Sri Gombak",
};

export const BRANCH_MAP: Record<string, string> = {
  ...IDENTITY_BRANCH_MAP,
  ...SHORT_CODE_BRANCH_MAP,
};

/** branchName values confirmed present on live ACTIVE HRFS rows (2026-07-24)
 *  that are NOT real branches — either a genuine non-branch org marker, or a
 *  code nobody has been able to confidently identify yet. Purely
 *  documentation + tested (BRANCH_MAP must never accidentally gain one of
 *  these as a key) — resolution behaviour for any value NOT in BRANCH_MAP is
 *  uniform regardless of whether it's listed here: skip (branch-required
 *  roles) or import branchless with a warning (branch-optional roles). Only
 *  DPU and IOP below are genuine unknowns blocking real people today (see
 *  the dry-run summary); the rest have a fairly confident non-branch
 *  explanation. */
export const UNRESOLVED_BRANCH_CODES: string[] = [
  "ACD", // Academy marker — the one ACADEMY-role row uses this exact value.
  "CEO", // the CEO's own row; explicitly called out as non-branch in the task spec.
  "DPU", // UNKNOWN — genuinely unresolved. Blocks 2 BRANCH_MANAGER + 2 "PT Coach" rows.
  "FNC", // likely a "Finance" department marker (not a branch) — matches the MKT/OD/OPT pattern below.
  "HQ", // likely a generic "headquarters" marker — matches "FT EXEC"/INTERN usage.
  "HR", // likely a "Human Resource" department marker. NOTE: coincidentally also a ROLE_MAP
  //         key (the HRFS *role* value "HR") — different namespace, no actual collision in code.
  "IOP", // UNKNOWN — genuinely unresolved. Only affects 1 INT row (branch not required for INT).
  "MKT", // likely a "Marketing" department marker.
  "OD", // likely an "Operation Department" marker.
  "OPT", // likely an "Optimisation" department marker.
  "RM", // likely a "Regional Manager" org-unit marker — matches REGIONAL_MANAGER usage.
];

const BRANCH_LOOKUP: Map<string, string> = new Map(
  Object.entries(BRANCH_MAP).map(([code, canonical]) => [code.trim().toLowerCase(), canonical]),
);

/** Case-insensitive, whitespace-tolerant branch resolution. Returns null for
 *  anything not recognised (including null/empty input) — callers decide
 *  whether that's a skip or a warning based on the role's branch policy. */
export function resolveBranch(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return BRANCH_LOOKUP.get(key) ?? null;
}

// ---------------------------------------------------------------------------
// OVERRIDES — per-email fixes, merged over the mapped result LAST (wins).
// ---------------------------------------------------------------------------

export interface MappedUser {
  email: string;
  name: string;
  role: Role;
  department: string | null;
  branch: string | null;
  employmentType: string | null;
  coachSchedule: string | null;
}

/** Keyed by LOWERCASED email. Empty by default — fill these in before
 *  production cutover. Applied as a shallow merge over the role-mapped
 *  result (`{ ...mapped, ...override }`), so an override only needs to name
 *  the fields it wants to change; everything else keeps the role-mapping's
 *  value. Can even change `role` itself (promotion).
 *
 * Examples (uncomment and edit — do not ship literal example data):
 *
 * export const OVERRIDES: Record<string, Partial<MappedUser>> = {
 *   // An HOD needs a department (HRFS has no department column at all) —
 *   // this is the #1 override every deployment will need at least once:
 *   "daniel@ebright.my": { department: "Operation" },
 *
 *   // Promote an existing HRFS user to CEO (HRFS has no CEO role value) —
 *   // mirrors the demo seed's CEO shape (role/department/employmentType all
 *   // set to "CEO", a real branch kept for personal-context display):
 *   "elaine@ebright.my": { role: "CEO", department: "CEO", employmentType: "CEO", branch: "Subang Taipan" },
 *
 *   // Promote an existing HRFS user to OPS (HRFS has no OPS role value):
 *   "nurul@ebright.my": { role: "OPS", employmentType: "Manager", branch: "Subang Taipan" },
 * };
 */
export const OVERRIDES: Record<string, Partial<MappedUser>> = {};

// ---------------------------------------------------------------------------
// EXTRA_USERS — accounts that don't exist in HRFS at all (site logins, etc).
// ---------------------------------------------------------------------------

/** Full MappedUser objects, upserted in addition to whatever HRFS produces.
 *  Empty by default — fill these in before production cutover.
 *
 * Examples (uncomment and edit — do not ship literal example data):
 *
 * export const EXTRA_USERS: MappedUser[] = [
 *   {
 *     email: "dept-operation@ebright.my",
 *     name: "Operation Department",
 *     role: "DEPT_SITE",
 *     department: "Operation",
 *     branch: null,
 *     employmentType: null,
 *     coachSchedule: null,
 *   },
 *   {
 *     email: "site-subangtaipan@ebright.my",
 *     name: "Subang Taipan Site",
 *     role: "BRANCH_SITE",
 *     department: null,
 *     branch: "Subang Taipan",
 *     employmentType: null,
 *     coachSchedule: null,
 *   },
 * ];
 */
export const EXTRA_USERS: MappedUser[] = [];

// ---------------------------------------------------------------------------
// mapHrfsUser
// ---------------------------------------------------------------------------

export interface HrfsUserRow {
  email: string;
  name: string | null;
  role: string;
  branchName: string | null;
  status: string;
}

export type MapResult = { ok: true; user: MappedUser; warnings: string[] } | { ok: false; reason: string };

function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

/** Pure: HRFS row in, mapped-or-skipped result out. Order (matches the task
 *  spec exactly): status -> unknown role -> branch resolution -> required-
 *  branch skip (NOT rescuable by OVERRIDES, see header) -> email/name
 *  normalization -> OVERRIDES merge (last, wins, can change anything
 *  including role) -> HOD-needs-department check (POST-overrides, IS
 *  rescuable) -> department/branch warnings computed from the final state. */
export function mapHrfsUser(row: HrfsUserRow): MapResult {
  const email = (row.email ?? "").trim().toLowerCase();

  if (row.status !== "ACTIVE") {
    return { ok: false, reason: `${email}: not ACTIVE (status: ${row.status})` };
  }

  const roleKey = row.role?.trim();
  const entry = roleKey ? ROLE_MAP[roleKey] : undefined;
  if (!entry) {
    return { ok: false, reason: `${email}: unknown HRFS role: ${row.role}` };
  }

  // ---- branch: resolved from the RAW HRFS value, before overrides ----
  const bPolicy = branchPolicy(entry);
  let branch: string | null = null;
  if (bPolicy !== "none") {
    branch = resolveBranch(row.branchName);
    if (!branch && bPolicy === "required") {
      return {
        ok: false,
        reason: `${email}: unresolved branch code ${JSON.stringify(row.branchName)} (role ${row.role} requires a branch)`,
      };
    }
  }

  const name = row.name && row.name.trim() ? row.name.trim() : emailLocalPart(email);

  let user: MappedUser = {
    email,
    name,
    role: entry.role,
    department: entry.department ?? null,
    branch,
    employmentType: entry.employmentType,
    coachSchedule: entry.coachSchedule,
  };

  // ---- overrides: merged LAST, can rewrite anything (including role) ----
  const override = OVERRIDES[email];
  if (override) {
    user = { ...user, ...override };
  }

  // ---- HOD needs a department — evaluated POST-overrides (rescuable) ----
  if (user.role === "HOD" && !user.department) {
    return { ok: false, reason: `${email}: HOD needs a department override` };
  }

  // ---- warnings, computed from the final (post-override) state ----
  const warnings: string[] = [];
  const dPolicy = departmentPolicy(user);
  if (dPolicy === "optional-override" && !user.department) {
    warnings.push(`${email}: no department override — imported with department = null`);
  }
  if (bPolicy === "optional" && !user.branch) {
    warnings.push(`${email}: unresolved branch code ${JSON.stringify(row.branchName)} — imported without a branch`);
  }

  return { ok: true, user, warnings };
}
