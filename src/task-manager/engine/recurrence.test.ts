// Pure-logic tests for the weekly recurrence date math. The DB module is
// vi.mock'ed (repo pattern — see engine/*.test.ts) so importing recurrence.ts
// never touches Postgres; advanceRecurringBlocks itself is exercised against
// the live app, not unit-tested here.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/task-manager/prisma", () => ({ prisma: {} }));

import { nextWeeklyDueAt } from "./recurrence";

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h);

describe("nextWeeklyDueAt", () => {
  it("advances a just-passed due date exactly one week", () => {
    // Due Tue 2026-07-21 09:00; today is Wed 2026-07-22.
    const next = nextWeeklyDueAt(at(2026, 7, 21), new Date(2026, 6, 22));
    expect(next).toEqual(at(2026, 7, 28));
  });

  it("collapses a multi-week gap into ONE occurrence in the current week", () => {
    // Due Tue 2026-06-30; today is Thu 2026-07-23 → next Tue >= today is 07-28.
    const next = nextWeeklyDueAt(at(2026, 6, 30), new Date(2026, 6, 23));
    expect(next).toEqual(at(2026, 7, 28));
  });

  it("keeps the weekday and the time-of-day", () => {
    const next = nextWeeklyDueAt(at(2026, 7, 21, 17), new Date(2026, 6, 22));
    expect(next.getDay()).toBe(at(2026, 7, 21).getDay());
    expect(next.getHours()).toBe(17);
  });

  it("returns an already-current or future due date unchanged", () => {
    // Due today at 09:00 (>= todayStart) — no advance.
    expect(nextWeeklyDueAt(at(2026, 7, 22), new Date(2026, 6, 22))).toEqual(at(2026, 7, 22));
    // Due in the future — unchanged.
    expect(nextWeeklyDueAt(at(2026, 7, 25), new Date(2026, 6, 22))).toEqual(at(2026, 7, 25));
  });

  it("month and year boundaries roll correctly", () => {
    // Due Fri 2026-12-25; today is Sat 2026-12-26 → next Fri is 2027-01-01.
    const next = nextWeeklyDueAt(at(2026, 12, 25), new Date(2026, 11, 26));
    expect(next).toEqual(at(2027, 1, 1));
  });
});
