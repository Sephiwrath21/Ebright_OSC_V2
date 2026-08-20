// Pure, client-safe (no "server-only" — imported by both the client-side
// NotificationBell and EmployeeOverviewView) shared formatting so the
// Probation reminder's day-count and wording can't drift between the two
// display sites (see conversation, 2026-08-19 English-text fix).
//
// Uses the same todayIso convention as employeeQueries.ts
// (`new Date().toISOString().slice(0, 10)` — UTC calendar date, not
// timezone- or time-of-day-sensitive) so this always agrees with the
// server-computed end dates regardless of the caller's local timezone.
export function daysUntil(endDateIso: string): number {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [ey, em, ed] = endDateIso.split("-").map(Number);
  const [ty, tm, td] = todayIso.split("-").map(Number);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(ty, tm - 1, td)) / msPerDay);
}

// "Within 3 days" eligibility (computeProbationReminderCandidates) has no
// lower bound, so `endDateIso` may already be in the past — hence the
// 3-way split rather than always saying "ends in N days".
export function formatProbationReminder(fullName: string, endDateIso: string): string {
  const days = daysUntil(endDateIso);
  if (days > 0) return `${fullName}'s probation ends in ${days} day${days === 1 ? "" : "s"}`;
  if (days === 0) return `${fullName}'s probation ends today`;
  const overdue = Math.abs(days);
  return `${fullName}'s probation ended ${overdue} day${overdue === 1 ? "" : "s"} ago`;
}
