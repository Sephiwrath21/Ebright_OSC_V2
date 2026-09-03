# Part-time Onboarding → Active transition (working-day based)

## Problem

Part-time, pre-stage employees should show `Onboarding` from their `start_date`
until they've completed 4 real working days (per their own
`employment.working_hours_json` schedule), then `Active`. Today they don't:
`careerApplicationSync.ts`'s `computeRealAccountLifecycleOverrides()` uses a
generic "3 fixed calendar days" rule for Part Time, and — worse — trusts a
stored `employment.status === "active"` directly, bypassing any day count
entirely. This is the same class of bug already fixed for Interns (see that
function's own Intern branch comment), just not yet applied to Part Time.

## Algorithm

Given `start_date` and `working_hours_json` (keyed by 3-letter weekday
abbreviation, each value either `null` or `{ start, end }`):

1. A day is a "working day" only if its `working_hours_json` value is a
   non-null object with both `start` and `end`.
2. Walk forward day-by-day from `start_date` (inclusive), counting only
   working days. `start_date` itself, if a working day, is working day #1.
3. The date on which the counter reaches 4 is `active_date`.
4. `status` (as displayed) is `Onboarding` for `start_date <= date <
   active_date`, and `Active` for `date >= active_date`.
5. If `working_hours_json` has zero working days across all 7 keys, this is a
   data error: do not loop indefinitely. Return `null` from the date
   function; callers skip the override (row keeps its current/base stage)
   and log a warning naming the employment row.

No cap on the day count is needed if the 4th working day rolls into a later
week — the walk just keeps going.

## Mechanism: display-time override, no DB writes

This is computed wherever the stage is displayed/queried, mirroring the
existing Intern override (`internActiveFromDate` /
`applyInternOnboardingOverride`, `employeeQueries.ts`). It never writes
`employment.status` — the stored column stays whatever it already was
(`"pre"`, `"onboarding"`, or an already-set `"active"` from a manual click),
exactly like Interns today. This was chosen over reviving the disabled
cron-based sweep (`stageTransitionAutomation.ts`'s `advanceOnboardingToActive`,
currently off per prior explicit decision) so the feature doesn't reopen that
decision or add a new scheduled DB-write path.

## Changes

**`src/lib/employeeQueries.ts`**
- New exported pure function `partTimeActiveFromDate(startDate: Date,
  workingHoursJson: unknown): string | null` — the algorithm above. Lives
  next to `internActiveFromDate`.
- New function `applyPartTimeOnboardingOverride(stage, posGroup, startDate,
  workingHoursJson, todayIso)` — same shape as
  `applyInternOnboardingOverride`, gated on `posGroup === "Part Time"`.
  Applied right after the existing Intern override at both of its call sites
  (`listEmployeeOverviewRows`, `getEmployeeOverviewRowById`). No new Prisma
  query fields needed — both call sites already `include` the full
  `employment` row (not a narrow `select`), so `working_hours_json` is
  already present on `emp`.

**`src/lib/careerApplicationSync.ts`**
- `computeRealAccountLifecycleOverrides()`'s Part Time branch (the `if
  (posGroup !== "Full Time")` block, currently the "3 fixed calendar days"
  rule with an `emp.status === "active"` shortcut) is replaced with a call to
  `partTimeActiveFromDate`. The `emp.status === "active"` shortcut is
  dropped — trusting stored status directly was exactly the bug already
  fixed for Interns.
- The `employment.findMany` select in this function is extended to include
  `working_hours_json`.

**Untouched**
- `stageTransitionAutomation.ts`'s `advancePreStageEmployees()` — already
  sets non-Full-Time employees to `"onboarding"` (not `"active"`) the moment
  `start_date` arrives. Correct as-is.
- The disabled `advanceOnboardingToActive()` cron sweep and the manual
  "Next" button (`proceedFromOnboarding`) — both write `employment.status`,
  which this feature deliberately doesn't touch.
- Full-time and all other stages — the new override is gated on `posGroup
  === "Part Time"` only.

## Testing

New `src/lib/employeeQueries.test.ts` (pure-function tests, `server-only` /
`@/lib/prisma` / `@/task-manager/prisma` mocked per this repo's existing
`careerApplicationSync.test.ts` pattern), covering `partTimeActiveFromDate`:
- Normal case: Saturday start, Mon/Sun off — active on the following
  Thursday (the worked example in the request).
- 1-2 days/week schedule where the 4th working day rolls into the next
  calendar week.
- All-`null` `working_hours_json` — returns `null` (data-error case), does
  not loop.
