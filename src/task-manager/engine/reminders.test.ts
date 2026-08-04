// Unit tests for the pure reminder/escalation decision (PROJECT_GUIDE §4).
// With strikeLimit = 3: reminders fire at strikes 1 and 2; the third firing
// (the one that raises strikeCount to the limit) escalates. No DB/Redis needed.

import { describe, expect, it } from "vitest";
import type { BlockStatus, RunStatus } from "@/generated/task-manager-client";
import { decideReminderAction, type ReminderDecisionInput } from "./reminders";

const NOW = new Date("2026-07-16T12:00:00.000Z");
const PAST = new Date("2026-07-15T12:00:00.000Z");
const FUTURE = new Date("2026-07-17T12:00:00.000Z");

function input(overrides: Partial<ReminderDecisionInput> = {}): ReminderDecisionInput {
  return {
    blockStatus: "ACTIVE",
    runStatus: "ACTIVE",
    strikeCount: 0,
    strikeLimit: 3,
    dueAt: null,
    now: NOW,
    ...overrides,
  };
}

describe("decideReminderAction — strike sequence (limit 3)", () => {
  it("first firing (strikeCount 0 -> strike 1) reminds", () => {
    expect(decideReminderAction(input({ strikeCount: 0 }))).toEqual({
      action: "remind",
      markOverdue: false,
    });
  });

  it("second firing (strikeCount 1 -> strike 2) reminds", () => {
    expect(decideReminderAction(input({ strikeCount: 1 }))).toEqual({
      action: "remind",
      markOverdue: false,
    });
  });

  it("third firing (strikeCount 2 -> strike 3, reaches the limit) escalates", () => {
    expect(decideReminderAction(input({ strikeCount: 2 })).action).toBe("escalate");
  });

  it("beyond the limit still escalates (defensive)", () => {
    expect(decideReminderAction(input({ strikeCount: 5 })).action).toBe("escalate");
  });
});

describe("decideReminderAction — strikeLimit 1", () => {
  it("the very first firing escalates immediately (no reminder ever sent)", () => {
    expect(decideReminderAction(input({ strikeCount: 0, strikeLimit: 1 })).action).toBe(
      "escalate",
    );
  });
});

describe("decideReminderAction — skip conditions", () => {
  it.each<BlockStatus>(["DONE", "SKIPPED", "ESCALATED"])(
    "skips when the block is %s",
    (blockStatus) => {
      expect(decideReminderAction(input({ blockStatus }))).toEqual({
        action: "skip",
        markOverdue: false,
      });
    },
  );

  it.each<RunStatus>(["COMPLETED", "CANCELLED"])("skips when the run is %s", (runStatus) => {
    expect(decideReminderAction(input({ runStatus }))).toEqual({
      action: "skip",
      markOverdue: false,
    });
  });

  it("skip never marks overdue, even with a passed dueAt", () => {
    expect(
      decideReminderAction(input({ blockStatus: "DONE", dueAt: PAST })),
    ).toEqual({ action: "skip", markOverdue: false });
    expect(
      decideReminderAction(input({ runStatus: "CANCELLED", dueAt: PAST })),
    ).toEqual({ action: "skip", markOverdue: false });
  });
});

describe("decideReminderAction — markOverdue transitions", () => {
  it("marks overdue when dueAt has passed and the block is still ACTIVE", () => {
    expect(decideReminderAction(input({ dueAt: PAST }))).toEqual({
      action: "remind",
      markOverdue: true,
    });
  });

  it("marks overdue when dueAt is exactly now", () => {
    expect(decideReminderAction(input({ dueAt: NOW })).markOverdue).toBe(true);
  });

  it("does not mark overdue when dueAt is in the future", () => {
    expect(decideReminderAction(input({ dueAt: FUTURE })).markOverdue).toBe(false);
  });

  it("does not mark overdue when there is no dueAt", () => {
    expect(decideReminderAction(input({ dueAt: null })).markOverdue).toBe(false);
  });

  it("a PENDING block with a passed dueAt reminds but is NOT marked overdue (ACTIVE-only rule)", () => {
    expect(decideReminderAction(input({ blockStatus: "PENDING", dueAt: PAST }))).toEqual({
      action: "remind",
      markOverdue: false,
    });
  });

  it("does not re-mark a block that is already OVERDUE (but still reminds)", () => {
    expect(decideReminderAction(input({ blockStatus: "OVERDUE", dueAt: PAST }))).toEqual({
      action: "remind",
      markOverdue: false,
    });
  });

  it("the escalating firing also reports the overdue transition", () => {
    expect(decideReminderAction(input({ strikeCount: 2, dueAt: PAST }))).toEqual({
      action: "escalate",
      markOverdue: true,
    });
  });

  it("an OVERDUE block escalates on the limit-reaching firing", () => {
    expect(
      decideReminderAction(input({ blockStatus: "OVERDUE", strikeCount: 2, dueAt: PAST })),
    ).toEqual({ action: "escalate", markOverdue: false });
  });
});
