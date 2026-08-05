// career_applications.board_stage -> our stage, per explicit decision (see
// conversation — this REPLACES an earlier version keyed off rec_recruit/
// rec_stage, reverted because board_stage and rec_stage are two genuinely
// separate columns in two separate tables that can disagree for the same
// application; board_stage is the field of record now).
//
// alsoShowOnProbationList: true only for "Probation" — those people's
// stored employment.status still becomes "onboarding" (same field values as
// every other entry here), but the Probation list ADDITIONALLY displays
// them (see [stage]/page.tsx and employee-folder/page.tsx) — display-only,
// not a second stored status.
//
// No entry currently maps to "active" — board_stage has no equivalent to
// rec_stage's old "Access To Payroll"/"IOP Sessions" values (checked: the
// real distinct board_stage values are Intern/Candidate (CD)/Buffer Resume/
// Rejected (RJT)/Probation/Rejected/Interviewed (INT)/Hired/Part Timer/Send
// Agreement Letter/Full Time/Buffer (For OD Use)/Interview Date (ID)/Health
// Declaration (HD)/Trial/Shortlisted (SL) — nothing that reads as "ready for
// Active." Flagged as an open gap, not assumed.
//
// Pulled into its own plain module (no server-only/Prisma import) so client
// components — e.g. StageFlatListView's Status filter, which needs these
// same key names to exclude Onboarding-bound values from its filter
// options — can import it without pulling server-only code into the client
// bundle.
export const BOARD_STAGE_TO_OUR_STAGE: Record<
  string,
  { status: "onboarding"; probation: false; alsoShowOnProbationList: boolean }
> = {
  "Trial": { status: "onboarding", probation: false, alsoShowOnProbationList: false },
  "1st Training Day": { status: "onboarding", probation: false, alsoShowOnProbationList: false },
  "2nd Training Day": { status: "onboarding", probation: false, alsoShowOnProbationList: false },
  "3rd Training Day": { status: "onboarding", probation: false, alsoShowOnProbationList: false },
  "Probation": { status: "onboarding", probation: false, alsoShowOnProbationList: true },
};
