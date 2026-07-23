// Unit tests for formatDueDate — the shared due-date badge used by every
// task row across the OSC package (ResizableTaskList, CeoTaskTable,
// department-overview's checklist, etc). Pins "today" with fake timers so
// the calendar-day arithmetic isn't flaky around local midnight.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDueDate } from "./types";

// A fixed Monday, well clear of month/year boundaries.
const TODAY = new Date(2024, 0, 15, 12, 0, 0);

function daysFromToday(offset: number, hour = 9): Date {
  return new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + offset, hour);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatDueDate", () => {
  it("returns null for no due date", () => {
    expect(formatDueDate(null)).toBeNull();
  });

  it("is time-of-day independent — due later today is still 'Today'", () => {
    expect(formatDueDate(daysFromToday(0, 23))).toEqual({
      text: "Today",
      className: "text-amber-600 font-medium",
    });
    expect(formatDueDate(daysFromToday(0, 0))).toEqual({
      text: "Today",
      className: "text-amber-600 font-medium",
    });
  });

  it("labels yesterday distinctly from older overdue dates", () => {
    expect(formatDueDate(daysFromToday(-1))).toEqual({
      text: "Yesterday",
      className: "text-red-500 font-medium",
    });
  });

  it("shows 'N days ago' for anything more than 1 day overdue", () => {
    expect(formatDueDate(daysFromToday(-2))).toEqual({
      text: "2 days ago",
      className: "text-red-500 font-medium",
    });
    expect(formatDueDate(daysFromToday(-10))).toEqual({
      text: "10 days ago",
      className: "text-red-500 font-medium",
    });
  });

  it("uses a short weekday name for the next 6 days, staying neutral gray", () => {
    for (const offset of [1, 6]) {
      const result = formatDueDate(daysFromToday(offset));
      expect(result?.className).toBe("text-gray-400");
      expect(result?.text).toMatch(/^[A-Za-z]{2,3}$/);
    }
  });

  it("falls back to 'day month' once 7+ days out", () => {
    const result = formatDueDate(daysFromToday(7));
    expect(result?.className).toBe("text-gray-400");
    // e.g. "Jan 22" — not a bare weekday abbreviation.
    expect(result?.text).toMatch(/^[A-Za-z]+\s+\d{1,2}$/);
  });
});
