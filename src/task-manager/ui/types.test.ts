// Unit tests for formatDueDate — the shared due-date badge used by every
// task row across the OSC package (ResizableTaskList, CeoTaskTable,
// department-overview's checklist, etc). Pins "today" with fake timers so
// the calendar-day arithmetic isn't flaky around local midnight.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FLOW_GROUP_DEPT_ALL,
  FLOW_GROUP_DEPT_NONE,
  flowGroupMembers,
  formatDueDate,
  visibleAssignerStreams,
  type FlowRole,
  type FlowStaffMember,
} from "./types";

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

  it("TODAY is 'Overdue' (red), time-of-day independent (2026-08-01 rules)", () => {
    expect(formatDueDate(daysFromToday(0, 23))).toEqual({
      text: "15/1 Overdue",
      className: "text-red-500 font-medium",
    });
    expect(formatDueDate(daysFromToday(0, 0))).toEqual({
      text: "15/1 Overdue",
      className: "text-red-500 font-medium",
    });
  });

  it("every past date is 'Overdue' (red)", () => {
    expect(formatDueDate(daysFromToday(-1))).toEqual({
      text: "14/1 Overdue",
      className: "text-red-500 font-medium",
    });
    expect(formatDueDate(daysFromToday(-10))).toEqual({
      text: "5/1 Overdue",
      className: "text-red-500 font-medium",
    });
  });

  it("TOMORROW is 'Due Soon' (amber)", () => {
    expect(formatDueDate(daysFromToday(1))).toEqual({
      text: "16/1 Due Soon",
      className: "text-amber-600 font-medium",
    });
  });

  it("uses 'D/M + short weekday' for 2-6 days out, neutral gray, no status label", () => {
    for (const offset of [2, 6]) {
      const result = formatDueDate(daysFromToday(offset));
      expect(result?.className).toBe("text-gray-400");
      expect(result?.text).toMatch(/^\d{1,2}\/\d{1,2} [A-Za-z]{2,3}$/);
    }
  });

  it("falls back to the bare 'D/M' date once 7+ days out", () => {
    expect(formatDueDate(daysFromToday(7))).toEqual({
      text: "22/1",
      className: "text-gray-400",
    });
  });
});

// Regression net for the DEPT_SITE fix (b639da4): Admin/Ops/dept-site
// assigned tasks share no separate recipient card — every other role's
// stream stays visible, in the order it was given.
describe("visibleAssignerStreams", () => {
  it("drops self/ADMIN/OPS/DEPT_SITE and keeps the rest, in order", () => {
    const streams: { key: FlowRole | "self" }[] = [
      { key: "self" },
      { key: "ADMIN" },
      { key: "OPS" },
      { key: "DEPT_SITE" },
      { key: "CEO" },
      { key: "HOD" },
      { key: "BRANCH_SITE" },
      { key: "MEMBER" },
    ];

    expect(visibleAssignerStreams(streams).map((s) => s.key)).toEqual([
      "CEO",
      "HOD",
      "BRANCH_SITE",
      "MEMBER",
    ]);
  });
});

describe("flowGroupMembers — Intern department drill-down (2026-07-25)", () => {
  const intern = (id: string, department: string | null): FlowStaffMember => ({
    id,
    name: id,
    role: "MEMBER" as FlowRole,
    department,
    branch: null,
    employmentType: "Intern",
    coachSchedule: null,
  });
  const staff: FlowStaffMember[] = [
    intern("op-intern", "Operations"),
    intern("mkt-intern", "Marketing"),
    intern("no-dept-intern", null),
  ];

  it("no sub-value or 'All departments' -> every intern (the old flat behavior)", () => {
    expect(flowGroupMembers(staff, "Intern").map((s) => s.id)).toEqual([
      "op-intern",
      "mkt-intern",
      "no-dept-intern",
    ]);
    expect(flowGroupMembers(staff, "Intern", FLOW_GROUP_DEPT_ALL).map((s) => s.id)).toEqual([
      "op-intern",
      "mkt-intern",
      "no-dept-intern",
    ]);
  });

  it("a department sub-value narrows to that department's interns only", () => {
    expect(flowGroupMembers(staff, "Intern", "Operations").map((s) => s.id)).toEqual([
      "op-intern",
    ]);
  });

  it("'No department yet' selects department-less interns only", () => {
    expect(flowGroupMembers(staff, "Intern", FLOW_GROUP_DEPT_NONE).map((s) => s.id)).toEqual([
      "no-dept-intern",
    ]);
  });
});
