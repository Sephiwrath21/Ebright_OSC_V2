// Behaviour tests for processReminder (PROJECT_GUIDE §4 "Reminder job fires").
// The impure modules (prisma / queues / email / users) are vi.mock'ed — no DB or
// Redis is touched. These assert the side-effect CONTRACT the pure decision
// can't: escalation does NOT re-queue; reminding re-queues at +reminderInterval;
// skips touch nothing.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TemplateSnapshot } from "../lib/types";

const mocks = vi.hoisted(() => ({
  runBlockFindUnique: vi.fn(),
  runBlockUpdateMany: vi.fn(),
  notificationCreate: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  queueAdd: vi.fn(),
  queueRemove: vi.fn(),
  sendEmail: vi.fn(),
  getUsersByIds: vi.fn(),
}));

vi.mock("../prisma", () => ({
  prisma: {
    runBlock: { findUnique: mocks.runBlockFindUnique, updateMany: mocks.runBlockUpdateMany },
    notificationLog: { create: mocks.notificationCreate },
    auditLog: { create: mocks.auditCreate },
    $transaction: mocks.transaction,
  },
}));
vi.mock("../lib/queues", () => ({
  getReminderQueue: () => ({ add: mocks.queueAdd, remove: mocks.queueRemove }),
  // Mirrors src/lib/queues.ts — deterministic id per (runBlock, strike#).
  reminderJobId: (runBlockId: string, strike: number) => `reminder:${runBlockId}:${strike}`,
}));
vi.mock("../lib/email", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("../lib/users", () => ({ getUsersByIds: mocks.getUsersByIds }));

import { processReminder } from "./reminders";

const HOUR_MS = 3_600_000;
const ASSIGNEE = { id: "u-assignee", name: "Alice", email: "alice@ebright.my" };
const SUPERVISOR = { id: "u-boss", name: "Boss", email: "boss@ebright.my" };

function snapshot(overrides: Partial<TemplateSnapshot["blocks"][number]> = {}): TemplateSnapshot {
  return {
    flowId: "flow1",
    flowName: "Procurement",
    version: 1,
    blocks: [
      {
        id: "blk1",
        nodeId: "node1",
        title: "Approve PO",
        assigneeRole: null,
        fixedAssigneeId: ASSIGNEE.id,
        dueInHours: 24,
        reminderInterval: 6,
        strikeLimit: 3,
        escalateToUserId: SUPERVISOR.id,
        outgoingEdges: [],
        items: [],
        ...overrides,
      },
    ],
    decisions: [],
    edges: [],
  };
}

type RunBlockFixture = {
  status?: string;
  strikeCount?: number;
  dueAt?: Date | null;
  runStatus?: string;
  templateSnapshot?: TemplateSnapshot;
};

function runBlock({
  status = "ACTIVE",
  strikeCount = 0,
  dueAt = null,
  runStatus = "ACTIVE",
  templateSnapshot = snapshot(),
}: RunBlockFixture = {}) {
  return {
    id: "rb1",
    runId: "run1",
    blockId: "blk1",
    nodeId: "node1",
    title: "Approve PO",
    assigneeId: ASSIGNEE.id,
    status,
    strikeCount,
    dueAt,
    startedAt: new Date("2026-07-15T00:00:00.000Z"),
    completedAt: null,
    reminderJobId: `reminder:rb1:${strikeCount + 1}`,
    run: {
      id: "run1",
      status: runStatus,
      name: "PO #42",
      templateSnapshot,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runBlockUpdateMany.mockResolvedValue({ count: 1 });
  mocks.notificationCreate.mockResolvedValue({});
  mocks.auditCreate.mockResolvedValue({});
  // Interactive transaction: run the callback against the same mocked models
  // so guarded-update + audit atomicity is observable through one mock set.
  mocks.transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        runBlock: { updateMany: mocks.runBlockUpdateMany },
        auditLog: { create: mocks.auditCreate },
      }),
  );
  mocks.queueAdd.mockResolvedValue({});
  mocks.queueRemove.mockResolvedValue({});
  mocks.sendEmail.mockResolvedValue({ id: "mail-1" });
  mocks.getUsersByIds.mockResolvedValue(
    new Map([
      [ASSIGNEE.id, ASSIGNEE],
      [SUPERVISOR.id, SUPERVISOR],
    ]),
  );
});

describe("processReminder — remind path", () => {
  it("first firing re-queues the next reminder at +reminderInterval hours and bumps the strike", async () => {
    mocks.runBlockFindUnique.mockResolvedValue(runBlock({ strikeCount: 0 }));

    await processReminder("rb1");

    expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "reminder",
      { runBlockId: "rb1" },
      { jobId: "reminder:rb1:2", delay: 6 * HOUR_MS },
    );
    // The write is GUARDED on the status + the strike that was read, so a
    // concurrent completeBlock/cancelRun (or a BullMQ retry whose strike was
    // already applied) matches 0 rows instead of resurrecting the block or
    // double-incrementing the strike.
    expect(mocks.runBlockUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "rb1",
        status: { in: ["ACTIVE", "OVERDUE"] },
        strikeCount: 0,
        run: { status: "ACTIVE" },
      },
      data: { strikeCount: 1, reminderJobId: "reminder:rb1:2" },
    });
    // reminder email to the ASSIGNEE, not the supervisor
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0].to).toBe(ASSIGNEE.email);
    expect(mocks.notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "REMINDER" }) }),
    );
  });

  it("marks OVERDUE when dueAt has passed and the block is still ACTIVE", async () => {
    mocks.runBlockFindUnique.mockResolvedValue(
      runBlock({ strikeCount: 0, dueAt: new Date("2020-01-01T00:00:00.000Z") }),
    );

    await processReminder("rb1");

    expect(mocks.runBlockUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "rb1",
        status: { in: ["ACTIVE", "OVERDUE"] },
        strikeCount: 0,
        run: { status: "ACTIVE" },
      },
      data: { strikeCount: 1, reminderJobId: "reminder:rb1:2", status: "OVERDUE" },
    });
    // …and the OVERDUE audit commits atomically with the strike (one tx), so a
    // transient audit failure can never leave a half-applied firing behind.
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "BLOCK_STATUS_CHANGED" }),
      }),
    );
  });

  it("does not mark OVERDUE when dueAt is in the future", async () => {
    mocks.runBlockFindUnique.mockResolvedValue(
      runBlock({ strikeCount: 0, dueAt: new Date(Date.now() + 48 * HOUR_MS) }),
    );

    await processReminder("rb1");

    const data = mocks.runBlockUpdateMany.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
  });

  it("falls back to the default 24h interval when the snapshot block is missing", async () => {
    const orphanSnapshot = { ...snapshot(), blocks: [] };
    mocks.runBlockFindUnique.mockResolvedValue(
      runBlock({ strikeCount: 0, templateSnapshot: orphanSnapshot }),
    );

    await processReminder("rb1");

    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "reminder",
      { runBlockId: "rb1" },
      { jobId: "reminder:rb1:2", delay: 24 * HOUR_MS },
    );
  });
});

describe("processReminder — escalate path (never nags again)", () => {
  it("the limit-reaching firing escalates and does NOT re-queue", async () => {
    mocks.runBlockFindUnique.mockResolvedValue(runBlock({ strikeCount: 2 }));

    await processReminder("rb1");

    expect(mocks.queueAdd).not.toHaveBeenCalled();
    expect(mocks.runBlockUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "rb1",
        status: { in: ["ACTIVE", "OVERDUE"] },
        strikeCount: 2,
        run: { status: "ACTIVE" },
      },
      data: { status: "ESCALATED", strikeCount: 3, reminderJobId: null },
    });
    // escalation email goes to the SUPERVISOR
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0].to).toBe(SUPERVISOR.email);
    expect(mocks.notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "ESCALATION", sentTo: SUPERVISOR.email }),
      }),
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "BLOCK_ESCALATED" }) }),
    );
  });

  it("strikeLimit 1: the very first firing escalates — the assignee never gets a reminder", async () => {
    mocks.runBlockFindUnique.mockResolvedValue(
      runBlock({ strikeCount: 0, templateSnapshot: snapshot({ strikeLimit: 1 }) }),
    );

    await processReminder("rb1");

    expect(mocks.queueAdd).not.toHaveBeenCalled();
    expect(mocks.runBlockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "ESCALATED", strikeCount: 1, reminderJobId: null },
      }),
    );
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0].to).toBe(SUPERVISOR.email);
  });

  it("still escalates (block + audit) when the escalation target user cannot be resolved", async () => {
    mocks.getUsersByIds.mockResolvedValue(new Map([[ASSIGNEE.id, ASSIGNEE]]));
    mocks.runBlockFindUnique.mockResolvedValue(runBlock({ strikeCount: 2 }));

    await processReminder("rb1");

    expect(mocks.runBlockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "ESCALATED", strikeCount: 3, reminderJobId: null },
      }),
    );
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.queueAdd).not.toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "BLOCK_ESCALATED" }) }),
    );
  });
});

describe("processReminder — guarded writes (concurrent completion / job retries)", () => {
  it("remind: when the guarded update matches no row, nothing is sent and the just-queued next job is removed", async () => {
    // e.g. the assignee's POST /complete committed DONE between the read and
    // the write — the firing must no-op, not resurrect the block to OVERDUE.
    mocks.runBlockFindUnique.mockResolvedValue(runBlock({ strikeCount: 0 }));
    mocks.runBlockUpdateMany.mockResolvedValue({ count: 0 });

    await processReminder("rb1");

    expect(mocks.queueRemove).toHaveBeenCalledWith("reminder:rb1:2");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("escalate: when the guarded update matches no row, no escalation email/audit is produced", async () => {
    mocks.runBlockFindUnique.mockResolvedValue(runBlock({ strikeCount: 2 }));
    mocks.runBlockUpdateMany.mockResolvedValue({ count: 0 });

    await processReminder("rb1");

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it("remind: a retried job re-queues the SAME deterministic next job id (BullMQ dedupes it)", async () => {
    // The strike guard means a retry only ever runs when the previous attempt
    // rolled back, so it recomputes the identical jobId — never a second track.
    mocks.runBlockFindUnique.mockResolvedValue(runBlock({ strikeCount: 1 }));

    await processReminder("rb1");

    expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
    expect(mocks.queueAdd.mock.calls[0][2].jobId).toBe("reminder:rb1:3");
    expect(mocks.runBlockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ strikeCount: 1 }),
        data: expect.objectContaining({ strikeCount: 2 }),
      }),
    );
  });
});

describe("processReminder — skip paths (no writes, no emails, no jobs)", () => {
  it.each(["DONE", "SKIPPED", "ESCALATED"])("no-ops when the block is %s", async (status) => {
    mocks.runBlockFindUnique.mockResolvedValue(runBlock({ status }));

    await processReminder("rb1");

    expect(mocks.runBlockUpdateMany).not.toHaveBeenCalled();
    expect(mocks.queueAdd).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });

  it.each(["COMPLETED", "CANCELLED"])("no-ops when the run is %s", async (runStatus) => {
    mocks.runBlockFindUnique.mockResolvedValue(runBlock({ runStatus }));

    await processReminder("rb1");

    expect(mocks.runBlockUpdateMany).not.toHaveBeenCalled();
    expect(mocks.queueAdd).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("no-ops (job dropped) when the runBlock no longer exists", async () => {
    mocks.runBlockFindUnique.mockResolvedValue(null);

    await processReminder("rb-ghost");

    expect(mocks.runBlockUpdateMany).not.toHaveBeenCalled();
    expect(mocks.queueAdd).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
