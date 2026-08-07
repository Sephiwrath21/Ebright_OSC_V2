import "server-only";
import { prisma } from "@/lib/prisma";
import { titleCaseName } from "@/lib/text";
import { lookupCareerApplicationsByName, normalizeName } from "@/lib/careerApplicationSync";
import {
  buildBranchStaffMatchIndex,
  matchBranchStaffForRealAccount,
  branchStaffProfileFields,
  logAmbiguousBranchStaffMatches,
  type AmbiguousBranchStaffMatch,
} from "@/lib/branchStaffProfile";
import { listBranches, listDepartments } from "@/lib/employeeQueries";
import { positionGroup } from "@/lib/employeeStages";
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

export type ProbationDisplayStatus = "Confirm" | "Stop" | "In Progress" | "Extended";

export interface ProbationDisplayInfo {
  startDate: string | null;
  endDate: string | null;
  feedback2: string | null;
  displayStatus: ProbationDisplayStatus;
  /** True when this person should be treated as confirmed (removed from
   *  Probation/Onboarding, added to Active — Full Time only; see
   *  isEffectivelyConfirmed's own comment). */
  effectivelyConfirmed: boolean;
  /** True when status2/local decision says Stop — stays in Probation, but
   *  the profile shows "Stop" rather than "In Progress". */
  effectivelyStopped: boolean;
  localProbationStatus: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
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
  if (localProbationStatus === "Confirmed") return "Confirm";
  if (localProbationStatus === "Stopped") return "Stop";
  if (status2 === "Accept") return "Confirm";
  if (status2 === "Rejected") return "Stop";
  return "In Progress";
}

// Drives the stage transition (see employee-folder/page.tsx and
// [stage]/page.tsx): Full Time only (checked by the caller via
// positionGroup, not here), removed from Probation/Onboarding, added to
// Active. True whether the confirmation came from ebright_hrfs (status2)
// or from HR's own local decision — but never true if HR already recorded
// Stopped/Extended locally, even if status2 later reads Accept.
export function isEffectivelyConfirmed(localProbationStatus: string | null, status2: string | null): boolean {
  if (localProbationStatus === "Stopped" || localProbationStatus === "Extended") return false;
  return localProbationStatus === "Confirmed" || status2 === "Accept";
}

// Display-only ("Stop" instead of "In Progress") — per explicit decision
// (see conversation), a Stopped/Rejected person stays in Probation, no
// stage transition happens for this outcome.
export function isEffectivelyStopped(localProbationStatus: string | null, status2: string | null): boolean {
  if (localProbationStatus === "Confirmed" || localProbationStatus === "Extended") return false;
  return localProbationStatus === "Stopped" || status2 === "Rejected";
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
  const [localRows, bsIndex] = await Promise.all([
    prisma.probation.findMany({ where: { user_id: { in: rows.map((r) => r.id) } }, select: { user_id: true, end_date: true } }),
    buildBranchStaffMatchIndex(),
  ]);
  const localByUserId = new Map(localRows.map((r) => [r.user_id, r]));

  const result = new Map<number, string | null>();
  for (const row of rows) {
    const bsMatch = matchBranchStaffForRealAccount(row.fullName, null, null, bsIndex, [], []);
    const local = localByUserId.get(row.id);
    const endDate = bsMatch
      ? (branchStaffProfileFields(bsMatch).probationEndDate?.toISOString().slice(0, 10) ?? null)
      : (local?.end_date?.toISOString().slice(0, 10) ?? null);
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
>(candidateRows: T[], careerApplications: Map<string, CareerApplicationLookupEntry>): Promise<Set<number>> {
  const eligible = candidateRows.filter((r) => positionGroup(r.position) === "Full Time");
  if (eligible.length === 0) return new Set();

  const localRows = await prisma.probation.findMany({
    where: { user_id: { in: eligible.map((r) => r.id) } },
    select: { user_id: true, probation_status: true },
  });
  const localStatusById = new Map(localRows.map((r) => [r.user_id, r.probation_status]));

  const result = new Set<number>();
  for (const row of eligible) {
    const status2 = careerApplications.get(normalizeName(row.fullName))?.status2 ?? null;
    if (isEffectivelyConfirmed(localStatusById.get(row.id) ?? null, status2)) result.add(row.id);
  }
  return result;
}

export interface ProbationReminderCandidate {
  id: number;
  fullName: string;
  endDate: string;
}

// Drives the red dot on the Probation summary card and the HR notification
// bell card (see conversation) — starting 2 weeks before a Full-Time
// person's probation end date, until HR (or ebright_hrfs's own status2)
// resolves an outcome. "Within 2 weeks" includes already-overdue ones (a
// reminder that's overdue is still owed, not dismissed by time alone).
// Lower-stakes than the Personal Info/Bank Detail BranchStaff matching
// (this only surfaces a count + end date, no PII), so the location
// cross-check those use is skipped here — an ambiguous NAME match (2+
// BranchStaff rows) still safely falls back to no reminder rather than
// guessing, same as everywhere else.
export async function computeProbationReminderCandidates<
  T extends { id: number; fullName: string; position: string | null },
>(
  probationBadgedRows: T[],
  careerApplications: Map<string, CareerApplicationLookupEntry>,
): Promise<ProbationReminderCandidate[]> {
  const fullTimeRows = probationBadgedRows.filter((r) => positionGroup(r.position) === "Full Time");
  if (fullTimeRows.length === 0) return [];

  const [localRows, bsIndex] = await Promise.all([
    prisma.probation.findMany({
      where: { user_id: { in: fullTimeRows.map((r) => r.id) } },
      select: { user_id: true, probation_status: true, end_date: true },
    }),
    buildBranchStaffMatchIndex(),
  ]);
  const localByUserId = new Map(localRows.map((r) => [r.user_id, r]));

  // No lower bound on purpose — "within 2 weeks" includes already-overdue
  // end dates (see this function's own doc comment above).
  const twoWeeksOutIso = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const result: ProbationReminderCandidate[] = [];
  for (const row of fullTimeRows) {
    const local = localByUserId.get(row.id);
    const status2 = careerApplications.get(normalizeName(row.fullName))?.status2 ?? null;
    // Already resolved one way or another (HR decided, or status2 already
    // reads Accept/Rejected) — nothing left to remind anyone about.
    if (local?.probation_status || status2) continue;

    const bsMatch = matchBranchStaffForRealAccount(row.fullName, null, null, bsIndex, [], []);
    const endDate = bsMatch
      ? branchStaffProfileFields(bsMatch).probationEndDate?.toISOString().slice(0, 10)
      : local?.end_date
        ? local.end_date.toISOString().slice(0, 10)
        : null;
    if (!endDate) continue;
    if (endDate <= twoWeeksOutIso) {
      result.push({ id: row.id, fullName: row.fullName, endDate });
    }
  }
  return result;
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

  return {
    startDate,
    endDate,
    feedback2,
    displayStatus: computeProbationDisplayStatus(localProbationStatus, status2),
    effectivelyConfirmed: isEffectivelyConfirmed(localProbationStatus, status2),
    effectivelyStopped: isEffectivelyStopped(localProbationStatus, status2),
    localProbationStatus,
    decidedByName: localRow?.decided_by_user?.user_profile?.full_name
      ? titleCaseName(localRow.decided_by_user.user_profile.full_name)
      : null,
    decidedAt: localRow?.decided_at ? localRow.decided_at.toISOString() : null,
  };
}
