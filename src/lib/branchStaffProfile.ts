import "server-only";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";
import { normalizeName } from "@/lib/careerApplicationSync";
import { resolveDepartmentBranch, type BranchOpt, type DepartmentOpt } from "@/lib/employeeQueries";

// Read-only enrichment source for specific Personal Info/Bank Detail/
// Emergency Contact/Start-End-date/Employee ID fields on every profile page
// (stage-specific and Employee Record) — per explicit decision (see
// conversation). ebright_hrfs.public."BranchStaff" is only ever queried
// here, never written to.

// Raw shape pulled from ebright_hrfs.BranchStaff — text columns, mixed
// snake_case/camelCase per the upstream schema (see sync-onboarding.ts,
// which sources onboarding_candidate from this same table).
interface RawBranchStaffProfileRow {
  id: number;
  name: string | null;
  gender: string | null;
  dob: string | null;
  nric: string | null;
  email: string | null;
  phone: string | null;
  home_address: string | null;
  bank: string | null;
  bank_name: string | null;
  bank_account: string | null;
  emergency_name: string | null;
  emergency_relation: string | null;
  emergency_phone: string | null;
  start_date: string | null;
  endDate: string | null;
  employeeId: string | null;
  branch: string | null;
  department: string | null;
  /** Probation stage's own End Date (see probationDecision.ts) — a
   *  DIFFERENT column from endDate above (general employment/exit end
   *  date); this one specifically holds the probation period's own end
   *  date, when HR has entered one. */
  probation: string | null;
}

export interface BranchStaffProfileFields {
  gender: string | null;
  dob: string | null;
  nric: string | null;
  email: string | null;
  phone: string | null;
  homeAddress: string | null;
  /** "Bank Name" field <- BranchStaff.bank */
  bankName: string | null;
  /** "Account Holder" field <- BranchStaff.bank_name (confirmed against real
   *  data — this column holds the account holder's name, not the bank's). */
  accountName: string | null;
  /** "Account Number" field <- BranchStaff.bank_account */
  bankAccount: string | null;
  emergencyName: string | null;
  emergencyRelation: string | null;
  emergencyPhone: string | null;
  employeeId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  /** Probation stage's own End Date — parsed from BranchStaff.probation
   *  when present, else start_date + 3 months (see probationDecision.ts's
   *  own comment for the full rationale — this is a DIFFERENT date from
   *  endDate above). Null only when there's no start_date to fall back
   *  from either. */
  probationEndDate: Date | null;
}

function blank(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

// BranchStaff stores dob/start_date/endDate as free text ("YYYY-MM-DD" or
// empty/garbage), same as onboarding_candidate's sync source — same parsing
// as sync-onboarding.ts's own parseHrfsTextDate, duplicated here (rather
// than imported) since that file lives under src/app/induction/jobs (app ->
// lib is the wrong import direction) and this parser is small/stable enough
// that a second copy is cheaper than relocating it.
function parseHrfsTextDate(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

// dob is displayed as plain ISO text (EmployeeDetailFull.dob is already a
// string, not a Date), but still validated against the same shape rather
// than trusted as-is — malformed free text falls back to local data instead
// of being shown verbatim.
function validDobText(s: string | null): string | null {
  const t = blank(s);
  return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
}

// Personal Info's Phone Number and Emergency Contact's Phone Number, per
// explicit decision (see conversation) — display-only reformatting, never
// written back to ebright_hrfs: strip a Malaysia country-code prefix
// ("+60" or bare "60", the two shapes actually seen in this table's real
// data — none of it carries a literal "+") down to the digits after it, or
// for a number already in local 0-prefixed format, drop just the leading
// 0. Baked into this mapping function itself (not a shared formatter
// callable on any phone field) so it only ever touches BranchStaff-sourced
// values — local hrfs phone data (user_profile.phone,
// emergency_contact.phone) is never passed through this and stays exactly
// as stored.
function formatBranchStaffPhone(raw: string | null): string | null {
  const t = blank(raw);
  if (!t) return t;
  if (t.startsWith("+60")) return t.slice(3);
  if (t.startsWith("60") && t.length > 2) return t.slice(2);
  if (t.startsWith("0") && t.length > 1) return t.slice(1);
  return t;
}

export interface BranchStaffMatchIndex {
  bySourceId: Map<number, RawBranchStaffProfileRow>;
  byNormalizedName: Map<string, RawBranchStaffProfileRow[]>;
}

async function fetchAllBranchStaffProfileRows(): Promise<RawBranchStaffProfileRow[]> {
  const { rows } = await queryEbrightHrfs<RawBranchStaffProfileRow>(
    `SELECT id, name, gender, dob, nric, email, phone, home_address, bank, bank_name, bank_account,
            emergency_name, emergency_relation, emergency_phone, start_date, "endDate", "employeeId",
            branch, department, probation
       FROM public."BranchStaff"`,
  );
  return rows;
}

export async function buildBranchStaffMatchIndex(): Promise<BranchStaffMatchIndex> {
  const rows = await fetchAllBranchStaffProfileRows();
  const bySourceId = new Map<number, RawBranchStaffProfileRow>();
  const byNormalizedName = new Map<string, RawBranchStaffProfileRow[]>();
  for (const r of rows) {
    bySourceId.set(r.id, r);
    const key = normalizeName(r.name ?? "");
    if (!key) continue;
    const list = byNormalizedName.get(key);
    if (list) list.push(r);
    else byNormalizedName.set(key, [r]);
  }
  return { bySourceId, byNormalizedName };
}

export interface AmbiguousBranchStaffMatch {
  fullName: string;
  reason: "multiple-name-matches" | "location-conflict";
  candidateIds: number[];
}

function resolveRowLocation(
  row: RawBranchStaffProfileRow,
  branches: BranchOpt[],
  departments: DepartmentOpt[],
): { branchCode: string | null; departmentCode: string | null } {
  let resolved = row.department ? resolveDepartmentBranch(row.department, departments, branches) : null;
  if (resolved && !resolved.departmentCode && !resolved.branchCode && row.department?.includes("/")) {
    resolved = resolveDepartmentBranch(row.department.split("/")[0].trim(), departments, branches);
  }
  if (!resolved || (!resolved.departmentCode && !resolved.branchCode)) {
    resolved = row.branch ? resolveDepartmentBranch(row.branch, departments, branches) : null;
  }
  return { branchCode: resolved?.branchCode ?? null, departmentCode: resolved?.departmentCode ?? null };
}

function locationsConflict(
  localBranchCode: string | null,
  localDepartmentCode: string | null,
  resolvedBranchCode: string | null,
  resolvedDepartmentCode: string | null,
): boolean {
  if (localDepartmentCode && resolvedDepartmentCode) return localDepartmentCode !== resolvedDepartmentCode;
  if (localBranchCode && resolvedBranchCode) return localBranchCode !== resolvedBranchCode;
  return false; // not enough info on both sides to compare either way
}

// Rigorous match for a REAL account — unlike a candidate (which has an exact
// foreign key: onboarding_candidate.source_id = BranchStaff.id, see
// matchBranchStaffForCandidate below), there is NO foreign key from a real
// users/employment row to BranchStaff anywhere in this schema; name is the
// only available signal. Given what this unlocks — NRIC, bank account, home
// address — this deliberately errs toward NOT matching rather than
// guessing, per explicit decision (see conversation):
//   - zero BranchStaff rows share this normalized name -> no match (caller
//     falls back to local hrfs data).
//   - two or more DO -> genuinely can't tell them apart by name alone -> no
//     match, flagged.
//   - exactly one does, and wherever both sides have a known branch/
//     department it agrees (or one/both sides simply don't have one to
//     compare) -> confident match.
//   - exactly one does, but the branch/department the two sides report
//     actively contradicts each other -> the name match alone isn't
//     trusted enough given the stakes -> no match, flagged.
export function matchBranchStaffForRealAccount(
  fullName: string,
  localBranchCode: string | null,
  localDepartmentCode: string | null,
  index: BranchStaffMatchIndex,
  branches: BranchOpt[],
  departments: DepartmentOpt[],
  ambiguousOut?: AmbiguousBranchStaffMatch[],
): RawBranchStaffProfileRow | null {
  const key = normalizeName(fullName);
  if (!key) return null;
  const candidates = index.byNormalizedName.get(key);
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length > 1) {
    ambiguousOut?.push({ fullName, reason: "multiple-name-matches", candidateIds: candidates.map((c) => c.id) });
    return null;
  }
  const row = candidates[0];
  const loc = resolveRowLocation(row, branches, departments);
  if (locationsConflict(localBranchCode, localDepartmentCode, loc.branchCode, loc.departmentCode)) {
    ambiguousOut?.push({ fullName, reason: "location-conflict", candidateIds: [row.id] });
    return null;
  }
  return row;
}

// Candidates (onboarding_candidate rows, no real portal account yet) DO
// have an exact foreign key — source_id was literally copied from
// BranchStaff.id at sync time (see syncOnboardingCandidatesFromEbrightLeads)
// — so this is a precise lookup, no name-matching ambiguity possible.
export function matchBranchStaffForCandidate(sourceId: number, index: BranchStaffMatchIndex): RawBranchStaffProfileRow | null {
  return index.bySourceId.get(sourceId) ?? null;
}

// Feeds stageForRow()'s Pre/Exit determination and dateSourceFor()'s "Date"
// column — system-wide, per explicit decision (see conversation): a real
// account's effective start_date/end_date now comes from a confident
// BranchStaff name match first, falling back to this app's own
// employment.start_date/end_date whenever there's no confident match or the
// matched row's dates are blank. Generic over T so this works unmodified
// for both listEmployeeOverviewRows' and getEmployeeOverviewRowById's
// slightly different `emp` shapes — returns a shallow clone with only
// start_date/end_date overridden, so every other field (status, probation,
// position, branch/department relations, ...) passes through untouched.
export function resolveEffectiveEmploymentDates<
  T extends {
    start_date: Date | null;
    end_date: Date | null;
    branch?: { branch_code: string | null } | null;
    department?: { department_code: string | null } | null;
  },
>(
  emp: T | undefined,
  fullName: string,
  index: BranchStaffMatchIndex,
  branches: BranchOpt[],
  departments: DepartmentOpt[],
  ambiguousOut?: AmbiguousBranchStaffMatch[],
): T | undefined {
  if (!emp) return emp;
  const match = matchBranchStaffForRealAccount(
    fullName,
    emp.branch?.branch_code ?? null,
    emp.department?.department_code ?? null,
    index,
    branches,
    departments,
    ambiguousOut,
  );
  if (!match) return emp;
  const fields = branchStaffProfileFields(match);
  if (fields.startDate == null && fields.endDate == null) return emp;
  return {
    ...emp,
    start_date: fields.startDate ?? emp.start_date,
    end_date: fields.endDate ?? emp.end_date,
  };
}

// No dedicated admin UI exists for this yet — server-log visibility only.
// Kept as its own function (rather than inlined at each call site) so every
// caller logs identically, and so a future UI just has to replace this one
// function instead of hunting down every console.warn.
export function logAmbiguousBranchStaffMatches(ambiguous: AmbiguousBranchStaffMatch[]): void {
  for (const a of ambiguous) {
    console.warn(
      `[branchStaffProfile] Ambiguous BranchStaff match for "${a.fullName}" (${a.reason}) — candidate BranchStaff ids: ${a.candidateIds.join(", ")}. Falling back to local hrfs data.`,
    );
  }
}

export function branchStaffProfileFields(row: RawBranchStaffProfileRow): BranchStaffProfileFields {
  return {
    gender: blank(row.gender),
    dob: validDobText(row.dob),
    nric: blank(row.nric),
    email: blank(row.email),
    phone: formatBranchStaffPhone(row.phone),
    homeAddress: blank(row.home_address),
    bankName: blank(row.bank),
    accountName: blank(row.bank_name),
    bankAccount: blank(row.bank_account),
    emergencyName: blank(row.emergency_name),
    emergencyRelation: blank(row.emergency_relation),
    emergencyPhone: formatBranchStaffPhone(row.emergency_phone),
    employeeId: blank(row.employeeId),
    startDate: parseHrfsTextDate(row.start_date),
    endDate: parseHrfsTextDate(row.endDate),
    probationEndDate: resolveProbationEndDate(row),
  };
}

// Probation stage's End Date, per explicit decision (see conversation):
// BranchStaff.probation when it's set (confirmed against real data — it's
// already a "YYYY-MM-DD" date text, usually ~3 months after start_date,
// entered by HR directly), else start_date + 3 months. Only 10 of 353
// BranchStaff rows actually have this column set, so the fallback is the
// common case in practice, not an edge case.
function resolveProbationEndDate(row: RawBranchStaffProfileRow): Date | null {
  const explicit = parseHrfsTextDate(row.probation);
  if (explicit) return explicit;
  const start = parseHrfsTextDate(row.start_date);
  if (!start) return null;
  const d = new Date(start);
  d.setUTCMonth(d.getUTCMonth() + 3);
  return d;
}
