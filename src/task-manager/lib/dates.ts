// Shared "today" boundary for the Task Manager module (2026-08-07,
// extracted from engine/recurrence.ts so editTaskTemplateCore's
// past-due-protection filter and the recurrence sweep can never disagree
// about what "today" means). Local-server-time based (not an explicit
// timezone), shifted by TM_RESET_HOUR — see resetHour() below for why.
// This is deliberately NOT the same thing as attendance/report's
// Asia/Kuala_Lumpur-explicit date helpers; Task Manager's day-boundary
// convention predates and is independent of that module.

/** Global reset hour (2026-07-31, TM_RESET_HOUR in .env, 0–23; default 0 =
 *  midnight, the original behavior): next week's occurrence only appears
 *  once the clock passes this hour on the day AFTER the due day. Read at
 *  call time so tests/scripts can override per run. One GLOBAL setting by
 *  design (user decision) — not per-series. */
export function resetHour(): number {
  const parsed = Number.parseInt(process.env.TM_RESET_HOUR ?? "0", 10);
  return Number.isFinite(parsed) ? Math.min(23, Math.max(0, parsed)) : 0;
}

/** Start of "today" per the module's day-boundary convention (local
 *  server time, shifted by resetHour()). Pass `now` explicitly in tests;
 *  defaults to the real current time. */
export function todayStart(now: Date = new Date()): Date {
  // Shift the day boundary by the configured reset hour: before TM_RESET_HOUR
  // o'clock, "today" still counts as yesterday, so due blocks don't advance
  // until the reset time arrives. The lazy on-read trigger makes the flip
  // near-instant at that hour; the hourly sweep is the backstop.
  const shifted = new Date(now.getTime() - resetHour() * 3_600_000);
  return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
}
