// Behaviour tests for completeBlock's advance transaction (PROJECT_GUIDE §4
// "Block completion"). The impure modules (prisma / queues / users) are
// vi.mock'ed exactly like reminders.process.test.ts — no DB or Redis. These pin
// the concurrency contract:
//   - the block -> DONE transition is GUARDED (double-complete aborts with 400
//     instead of re-running the advance and double-firing WORKFLOW_CHAIN);
//   - run completion is GUARDED (only the request that flips ACTIVE ->
//     COMPLETED audits RUN_COMPLETED and fires chain triggers);
//   - the tx takes a per-run advisory lock BEFORE the remaining-count so two
//     parallel last blocks can't write-skew the run into a stuck ACTIVE state;
//   - a P2002 from the @@unique([runId,nodeId]) fan-in backstop retries the
//     advance instead of failing the user's completion with a 500.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/task-manager-client";
import { ApiHttpError } from "../lib/api-server";
import type { TemplateSnapshot } from "../lib/types";

const mocks = vi.hoisted(() => ({
  runBlockFindUnique: vi.fn(),
  runBlockUpdate: vi.fn(),
  runItemFindMany: vi.fn(),
  auditCreateMany: vi.fn(),
  auditCreate: vi.fn(),
  flowTriggerFindMany: vi.fn(),
  transaction: vi.fn(),
  // tx-scoped models
  txExecuteRaw: vi.fn(),
  txRunBlockUpdateMany: vi.fn(),
  txRunBlockFindMany: vi.fn(),
  txRunBlockCreate: vi.fn(),
  txRunBlockCount: vi.fn(),
  txFlowRunUpdateMany: vi.fn(),
  getReminderQueue: vi.fn(),
  queueAdd: vi.fn(),
  queueRemove: vi.fn(),
  getUsersByIds: vi.fn(),
}));

vi.mock("../prisma", () => ({
  prisma: {
    runBlock: { findUnique: mocks.runBlockFindUnique, update: mocks.runBlockUpdate },
    runItem: { findMany: mocks.runItemFindMany },
    auditLog: { createMany: mocks.auditCreateMany, create: mocks.auditCreate },
    flowTrigger: { findMany: mocks.flowTriggerFindMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("../lib/queues", () => ({
  getReminderQueue: mocks.getReminderQueue,
  reminderJobId: (runBlockId: string, strike: number) => `reminder:${runBlockId}:${strike}`,
}));
vi.mock("../lib/users", () => ({ getUsersByIds: mocks.getUsersByIds }));

import { completeBlock } from "./run";

const ASSIGNEE = { id: "u1", name: "Alice", email: "alice@ebright.my", role: "MEMBER" };

function snapBlock(
  id: string,
  nodeId: string,
  targets: string[] = [],
): TemplateSnapshot["blocks"][number] {
  return {
    id,
    nodeId,
    title: `Step ${nodeId}`,
    assigneeRole: null,
    fixedAssigneeId: ASSIGNEE.id,
    dueInHours: null,
    reminderInterval: 24,
    strikeLimit: 3,
    escalateToUserId: "u-boss",
    outgoingEdges: targets.map((t) => ({
      condition: { kind: "always" as const },
      targetNodeId: t,
    })),
    items: [],
  };
}

function snapshot(blocks: TemplateSnapshot["blocks"]): TemplateSnapshot {
  return { flowId: "flow1", flowName: "Procurement", version: 1, blocks, decisions: [], edges: [] };
}

function runBlockRow(templateSnapshot: TemplateSnapshot) {
  return {
    id: "rb-a",
    runId: "run1",
    blockId: "blk-a",
    nodeId: "node-a",
    title: "Step node-a",
    assigneeId: ASSIGNEE.id,
    status: "ACTIVE",
    strikeCount: 0,
    dueAt: null,
    startedAt: new Date("2026-07-15T00:00:00.000Z"),
    completedAt: null,
    reminderJobId: "reminder:rb-a:1",
    runItems: [],
    run: {
      id: "run1",
      flowId: "flow1",
      status: "ACTIVE",
      startedById: ASSIGNEE.id,
      name: "PO #42",
      templateSnapshot,
    },
  };
}

/** Wire the interactive-transaction mock to the tx-scoped model mocks. */
function wireTransaction() {
  mocks.transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $executeRaw: mocks.txExecuteRaw,
        runBlock: {
          updateMany: mocks.txRunBlockUpdateMany,
          findMany: mocks.txRunBlockFindMany,
          create: mocks.txRunBlockCreate,
          count: mocks.txRunBlockCount,
        },
        flowRun: { updateMany: mocks.txFlowRunUpdateMany },
      }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  wireTransaction();
  mocks.runItemFindMany.mockResolvedValue([]);
  mocks.runBlockUpdate.mockResolvedValue({});
  mocks.auditCreateMany.mockResolvedValue({});
  mocks.auditCreate.mockResolvedValue({});
  mocks.flowTriggerFindMany.mockResolvedValue([]);
  mocks.txExecuteRaw.mockResolvedValue(0);
  mocks.txRunBlockUpdateMany.mockResolvedValue({ count: 1 });
  mocks.txRunBlockFindMany.mockResolvedValue([]);
  mocks.txRunBlockCreate.mockImplementation(
    async ({ data }: { data: { nodeId: string } }) => ({
      id: `rb-${data.nodeId}`,
      nodeId: data.nodeId,
      title: `Step ${data.nodeId}`,
      assigneeId: ASSIGNEE.id,
      startedAt: new Date(),
      dueAt: null,
      strikeCount: 0,
    }),
  );
  mocks.txRunBlockCount.mockResolvedValue(0);
  mocks.txFlowRunUpdateMany.mockResolvedValue({ count: 1 });
  mocks.getReminderQueue.mockReturnValue({ add: mocks.queueAdd, remove: mocks.queueRemove });
  mocks.queueAdd.mockResolvedValue({});
  mocks.queueRemove.mockResolvedValue({});
  mocks.getUsersByIds.mockResolvedValue(new Map([[ASSIGNEE.id, ASSIGNEE]]));
});

const input = { runId: "run1", runBlockId: "rb-a", actorId: ASSIGNEE.id };

describe("completeBlock — guarded DONE transition (double-complete)", () => {
  it("marks the block DONE with a status-guarded write, not a blind update", async () => {
    mocks.runBlockFindUnique.mockResolvedValue(runBlockRow(snapshot([snapBlock("blk-a", "node-a")])));

    await completeBlock(input);

    expect(mocks.txRunBlockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rb-a", status: { notIn: ["DONE", "SKIPPED"] } },
        data: expect.objectContaining({ status: "DONE", reminderJobId: null }),
      }),
    );
  });

  it("aborts with 400 when a concurrent request already completed the block — no run update, no audits, no chain triggers", async () => {
    mocks.runBlockFindUnique.mockResolvedValue(runBlockRow(snapshot([snapBlock("blk-a", "node-a")])));
    mocks.txRunBlockUpdateMany.mockResolvedValue({ count: 0 });

    await expect(completeBlock(input)).rejects.toMatchObject({ status: 400 });
    await expect(
      completeBlock(input).catch((e) => e),
    ).resolves.toBeInstanceOf(ApiHttpError);

    expect(mocks.txFlowRunUpdateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreateMany).not.toHaveBeenCalled();
    expect(mocks.flowTriggerFindMany).not.toHaveBeenCalled();
  });
});

describe("completeBlock — guarded run completion (exactly-once)", () => {
  it("completes the run with a status-guarded write and then audits RUN_COMPLETED + looks up chain triggers", async () => {
    mocks.runBlockFindUnique.mockResolvedValue(runBlockRow(snapshot([snapBlock("blk-a", "node-a")])));

    const result = await completeBlock(input);

    expect(result.runCompleted).toBe(true);
    expect(mocks.txFlowRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run1", status: "ACTIVE" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
    const auditRows = mocks.auditCreateMany.mock.calls[0][0].data;
    expect(auditRows.some((r: { action: string }) => r.action === "RUN_COMPLETED")).toBe(true);
    expect(mocks.flowTriggerFindMany).toHaveBeenCalledTimes(1);
  });

  it("does NOT claim run completion (no RUN_COMPLETED audit, no chain triggers) when another tx flipped the run first", async () => {
    mocks.runBlockFindUnique.mockResolvedValue(runBlockRow(snapshot([snapBlock("blk-a", "node-a")])));
    mocks.txFlowRunUpdateMany.mockResolvedValue({ count: 0 });

    const result = await completeBlock(input);

    expect(result.runCompleted).toBe(false);
    const auditRows = mocks.auditCreateMany.mock.calls[0][0].data;
    expect(auditRows.some((r: { action: string }) => r.action === "RUN_COMPLETED")).toBe(false);
    expect(mocks.flowTriggerFindMany).not.toHaveBeenCalled();
  });

  it("does not touch the run while open blocks remain", async () => {
    mocks.runBlockFindUnique.mockResolvedValue(runBlockRow(snapshot([snapBlock("blk-a", "node-a")])));
    mocks.txRunBlockCount.mockResolvedValue(1);

    const result = await completeBlock(input);

    expect(result.runCompleted).toBe(false);
    expect(mocks.txFlowRunUpdateMany).not.toHaveBeenCalled();
  });

  it("takes the per-run advisory lock FIRST inside the tx (serializes concurrent advances of one run)", async () => {
    mocks.runBlockFindUnique.mockResolvedValue(runBlockRow(snapshot([snapBlock("blk-a", "node-a")])));

    await completeBlock(input);

    expect(mocks.txExecuteRaw).toHaveBeenCalledTimes(1);
    const lockOrder = mocks.txExecuteRaw.mock.invocationCallOrder[0];
    const doneOrder = mocks.txRunBlockUpdateMany.mock.invocationCallOrder[0];
    const countOrder = mocks.txRunBlockCount.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(doneOrder);
    expect(lockOrder).toBeLessThan(countOrder);
  });
});

describe("completeBlock — fan-in P2002 backstop", () => {
  const fanInSnapshot = snapshot([
    snapBlock("blk-a", "node-a", ["node-c"]),
    snapBlock("blk-b", "node-b", ["node-c"]),
    snapBlock("blk-c", "node-c"),
  ]);

  it("a unique-constraint race on the next block retries the advance and the completion still succeeds", async () => {
    mocks.runBlockFindUnique.mockResolvedValue(runBlockRow(fanInSnapshot));
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
    });
    // 1st attempt: the concurrent completion commits node-c between our
    // `existing` check and our create -> P2002 aborts the whole tx.
    // 2nd attempt: the re-run's `existing` check sees the winner's row.
    mocks.txRunBlockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ nodeId: "node-c" }]);
    mocks.txRunBlockCreate.mockRejectedValueOnce(p2002);
    mocks.txRunBlockCount.mockResolvedValue(1); // node-c is still open

    const result = await completeBlock(input);

    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(result.runCompleted).toBe(false);
    expect(result.activatedNodeIds).toEqual([]); // the other tx owns node-c
    // the user's completion committed — DONE audit written, no error surfaced
    const auditRows = mocks.auditCreateMany.mock.calls[0][0].data;
    expect(auditRows[0]).toMatchObject({ action: "BLOCK_STATUS_CHANGED" });
  });

  it("creates the next block (and schedules its reminder) when there is no race", async () => {
    mocks.runBlockFindUnique.mockResolvedValue(runBlockRow(fanInSnapshot));
    mocks.txRunBlockCount.mockResolvedValue(1);

    const result = await completeBlock(input);

    expect(result.activatedNodeIds).toEqual(["node-c"]);
    expect(mocks.txRunBlockCreate).toHaveBeenCalledTimes(1);
    // reminder scheduled for the newly activated block
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "reminder",
      { runBlockId: "rb-node-c" },
      expect.objectContaining({ jobId: "reminder:rb-node-c:1" }),
    );
  });

  it("non-retryable errors still propagate", async () => {
    mocks.runBlockFindUnique.mockResolvedValue(runBlockRow(fanInSnapshot));
    mocks.txRunBlockCreate.mockRejectedValue(new Error("connection lost"));

    await expect(completeBlock(input)).rejects.toThrow("connection lost");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("completeBlock — reminder queue unavailable (REDIS_URL unset by design)", () => {
  it("still completes and marks the block DONE when getReminderQueue throws", async () => {
    const snap = snapshot([snapBlock("blk-a", "node-a", ["node-b"]), snapBlock("blk-b", "node-b")]);
    // reminderJobId: null so removeReminderJob no-ops via its `if (!jobId) return`
    // guard instead of consuming the single mocked throw itself — the throw must
    // land on scheduleReminder's call for the newly created block.
    mocks.runBlockFindUnique.mockResolvedValue({ ...runBlockRow(snap), reminderJobId: null });
    mocks.txRunBlockCount.mockResolvedValue(1);
    mocks.getReminderQueue.mockImplementationOnce(() => {
      throw new Error("REDIS_URL is not set — reminder scheduling disabled");
    });
    const warnSpy = vi.spyOn(console, "warn"); // call-through: still prints, also assertable

    const result = await completeBlock(input);

    expect(result.activatedNodeIds).toEqual(["node-b"]);
    expect(mocks.txRunBlockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rb-a", status: { notIn: ["DONE", "SKIPPED"] } },
        data: expect.objectContaining({ status: "DONE", reminderJobId: null }),
      }),
    );
    // the single throw landed on scheduleReminder, not on removeReminderJob
    expect(mocks.getReminderQueue).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[engine] reminders disabled (REDIS_URL unset) — skipping schedule for runBlock rb-node-b",
    );

    warnSpy.mockRestore();
  });
});
