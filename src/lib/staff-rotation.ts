import type { DayKey } from "@/lib/schedule-history";

// Staff who rotate between branches on a weekly cycle. Used by the Attendance
// Summary to:
//   1. Tag "Visiting · <home branch>" when they scan outside their home branch.
//   2. Count them as MISSING at the day's assigned branch (not the home branch)
//      when they didn't scan.
//
// To enable a person, add an entry below. Until populated, the daily Summary
// falls back to its plain "scanner-branch == BranchStaff.branch" comparison.
//
// Branch codes must match `branch.branch_code` in the local DB and
// BranchStaff.branch on HRFS.

export interface RotationEntry {
  /** HRFS BranchStaff.employeeId */
  employeeId: string;
  /** Where they're "based" — shown in the visiting badge as "Visiting · HQ". */
  homeBranchCode: string;
  /**
   * Where they're expected on each day of the week. `null` = day off (no
   * working-hours expectation). Day key matches workingHours.
   */
  weeklyAssignment: Record<DayKey, string | null>;
}

export const STAFF_ROTATION: RotationEntry[] = [
  // EXAMPLE — leave commented until you give me the real list:
  // {
  //   employeeId: "44080099",
  //   homeBranchCode: "ST",
  //   weeklyAssignment: {
  //     Sun: null,
  //     Mon: null,
  //     Tue: "HQ",
  //     Wed: "ST",
  //     Thu: "ST",
  //     Fri: "HQ",
  //     Sat: "ST",
  //   },
  // },
];

/** Lookup by HRFS BranchStaff.employeeId. */
export function rotationFor(employeeId: string | null): RotationEntry | null {
  if (!employeeId) return null;
  return STAFF_ROTATION.find((r) => r.employeeId === employeeId) ?? null;
}

/** Branch the person is assigned to on the given day (null = off). */
export function assignedBranchOnDay(
  employeeId: string | null,
  day: DayKey,
): string | null {
  const r = rotationFor(employeeId);
  if (!r) return null;
  return r.weeklyAssignment[day] ?? null;
}
