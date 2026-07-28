// Pure mapping config + mapper for the HRFS-driven bootstrap (bootstrap.ts).
// mapHrfsUser() and every exported map/helper are pure functions/data — no
// I/O, no side effects, safe to call from a unit test with plain object
// literals.
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
//
// ONE IMPORT-GRAPH EXCEPTION: this file imports BRANCH_STAFF_ROLES from
// analytics/_lib.ts, purely to load-assert it stays equal to FLOW_STAFF_
// ROLES (ui/types.ts), which branchPolicy() below actually relies on — see
// that assertion. _lib.ts transitively imports the real
// src/task-manager/prisma singleton (constructs a PrismaClient at import
// time, never queried by anything in THIS file) and src/task-manager/lib/
// users.ts (same). hrfs-map.test.ts mocks both before importing anything,
// same pattern analytics/_lib.test.ts already uses — no real DB connection
// is ever opened by importing or testing this file.
import { BRANCH_STAFF_ROLES } from "../../src/task-manager/analytics/_lib";
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

  // DECIDED 2026-07-25 (user): "FT EXEC" means an HQ/department-level
  // executive, NOT a branch's own exec — in the live data every FT EXEC row
  // carries a non-branch marker (HQ/MKT/OD), never a real branch. Mapped to
  // the department side ("HQ Exec"), so branchName is ignored entirely and
  // all of them import. Department comes from OVERRIDES where a marker
  // identified one (MKT -> Marketing, OD -> Optimisation); the HQ-marked
  // rows import department-less until someone assigns one.
  "FT EXEC": { role: "MEMBER", employmentType: "HQ Exec", coachSchedule: null },
  // Appeared in live ebright_hrfs data 2026-07-25 (1 ACTIVE row) — same
  // HQ-exec reading as FT EXEC per the standing decision.
  EXECUTIVE: { role: "MEMBER", employmentType: "HQ Exec", coachSchedule: null },

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

// branchPolicy() below treats FLOW_STAFF_ROLES (ui/types.ts) as equivalent
// to BRANCH_STAFF_ROLES (analytics/_lib.ts) — same values, kept in two
// files with no shared source-of-truth (see the file header for why this
// file imports the latter at all). Assert that's still true at load time,
// so a future edit to either array can't silently desync branchPolicy()
// from the "Manager"/"Coach"/"Branch Exec" set the rest of the app actually
// enforces (seed.ts's self-check, DEPARTMENT_EMPLOYMENT_TYPES pairing, etc).
{
  const a = new Set<string>(FLOW_STAFF_ROLES as readonly string[]);
  const b = new Set<string>(BRANCH_STAFF_ROLES as readonly string[]);
  const drift = [...a].filter((x) => !b.has(x)).concat([...b].filter((x) => !a.has(x)));
  if (drift.length > 0) {
    throw new Error(
      `hrfs-map.ts: FLOW_STAFF_ROLES (ui/types.ts) and BRANCH_STAFF_ROLES (_lib.ts) have drifted — ` +
        `branchPolicy() below assumes they're the same set. Symmetric difference: ${drift.join(", ")}`,
    );
  }
}

/** Branch-pool employment types (FLOW_STAFF_ROLES === BRANCH_STAFF_ROLES's
 *  values — asserted equal just above) always REQUIRE a resolvable branch;
 *  "Regional Manager" resolves one OPTIONALLY (never blocks import);
 *  everything else never even looks at branchName. */
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
  // Spelling drift observed in the PORTAL's branch table (2026-07-25):
  // "Grove" for the canonical "Groove". An alias, not a code.
  "Kajang TTDI Grove": "Kajang TTDI Groove",
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
 *   // Promote an existing HRFS user to CEO (HRFS has no CEO role value).
 *   // department stays null, unlike the demo seed's convention of stashing
 *   // "CEO" there — the load-time validation below rejects any OVERRIDES/
 *   // EXTRA_USERS department that isn't a real FLOW_DEPARTMENTS value:
 *   "elaine@ebright.my": { role: "CEO", employmentType: "CEO", branch: "Subang Taipan" },
 *
 *   // Promote an existing HRFS user to OPS (HRFS has no OPS role value):
 *   "nurul@ebright.my": { role: "OPS", employmentType: "Manager", branch: "Subang Taipan" },
 * };
 */
export const OVERRIDES: Record<string, Partial<MappedUser>> = {
  // ---- decisions confirmed by the user, 2026-07-25 ----

  // The one HOD: heads Optimisation ("OD" marker read as Optimisation
  // Department, matching the org's own od@ebright.my naming).
  "iqbalhakim216@gmail.com": { department: "Optimisation" },

  // FT EXEC department markers (see ROLE_MAP's "FT EXEC" note): MKT and OD
  // identified a department; the HQ-marked rows stay department-less.
  "maizatulmaisarahmior@gmail.com": { department: "Marketing" },
  "ngyingchenn@gmail.com": { department: "Optimisation" },

  // SUPER_ADMIN demotions: HRFS marks 10 rows SUPER_ADMIN; the user kept
  // ADMIN for the people/system accounts (od@, admin@ x2, Ashwin, Wan
  // Nuraihan, Khora) and demoted the department logins to site accounts.
  // operation@ (no s) is HRFS's spelling; the login staff actually use is
  // operations@ — added in EXTRA_USERS below. sales@ has no matching Task
  // Manager department (FLOW_DEPARTMENTS has no Sales), so: plain member.
  "finance@ebright.my": { role: "DEPT_SITE", department: "Finance", employmentType: null },
  "marketing@ebright.my": { role: "DEPT_SITE", department: "Marketing", employmentType: null },
  "operation@ebright.my": { role: "DEPT_SITE", department: "Operations", employmentType: null },
  "sales@ebright.my": { role: "MEMBER", employmentType: null },

  // od@ebright.my is the Optimisation Department's own superadmin login —
  // recording its department (no authorization effect for ADMIN) makes the
  // Task Manager department dropdown default to Optimisation for it
  // (2026-07-25 user decision).
  "od@ebright.my": { department: "Optimisation" },
};

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
export const EXTRA_USERS: MappedUser[] = [
  // ---- decisions confirmed by the user, 2026-07-25 ----

  // CEO: Kevin's HRFS row is BRANCH_MANAGER with branchName "CEO" — a
  // branch-required role with a non-branch marker, which auto-skips, and
  // branch skips are deliberately not override-rescuable (see the file
  // header's asymmetry note). Manual entry instead.
  {
    email: "kevinkhoo@ebright.my",
    name: "Kevin Khoo Kuan Xiong",
    role: "CEO",
    department: null,
    branch: null,
    employmentType: "CEO",
    coachSchedule: null,
  },

  // Department site logins that exist in hrfs.users (the login source) but
  // not in ebright_hrfs. operations@ (with the s) is the real login;
  // Operation/Optimisation department sites get the elevated experience
  // (all-departments view + assign — see isElevatedDeptSite).
  {
    email: "operations@ebright.my",
    name: "Operations Department",
    role: "DEPT_SITE",
    department: "Operations",
    branch: null,
    employmentType: null,
    coachSchedule: null,
  },
  {
    email: "academy@ebright.my",
    name: "Academy Department",
    role: "DEPT_SITE",
    department: "Academy",
    branch: null,
    employmentType: null,
    coachSchedule: null,
  },
  {
    email: "hr@ebright.my",
    name: "Human Resource Department",
    role: "DEPT_SITE",
    department: "Human Resource",
    branch: null,
    employmentType: null,
    coachSchedule: null,
  },

  // Branch site logins (view-only branch status accounts).
  {
    email: "ebrightbandarbarubangi@gmail.com",
    name: "Bandar Baru Bangi Site",
    role: "BRANCH_SITE",
    department: null,
    branch: "Bandar Baru Bangi",
    employmentType: null,
    coachSchedule: null,
  },
  {
    email: "ebrightbandarrimbayu@gmail.com",
    name: "Bandar Rimbayu Site",
    role: "BRANCH_SITE",
    department: null,
    branch: "Bandar Rimbayu",
    employmentType: null,
    coachSchedule: null,
  },
  {
    email: "ebrightonline@gmail.com",
    name: "Online Site",
    role: "BRANCH_SITE",
    department: null,
    branch: "Online",
    employmentType: null,
    coachSchedule: null,
  },
];

// ---------------------------------------------------------------------------
// Load-time validation of the hand-edited config. OVERRIDES/EXTRA_USERS are
// the one part of this file a human types by hand, unlike ROLE_MAP/
// BRANCH_MAP — which are checked against live data and covered by the
// ROLE_MAP-completeness test — so they carry none of the auto-derived
// path's self-checks otherwise, and are the likeliest place to carry a
// typo. Every department must be a real FLOW_DEPARTMENTS value; every
// branch must be a canonical FLOW_BRANCH_REGIONS name; null/undefined
// always pass (no department / no branch is a normal, valid state).
// ---------------------------------------------------------------------------

/** Exported (rather than inlined below) so hrfs-map.test.ts can call it
 *  directly with synthetic bad input — by the time any test imports this
 *  module, the SHIPPED OVERRIDES/EXTRA_USERS have already passed this exact
 *  check once (see the call immediately below this definition), so there's
 *  nothing left to fail against without going through this function
 *  directly. Throws naming the offending email, field, and value. */
export function validateHandEditedConfig(
  overrides: Record<string, Partial<MappedUser>>,
  extraUsers: MappedUser[],
): void {
  const checkDepartment = (source: string, email: string, department: string | null | undefined) => {
    if (!department) return;
    if (!(FLOW_DEPARTMENTS as readonly string[]).includes(department)) {
      throw new Error(
        `hrfs-map.ts: ${source}["${email}"].department = ${JSON.stringify(department)} is not one of FLOW_DEPARTMENTS`,
      );
    }
  };
  const checkBranch = (source: string, email: string, branch: string | null | undefined) => {
    if (!branch) return;
    if (!ALL_BRANCH_NAMES.includes(branch)) {
      throw new Error(
        `hrfs-map.ts: ${source}["${email}"].branch = ${JSON.stringify(branch)} is not a canonical FLOW_BRANCH_REGIONS branch`,
      );
    }
  };

  for (const [email, override] of Object.entries(overrides)) {
    checkDepartment("OVERRIDES", email, override.department);
    checkBranch("OVERRIDES", email, override.branch);
  }
  for (const user of extraUsers) {
    checkDepartment("EXTRA_USERS", user.email, user.department);
    checkBranch("EXTRA_USERS", user.email, user.branch);
  }
}

validateHandEditedConfig(OVERRIDES, EXTRA_USERS);

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

// ---------------------------------------------------------------------------
// Portal-source mapping (2026-07-25) — the SECOND bootstrap source. 63 of
// the Employee Management page's active staff had no ebright_hrfs row at
// all (roster drift between the two HR databases), so bootstrap.ts also
// imports active portal employees (hrfs db: users -> employment ->
// department/branch) that ebright_hrfs doesn't cover. Positions are the
// portal's free-text employment.position values; departments and branches
// arrive as REAL names (validated against FLOW_DEPARTMENTS / resolved via
// BRANCH_MAP's identity entries + aliases). ebright_hrfs stays
// authoritative: bootstrap only consults this mapper for emails the
// primary source didn't already map.
// ---------------------------------------------------------------------------

/** Task Manager renamed "Operation" -> "Operations" (2026-07-25 user
 *  spelling fix) but the SOURCE systems (portal hrfs department table, HRFS
 *  markers) still say "Operation" — normalize on the way in so imports and
 *  enrichment keep matching. */
export const SOURCE_DEPARTMENT_RENAMES: Record<string, string> = {
  Operation: "Operations",
};

export function normalizeSourceDepartment(name: string | null): string | null {
  if (!name) return null;
  return SOURCE_DEPARTMENT_RENAMES[name] ?? name;
}

export interface PortalEmployeeRow {
  email: string;
  name: string | null;
  /** employment.position — free text, normalized before lookup. */
  position: string | null;
  /** department.department_name via the active employment (or null). */
  department: string | null;
  /** branch.branch_name via the active employment (or null). */
  branch: string | null;
}

/** Normalized-position -> mapping. Keys are UPPERCASED, whitespace-collapsed
 *  position strings as observed live on 2026-07-25 (INTERN x28, PT COACH
 *  x15, FT EXEC x4, Part-Time x3, FT COACH x2, Full-Time Coach x1, BM x2,
 *  FT HOD x2) plus obvious close variants. Same role/employmentType
 *  vocabulary as ROLE_MAP. */
export const PORTAL_POSITION_MAP: Record<string, RoleMapEntry> = {
  INTERN: { role: "MEMBER", employmentType: "Intern", coachSchedule: null },
  "PT COACH": { role: "MEMBER", employmentType: "Coach", coachSchedule: "Part Time" },
  "PART-TIME COACH": { role: "MEMBER", employmentType: "Coach", coachSchedule: "Part Time" },
  "FT COACH": { role: "MEMBER", employmentType: "Coach", coachSchedule: "Full Time" },
  "FULL-TIME COACH": { role: "MEMBER", employmentType: "Coach", coachSchedule: "Full Time" },
  "FT EXEC": { role: "MEMBER", employmentType: "HQ Exec", coachSchedule: null },
  EXECUTIVE: { role: "MEMBER", employmentType: "HQ Exec", coachSchedule: null },
  "PART-TIME": { role: "MEMBER", employmentType: "Part Time", coachSchedule: null },
  "FULL-TIME": { role: "MEMBER", employmentType: "Full Time", coachSchedule: null },
  BM: { role: "BRANCH", employmentType: "Manager", coachSchedule: null },
  "BRANCH MANAGER": { role: "BRANCH", employmentType: "Manager", coachSchedule: null },
  // 2026-07-25 user decision: portal FT HODs import as FULL HODs, with the
  // department taken from their employment record (required — see below).
  "FT HOD": { role: "HOD", employmentType: "HOD", coachSchedule: null },
  HOD: { role: "HOD", employmentType: "HOD", coachSchedule: null },
};

/** Pure: portal employee row in, mapped-or-skipped result out. Mirrors
 *  mapHrfsUser's order and conventions: unknown position -> branch
 *  resolution -> required-branch skip -> OVERRIDES merge (last, wins) ->
 *  HOD-needs-department check (post-overrides) -> warnings from the final
 *  state. Departments must be real FLOW_DEPARTMENTS values (the portal also
 *  carries non-Task-Manager units like "IOP" — treated as no-department);
 *  branch-pool staff never carry one (mutual exclusivity). */
export function mapPortalEmployee(row: PortalEmployeeRow): MapResult {
  const email = (row.email ?? "").trim().toLowerCase();

  const positionKey = row.position ? row.position.trim().replace(/\s+/g, " ").toUpperCase() : "";
  const entry = positionKey ? PORTAL_POSITION_MAP[positionKey] : undefined;
  if (!entry) {
    return { ok: false, reason: `${email}: unknown portal position: ${row.position ?? "(no active employment)"}` };
  }

  // ---- branch: the portal sends REAL branch names — resolveBranch covers
  // the identity map + aliases ("Kajang TTDI Grove"). "HQ" is an org
  // marker, not a branch — unresolved like any unknown value. ----
  const bPolicy = branchPolicy(entry);
  let branch: string | null = null;
  if (bPolicy !== "none") {
    branch = resolveBranch(row.branch);
    if (!branch && bPolicy === "required") {
      return {
        ok: false,
        reason: `${email}: unresolved branch ${JSON.stringify(row.branch)} (portal position ${row.position} requires a branch)`,
      };
    }
  }

  const sourceDept = normalizeSourceDepartment(row.department);
  const department =
    bPolicy === "none" &&
    sourceDept &&
    (FLOW_DEPARTMENTS as readonly string[]).includes(sourceDept)
      ? sourceDept
      : null;

  const name = row.name && row.name.trim() ? row.name.trim() : emailLocalPart(email);

  let user: MappedUser = {
    email,
    name,
    role: entry.role,
    department,
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
    return { ok: false, reason: `${email}: HOD needs a department (none on the portal employment record)` };
  }

  // ---- warnings, computed from the final (post-override) state ----
  const warnings: string[] = [];
  if (departmentPolicy(user) === "optional-override" && !user.department) {
    warnings.push(`${email}: no department on the portal employment record — imported with department = null`);
  }

  return { ok: true, user, warnings };
}

// ---------------------------------------------------------------------------
// diffUserFields — used by bootstrap.ts to print a loud CHANGED line instead
// of silently overwriting an existing Task Manager account on re-run.
// ---------------------------------------------------------------------------

/** Minimal shape diffUserFields needs — the 5 fields bootstrap.ts's
 *  upsertUsers actually writes on update (a subset of the full Prisma User
 *  row; deliberately not importing the generated User type here to keep
 *  this file's import surface small beyond the one exception noted in the
 *  file header). */
export interface DiffableUserFields {
  role: string;
  department: string | null;
  branch: string | null;
  employmentType: string | null;
  coachSchedule: string | null;
}

/** Pure: which of the 5 upsert-relevant fields differ between `existing`
 *  (the current Task Manager row) and `next` (this run's mapped result)?
 *  Returns one "<field> <old>→<new>" string per changed field (null shown
 *  as "(none)"), in a fixed field order; [] means no change. Catches the
 *  silent-revert case — an OVERRIDES promotion later removed demotes
 *  someone on the next run; the operator should see that happen, not have
 *  it happen quietly. */
export function diffUserFields(existing: DiffableUserFields, next: DiffableUserFields): string[] {
  const fields: (keyof DiffableUserFields)[] = ["role", "department", "branch", "employmentType", "coachSchedule"];
  const fmt = (v: string | null) => (v === null ? "(none)" : v);
  const changes: string[] = [];
  for (const field of fields) {
    if (existing[field] !== next[field]) {
      changes.push(`${field} ${fmt(existing[field])}→${fmt(next[field])}`);
    }
  }
  return changes;
}
