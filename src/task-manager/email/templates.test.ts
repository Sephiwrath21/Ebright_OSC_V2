// Pins the reminder/escalation copy to the normative strike math (guide §4):
// with strikeLimit = N, reminders fire at strikes 1..N-1 and the Nth firing
// escalates — so only N-1 reminders ever exist and the copy must say so.

import { describe, expect, it } from "vitest";
import { escalationEmail, reminderEmail } from "./templates";

const base = {
  assigneeName: "Alice",
  blockTitle: "Approve PO",
  runName: "PO #42",
  flowName: "Procurement",
  dueAt: null,
  url: "http://localhost:3000/runs/run1",
};

describe("reminderEmail — strike math copy", () => {
  it("numbers reminders out of strikeLimit - 1, not strikeLimit", () => {
    const { subject, html } = reminderEmail({ ...base, strikeCount: 1, strikeLimit: 3 });
    expect(subject).toContain("Reminder 1/2");
    expect(html).toContain("1 of 2");
    expect(html).toContain("After 2 reminders");
  });

  it("the final reminder before escalation reads N-1 of N-1", () => {
    const { subject } = reminderEmail({ ...base, strikeCount: 2, strikeLimit: 3 });
    expect(subject).toContain("Reminder 2/2");
  });

  it("guards the degenerate strikeLimit = 1 case (never advertises 0 reminders)", () => {
    const { subject, html } = reminderEmail({ ...base, strikeCount: 1, strikeLimit: 1 });
    expect(subject).toContain("Reminder 1/1");
    expect(html).toContain("After 1 reminder");
  });

  it("agrees with the escalation email about how many reminders were sent", () => {
    // At escalation strikeCount === strikeLimit, so reminders sent = N - 1 —
    // exactly the reminder template's total.
    const { html } = escalationEmail({
      ...base,
      supervisorName: "Boss",
      strikeCount: 3,
    });
    expect(html).toContain("Reminders sent");
    expect(html).toContain(">2</td>");
  });
});
