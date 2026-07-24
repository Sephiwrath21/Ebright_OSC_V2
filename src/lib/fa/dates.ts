// Timezone-safe calendar-date helpers for the FA system. Ported from the v1
// codebase (lib/dates.ts). THE one place to turn a Date/pg-date into a plain
// YYYY-MM-DD string. Two traps this avoids, both of which have caused real
// KL-timezone bugs:
//   1. `new Date().toISOString().slice(0,10)` as "today" → renders UTC, so
//      between midnight and 08:00 KL it returns YESTERDAY.
//   2. `new Date(dateStr).toISOString()` round-trips shift the date back a day
//      on any runtime ahead of UTC (KL dev). node-pg parses `date` columns to
//      LOCAL midnight, so read them back with local getters.

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today's calendar date in Asia/Kuala_Lumpur, as YYYY-MM-DD. */
export function todayKL(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

/** dateStr ± k days, UTC-anchored — immune to the runtime's timezone. */
export function addDaysStr(dateStr: string, k: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + k));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Calendar date (YYYY-MM-DD) of a Date object or date-ish string. Reads local
 *  getters for Date instances (correct for pg `date` columns on UTC prod + KL
 *  dev); strips any time suffix from strings. */
export function dateStrOf(d: Date | string): string {
  if (d instanceof Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  return String(d).split("T")[0];
}
