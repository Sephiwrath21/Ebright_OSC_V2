import "server-only";
import { normalizeName } from "@/lib/normalizeName";
import { prisma } from "@/lib/prisma";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";
import {
  STAFF_ROLE_ID,
  CONFIRMED_HIRE_ID_OFFSET,
  resolveDepartmentBranch,
  listEmployeeOverviewRows,
  listBranches,
  listDepartments,
  internActiveFromDate,
  partTimeActiveFromDate,
  type EmployeeOverviewRow,
  type EmployeeDetailFull,
  type BranchOpt,
  type DepartmentOpt,
} from "@/lib/employeeQueries";
import { positionGroup, type EmployeeStage, type PositionGroup } from "@/lib/employeeStages";
import { titleCaseNameOrNull } from "@/lib/text";
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

export { normalizeName };

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
  // Probation stage's own "Feedback" section (see probationDecision.ts) —
  // feedback2 specifically, NOT the feedback1-or-feedback2 fallback pair
  // hiringNote above already uses for a different, pre-existing UI element.
  feedback2: string | null;
  // Probation stage's own Confirm/Stop/In Progress display status (see
  // probationDecision.ts) — "Accept"/"Rejected"/empty, read-only.
  status2: string | null;
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
      status2: string | null;
    }>(`select id, name, board_stage, feedback1, feedback2, status2 from public.career_applications`),
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
      feedback2: r.feedback2?.trim() || null,
      status2: r.status2?.trim() || null,
    });
  }
  // A rec_recruit row with no matching career_applications row (e.g.
  // someone whose recruitment record predates career_applications, or was
  // entered straight into the pipeline board) still needs to be checkable —
  // otherwise a real employee who only ever exists in rec_recruit could
  // never be OR-matched into the Probation list at all.
  for (const [key, recStage] of recStageByName) {
    if (!map.has(key))
      map.set(key, { applicationId: null, boardStage: null, hiringNote: null, recStage, feedback2: null, status2: null });
  }
  return map;
}

// Live Full Time/Part Time/Intern signal for real-account classification —
// used by computeRealAccountLifecycleOverrides below and by
// probationDecision.ts's own Full-Time filters — resolved directly from
// ebright_hrfs.BranchStaff.employment_type (the clean "Part Time"/
// "Full Time" value HR actually maintains there), falling back to
// BranchStaff.role (free-text but still classifiable, e.g. "PT Coach")
// when employment_type itself is blank. Deliberately NOT sourced from
// employment.position (can be stale/ghost-originated — see
// syncCareerApplicationsToPreStage's fake positions) or
// onboarding_candidate.position (frequently null — the BranchStaff sync
// that populates it never captured employment_type/role at all; see
// conversation, Wan Noraina Sofia Binti Mior Rasdi's own BranchStaff row:
// employment_type="Part Time", role="PT Coach", position=null). Same
// simple one-batch-query, last-write-wins-by-normalized-name pattern as
// lookupCareerApplicationsByName() above — every caller falls back to
// positionGroup(row.position) when a name has no BranchStaff match, same
// as before this function existed.
export async function lookupBranchStaffPositionGroupByName(): Promise<Map<string, PositionGroup>> {
  const { rows } = await queryEbrightHrfs<{ name: string; employment_type: string | null; role: string | null }>(
    `select name, employment_type, role from public."BranchStaff"`,
  );
  const map = new Map<string, PositionGroup>();
  for (const r of rows) {
    const key = normalizeName(r.name);
    if (!key) continue;
    const signal = r.employment_type?.trim() || r.role?.trim();
    if (signal) map.set(key, positionGroup(signal));
  }
  return map;
}

// Probation-list membership, per explicit decision (see conversation) —
// narrowed to career_applications.board_stage alone. rec_recruit/
// rec_stage.name used to also count (an OR across both fields), but that's
// been dropped; recStage is kept on CareerApplicationLookupEntry for
// matchIsProbationOverrideExcluded below and any other existing reader, just
// no longer consulted here. Pure, map-lookup version — takes an
// already-fetched lookup entry so a caller iterating many rows (the list
// page) can fetch lookupCareerApplicationsByName() ONCE instead of once per
// row; matchIsProbationOverrideExcluded below is its mirror. The single-name
// async wrappers further below wrap both for one-off callers (the profile
// page, checking just the row it's rendering).
export function matchIsProbationPipeline(match: CareerApplicationLookupEntry | undefined): boolean {
  return Boolean(match && match.boardStage === "Probation");
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

// A real Probation-stage row whose manual flag the pipeline actively
// contradicts (matchIsProbationOverrideExcluded) isn't really Probation at
// all, per explicit decision (see conversation) — removed entirely
// wherever stage is displayed or counted, not just the dedicated Probation
// list. Shared here so the Employee Records page and the dedicated
// Probation/Onboarding/Active pages all apply the same removal to the same
// population, instead of drifting.
export function excludeOverrideRejectedRows<T extends { stage: EmployeeStage; fullName: string }>(
  rows: T[],
  careerApplications: Map<string, CareerApplicationLookupEntry>,
): T[] {
  return rows.filter(
    (r) => r.stage !== "probation" || !matchIsProbationOverrideExcluded(careerApplications.get(normalizeName(r.fullName))),
  );
}

// A real Active-stage row whose pipeline ALSO reads Probation (e.g. a
// person whose employment.status="active" but career_applications.
// board_stage still says "Probation") is ambiguous on its own: is the
// pipeline just lagging behind a real transition that already happened, or
// is it the current, accurate state? Per explicit decision (see
// conversation), resolved by the row's own PROBATION END DATE (see
// probationDecision.ts's computeProbationEndDates) — NOT the start date
// this used to check: Ayu Novitasari started 2026-05-23 (already passed)
// but her actual probation end date is 2026-08-23, so checking start date
// alone dropped her to Active-only over two months before her probation
// genuinely ended. A start date passing only means she began working, not
// that her probation period is over.
//   - probation end date has passed (or was never recorded at all,
//     including no fallback available) -> the pipeline is stale; genuinely
//     Active only, no Probation/Onboarding badge or count.
//   - probation end date hasn't passed yet -> Probation and Onboarding are
//     the real, current state instead; no Active badge or count.
// Returns the "passed" set — every OR-rule addition driven by
// matchIsProbationPipeline/matchBelongsOnOnboardingList should skip rows in
// this set and treat them as plain Active instead. Shared (dynamic import
// of probationDecision.ts to avoid the circular import both files already
// have elsewhere) so every page applies the same rule to the same
// population, not just the Employee Records table.
export async function computeActivePipelineProbationPassedIds<T extends { id: number; stage: EmployeeStage; fullName: string }>(
  rows: T[],
  careerApplications: Map<string, CareerApplicationLookupEntry>,
): Promise<Set<number>> {
  const { computeProbationEndDates } = await import("@/lib/probationDecision");
  const candidates = rows.filter(
    (r) => r.stage === "active" && matchIsProbationPipeline(careerApplications.get(normalizeName(r.fullName))),
  );
  const endDates = await computeProbationEndDates(candidates);
  const todayIso = new Date().toISOString().slice(0, 10);
  return new Set(
    candidates
      .filter((r) => {
        const endDate = endDates.get(r.id);
        return endDate != null && endDate <= todayIso;
      })
      .map((r) => r.id),
  );
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
  // A real Probation-stage row whose manual flag the pipeline actively
  // contradicts (matchIsProbationOverrideExcluded) isn't really Probation at
  // all per that same rule — per explicit decision, these people are
  // removed entirely (no stage, no card, no list), so they must not
  // qualify here either, the same way they no longer qualify for the
  // Probation list itself.
  if (row.stage === "probation") return !matchIsProbationOverrideExcluded(match);
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

export interface RealAccountLifecycleOverride {
  stage: "probation" | "onboarding" | "active";
  extraStages?: EmployeeStage[];
}

// Real-account Probation/Onboarding/Active membership, per explicit
// decision (see conversation) — REPLACES matchBelongsOnOnboardingList/
// computeActivePipelineProbationPassedIds's role in deciding this for real
// accounts. Scope: real accounts only — a candidate with no real
// users/employment row yet is untouched regardless of how far past their
// onboarding_candidate.start_date is (see conversation: out of scope until
// the existing induction/conversion flow gives them a real account).
//
// Only ever overrides rows whose base computed stage (stageForRow, see
// employeeQueries.ts) is already "onboarding", "probation", or "active" —
// Pre and Exit are untouched, already correctly resolved elsewhere
// (computePreStageRows/computePreStartDatePassedRows for Pre, the base
// stage computation's own end_date check for Exit).
//
// Probation MEMBERSHIP (entry), per explicit decision (see conversation,
// correcting an earlier version of this rule that used Full Time + not-yet-
// Confirmed as the trigger and caught long-standing real employees who
// predate this feature — Ng Ying Chen/Iqbal Hakim Bin Halim/Muhammad Adam
// Shah Bin Jasmin): resolvePositionGroup(row) === "Full Time" (live
// BranchStaff signal, falling back to employment.position — see
// lookupBranchStaffPositionGroupByName) AND EITHER of two independent
// paths, split by whether this person has any recruitment-pipeline
// footprint at all:
//   - Has a career_applications/rec_recruit match (name-matched via
//     lookupCareerApplicationsByName): career_applications.board_stage ===
//     "Probation" (via matchIsProbationPipeline) — surveyed live, this is a
//     clean, unambiguous value with no spelling variants to worry about (6
//     real matches, all Full Time, all with sensible past start_dates). A
//     match with any OTHER board_stage (e.g. "Rejected") does NOT fall
//     through to the second path below — having a match at all, even a
//     non-"Probation" one, is what disqualifies someone from it.
//   - No match at all: Full Time + employment.start_date already arrived
//     is itself sufficient — no board_stage to check, no manual button, no
//     pre-existing probation row required. This is exactly
//     addPreStageEmployee's manual "+ Add" shape (see conversation — Test
//     Rui En was permanently stuck at Onboarding before this path
//     existed). Long-standing employees who also have no pipeline match
//     (Ng Ying Chen et al.) hit this path too, but computeProbationEndDates'
//     start_date+3-months fallback below is what keeps them correctly at
//     Active instead of stuck — same mechanism, not a special case.
// Part Time/Intern/Protege Intern are NEVER eligible for Probation via
// either path — they stay in the Onboarding-only 3-day flow below
// unconditionally.
//
// Probation EXIT (to Active) is unchanged from before — still purely
// isEffectivelyConfirmed (Confirm/Extend/Stop's local decision, or external
// status2="Accept"), reused as-is from probationDecision.ts, no day count.
// Same narrow exception as before for a row with NO probation row at all
// yet (never Confirmed, Extended, Stopped, or even opened) — applies to
// BOTH membership paths above identically, not just the board_stage one:
// falls back to the resolved probation end date (computeProbationEndDates
// — BranchStaff.probation, local probation.end_date, or start_date+3
// months, in that order), rather than staying stuck in Probation forever
// just because nobody ever opened a probation record. A row that DOES have
// a probation row, whatever its status, always keeps the plain Confirm-gate
// with no date fallback — an explicit HR signal wins outright. (Live data:
// Ayu Novitasari's own resolved end date, 2026-08-23, is still in the
// future, so she's unaffected — stays Probation+Onboarding, exactly the
// case this exception was built to protect.)
//
// Full Time rows that match NEITHER path above (has a pipeline entry, but
// its board_stage isn't "Probation") get no override here at all — they
// keep whatever their raw/base stage already is (e.g. genuinely "active",
// or a stored "onboarding"/"probation" from elsewhere), same as any other
// row this function doesn't touch.
//
// Part Time/Intern/Protege Intern: Onboarding only, no Probation, ever. No
// Confirm concept applies, so a real employment.status of "active" IS
// trusted directly (covers the manual "Next" early-advance click). Otherwise
// 3 FIXED CALENDAR days from employment.start_date (day 1 = start_date
// itself, day 4 = start_date + 3 days) auto-advances to Active — purely
// computed here, nothing written.
export async function computeRealAccountLifecycleOverrides<
  T extends { id: number; fullName: string; stage: EmployeeStage; position: string | null },
>(
  rows: T[],
  careerApplications: Map<string, CareerApplicationLookupEntry>,
  // Optional — pass the already-fetched map when the caller's own page
  // needs it in more than one place (Employee Overview, the stage summary
  // pages, the two leaf namelist pages all do), so this doesn't re-run the
  // same unfiltered BranchStaff table scan once per call. Falls back to
  // fetching its own when omitted (single-row callers like
  // getRealAccountLifecycleOverride below don't need to bother threading
  // it through).
  branchStaffPositionGroups?: Map<string, PositionGroup>,
): Promise<Map<number, RealAccountLifecycleOverride>> {
  const eligible = rows.filter((r) => r.stage === "onboarding" || r.stage === "probation" || r.stage === "active");
  const result = new Map<number, RealAccountLifecycleOverride>();
  if (eligible.length === 0) return result;

  const { computeAutoConfirmedProbationIds, computeProbationEndDates } = await import("@/lib/probationDecision");
  const employments = await prisma.employment.findMany({
    where: { user_id: { in: eligible.map((r) => r.id) } },
    orderBy: { start_date: "desc" },
    select: { user_id: true, status: true, start_date: true, working_hours_json: true },
  });
  const empByUserId = new Map<number, (typeof employments)[number]>();
  for (const e of employments) if (!empByUserId.has(e.user_id)) empByUserId.set(e.user_id, e);

  // Live BranchStaff signal wins over employment.position — see
  // lookupBranchStaffPositionGroupByName's own comment.
  const bsPositionGroups = branchStaffPositionGroups ?? (await lookupBranchStaffPositionGroupByName());
  const resolvePositionGroup = (row: T): PositionGroup =>
    bsPositionGroups.get(normalizeName(row.fullName)) ?? positionGroup(row.position);

  const todayIso = new Date().toISOString().slice(0, 10);

  const probationMatched = eligible.filter((r) => {
    if (resolvePositionGroup(r) !== "Full Time") return false;
    const match = careerApplications.get(normalizeName(r.fullName));
    if (matchIsProbationPipeline(match)) return true;
    // Second, independent path into Probation, per explicit decision (see
    // conversation): a Full-Time real account with NO board_stage footprint
    // (not "has an entry with some other board_stage" — that's `match.
    // boardStage` being set to something other than "Probation", which
    // stays excluded here, same as before) has no pipeline to check in the
    // first place — addPreStageEmployee's manual "+ Add" is exactly this
    // shape. Once their start_date has arrived, Full Time + started is
    // itself sufficient. No manual button, no pre-existing probation row
    // required — membership alone; computeProbationEndDates' fallback
    // below (start_date + 3 months) is what keeps a long-standing employee
    // in this bucket (e.g. Ng Ying Chen, started 2020) from getting stuck
    // here instead of Active — see that function's own comment.
    //
    // Checks match.boardStage specifically, NOT match's mere existence —
    // fixed 2026-08-13, was `if (match) return false`, which incorrectly
    // treated a rec_recruit/rec_stage-only match (board_stage itself null)
    // as disqualifying "footprint", wrongly excluding a Full-Time account
    // whose only career_applications trace was an unrelated rec_stage value
    // (e.g. "Hired (HRD)") with no board_stage at all — confirmed live via
    // two test accounts (user_id 2256, 2260) that should have qualified via
    // this fallback path but silently got neither Probation membership nor
    // this loop's own dual-listing, 404ing their own Probation profile page.
    if (match?.boardStage != null) return false;
    const emp = empByUserId.get(r.id);
    return Boolean(emp?.start_date && emp.start_date.toISOString().slice(0, 10) <= todayIso);
  });
  const probationMatchedIds = new Set(probationMatched.map((r) => r.id));
  const confirmedIds = await computeAutoConfirmedProbationIds(probationMatched, careerApplications, bsPositionGroups);

  // Split per explicit decision (see conversation, 2026-08-25): a
  // board-stage-matched row (real career_applications entry, board_stage
  // === "Probation" — see matchIsProbationPipeline above) has a genuinely
  // trackable feedback2/status2 signal, so it should ONLY ever leave
  // Probation via isEffectivelyConfirmed (local "Confirmed" or
  // status2="Accept"+feedback2 set) — no date-based escape hatch. Without
  // an explicit confirmation it stays in Probation+Onboarding indefinitely,
  // even once its estimated end date passes. The no-match population (no
  // board_stage footprint at all — addPreStageEmployee's manual "+ Add"
  // shape) has nothing else to check against, so it keeps the original
  // pastEndDateIds fallback exactly as before (see computeProbationEndDates'
  // own comment on why this exists — Ng Ying Chen et al. would otherwise be
  // stuck in Probation forever with no way out).
  const hasBoardStageMatch = (r: T) => careerApplications.get(normalizeName(r.fullName))?.boardStage != null;
  const noMatchStarted = probationMatched.filter((r) => !hasBoardStageMatch(r));

  // No-match rows with NO probation row at all yet — see the function's
  // own doc comment above. Board-stage-matched rows never reach the date
  // fallback at all now, so they're excluded from this query entirely.
  const probationRows = await prisma.probation.findMany({
    where: { user_id: { in: noMatchStarted.map((r) => r.id) } },
    select: { user_id: true },
  });
  const hasProbationRow = new Set(probationRows.map((p) => p.user_id));
  const noProbationRowRows = noMatchStarted.filter((r) => !confirmedIds.has(r.id) && !hasProbationRow.has(r.id));
  const probationEndDates = await computeProbationEndDates(noProbationRowRows);
  const pastEndDateIds = new Set(
    noProbationRowRows
      .filter((r) => {
        const endDate = probationEndDates.get(r.id);
        return endDate != null && endDate <= todayIso;
      })
      .map((r) => r.id),
  );

  for (const row of eligible) {
    // board_stage-matched Probation membership doesn't depend on
    // employment.start_date at all (several of the 6 real matches have a
    // null start_date — a leftover gap from the old ghost-manufacturing
    // sync — and the old career_applications-pipeline mechanism this
    // replaces never required one either) — checked and resolved before
    // the start_date gate below, which only applies to the Part Time/
    // Intern day-count branch that genuinely needs a date to count from.
    if (probationMatchedIds.has(row.id)) {
      const effectivelyDone = confirmedIds.has(row.id) || (!hasBoardStageMatch(row) && pastEndDateIds.has(row.id));
      result.set(row.id, effectivelyDone ? { stage: "active" } : { stage: "probation", extraStages: ["onboarding"] });
      continue;
    }

    const emp = empByUserId.get(row.id);
    if (!emp?.start_date) continue;
    const startIso = emp.start_date.toISOString().slice(0, 10);
    if (startIso > todayIso) continue;

    const posGroup = resolvePositionGroup(row);
    if (posGroup === "Intern") {
      // Tue-Sat scheduled-working-day rule (see conversation) — start_date
      // is the sole authority once it's arrived; emp.status is NOT
      // consulted (that was this exact bug: a real Intern stored as
      // status="active" — e.g. Nur Aerisya Binti Abdillah — got marked
      // Active immediately below without ever checking her day-count).
      // Same canonical function employeeQueries.ts's own Intern override
      // uses — this was a second, independent (and until now, buggy)
      // reimplementation of that same rule; kept in sync by sharing the one
      // function instead of two copies drifting apart again.
      result.set(row.id, { stage: todayIso >= internActiveFromDate(emp.start_date) ? "active" : "onboarding" });
      continue;
    }
    if (posGroup !== "Full Time") {
      // Part Time — working_hours_json-based 4-working-day rule (see
      // conversation, 2026-08-22 spec), same shape as the Intern branch
      // above. emp.status is deliberately NOT consulted directly — trusting
      // a stored "active" was exactly the bug already fixed for Interns
      // (see that branch's own comment), and was reproducing here too (a
      // Part Time employee stored as "active" on their own start_date
      // displayed Active immediately, skipping the working-day count
      // entirely).
      const activeFrom = partTimeActiveFromDate(emp.start_date, emp.working_hours_json);
      if (activeFrom == null) {
        console.warn(
          `[part-time-onboarding] working_hours_json has no working days configured for user_id=${row.id} — skipping the Onboarding->Active override`,
        );
        continue;
      }
      result.set(row.id, { stage: todayIso >= activeFrom ? "active" : "onboarding" });
    }
    // else: Full Time, not board_stage-matched — no override, keeps
    // whatever raw/base stage this row already had.
  }
  return result;
}

// Single-row wrapper for the profile-page guards.
export async function getRealAccountLifecycleOverride(row: {
  id: number;
  fullName: string;
  stage: EmployeeStage;
  position: string | null;
}): Promise<RealAccountLifecycleOverride | undefined> {
  const careerApplications = await lookupCareerApplicationsByName();
  const map = await computeRealAccountLifecycleOverrides([row], careerApplications);
  return map.get(row.id);
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

// ─── Pre stage list membership, per explicit decision (see conversation) —
// sourced SOLELY from hrfs.onboarding_candidate (a real Prisma model in the
// app's OWN main database — NOT ebright_hrfs, despite the naming pattern —
// confirmed by direct schema read): a person belongs on Pre if they have an
// onboarding_candidate row with a start_date still in the future.
//
// This used to also match on career_applications.board_stage being one of
// Hired/Intern/Full Time/Part Time (a confirmed-hire outcome). That branch
// is gone per explicit decision (see conversation): its write-side sibling,
// syncCareerApplicationsToPreStage() in this same file (now disabled — see
// instrumentation.ts's CAREER_APPLICATION_SYNC_ENABLED), created a real
// users/employment(status="pre") row for EVERY career_applications
// applicant regardless of board_stage, which is what produced 192 stale
// placeholder "employees" that had to be found and cleaned up. HRFS's
// career_applications/rec_recruit/rec_stage tables are read-only external
// data (ebright_hrfs) and are left completely untouched by this change —
// only this app's OWN Pre-stage membership rule changed.
//
// One override on top of the onboarding_candidate rule, found by checking
// live data before implementing (per explicit request): if someone's REAL
// employment record already shows a stage MORE ADVANCED than Pre
// (onboarding/probation/active/exit), that real, current data wins over a
// stale onboarding_candidate row (its own BranchStaff-sourced start_date
// simply hasn't been updated since they actually started). A real row still
// genuinely AT Pre (employment.status="pre") is unaffected.
//
// A second addition, per explicit decision (see conversation): a real
// account genuinely AT Pre with NO onboarding_candidate row at all also
// belongs here, using its own data directly — the manual "+ Add" button on
// this list (addPreStageEmployeeModal.tsx -> addPreStageEmployee) creates
// exactly this shape (a real users/employment(status="pre") row, no
// onboarding_candidate row) and was left with no way to ever become visible
// once this function stopped trusting employment.status="pre" on its own.
// addPreStageEmployee() itself is untouched — this is a read-side fix only.
// Deliberately scoped to "no onboarding_candidate row matches this name AT
// ALL" (any date, not just future), not "not currently eligible" — a real
// account whose name DOES match a stale/past-dated onboarding_candidate row
// keeps going through the OR-rule above unaffected; this only picks up
// names onboarding_candidate has never heard of.
//
// Narrowed further, per explicit decision (see conversation): this fallback
// used to admit ANY such real-no-match account, which unintentionally also
// let still-interviewing career_applications applicants leak onto Pre
// whenever production's still-undeployed sync-disable fix
// (CAREER_APPLICATION_SYNC_ENABLED, instrumentation.ts) created a real row
// for one directly in the shared database — identical shape to a
// legitimate manual add. An email-pattern filter was tried first and
// rejected (see conversation) — syncCareerApplicationsToPreStage()'s own
// create branch turned out to generate the exact same
// `pre-<ms>-<rand>@placeholder.ebright.my` format as its own fallback,
// making a ghost indistinguishable from a real manual add by email alone.
// Now restricted to accounts with a real start_date instead — see
// computePreEligibleRows's own comment on this exact filter below. Still no
// career_applications/rec_recruit involvement of any kind.

// One-off known-bad-data exception to the "real employment wins" override
// above, per explicit decision (see conversation) — NOT a change to the
// general rule, which stays correct for everyone else it excludes (Ayu,
// Muhammad Al Amin, Thulasi, Muadh, Zahid). Tang Rui's own real employment
// row (user_id 245, employment_id 200: status="active", start_date=
// 2026-08-01) is itself wrong, confirmed directly by the user — his real
// start date is 2026-08-15, matching onboarding_candidate's own record
// (source_id 363), not his employment row. Deliberately keyed to his real
// user_id specifically (not a name-based rule, which could accidentally
// widen to someone else) and deliberately a display-only exception, not a
// database correction — his employment row itself is left untouched.
const PRE_OVERRIDE_EXCEPTION_USER_IDS = new Set([245]); // Tang Rui

// ─── Confirmed-hire Pre-stage candidates, sourced from career_applications ──
//
// Per explicit decision (see conversation, 2026-08-11): a SECOND, narrowly-
// filtered path onto Pre, alongside the onboarding_candidate rule above —
// NOT a revival of syncCareerApplicationsToPreStage()/
// CAREER_APPLICATION_SYNC_ENABLED (left disabled, untouched), whose actual
// bug was writing a real users/employment row unconditionally for every
// career_applications applicant. This is read-only/computed instead — same
// shape as an onboarding_candidate row (isCandidate: true, no portal account
// until they actually start) — so even a filter mistake here means an extra
// name shown temporarily, never a permanent row needing cleanup.
//
// A candidate qualifies only when ALL of:
//   1. board_stage is one of the confirmed-hire values below (everything
//      else — new/screening/interview/offer/rejected/etc. — excluded).
//   2. Their name matches a BranchStaff row (ebright_hrfs) — checked against
//      the SAME normalized-name key set computePreEligibleRows already
//      fetches via lookupBranchStaffPositionGroupByName for position
//      resolution, so this adds no extra BranchStaff query.
//   3. position AND (department OR branch) AND start_trial are all present
//      on the career_applications row itself — no fallback to blank/
//      "(unnamed)" defaults for this path specifically.
//   4. start_trial is still in the future relative to today.
//
// "Part Timer" (not "Part Time") — confirmed against the live distinct
// board_stage values before implementing.
const CONFIRMED_HIRE_BOARD_STAGES = new Set(["Hired", "Intern", "Part Timer", "Full Time"]);

// Minimal shape computePreEligibleRows' eligible-candidate loop actually
// reads (source_id/name/position/department_branch/start_date) — both a
// real onboarding_candidate row and a ConfirmedHireCandidateRow below
// satisfy this structurally, so the two sources can share one loop/one
// merge without duplicating the Pre-stage row-construction logic.
interface PreCandidateSourceRow {
  source_id: number;
  name: string;
  position: string;
  department_branch: string;
  start_date: Date;
}

async function computeConfirmedHireCandidateRows(
  branchStaffNames: ReadonlySet<string>,
): Promise<PreCandidateSourceRow[]> {
  const { rows: applications } = await queryEbrightHrfs<CareerApplicationRow>(
    `select id, name, position, branch, department, start_trial, email, phone, gender, board_stage
     from public.career_applications`,
  );

  const todayIso = new Date().toISOString().slice(0, 10);
  const rows: PreCandidateSourceRow[] = [];
  for (const app of applications) {
    if (!app.board_stage || !CONFIRMED_HIRE_BOARD_STAGES.has(app.board_stage)) continue;
    const name = app.name?.trim();
    if (!name || !branchStaffNames.has(normalizeName(name))) continue;
    const position = app.position?.trim();
    const department = app.department?.trim();
    const branch = app.branch?.trim();
    if (!position || (!department && !branch)) continue;
    if (!app.start_trial) continue;
    if (app.start_trial.toISOString().slice(0, 10) <= todayIso) continue;

    rows.push({
      // Offset so -source_id never collides with -BranchStaff.id (the
      // sentinel onboarding_candidate rows use) — see CONFIRMED_HIRE_ID_OFFSET.
      source_id: CONFIRMED_HIRE_ID_OFFSET + app.id,
      name,
      position,
      department_branch: department || branch || "",
      start_date: app.start_trial,
    });
  }
  return rows;
}

// Detail-page counterpart to computeConfirmedHireCandidateRows above — called
// from employeeQueries.ts's getOnboardingCandidateDetail whenever sourceId
// falls in the confirmed-hire offset range. Re-checks board_stage at view
// time (not just at list time) so a since-changed/rejected application 404s
// instead of showing stale data. Enriches with live BranchStaff data by NAME
// (not by id, unlike the onboarding_candidate path — this candidate type's
// sentinel isn't a BranchStaff.id) — condition 2 above already guarantees a
// match exists.
export async function getConfirmedHireCandidateDetail(applicationId: number): Promise<EmployeeDetailFull | null> {
  const { rows } = await queryEbrightHrfs<CareerApplicationRow>(
    `select id, name, position, branch, department, start_trial, email, phone, gender, board_stage
     from public.career_applications where id = $1`,
    [applicationId],
  );
  const app = rows[0];
  if (!app || !app.board_stage || !CONFIRMED_HIRE_BOARD_STAGES.has(app.board_stage)) return null;

  const [departments, branches] = await Promise.all([listDepartments(), listBranches()]);
  const loc = resolveDepartmentBranch(app.department?.trim() || app.branch?.trim() || "", departments, branches);

  const { buildBranchStaffMatchIndex, branchStaffProfileFields } = await import("@/lib/branchStaffProfile");
  const bsIndex = await buildBranchStaffMatchIndex();
  const bsMatches = bsIndex.byNormalizedName.get(normalizeName(app.name));
  const bs = bsMatches?.[0] ? branchStaffProfileFields(bsMatches[0]) : null;

  return {
    id: -(CONFIRMED_HIRE_ID_OFFSET + app.id),
    email: bs?.email ?? app.email ?? "",
    employeeId: bs?.employeeId ?? null,
    fullName: titleCaseNameOrNull(app.name) ?? app.name,
    nickName: null,
    role: app.position || null,
    ...loc,
    status: null,
    startDate: app.start_trial ? app.start_trial.toISOString().slice(0, 10) : null,
    pendingOnboarding: false,
    gender: bs?.gender ?? app.gender ?? null,
    dob: bs?.dob ?? null,
    phone: bs?.phone ?? app.phone ?? null,
    nationality: null,
    nric: bs?.nric ?? null,
    homeAddress: bs?.homeAddress ?? null,
    position: app.position || null,
    endDate: bs?.endDate ? bs.endDate.toISOString().slice(0, 10) : null,
    employmentType: null,
    probation: false,
    rate: null,
    branchId: null,
    departmentId: null,
    employmentId: null,
    bankName: bs?.bankName ?? null,
    bankAccount: bs?.bankAccount ?? null,
    accountName: bs?.accountName ?? null,
    emergencyName: bs?.emergencyName ?? null,
    emergencyPhone: bs?.emergencyPhone ?? null,
    emergencyRelation: bs?.emergencyRelation ?? null,
    emergencyEmail: null,
    emergencyAddress: null,
    offerLetterFileId: null,
  };
}

// A person built by the shared computation below, tagged with whether their
// resolved start date has already passed — see the two exported functions
// further down for how each half is used.
interface PreEligibleRow {
  row: EmployeeOverviewRow;
  startDatePassed: boolean;
}

// Shared population + row-construction for both computePreStageRows() and
// computePreStartDatePassedRows() below — same OR-rule union, same
// real-data-wins override, same id/branch/department/position resolution.
// Splitting it out here just once avoids the two callers silently drifting
// apart on what "eligible" means.
async function computePreEligibleRows(
  branchStaffPositionGroups?: Map<string, PositionGroup>,
): Promise<PreEligibleRow[]> {
  const [candidates, realRows, branches, departments, bsPositionGroups] = await Promise.all([
    prisma.onboarding_candidate.findMany(),
    listEmployeeOverviewRows({ skipScopeFilter: true }),
    listBranches(),
    listDepartments(),
    branchStaffPositionGroups ? Promise.resolve(branchStaffPositionGroups) : lookupBranchStaffPositionGroupByName(),
  ]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const realByName = new Map<string, EmployeeOverviewRow>();
  for (const r of realRows) realByName.set(normalizeName(r.fullName), r);

  // Primary eligibility condition: an onboarding_candidate row whose
  // start_date hasn't arrived yet.
  const eligible = new Map<string, PreCandidateSourceRow>();
  for (const c of candidates) {
    if (c.start_date.toISOString().slice(0, 10) > todayIso) {
      eligible.set(normalizeName(c.name), c);
    }
  }

  // Second, additive eligibility condition, per explicit decision (see
  // conversation, 2026-08-11): a career_applications-sourced confirmed hire
  // (board_stage + BranchStaff match + required fields + future start_trial
  // — see computeConfirmedHireCandidateRows' own doc comment). Only fills in
  // names onboarding_candidate doesn't already cover — never overwrites, so
  // the existing onboarding_candidate rule's behavior is unchanged for every
  // name it already knows about.
  const confirmedHireCandidates = await computeConfirmedHireCandidateRows(new Set(bsPositionGroups.keys()));
  for (const c of confirmedHireCandidates) {
    const key = normalizeName(c.name);
    if (!eligible.has(key)) eligible.set(key, c);
  }

  const rows: PreEligibleRow[] = [];
  for (const [name, candidate] of eligible) {
    const real = realByName.get(name);
    // Real, more-advanced data wins — see the override note above — except
    // for the narrow, explicit exception list (currently just Tang Rui;
    // see PRE_OVERRIDE_EXCEPTION_USER_IDS).
    if (real && real.stage !== "pre" && !PRE_OVERRIDE_EXCEPTION_USER_IDS.has(real.id)) continue;

    let id: number;
    let branchCode: string | null;
    let branchName: string | null;
    let departmentCode: string | null;
    let departmentName: string | null;
    let isCandidate = false;
    if (real) {
      id = real.id;
      branchCode = real.branchCode;
      branchName = real.branchName;
      departmentCode = real.departmentCode;
      departmentName = real.departmentName;
    } else {
      // No real portal account yet — same negative-sentinel convention as
      // the rest of the app (see getOnboardingCandidateDetail).
      id = -candidate.source_id;
      isCandidate = true;
      const loc = resolveDepartmentBranch(candidate.department_branch, departments, branches);
      branchCode = loc.branchCode;
      branchName = loc.branchName;
      departmentCode = loc.departmentCode;
      departmentName = loc.departmentName;
    }

    // Prefer the real employment record's own date when one exists — it's
    // authoritative over onboarding_candidate's BranchStaff-sourced
    // start_date, which can go stale (still reading a future date after the
    // real record shows they've actually already started).
    const startDate = real?.date ?? candidate.start_date.toISOString().slice(0, 10);
    // Prefer the real employment record's own position when one exists —
    // onboarding_candidate.position (BranchStaff-sourced) is frequently
    // blank/unreliable even when a real employment row already has a good
    // value. When NEITHER has a usable position string (common for a pure
    // candidate — onboarding_candidate's own sync only ever captures
    // BranchStaff.position, never employment_type/role, so it's blank even
    // when BranchStaff clearly knows Full Time/Part Time/Intern), fall back
    // to the live BranchStaff signal — same
    // lookupBranchStaffPositionGroupByName resolver
    // computeRealAccountLifecycleOverrides uses, batched once above rather
    // than per row.
    const positionSource = real?.position ?? candidate.position;
    const resolvedPositionType: PositionGroup | null = positionSource?.trim()
      ? positionGroup(positionSource)
      : (bsPositionGroups.get(name) ?? null);

    rows.push({
      row: {
        id,
        employeeId: null,
        fullName: real?.fullName ?? titleCaseNameOrNull(candidate.name) ?? name,
        position: real?.position ?? candidate.position ?? null,
        branchCode,
        branchName,
        departmentCode,
        departmentName,
        employmentType: null,
        date: startDate,
        startDate,
        stage: "pre",
        isCandidate,
        resolvedPositionType,
      },
      // A real employee's own date that's already arrived means this person
      // has actually started, and Pre ("hasn't started yet") is no longer
      // correct for them, even though onboarding_candidate's own start_date
      // still reads in the future. Candidate-only rows count too now (see
      // computePreStartDatePassedRows below) — a pure candidate's date is
      // always in the future by construction of `eligible` above UNTIL the
      // day it arrives, at which point `eligible` itself excludes them
      // (start_date is no longer > todayIso) and this is the only place
      // left that still has their row to flag as passed.
      startDatePassed: Boolean(startDate <= todayIso),
    });
  }

  // Real accounts genuinely at Pre with no onboarding_candidate row at all —
  // see this function's own doc comment above for the full rationale
  // (addPreStageEmployee's manual "+ Add" rows land here). Restricted to
  // rows with a real start_date — per explicit decision (see conversation,
  // correcting an earlier version of this filter that checked the
  // placeholder EMAIL pattern instead): that turned out to be no signal at
  // all, since syncCareerApplicationsToPreStage()'s own create branch
  // (still actively running on production — CAREER_APPLICATION_SYNC_ENABLED,
  // instrumentation.ts) generates the exact same
  // `pre-<ms>-<rand>@placeholder.ebright.my` format as its OWN fallback
  // whenever an applicant has no email on file, making a still-interviewing
  // ghost indistinguishable from a real manual add by email alone (11 such
  // ghosts found live this way). start_date is the real discriminator:
  // addPreStageEmployee() hard-validates a real, future start_date on every
  // submission (see its own "Date is required" check) — no code path lets
  // that be null — while the sync's create branch leaves it null for
  // anyone with no confirmed start yet (i.e., still interviewing), which is
  // exactly the case for every ghost found. EmployeeOverviewRow.date for a
  // "pre" row is already the raw, un-backfilled employment.start_date (see
  // dateSourceFor in employeeQueries.ts — deliberately never falls back to
  // created_at for Pre), so a plain null check here is exact, no extra
  // query needed. A name-based cross-check against career_applications was
  // deliberately avoided (a coincidental name collision could wrongly
  // exclude a real manual add). Once admitted, a row's own real data is
  // already authoritative (no stale/synced row to prefer over), so this
  // just carries it straight through, unlike the onboarding_candidate
  // branch above which has to choose between two possible sources per field.
  // Includes confirmedHireCandidates' names too — not the raw-career_applications
  // cross-check the comment above warns against (that risk was a coincidental
  // match against ANY applicant, unfiltered); these are the SAME already-
  // merged-into-`eligible` names from just above, so omitting them here would
  // double-process a real account already handled by the main loop's real-
  // data-wins path, producing a duplicate row.
  const candidateNames = new Set(
    [...candidates, ...confirmedHireCandidates].map((c) => normalizeName(c.name)),
  );
  for (const real of realRows) {
    if (real.stage !== "pre") continue;
    if (candidateNames.has(normalizeName(real.fullName))) continue;
    if (!real.date) continue;
    rows.push({
      row: {
        ...real,
        stage: "pre",
        isCandidate: false,
        // Prefer bsPositionGroups (employment_type-first, see
        // lookupBranchStaffPositionGroupByName's own comment) over
        // positionGroup(real.position) directly — real.position may now be
        // a BranchStaff role abbreviation (e.g. "INT", see
        // resolveEffectivePosition in branchStaffProfile.ts), which
        // positionGroup() alone would misclassify as Full Time. Already
        // fetched above, no extra query.
        resolvedPositionType:
          bsPositionGroups.get(normalizeName(real.fullName)) ?? (real.position?.trim() ? positionGroup(real.position) : null),
      },
      startDatePassed: Boolean(real.date && real.date <= todayIso),
    });
  }

  return rows;
}

export async function computePreStageRows(
  branchStaffPositionGroups?: Map<string, PositionGroup>,
): Promise<EmployeeOverviewRow[]> {
  return (await computePreEligibleRows(branchStaffPositionGroups)).filter((r) => !r.startDatePassed).map((r) => r.row);
}

// The other half of the split above — someone who matches the Pre OR-rule
// but whose resolved start date has already arrived has actually started;
// per explicit decision (see conversation — found live via Farzana Adilah
// Binti Zainuddin and Nur Afrina Binti Nazaha both showing a past date while
// still sitting on Pre), they belong on Onboarding instead, dual-listed the
// same way computeOnboardingDualListedRows() dual-lists Probation-pipeline
// people there — their own stored employment.status is untouched (still
// "pre"; nothing here writes to the database), this only changes what
// [stage]/page.tsx displays. Full Time additionally counts as Probation at
// the same time — Onboarding and Probation are not mutually exclusive once
// start_date has passed (see extraStages below); Part Time/Intern is
// Onboarding only. Candidate-only rows (isCandidate, negative id) are
// included here too — the [id]/page.tsx profile guard and the Overview/
// dedicated-list pages that consume this were widened to give them a real
// route on Onboarding (and Probation, via extraStages), same
// getOnboardingCandidateDetail-backed profile Pre already uses.
//
// Mirrors computeRealAccountLifecycleOverrides' own Full-Time/Part-Time
// rules (see that function's comment for the full rationale), per explicit
// decision (see conversation, 2026-08-12) — same board_stage-gated Probation
// membership, same 3-day Part Timer/Intern threshold, same
// isEffectivelyConfirmed check — but deliberately capped short of that
// function's own "-> active" transition: a pure candidate (isCandidate,
// negative id) has no real employment row for the Active-stage pages to
// pick up, so computing stage:"active" here would silently drop them from
// every list instead of moving them to a new one (Onboarding/branch/
// department pages all gate this function's output behind
// stage==="onboarding"; none of them know this candidate shape exists on
// stage==="active"). Once someone crosses the threshold, readyForRealAccount
// signals it (see EmployeeOverviewRow's own comment) without changing
// `stage` — they stay visible on Onboarding/Probation until a real account
// exists, at which point computeRealAccountLifecycleOverrides takes over
// and completes the actual transition to Active.
export async function computePreStartDatePassedRows(
  branchStaffPositionGroups?: Map<string, PositionGroup>,
  careerApplications?: Map<string, CareerApplicationLookupEntry>,
): Promise<EmployeeOverviewRow[]> {
  const [eligible, careerApps] = await Promise.all([
    computePreEligibleRows(branchStaffPositionGroups),
    careerApplications ? Promise.resolve(careerApplications) : lookupCareerApplicationsByName(),
  ]);
  const { isEffectivelyConfirmed } = await import("@/lib/probationDecision");
  const todayIso = new Date().toISOString().slice(0, 10);

  return eligible
    .filter((r) => r.startDatePassed)
    .map((r) => {
      const isFullTime = r.row.resolvedPositionType === "Full Time";
      const match = careerApps.get(normalizeName(r.row.fullName));

      if (!isFullTime) {
        // Part Timer/Intern — board_stage plays no part, same as the real-
        // account rule. daysSinceStart counts the start date itself as day
        // 0 (Date.parse difference), so >=3 means 3 full days have elapsed
        // since start — matches computeRealAccountLifecycleOverrides exactly.
        const startIso = r.row.date ?? todayIso;
        const daysSinceStart = Math.floor((Date.parse(todayIso) - Date.parse(startIso)) / 86_400_000);
        return { ...r.row, stage: "onboarding" as const, readyForRealAccount: daysSinceStart >= 3 };
      }

      // Full Time — Probation membership gated on board_stage==="Probation"
      // (matchIsProbationPipeline), OR no career_applications footprint at
      // all (the manual-add shape addPreStageEmployee produces) — same two
      // paths computeRealAccountLifecycleOverrides uses for real accounts.
      // A match that exists but reads some OTHER board_stage does NOT
      // qualify, same as that function.
      const isProbationMember = matchIsProbationPipeline(match) || !match;
      if (!isProbationMember) return { ...r.row, stage: "onboarding" as const };

      const readyForRealAccount = isEffectivelyConfirmed(null, match?.status2 ?? null, match?.feedback2 ?? null);
      return {
        ...r.row,
        stage: "onboarding" as const,
        extraStages: ["probation"] as const,
        readyForRealAccount,
      };
    });
}
