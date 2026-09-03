import "server-only";
import { prisma } from "@/lib/prisma";
import { titleCaseName } from "@/lib/text";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";
import { lookupCareerApplicationsByName, lookupBranchStaffPositionGroupByName, normalizeName } from "@/lib/careerApplicationSync";
import {
  buildBranchStaffMatchIndex,
  matchBranchStaffForRealAccount,
  branchStaffProfileFields,
  logAmbiguousBranchStaffMatches,
  type AmbiguousBranchStaffMatch,
} from "@/lib/branchStaffProfile";
import { listBranches, listDepartments } from "@/lib/employeeQueries";
import { positionGroup, type PositionGroup } from "@/lib/employeeStages";
import type { CareerApplicationLookupEntry } from "@/lib/careerApplicationSync";

// Probation stage's full requirements, per explicit decision (see
// conversation):
//   - Start/End Date: read-only from ebright_hrfs.BranchStaff (start_date,
//     and probation with a start_date+3-months fallback — see
//     branchStaffProfile.ts's resolveProbationEndDate), falling back to the
//     local hrfs.probation table's own start_date/end_date when there's no
//     confident BranchStaff match, same fallback rule as every other
//     BranchStaff-sourced field.
//   - Feedback: read-only from ebright_hrfs.career_applications.feedback2.
//   - Display status: read-only from career_applications.status2 UNLESS HR
//     has made an explicit local decision (hrfs.probation.probation_status,
//     written by decideProbationOutcome in employeeRecordActions.ts — the
//     ONE write path this whole feature introduces), which always takes
//     priority over the external signal once made.

export type ProbationDisplayStatus = "Confirmed" | "Stopped" | "In Progress" | "Extended";

export interface ProbationDisplayInfo {
  startDate: string | null;
  endDate: string | null;
  feedback2: string | null;
  /** True when a career_applications match exists at all (regardless of its
   *  board_stage) — drives the Feedback field's source/editability, per
   *  explicit decision (see conversation): true means feedback2 (external,
   *  read-only) is the applicable source; false means probation.
   *  local_feedback (HR-editable, see ProbationInfo.localFeedback) is. */
  hasCareerApplicationMatch: boolean;
  displayStatus: ProbationDisplayStatus;
  /** True when this person should be treated as confirmed (removed from
   *  Probation/Onboarding, added to Active — Full Time only; see
   *  isEffectivelyConfirmed's own comment). */
  effectivelyConfirmed: boolean;
  /** True when status2/local decision says Stop — stays in Probation, but
   *  the profile shows "Stopped" rather than "In Progress". */
  effectivelyStopped: boolean;
  localProbationStatus: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  /** Fully computed, read-only display value (2026-08-28, see conversation)
   *  — only ever set when displayStatus === "Confirmed". Priority: (1) the
   *  local hrfs.probation.confirm_date, when set — this is decideProbationOutcome's
   *  own auto-stamp (employeeRecordActions.ts) for anyone HR confirmed
   *  directly in-app, checked first so those people get a real date even
   *  with no career_applications match at all; (2) ebright_hrfs.hrms_audit_log's
   *  TrialProbation/STATUS_CHANGE entry's created_at, for anyone whose
   *  confirmation was logged there (this logging only started firing
   *  recently — currently just Ayu Novitasari has a matching entry); (3)
   *  career_applications.updated_at as a last-resort fallback for
   *  confirmations that predate that audit logging (a whole-row timestamp,
   *  not status2-specific — an approximation, not a guaranteed-accurate
   *  confirmation moment). Never a manual HR input. */
  confirmationDate: string | null;
}

// HR's local decision, once made, always wins over the external
// status2 signal — a human already made the call; a later change to
// career_applications shouldn't silently override it. Confirmed/Stopped
// resolve on their own; Extended (an HR-only concept, no status2
// equivalent) blocks BOTH the confirmed and stopped reads below.
export function computeProbationDisplayStatus(
  localProbationStatus: string | null,
  status2: string | null,
): ProbationDisplayStatus {
  if (localProbationStatus === "Extended") return "Extended";
  if (localProbationStatus === "Confirmed") return "Confirmed";
  if (localProbationStatus === "Stopped") return "Stopped";
  // Case-insensitive/trimmed, matching the fix isEffectivelyConfirmed already
  // got (2026-08-12, see its own comment below) — the live distinct values in
  // ebright_hrfs.career_applications.status2 are lowercase ('accept'/
  // 'reject'); the previous `=== "Accept"`/`=== "Rejected"` checks never
  // matched anything in real data.
  const normalizedStatus2 = status2?.trim().toLowerCase() ?? "";
  if (normalizedStatus2 === "accept") return "Confirmed";
  if (normalizedStatus2 === "reject") return "Stopped";
  return "In Progress";
}

// Drives the stage transition (see employee-folder/page.tsx and
// [stage]/page.tsx): Full Time only (checked by the caller via
// positionGroup, not here), removed from Probation/Onboarding, added to
// Active. True whether the confirmation came from ebright_hrfs (status2)
// or from HR's own local decision — but never true if HR already recorded
// Stopped/Extended locally, even if status2 later reads Accept.
//
// status2 comparison fixed (2026-08-12) — the live distinct values in
// ebright_hrfs.career_applications.status2 are lowercase ('accept'/
// 'reject'), confirmed by direct query; the previous `=== "Accept"` check
// never matched anything in real data. Now case-insensitive, and requires
// feedback2 to also be non-null — per explicit decision (see conversation),
// tightening the status2 branch specifically so a bare status2 value with
// no actual feedback recorded isn't treated as a real confirmation.
export function isEffectivelyConfirmed(
  localProbationStatus: string | null,
  status2: string | null,
  feedback2: string | null,
): boolean {
  if (localProbationStatus === "Stopped" || localProbationStatus === "Extended") return false;
  const status2Confirmed = (status2?.trim().toLowerCase() ?? "") === "accept" && feedback2 !== null;
  return localProbationStatus === "Confirmed" || status2Confirmed;
}

// Display-only ("Stop" instead of "In Progress") — per explicit decision
// (see conversation), a Stopped/Rejected person stays in Probation, no
// stage transition happens for this outcome.
export function isEffectivelyStopped(localProbationStatus: string | null, status2: string | null): boolean {
  if (localProbationStatus === "Confirmed" || localProbationStatus === "Extended") return false;
  return localProbationStatus === "Stopped" || status2 === "Rejected";
}

// Local-only fallback when NEITHER a BranchStaff match NOR a local
// probation.end_date exists — same "+3 months" formula as BranchStaff's
// own fallback (resolveProbationEndDate in branchStaffProfile.ts), just
// computed from this app's own employment.start_date instead of a synced
// BranchStaff value, since there's nothing else to go on. Only ever
// reached for the second Probation-membership path in
// computeRealAccountLifecycleOverrides (see conversation) — a real Full-
// Time account with no BranchStaff match and no career_applications entry
// at all (addPreStageEmployee's manual "+ Add"). Load-bearing, not
// cosmetic: without this, a long-standing employee who also has no
// pipeline match (e.g. Ng Ying Chen, started 2020) would resolve to a null
// end date here and never fall past the "no probation row" fallback below,
// getting stuck in Probation forever instead of correctly landing on
// Active — the exact bug this whole end-date fallback exists to prevent.
function fallbackProbationEndDate(startDate: Date | null): string | null {
  if (!startDate) return null;
  const d = new Date(startDate);
  d.setUTCMonth(d.getUTCMonth() + 3);
  return d.toISOString().slice(0, 10);
}

// Resolves what the LOCAL probation row's own end_date should be WRITTEN as
// the moment someone newly enters Probation (see proceedFromPreStage in
// employeeRecordActions.ts) — same BranchStaff-match-first, then
// fallbackProbationEndDate priority getProbationDisplayInfo already reads
// at display time (BranchStaff always wins there regardless of what's
// stored locally, so writing its value here is harmless, just a consistent
// fallback record). Exists because proceedFromPreStage previously only
// touched employment, never created a probation row at all — for the exact
// population this button now advances (manually-added Full-Time, no
// BranchStaff match, no career_applications entry), that left
// getProbationDisplayInfo with nothing in EITHER branch of its own fallback
// chain, showing blank Start/End Date forever instead of the 3-months-out
// value every other Full-Time-with-no-match person already gets.
export async function resolveNewProbationEndDate(
  fullName: string,
  startDate: Date,
  branchCode: string | null,
  departmentCode: string | null,
): Promise<string> {
  const [branches, departments, bsIndex] = await Promise.all([listBranches(), listDepartments(), buildBranchStaffMatchIndex()]);
  const bsMatch = matchBranchStaffForRealAccount(fullName, branchCode, departmentCode, bsIndex, branches, departments, []);
  const bsEndDate = bsMatch ? branchStaffProfileFields(bsMatch).probationEndDate : null;
  return bsEndDate ? bsEndDate.toISOString().slice(0, 10) : (fallbackProbationEndDate(startDate) ?? startDate.toISOString().slice(0, 10));
}

// Bulk probation END date resolution — used by
// computeActivePipelineProbationPassedIds (careerApplicationSync.ts) to
// decide whether a real Active-stage + pipeline-Probation person's
// probation window has actually ended, not just whether their start date
// has passed (see that function's own comment on why this replaced the
// start-date check: Ayu Novitasari started 2026-05-23, which had already
// passed, but her actual probation end date is 2026-08-23 — she was being
// dropped to Active-only over two months before her probation genuinely
// ended). Same BranchStaff.probation-or-start+3mo resolution as
// getProbationDisplayInfo, falling back to local hrfs.probation.end_date,
// but batched for a whole population instead of one row at a time — and,
// like computeProbationReminderCandidates, skips the location cross-check
// (lower stakes than Personal Info's PII fields; an ambiguous name match
// still safely falls back to local data rather than guessing).
export async function computeProbationEndDates<T extends { id: number; fullName: string }>(
  rows: T[],
): Promise<Map<number, string | null>> {
  if (rows.length === 0) return new Map();
  const [localRows, bsIndex, employments] = await Promise.all([
    prisma.probation.findMany({ where: { user_id: { in: rows.map((r) => r.id) } }, select: { user_id: true, end_date: true } }),
    buildBranchStaffMatchIndex(),
    prisma.employment.findMany({
      where: { user_id: { in: rows.map((r) => r.id) } },
      orderBy: { start_date: "desc" },
      select: { user_id: true, start_date: true },
    }),
  ]);
  const localByUserId = new Map(localRows.map((r) => [r.user_id, r]));
  const empByUserId = new Map<number, (typeof employments)[number]>();
  for (const e of employments) if (!empByUserId.has(e.user_id)) empByUserId.set(e.user_id, e);

  const result = new Map<number, string | null>();
  for (const row of rows) {
    const bsMatch = matchBranchStaffForRealAccount(row.fullName, null, null, bsIndex, [], []);
    const local = localByUserId.get(row.id);
    const endDate = bsMatch
      ? (branchStaffProfileFields(bsMatch).probationEndDate?.toISOString().slice(0, 10) ?? null)
      : (local?.end_date?.toISOString().slice(0, 10) ?? fallbackProbationEndDate(empByUserId.get(row.id)?.start_date ?? null));
    result.set(row.id, endDate);
  }
  return result;
}

// Bulk version for the Employee Records table/cards and the dedicated stage
// list pages (see employee-folder/page.tsx and [stage]/page.tsx) — same
// isEffectivelyConfirmed check as the single-person version above, but for
// the whole set of currently-Probation-badged rows in one query instead of
// one round trip per person. Deliberately does NOT re-check BranchStaff
// dates or run the rigorous name match here — a row already reaching this
// function is already known to be Probation-badged (real stage or OR-rule
// match), and this only needs the LOCAL decided status (a real HR
// "Confirmed" decision already flips employment.status directly — see
// decideProbationOutcome — so by the time this runs, such a row's raw stage
// would already be "active" and wouldn't even be in the input set; the
// case this genuinely needs to catch live is status2="Accept" with NO local
// decision yet). Only Full Time rows are eligible, per explicit decision —
// Intern/Part Time are untouched by this flow regardless of status2/local
// status.
export async function computeAutoConfirmedProbationIds<
  T extends { id: number; fullName: string; position: string | null },
>(
  candidateRows: T[],
  careerApplications: Map<string, CareerApplicationLookupEntry>,
  // Optional — computeRealAccountLifecycleOverrides (the only caller today)
  // already has this fetched and passes it straight through, so this never
  // re-queries BranchStaff on top of its caller's own fetch. Falls back to
  // fetching its own for any future standalone caller.
  branchStaffPositionGroups?: Map<string, PositionGroup>,
): Promise<Set<number>> {
  // Live BranchStaff signal wins over employment.position, same as
  // computeRealAccountLifecycleOverrides — candidateRows here is already
  // that function's own board_stage-matched output, so this must agree
  // with it or a BranchStaff-corrected Full Time row would get silently
  // re-excluded from the Confirm-gate check by the stale local position.
  const bsPositionGroups = branchStaffPositionGroups ?? (await lookupBranchStaffPositionGroupByName());
  const eligible = candidateRows.filter(
    (r) => (bsPositionGroups.get(normalizeName(r.fullName)) ?? positionGroup(r.position)) === "Full Time",
  );
  if (eligible.length === 0) return new Set();

  const localRows = await prisma.probation.findMany({
    where: { user_id: { in: eligible.map((r) => r.id) } },
    select: { user_id: true, probation_status: true },
  });
  const localStatusById = new Map(localRows.map((r) => [r.user_id, r.probation_status]));

  const result = new Set<number>();
  for (const row of eligible) {
    const match = careerApplications.get(normalizeName(row.fullName));
    if (isEffectivelyConfirmed(localStatusById.get(row.id) ?? null, match?.status2 ?? null, match?.feedback2 ?? null)) {
      result.add(row.id);
    }
  }
  return result;
}

// Same shape as computeAutoConfirmedProbationIds above, just isEffectivelyStopped
// instead of isEffectivelyConfirmed — drives the Probation namelist's Status
// column showing "Stop" instead of the page's own "Probation" label for a
// row whose decision is Stopped (see conversation, StageFlatListView.tsx).
// A Stopped row's raw stage stays "probation" (decideProbationOutcome never
// touches employment.status for this outcome), so unlike the Confirmed case
// above, every genuinely-Stopped row really is still present in whatever
// candidateRows set the caller passes in — nothing to reconcile against.
export async function computeStoppedProbationIds<
  T extends { id: number; fullName: string; position: string | null },
>(
  candidateRows: T[],
  careerApplications: Map<string, CareerApplicationLookupEntry>,
  branchStaffPositionGroups?: Map<string, PositionGroup>,
): Promise<Set<number>> {
  const bsPositionGroups = branchStaffPositionGroups ?? (await lookupBranchStaffPositionGroupByName());
  const eligible = candidateRows.filter(
    (r) => (bsPositionGroups.get(normalizeName(r.fullName)) ?? positionGroup(r.position)) === "Full Time",
  );
  if (eligible.length === 0) return new Set();

  const localRows = await prisma.probation.findMany({
    where: { user_id: { in: eligible.map((r) => r.id) } },
    select: { user_id: true, probation_status: true },
  });
  const localStatusById = new Map(localRows.map((r) => [r.user_id, r.probation_status]));

  const result = new Set<number>();
  for (const row of eligible) {
    const status2 = careerApplications.get(normalizeName(row.fullName))?.status2 ?? null;
    if (isEffectivelyStopped(localStatusById.get(row.id) ?? null, status2)) result.add(row.id);
  }
  return result;
}

export interface ProbationReminderCandidate {
  id: number;
  fullName: string;
  endDate: string;
}

// Drives the red dot (+ tooltip) on the Probation summary card and the HR
// notification bell card (see conversation) — starting 3 days before a
// Full-Time person's probation end date, until HR (or ebright_hrfs's own
// status2) resolves an outcome. "Within 3 days" includes already-overdue
// ones (a reminder that's overdue is still owed, not dismissed by time
// alone). Lower-stakes than the Personal Info/Bank Detail BranchStaff
// matching (this only surfaces a name + end date, no other PII), so the
// location cross-check those use is skipped here — an ambiguous NAME match
// (2+ BranchStaff rows) still safely falls back to no reminder rather than
// guessing, same as everywhere else.
export async function computeProbationReminderCandidates<
  T extends { id: number; fullName: string; position: string | null },
>(
  probationBadgedRows: T[],
  careerApplications: Map<string, CareerApplicationLookupEntry>,
  // Optional — pass the caller's already-fetched map (see
  // computeAutoConfirmedProbationIds's own comment); falls back to fetching
  // its own when omitted.
  branchStaffPositionGroups?: Map<string, PositionGroup>,
): Promise<ProbationReminderCandidate[]> {
  // Live BranchStaff signal wins over employment.position — same reasoning
  // as computeAutoConfirmedProbationIds above.
  const bsPositionGroups = branchStaffPositionGroups ?? (await lookupBranchStaffPositionGroupByName());
  const fullTimeRows = probationBadgedRows.filter(
    (r) => (bsPositionGroups.get(normalizeName(r.fullName)) ?? positionGroup(r.position)) === "Full Time",
  );
  if (fullTimeRows.length === 0) return [];

  const [localRows, bsIndex, employments] = await Promise.all([
    prisma.probation.findMany({
      where: { user_id: { in: fullTimeRows.map((r) => r.id) } },
      select: { user_id: true, probation_status: true, end_date: true },
    }),
    buildBranchStaffMatchIndex(),
    prisma.employment.findMany({
      where: { user_id: { in: fullTimeRows.map((r) => r.id) } },
      orderBy: { start_date: "desc" },
      select: { user_id: true, start_date: true },
    }),
  ]);
  const localByUserId = new Map(localRows.map((r) => [r.user_id, r]));
  const empByUserId = new Map<number, (typeof employments)[number]>();
  for (const e of employments) if (!empByUserId.has(e.user_id)) empByUserId.set(e.user_id, e);

  // No lower bound on purpose — "within 3 days" includes already-overdue
  // end dates (see this function's own doc comment above).
  const threeDaysOutIso = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const result: ProbationReminderCandidate[] = [];
  for (const row of fullTimeRows) {
    const local = localByUserId.get(row.id);
    const status2 = careerApplications.get(normalizeName(row.fullName))?.status2 ?? null;
    // Already resolved one way or another (HR decided, or status2 already
    // reads Accept/Rejected) — nothing left to remind anyone about.
    if (local?.probation_status || status2) continue;

    const bsMatch = matchBranchStaffForRealAccount(row.fullName, null, null, bsIndex, [], []);
    const endDate = bsMatch
      ? (branchStaffProfileFields(bsMatch).probationEndDate?.toISOString().slice(0, 10) ?? null)
      : (local?.end_date?.toISOString().slice(0, 10) ?? fallbackProbationEndDate(empByUserId.get(row.id)?.start_date ?? null));
    if (!endDate) continue;
    if (endDate <= threeDaysOutIso) {
      result.push({ id: row.id, fullName: row.fullName, endDate });
    }
  }
  return result;
}

// Confirmation Date's 3-tier resolution (2026-08-28, see conversation and
// ProbationDisplayInfo.confirmationDate's own doc comment for the full
// rationale). Only called when displayStatus === "Confirmed" — every other
// status (Stopped/Extended/In Progress) has no Confirmation Date at all, and
// skipping the call otherwise avoids an unnecessary hrms_audit_log round
// trip for the common non-Confirmed case.
async function resolveConfirmationDate(
  localConfirmDate: Date | null,
  applicationId: number | null,
  careerApplicationUpdatedAt: Date | null,
): Promise<string | null> {
  if (localConfirmDate) return localConfirmDate.toISOString().slice(0, 10);
  if (applicationId !== null) {
    const { rows } = await queryEbrightHrfs<{ created_at: Date }>(
      `SELECT created_at FROM public.hrms_audit_log
        WHERE entity = 'TrialProbation' AND entity_id = $1 AND action = 'STATUS_CHANGE'
        ORDER BY created_at DESC LIMIT 1`,
      [String(applicationId)],
    );
    if (rows[0]?.created_at) return rows[0].created_at.toISOString().slice(0, 10);
  }
  return careerApplicationUpdatedAt ? careerApplicationUpdatedAt.toISOString().slice(0, 10) : null;
}

export async function getProbationDisplayInfo(userId: number, fullName: string): Promise<ProbationDisplayInfo> {
  const [localRow, careerApplications, branches, departments, bsIndex, emp] = await Promise.all([
    prisma.probation.findUnique({ where: { user_id: userId }, include: { decided_by_user: { include: { user_profile: true } } } }),
    lookupCareerApplicationsByName(),
    listBranches(),
    listDepartments(),
    buildBranchStaffMatchIndex(),
    prisma.employment.findFirst({
      where: { user_id: userId },
      orderBy: { start_date: "desc" },
      include: { branch: true, department: true },
    }),
  ]);

  const careerMatch = careerApplications.get(normalizeName(fullName));
  const status2 = careerMatch?.status2 ?? null;
  const feedback2 = careerMatch?.feedback2 ?? null;

  // Same rigorous match (and same location cross-check, using this
  // person's own real branch/department when known) as the Personal Info/
  // Bank Detail/Emergency Contact fields already use — never guesses on an
  // ambiguous or conflicting match, just falls back to local data.
  const ambiguous: AmbiguousBranchStaffMatch[] = [];
  const bsMatch = matchBranchStaffForRealAccount(
    fullName,
    emp?.branch?.branch_code ?? null,
    emp?.department?.department_code ?? null,
    bsIndex,
    branches,
    departments,
    ambiguous,
  );
  const bsFields = bsMatch ? branchStaffProfileFields(bsMatch) : null;

  const startDate = bsFields?.startDate
    ? bsFields.startDate.toISOString().slice(0, 10)
    : localRow?.start_date
      ? localRow.start_date.toISOString().slice(0, 10)
      : null;
  const endDate = bsFields?.probationEndDate
    ? bsFields.probationEndDate.toISOString().slice(0, 10)
    : localRow?.end_date
      ? localRow.end_date.toISOString().slice(0, 10)
      : null;

  logAmbiguousBranchStaffMatches(ambiguous);

  const localProbationStatus = localRow?.probation_status ?? null;
  const displayStatus = computeProbationDisplayStatus(localProbationStatus, status2);
  const confirmationDate =
    displayStatus === "Confirmed"
      ? await resolveConfirmationDate(localRow?.confirm_date ?? null, careerMatch?.applicationId ?? null, careerMatch?.updatedAt ?? null)
      : null;

  return {
    startDate,
    endDate,
    feedback2,
    hasCareerApplicationMatch: careerMatch != null,
    displayStatus,
    effectivelyConfirmed: isEffectivelyConfirmed(localProbationStatus, status2, feedback2),
    effectivelyStopped: isEffectivelyStopped(localProbationStatus, status2),
    localProbationStatus,
    decidedByName: localRow?.decided_by_user?.user_profile?.full_name
      ? titleCaseName(localRow.decided_by_user.user_profile.full_name)
      : null,
    decidedAt: localRow?.decided_at ? localRow.decided_at.toISOString() : null,
    confirmationDate,
  };
}
