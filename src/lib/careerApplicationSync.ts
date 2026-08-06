import "server-only";
import { prisma } from "@/lib/prisma";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";
import { STAFF_ROLE_ID, resolveDepartmentBranch, type BranchOpt, type DepartmentOpt } from "@/lib/employeeQueries";
import { positionGroup, type EmployeeStage } from "@/lib/employeeStages";
import { BOARD_STAGE_TO_OUR_STAGE } from "@/lib/boardStageMapping";

export { BOARD_STAGE_TO_OUR_STAGE };

// Syncs EVERY applicant from ebright_hrfs.career_applications — every stage,
// including rejected — into our own Pre stage (users/employment with
// status="pre") — the same shape addPreStageEmployee() creates manually, so
// everything downstream (display, the manual "Proceed" button, the
// advancePreStageEmployees sweep) just works without any special-casing.
// Pre-only, deliberately kept simple — a board_stage-based routing branch
// into Probation, and an accepted/hired-only filter, were both proposed and
// then pulled back out (see conversation) to keep this to the basics.
//
// Every applicant gets synced, whether or not a start_date is known.
// career_applications has no column literally named start_date —
// trial_date is a text column that's empty on all 229 rows; start_trial is
// the only real date field, populated on very few rows. Deliberately no
// cross-database lookup for a start_date — only ebright_hrfs is connected,
// hrfs is not referenced at all. A row synced with no start_date simply won't
// be picked up by advancePreStageEmployees until HR fills one in later —
// expected, not an error. In the Pre stage list, that shows up sorted after
// every dated row (StageFlatListView's ascending default), not gapped/hidden.
//
// Three safety checks before creating/advancing anything:
//  - already a real employee (by normalized name) -> skip, not a new Pre.
//  - already synced previously (a placeholder user with the same normalized
//    name already exists) -> checked against board_stage for advancement
//    (see below), never re-created as a duplicate.
// Dedup has no shared ID to key off (a schema column for this was proposed
// and declined), so it's name-based and therefore approximate — two
// unrelated applicants who happen to share a full name would collide.
//
// Stage advancement is driven by board_stage (career_applications' own
// column) via BOARD_STAGE_TO_OUR_STAGE — REPLACES an earlier version keyed
// off rec_recruit/rec_stage (a separate table pair, joined by an exact FK),
// reverted per explicit decision: board_stage and rec_stage are two
// genuinely different fields that can disagree for the same application
// (confirmed case: Chan Ten Kiat's application id=63 has board_stage=
// "Rejected" but its linked rec_stage was "Trial" — see conversation).
// board_stage is read directly off each row here, no join needed.
//
// Personal Info field mapping (career_applications -> users/user_profile),
// matching exactly what ActiveProfilePanels.tsx's PersonalInfoPanel actually
// shows for Pre stage — see the full mapping table in conversation:
//  - email    -> users.email (replaces the placeholder login email, since
//                that field IS what PersonalInfoPanel displays/edits as
//                "Email" — it doubles as the login identifier). Falls back
//                to the placeholder pattern if the real email is blank or
//                would collide with any existing users.email (real or
//                another placeholder) — users.email is UNIQUE, so a
//                collision must never be allowed to crash the row.
//  - phone    -> user_profile.phone
//  - gender   -> user_profile.gender
// education_level and city have no matching field anywhere in
// user_profile/employment, and PersonalInfoPanel has no slot for either —
// left unmapped (see conversation for the full gap list: also dob, nric,
// home_address, none of which career_applications collects at all).

export interface CareerApplicationRow {
  id: number;
  name: string;
  position: string;
  branch: string | null;
  department: string | null;
  start_trial: Date | null;
  email: string;
  phone: string | null;
  gender: string | null;
  board_stage: string | null;
}

export interface CareerApplicationSyncGap {
  applicationId: number;
  name: string;
  reason: "already-employee" | "duplicate-placeholder" | "no-board-stage-match";
}

export interface CareerApplicationSyncResult {
  created: number;
  updated: number;
  gaps: CareerApplicationSyncGap[];
}

export interface PlaceholderRecord {
  userId: number;
  employmentId: number;
  status: string | null;
  probation: boolean;
  email: string;
  phone: string | null;
  gender: string | null;
}

export interface SyncContext {
  realEmployeeNames: Set<string>;
  // Already-synced applicants, by normalized name — carries their current
  // employment row so the update path (board_stage-driven advancement)
  // knows what to compare against and which row to write.
  placeholdersByName: Map<string, PlaceholderRecord>;
  branchByCode: Map<string, number>;
  departmentByCodeOrName: Map<string, number>;
  usedEmails: Set<string>;
}

export type SyncAction =
  | {
      type: "create";
      startDate: Date | null;
      branchId: number | null;
      departmentId: number | null;
      // The real applicant email, or null if it's blank/would collide with
      // an existing users.email — the write loop falls back to the
      // placeholder pattern in that case.
      email: string | null;
      phone: string | null;
      gender: string | null;
    }
  | {
      // Already-synced applicant needing a refresh — either their current
      // board_stage now resolves to Onboarding (stage) and/or their
      // phone/gender/email in career_applications has since changed, or was
      // never set on our side (personalInfo). Either half may be present
      // alone; the write loop only touches what's set.
      type: "update";
      userId: number;
      employmentId: number;
      stage?: { status: "onboarding"; probation: boolean };
      // Each field is present only if it actually needs writing — absent
      // (not just falsy) means "leave this field alone." A present value of
      // null means "career_applications' current value is genuinely blank,
      // sync that blankness over" — distinct from "don't touch."
      personalInfo?: { email?: string | null; phone?: string | null; gender?: string | null };
    }
  | { type: "skip"; reason: CareerApplicationSyncGap["reason"] };

export function normalizeName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface CareerApplicationLookupEntry {
  applicationId: number | null;
  boardStage: string | null;
  hiringNote: string | null;
  // rec_recruit -> rec_stage.name, name-matched the same way as board_stage
  // below — a SEPARATE, granular pipeline field that often disagrees with
  // board_stage (see conversation: Chan Ten Kiat's board_stage said
  // "Rejected" while rec_stage said "Trial"). Kept alongside board_stage,
  // not instead of it — per explicit decision, Probation-list membership is
  // now an OR across both fields (see isDualListedOnProbation /
  // isProbationOverrideExcluded below), since each field alone has been
  // caught disagreeing with reality in different, unpredictable directions.
  recStage: string | null;
}

// Live name-matched lookup into career_applications AND rec_recruit/
// rec_stage — used wherever a synced Pre/Probation record's page needs to
// reflect that source data's CURRENT state (board_stage for the Pre list's
// Status column; board_stage OR rec_stage for the Probation list's
// dual-listing; feedback1/feedback2 as the Hiring Notes fallback), not just
// what was true at sync time. Same normalizeName matching the sync itself
// uses, same "approximate, name-based" caveat. Cheap in practice — both
// tables are a few hundred rows total — so always fetches everything rather
// than trying to filter server-side by a list of names.
export async function lookupCareerApplicationsByName(): Promise<Map<string, CareerApplicationLookupEntry>> {
  const [{ rows: apps }, { rows: recs }, { rows: stages }] = await Promise.all([
    queryEbrightHrfs<{
      id: number;
      name: string;
      board_stage: string | null;
      feedback1: string | null;
      feedback2: string | null;
    }>(`select id, name, board_stage, feedback1, feedback2 from public.career_applications`),
    queryEbrightHrfs<{ name: string; stageId: string | null }>(`select name, "stageId" from public.rec_recruit`),
    queryEbrightHrfs<{ id: string; name: string }>(`select id, name from public.rec_stage`),
  ]);

  const stageNameById = new Map(stages.map((s) => [s.id, s.name]));
  const recStageByName = new Map<string, string | null>();
  for (const r of recs) {
    const key = normalizeName(r.name);
    if (!key) continue;
    recStageByName.set(key, r.stageId ? (stageNameById.get(r.stageId) ?? null) : null);
  }

  const map = new Map<string, CareerApplicationLookupEntry>();
  for (const r of apps) {
    const key = normalizeName(r.name);
    if (!key) continue;
    map.set(key, {
      applicationId: r.id,
      boardStage: r.board_stage,
      hiringNote: (r.feedback1?.trim() || r.feedback2?.trim()) || null,
      recStage: recStageByName.get(key) ?? null,
    });
  }
  // A rec_recruit row with no matching career_applications row (e.g.
  // someone whose recruitment record predates career_applications, or was
  // entered straight into the pipeline board) still needs to be checkable —
  // otherwise a real employee who only ever exists in rec_recruit could
  // never be OR-matched into the Probation list at all.
  for (const [key, recStage] of recStageByName) {
    if (!map.has(key)) map.set(key, { applicationId: null, boardStage: null, hiringNote: null, recStage });
  }
  return map;
}

// Probation-list membership per explicit decision: a person belongs on the
// Probation list if EITHER career_applications.board_stage OR
// rec_recruit/rec_stage.name reads "Probation" — neither field alone is
// trusted enough on its own (both have been caught disagreeing with the
// other and with reality; see the recStage doc comment above). Pure,
// map-lookup version — takes an already-fetched lookup entry so a caller
// iterating many rows (the list page) can fetch lookupCareerApplicationsByName()
// ONCE instead of once per row; matchIsProbationOverrideExcluded below is
// its mirror. The single-name async wrappers further below wrap both for
// one-off callers (the profile page, checking just the row it's rendering).
export function matchIsProbationPipeline(match: CareerApplicationLookupEntry | undefined): boolean {
  return Boolean(match && (match.boardStage === "Probation" || match.recStage === "Probation"));
}

// The flip side of the same rule: a person whose OWN employment record has
// probation=true (set by someone manually clicking "Proceed") should NOT
// show on the Probation list if BOTH pipeline fields are known and NEITHER
// says "Probation" — the manual flag doesn't get to override when the
// pipeline data actively contradicts it. Deliberately returns false (i.e.
// trust the manual flag) when there's no pipeline match at all, or the
// match has no data in either field — this only excludes on a genuine,
// positive contradiction, not on an absence of data.
export function matchIsProbationOverrideExcluded(match: CareerApplicationLookupEntry | undefined): boolean {
  if (!match) return false;
  if (match.boardStage === "Probation" || match.recStage === "Probation") return false;
  return Boolean(match.boardStage || match.recStage);
}

// Used both to decide whether to dual-list a not-really-Probation-stage row
// onto the Probation list, and by the profile page to decide whether to
// relax its stage guard for that same row — the two can never disagree
// since both ultimately call matchIsProbationPipeline.
export async function isDualListedOnProbation(fullName: string): Promise<boolean> {
  const map = await lookupCareerApplicationsByName();
  return matchIsProbationPipeline(map.get(normalizeName(fullName)));
}

export async function isProbationOverrideExcluded(fullName: string): Promise<boolean> {
  const map = await lookupCareerApplicationsByName();
  return matchIsProbationOverrideExcluded(map.get(normalizeName(fullName)));
}

// A person shows on the Onboarding list beyond their own real stage (their
// stored stage is never touched) if EITHER: they're a real Probation-stage,
// Full-Time employee (Probation and Onboarding run concurrently for
// Full-Time hires, per explicit decision — same rule as
// isDualListedOnOnboarding in employeeQueries.ts, reimplemented here since
// this version also needs the pipeline check below in the same pass), OR
// they're a real Active-stage, Full-Time employee whose recruitment
// pipeline (board_stage/rec_stage) still reads "Probation" — i.e. exactly
// the same people the Probation list itself dual-lists via
// matchIsProbationPipeline (see [stage]/page.tsx's probation branch),
// per explicit decision that anyone visible on Probation should also be
// visible on Onboarding while Full-Time, not just the Probation-stage
// subset of them. Never true for someone already natively Onboarding-stage
// — they're already there, no dual-listing needed.
export function matchBelongsOnOnboardingList(
  row: { stage: EmployeeStage; position: string | null },
  match: CareerApplicationLookupEntry | undefined,
): boolean {
  if (row.stage === "onboarding") return false;
  if (positionGroup(row.position) !== "Full Time") return false;
  if (row.stage === "probation") return true;
  return matchIsProbationPipeline(match);
}

export async function computeOnboardingDualListedRows<
  T extends { fullName: string; stage: EmployeeStage; position: string | null },
>(rows: T[]): Promise<T[]> {
  const map = await lookupCareerApplicationsByName();
  return rows.filter((row) => matchBelongsOnOnboardingList(row, map.get(normalizeName(row.fullName))));
}

// Single-person version for the Onboarding profile page's stage guard —
// same rule as computeOnboardingDualListedRows, just for whichever one row
// that page is rendering.
export async function isEligibleForOnboardingDualListing(row: {
  fullName: string;
  stage: EmployeeStage;
  position: string | null;
}): Promise<boolean> {
  const map = await lookupCareerApplicationsByName();
  return matchBelongsOnOnboardingList(row, map.get(normalizeName(row.fullName)));
}

// ebright_hrfs's real operational HR roster (confirmed table/columns by
// direct schema inspection — not the auth `hrfs` Prisma database, a
// same-named but unrelated thing; see ebright-hrfs.ts's own note on this).
// Used as a live Branch/Department fallback for Probation-list rows whose
// own employment record has neither set — most commonly a dual-listed row
// still mid-recruitment-pipeline (career_applications/rec_recruit have no
// branch/department column of their own), but BranchStaff already has real,
// current values for them since HR enters new hires there as soon as
// they're signed, generally before this system's own employment row is
// fully filled in. department wins over branch when both resolve, matching
// resolveDepartmentBranch's existing rule everywhere else; a compound value
// like "HR/IOP" (seen on real data) is retried by its first "/"-segment
// since the compound itself never matches a real department code/name.
export async function lookupBranchStaffLocationByName(
  branches: BranchOpt[],
  departments: DepartmentOpt[],
): Promise<Map<string, ReturnType<typeof resolveDepartmentBranch>>> {
  const { rows } = await queryEbrightHrfs<{ name: string; branch: string | null; department: string | null }>(
    `select name, branch, department from public."BranchStaff"`,
  );
  const map = new Map<string, ReturnType<typeof resolveDepartmentBranch>>();
  for (const r of rows) {
    const key = normalizeName(r.name);
    if (!key) continue;
    let resolved = r.department ? resolveDepartmentBranch(r.department, departments, branches) : null;
    if (resolved && !resolved.departmentCode && !resolved.branchCode && r.department!.includes("/")) {
      resolved = resolveDepartmentBranch(r.department!.split("/")[0].trim(), departments, branches);
    }
    if (!resolved || (!resolved.departmentCode && !resolved.branchCode)) {
      resolved = r.branch ? resolveDepartmentBranch(r.branch, departments, branches) : null;
    }
    if (resolved && (resolved.departmentCode || resolved.branchCode)) map.set(key, resolved);
  }
  return map;
}

// Display-only Branch/Department fallback for the By-Branch/By-Department
// grouping and its drill-down lists (Onboarding/Active/Exit) — the same
// BranchStaff lookup the Probation list already uses, generalized to
// anyone with neither branch_id nor department_id set on their own
// employment row, not just the people flagged in conversation. Returns NEW
// row objects (never mutates the input) for rows it fills in; rows that
// already have real data, or have no BranchStaff match, are returned
// unchanged (by reference) so callers can freely mix this into a list
// without extra copying. Purely for grouping/rendering — nothing here ever
// writes to an employment record.
export async function enrichRowsWithBranchStaffLocation<
  T extends { fullName: string; branchCode: string | null; branchName: string | null; departmentCode: string | null; departmentName: string | null },
>(rows: T[], branches: BranchOpt[], departments: DepartmentOpt[]): Promise<T[]> {
  if (!rows.some((r) => !r.branchCode && !r.departmentCode)) return rows;
  const branchStaffByName = await lookupBranchStaffLocationByName(branches, departments);
  return rows.map((row) => {
    if (row.branchCode || row.departmentCode) return row;
    const loc = branchStaffByName.get(normalizeName(row.fullName));
    if (!loc) return row;
    return {
      ...row,
      branchCode: loc.branchCode ?? null,
      branchName: loc.branchName ?? null,
      departmentCode: loc.departmentCode ?? null,
      departmentName: loc.departmentName ?? null,
    };
  });
}

// Pure per-applicant decision — no I/O, fully unit-testable without a
// database or mocks. The DB-writing loop below just executes what this
// returns.
export function decideSyncAction(app: CareerApplicationRow, ctx: SyncContext): SyncAction {
  const key = normalizeName(app.name);

  const placeholder = ctx.placeholdersByName.get(key);
  if (placeholder) {
    const mapped = app.board_stage ? BOARD_STAGE_TO_OUR_STAGE[app.board_stage] : undefined;
    const stage =
      mapped && (placeholder.status !== mapped.status || placeholder.probation !== mapped.probation)
        ? { status: mapped.status, probation: mapped.probation }
        : undefined;

    // Personal info refresh — phone/gender always refreshed to match
    // career_applications' current value (per explicit decision, this is an
    // ongoing sync, not a one-time fill); email only filled in if it's still
    // the auto-generated placeholder pattern, never overwriting a real
    // email that's since been set (manually or by an earlier sync run) —
    // users.email is the login identifier, so silently changing an
    // already-real value would be a genuinely surprising, risky side effect.
    const newPhone = app.phone?.trim() || null;
    const newGender = app.gender?.trim() || null;
    const phoneChanged = newPhone !== placeholder.phone;
    const genderChanged = newGender !== placeholder.gender;
    const isPlaceholderEmail = placeholder.email.startsWith("pre-") && placeholder.email.endsWith("@placeholder.ebright.my");
    const normalizedNewEmail = app.email ? normalizeEmail(app.email) : "";
    const emailFillable = isPlaceholderEmail && normalizedNewEmail && !ctx.usedEmails.has(normalizedNewEmail);
    const personalInfo =
      phoneChanged || genderChanged || emailFillable
        ? {
            ...(phoneChanged ? { phone: newPhone } : {}),
            ...(genderChanged ? { gender: newGender } : {}),
            ...(emailFillable ? { email: app.email.trim() } : {}),
          }
        : undefined;

    if (!stage && !personalInfo) {
      return { type: "skip", reason: mapped ? "duplicate-placeholder" : "no-board-stage-match" };
    }
    return { type: "update", userId: placeholder.userId, employmentId: placeholder.employmentId, stage, personalInfo };
  }
  if (ctx.realEmployeeNames.has(key)) return { type: "skip", reason: "already-employee" };

  const branchId = app.branch ? ctx.branchByCode.get(app.branch.toUpperCase()) ?? null : null;
  const departmentId = app.department ? ctx.departmentByCodeOrName.get(app.department.toUpperCase()) ?? null : null;
  const normalizedEmail = app.email ? normalizeEmail(app.email) : "";
  const email = normalizedEmail && !ctx.usedEmails.has(normalizedEmail) ? app.email.trim() : null;
  return {
    type: "create",
    startDate: app.start_trial,
    branchId,
    departmentId,
    email,
    phone: app.phone?.trim() || null,
    gender: app.gender?.trim() || null,
  };
}

export async function syncCareerApplicationsToPreStage(): Promise<CareerApplicationSyncResult> {
  const gaps: CareerApplicationSyncGap[] = [];
  let created = 0;
  let updated = 0;

  // No filter — every row, every stage (new/screening/interview/offer/
  // hired/rejected alike). Widened from an accepted/hired-only filter per
  // explicit decision (see conversation).
  const { rows: applications } = await queryEbrightHrfs<CareerApplicationRow>(
    `select id, name, position, branch, department, start_trial, email, phone, gender, board_stage
     from public.career_applications`,
  );
  if (applications.length === 0) return { created, updated, gaps };

  const [branches, departments, existingUsers, placeholderUsers, allUserEmails] = await Promise.all([
    prisma.branch.findMany({ select: { branch_id: true, branch_code: true } }),
    prisma.department.findMany({ select: { department_id: true, department_code: true, department_name: true } }),
    prisma.user_profile.findMany({ select: { full_name: true } }),
    prisma.users.findMany({
      where: { email: { startsWith: "pre-", endsWith: "@placeholder.ebright.my" } },
      select: {
        user_id: true,
        email: true,
        user_profile: { select: { full_name: true, phone: true, gender: true } },
        employment: { orderBy: { start_date: "desc" }, take: 1, select: { employment_id: true, status: true, probation: true } },
      },
    }),
    prisma.users.findMany({ select: { email: true } }),
  ]);

  const placeholdersByName = new Map<string, PlaceholderRecord>();
  for (const u of placeholderUsers) {
    const key = normalizeName(u.user_profile?.full_name ?? "");
    const emp = u.employment[0];
    if (!key || !emp) continue;
    placeholdersByName.set(key, {
      userId: u.user_id,
      employmentId: emp.employment_id,
      status: emp.status,
      probation: emp.probation,
      email: u.email,
      phone: u.user_profile?.phone ?? null,
      gender: u.user_profile?.gender ?? null,
    });
  }

  const ctx: SyncContext = {
    realEmployeeNames: new Set(existingUsers.map((u) => normalizeName(u.full_name))),
    placeholdersByName,
    branchByCode: new Map(branches.filter((b) => b.branch_code).map((b) => [b.branch_code!.toUpperCase(), b.branch_id])),
    departmentByCodeOrName: new Map<string, number>(),
    usedEmails: new Set(allUserEmails.map((u) => normalizeEmail(u.email))),
  };
  for (const d of departments) {
    ctx.departmentByCodeOrName.set(d.department_code.toUpperCase(), d.department_id);
    ctx.departmentByCodeOrName.set(d.department_name.toUpperCase(), d.department_id);
  }

  for (const app of applications) {
    const key = normalizeName(app.name);
    if (!key) continue;

    const action = decideSyncAction(app, ctx);
    if (action.type === "skip") {
      gaps.push({ applicationId: app.id, name: app.name, reason: action.reason });
      continue;
    }

    if (action.type === "update") {
      const previous = ctx.placeholdersByName.get(key)!;
      await Promise.all([
        action.stage
          ? prisma.employment.update({
              where: { employment_id: action.employmentId },
              data: { status: action.stage.status, probation: action.stage.probation },
            })
          : Promise.resolve(),
        action.personalInfo
          ? prisma.users.update({
              where: { user_id: action.userId },
              data: {
                ...(action.personalInfo.email !== undefined ? { email: action.personalInfo.email! } : {}),
                user_profile: {
                  update: {
                    ...(action.personalInfo.phone !== undefined ? { phone: action.personalInfo.phone } : {}),
                    ...(action.personalInfo.gender !== undefined ? { gender: action.personalInfo.gender } : {}),
                  },
                },
              },
            })
          : Promise.resolve(),
      ]);
      // Reflect the new state in ctx so a duplicate application row later in
      // this same run (or the "already at target" no-op check) sees it.
      ctx.placeholdersByName.set(key, {
        userId: action.userId,
        employmentId: action.employmentId,
        status: action.stage?.status ?? previous.status,
        probation: action.stage?.probation ?? previous.probation,
        email: action.personalInfo?.email !== undefined ? action.personalInfo.email! : previous.email,
        phone: action.personalInfo?.phone !== undefined ? action.personalInfo.phone : previous.phone,
        gender: action.personalInfo?.gender !== undefined ? action.personalInfo.gender : previous.gender,
      });
      if (action.personalInfo?.email !== undefined) ctx.usedEmails.add(normalizeEmail(action.personalInfo.email!));
      updated++;
      continue;
    }

    const placeholderEmail = `pre-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@placeholder.ebright.my`;
    const email = action.email ?? placeholderEmail;
    const created_ = await prisma.users.create({
      data: {
        email,
        role_id: STAFF_ROLE_ID,
        status: "active",
        user_profile: { create: { full_name: app.name, phone: action.phone, gender: action.gender } },
        employment: {
          create: {
            position: app.position,
            branch_id: action.branchId,
            department_id: action.departmentId,
            start_date: action.startDate,
            status: "pre",
          },
        },
      },
      select: { user_id: true, employment: { select: { employment_id: true } } },
    });
    // Prevent a second application row in the same run from also matching
    // this name (e.g. a re-submitted/duplicate application), and from
    // reusing the same email (e.g. a re-submitted/duplicate application, or
    // two different applicants who happen to share an inbox).
    ctx.placeholdersByName.set(key, {
      userId: created_.user_id,
      employmentId: created_.employment[0].employment_id,
      status: "pre",
      probation: false,
      email,
      phone: action.phone,
      gender: action.gender,
    });
    ctx.usedEmails.add(normalizeEmail(email));
    created++;
  }

  return { created, updated, gaps };
}
