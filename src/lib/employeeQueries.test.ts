// Pure-logic tests for the Part Time Onboarding->Active working-day
// calculation. The DB/auth modules are vi.mock'ed (same pattern as
// careerApplicationSync.test.ts) so importing employeeQueries.ts never
// touches Postgres or NextAuth config.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/task-manager/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/employeeScope", () => ({
  getCurrentEmployeeScope: vi.fn(),
  filterRowsByScope: vi.fn(),
  isRowInScope: vi.fn(),
}));

import { partTimeActiveFromDate, internActiveFromDate } from "./employeeQueries";

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

describe("partTimeActiveFromDate", () => {
  it("worked example: Sat start, Mon/Sun off, Tue-Sat working — active on the following Thursday", () => {
    // 2024-01-06 is a Saturday. Day 1 = Sat 1/6, Sun/Mon skipped, day 2 = Tue
    // 1/9, day 3 = Wed 1/10, day 4 = Thu 1/11.
    const workingHoursJson = {
      Sun: null,
      Mon: null,
      Tue: { start: "09:00", end: "18:00" },
      Wed: { start: "09:00", end: "18:00" },
      Thu: { start: "09:00", end: "18:00" },
      Fri: { start: "09:00", end: "18:00" },
      Sat: { start: "09:00", end: "19:00" },
    };
    expect(partTimeActiveFromDate(utcDate("2024-01-06"), workingHoursJson)).toBe("2024-01-11");
  });

  it("1-2 days/week schedule rolls the 4th working day into the following week", () => {
    // Only Sat/Sun worked. Day 1 = Sat 1/6, day 2 = Sun 1/7, day 3 = Sat
    // 1/13 (next week), day 4 = Sun 1/14.
    const workingHoursJson = {
      Sun: { start: "10:00", end: "16:00" },
      Mon: null,
      Tue: null,
      Wed: null,
      Thu: null,
      Fri: null,
      Sat: { start: "10:00", end: "16:00" },
    };
    expect(partTimeActiveFromDate(utcDate("2024-01-06"), workingHoursJson)).toBe("2024-01-14");
  });

  it("returns null (data error) when working_hours_json has no working days at all", () => {
    const workingHoursJson = { Sun: null, Mon: null, Tue: null, Wed: null, Thu: null, Fri: null, Sat: null };
    expect(partTimeActiveFromDate(utcDate("2024-01-06"), workingHoursJson)).toBeNull();
    expect(partTimeActiveFromDate(utcDate("2024-01-06"), {})).toBeNull();
    expect(partTimeActiveFromDate(utcDate("2024-01-06"), null)).toBeNull();
  });
});

describe("internActiveFromDate", () => {
  it("4 consecutive Tue-Sat days, no weekend in between — active on the 4th working day itself", () => {
    // 2024-01-10 is a Wednesday. Day 1 = Wed 1/10, day 2 = Thu 1/11, day 3 =
    // Fri 1/12, day 4 = Sat 1/13.
    expect(internActiveFromDate(utcDate("2024-01-10"))).toBe("2024-01-13");
  });

  it("the 3rd working day landing on Saturday rolls day 4 past Sun/Mon (was wrongly Sunday under the old 'next calendar day' rule)", () => {
    // 2024-01-11 is a Thursday. Day 1 = Thu 1/11, day 2 = Fri 1/12, day 3 =
    // Sat 1/13, day 4 = the next Tue-Sat day = Tue 1/16 (Sun 1/14/Mon 1/15
    // skipped) — not Sun 1/14, which the old "unconditional next calendar
    // day" rule used to return.
    expect(internActiveFromDate(utcDate("2024-01-11"))).toBe("2024-01-16");
  });
});
