// Run lifecycle engine (PROJECT_GUIDE §4 — normative semantics).
// Imported by API routes via @server/* — NOT by the worker (the worker only
// needs reminders.ts). Relative imports only inside server/**.

import { Prisma } from "@/generated/task-manager-client";
import type { FlowRun, RunBlock, RunItem, TriggerType, User } from "@/generated/task-manager-client";
import { addHours, format } from "date-fns";
import { ApiHttpError } from "../lib/api-server";
import {
  isValueComplete,
  itemConfigViolation,
  parseItemValue,
} from "../lib/item-schemas";
import { prisma } from "../prisma";
import { getReminderQueue, reminderJobId } from "../lib/queues";
import type { RunItemValue, SnapshotBlock, TemplateSnapshot } from "../lib/types";
import { getUsersByIds } from "../lib/users";
import { isPastDueDay } from "../ui/types";
import { evaluateConditions } from "./conditions";
import { buildTemplateSnapshot } from "./snapshot";

// ---------- shared helpers ----------

async function getActor(actorId: string): Promise<User | null> {
  const users = await getUsersByIds([actorId]);
  return users.get(actorId) ?? null;
}

function isElevated(user: User | null): boolean {
  return user?.role === "ADMIN" || user?.role === "HOD";
}

/**
 * Assignee resolution (guide §4): fixedAssigneeId if set; else the first user
 * whose role or department matches assigneeRole (case-insensitive); else the
 * run starter.
 */
export async function resolveAssignee(
  block: Pick<SnapshotBlock, "fixedAssigneeId" | "assigneeRole">,
  starterId: string,
): Promise<string> {
  if (block.fixedAssigneeId) return block.fixedAssigneeId;
  if (block.assigneeRole) {
    const roleUpper = block.assigneeRole.toUpperCase();
    const or: Prisma.UserWhereInput[] = [
      { department: { equals: block.assigneeRole, mode: "insensitive" } },
    ];
    if (roleUpper === "ADMIN" || roleUpper === "HOD" || roleUpper === "MEMBER") {
      or.unshift({ role: roleUpper });
    }
    const user = await prisma.user.findFirst({
      where: { OR: or },
      orderBy: { createdAt: "asc" },
    });
    if (user) return user.id;
  }
  return starterId;
}

/** Nested-create payload for a RunBlock (+ its denormalized RunItems). */
function runBlockCreateData(
  block: SnapshotBlock,
  assigneeId: string,
  now: Date,
): Prisma.RunBlockCreateWithoutRunInput {
  return {
    blockId: block.id,
    nodeId: block.nodeId,
    title: block.title,
    assigneeId,
    status: "ACTIVE",
    startedAt: now,
    dueAt: block.dueInHours != null ? addHours(now, block.dueInHours) : null,
    runItems: {
      create: block.items.map((item) => ({
        itemId: item.id,
        order: item.order,
        type: item.type,
        label: item.label,
        required: item.required,
        config: item.config as Prisma.InputJsonValue,
      })),
    },
  };
}

/**
 * First-reminder timing (guide §4): fire at max(dueAt, activation) + interval
 * hours when dueAt is set, else activation + interval. The pending job id
 * (reminderJobId(runBlockId, strikeCount+1)) is stored on RunBlock.reminderJobId.
 */
async function scheduleReminder(
  runBlock: Pick<RunBlock, "id" | "startedAt" | "dueAt" | "strikeCount">,
  reminderIntervalHours: number,
): Promise<void> {
  try {
    const activation = runBlock.startedAt ?? new Date();
    const base =
      runBlock.dueAt && runBlock.dueAt.getTime() > activation.getTime()
        ? runBlock.dueAt
        : activation;
    const fireAt = addHours(base, reminderIntervalHours);
    const delay = Math.max(0, fireAt.getTime() - Date.now());
    const jobId = reminderJobId(runBlock.id, runBlock.strikeCount + 1);
    await getReminderQueue().add("reminder", { runBlockId: runBlock.id }, { jobId, delay });
    await prisma.runBlock.update({
      where: { id: runBlock.id },
      data: { reminderJobId: jobId },
    });
  } catch (err) {
    // A broken queue must not corrupt the run itself — log and continue. REDIS_URL
    // is permanently unset in this deployment, so that specific failure is a known,
    // by-design state — warn calmly instead of an error-with-stack per block
    // activation; genuine mid-operation queue failures stay loud.
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("REDIS_URL is not set")) {
      console.warn(
        `[engine] reminders disabled (REDIS_URL unset) — skipping schedule for runBlock ${runBlock.id}`,
      );
    } else {
      console.error(`[engine] failed to schedule reminder for runBlock ${runBlock.id}`, err);
    }
  }
}

async function removeReminderJob(jobId: string | null): Promise<void> {
  if (!jobId) return;
  try {
    await getReminderQueue().remove(jobId);
  } catch (err) {
    console.warn(`[engine] failed to remove reminder job ${jobId}`, err);
  }
}

function snapshotOf(run: FlowRun): TemplateSnapshot {
  return run.templateSnapshot as unknown as TemplateSnapshot;
}

function findSnapshotBlock(
  snapshot: TemplateSnapshot,
  runBlock: Pick<RunBlock, "blockId" | "nodeId">,
): SnapshotBlock | undefined {
  return (
    snapshot.blocks?.find((b) => b.id === runBlock.blockId) ??
    snapshot.blocks?.find((b) => b.nodeId === runBlock.nodeId)
  );
}

/** itemId -> value map across the whole run, for condition evaluation. */
function collectValues(items: Pick<RunItem, "itemId" | "value">[]): Map<string, RunItemValue> {
  const values = new Map<string, RunItemValue>();
  for (const item of items) {
    const v = item.value;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      values.set(item.itemId, v as unknown as RunItemValue);
    }
  }
  return values;
}

/**
 * Resolve the next BLOCK nodeIds after a block completes: evaluate its
 * outgoingEdges; edges targeting decision nodes route THROUGH the decision's
 * conditions recursively (decisions never become RunBlocks). A visited set
 * guards against decision cycles.
 */
export function resolveNextBlockNodeIds(
  snapshot: TemplateSnapshot,
  fromBlock: SnapshotBlock,
  values: Map<string, RunItemValue>,
): string[] {
  const blockByNode = new Map(snapshot.blocks.map((b) => [b.nodeId, b]));
  const decisionByNode = new Map(snapshot.decisions.map((d) => [d.nodeId, d]));
  const result = new Set<string>();
  const visitedDecisions = new Set<string>();

  const route = (targets: string[]) => {
    for (const target of targets) {
      if (blockByNode.has(target)) {
        result.add(target);
      } else if (decisionByNode.has(target)) {
        if (visitedDecisions.has(target)) {
          console.warn(`[engine] decision cycle detected at node ${target} — branch stopped`);
          continue;
        }
        visitedDecisions.add(target);
        route(evaluateConditions(decisionByNode.get(target)!.conditions, values));
      } else {
        console.warn(`[engine] edge targets unknown node ${target} — skipped`);
      }
    }
  };

  route(evaluateConditions(fromBlock.outgoingEdges, values));
  return [...result];
}

// ---------- start run ----------

export interface StartRunInput {
  flowId: string;
  startedById: string;
  triggerType: TriggerType;
  name?: string;
  formPayload?: Record<string, unknown>;
}

export async function startRun(
  input: StartRunInput,
): Promise<FlowRun & { runBlocks: RunBlock[] }> {
  const { flowId, startedById, triggerType, name, formPayload } = input;

  const flow = await prisma.flow.findUnique({ where: { id: flowId } });
  if (!flow) throw new ApiHttpError(404, "Flow not found");
  if (!flow.isPublished) throw new ApiHttpError(400, "Flow is not published");

  const snapshot = await buildTemplateSnapshot(flowId);

  // Entry nodes = block nodes with no incoming edge (union of canvas edges and
  // conditional-edge targets, defensively).
  const incoming = new Set<string>();
  for (const edge of snapshot.edges) incoming.add(edge.target);
  for (const block of snapshot.blocks)
    for (const ce of block.outgoingEdges) incoming.add(ce.targetNodeId);
  for (const decision of snapshot.decisions)
    for (const ce of decision.conditions) incoming.add(ce.targetNodeId);
  const entryBlocks = snapshot.blocks.filter((b) => !incoming.has(b.nodeId));
  if (entryBlocks.length === 0) {
    throw new ApiHttpError(400, "Flow has no entry step (every block has an incoming edge)");
  }

  const now = new Date();
  const runName = name?.trim() || `${flow.name} — ${format(now, "d MMM HH:mm")}`;

  const assignees = new Map<string, string>();
  for (const block of entryBlocks) {
    assignees.set(block.nodeId, await resolveAssignee(block, startedById));
  }

  // Nested create = one atomic transaction: FlowRun + entry RunBlocks + RunItems.
  const run = await prisma.flowRun.create({
    data: {
      flowId,
      flowVersion: snapshot.version,
      templateSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      name: runName,
      startedById,
      triggerType,
      status: "ACTIVE",
      startedAt: now,
      runBlocks: {
        create: entryBlocks.map((block) =>
          runBlockCreateData(block, assignees.get(block.nodeId)!, now),
        ),
      },
    },
    include: { runBlocks: true },
  });

  // Schedule first reminders (outside the transaction — queue failures must not
  // roll back the run).
  for (const runBlock of run.runBlocks) {
    const snapBlock = findSnapshotBlock(snapshot, runBlock);
    await scheduleReminder(runBlock, snapBlock?.reminderInterval ?? 24);
  }

  await prisma.auditLog.create({
    data: {
      runId: run.id,
      actorId: startedById,
      action: "RUN_STARTED",
      detail: {
        triggerType,
        flowId,
        flowVersion: snapshot.version,
        ...(formPayload ? { formPayload } : {}),
      } as Prisma.InputJsonValue,
    },
  });

  return run;
}

// ---------- submit / clear an item value ----------

export interface SubmitItemInput {
  runId: string;
  runBlockId: string;
  runItemId: string;
  value: unknown; // RunItemValue | null (null = clear)
  actorId: string;
}

export async function submitItem(input: SubmitItemInput): Promise<RunItem> {
  const { runId, runBlockId, runItemId, value, actorId } = input;

  const runItem = await prisma.runItem.findUnique({
    where: { id: runItemId },
    include: { runBlock: { include: { run: true } } },
  });
  if (!runItem || runItem.runBlockId !== runBlockId || runItem.runBlock.runId !== runId) {
    throw new ApiHttpError(404, "Item not found");
  }
  const runBlock = runItem.runBlock;
  const run = runBlock.run;

  if (run.status !== "ACTIVE") throw new ApiHttpError(400, "Run is not active");
  if (runBlock.status === "DONE" || runBlock.status === "SKIPPED") {
    throw new ApiHttpError(400, "This step is already closed");
  }

  // Authz: block assignee, ADMIN/HOD, or — for SUB_ASSIGNEE_TASK — the item's
  // current sub-assignee.
  const actor = await getActor(actorId);
  const existingValue = runItem.value as { assigneeId?: unknown } | null;
  const isSubAssignee =
    runItem.type === "SUB_ASSIGNEE_TASK" &&
    !!existingValue &&
    typeof existingValue === "object" &&
    existingValue.assigneeId === actorId;
  if (runBlock.assigneeId !== actorId && !isElevated(actor) && !isSubAssignee) {
    throw new ApiHttpError(403, "You are not allowed to update this item");
  }

  const now = new Date();

  // ---- clear ----
  if (value === null) {
    const updated = await prisma.runItem.update({
      where: { id: runItemId },
      data: { value: Prisma.DbNull, completedAt: null, completedBy: null },
    });
    await prisma.auditLog.create({
      data: {
        runId,
        runBlockId,
        actorId,
        action: "ITEM_CLEARED",
        detail: { runItemId, label: runItem.label },
      },
    });
    return updated;
  }

  // ---- set ----
  const parsed = parseItemValue(runItem.type, value) as RunItemValue; // ZodError -> 400 via handleApi

  // Enforce the item's config constraints server-side (guide §11) — the run UI
  // checks these too, but the API must not accept e.g. an APPROVAL without its
  // required note or a DROPDOWN value outside the configured options.
  const violation = itemConfigViolation(runItem.type, runItem.config, parsed);
  if (violation) {
    throw new ApiHttpError(400, `${runItem.label || "This item"}: ${violation}`);
  }

  const complete = isValueComplete(runItem.type, parsed);

  const updated = await prisma.runItem.update({
    where: { id: runItemId },
    data: {
      value: parsed as unknown as Prisma.InputJsonValue,
      completedAt: complete ? now : null,
      completedBy: complete ? actorId : null,
    },
  });

  // DUE_DATE items with config.setsBlockDue update the block's dueAt AND
  // reschedule the pending reminder around the new due date.
  const config = runItem.config as { setsBlockDue?: unknown } | null;
  if (
    parsed.type === "DUE_DATE" &&
    config &&
    typeof config === "object" &&
    config.setsBlockDue === true
  ) {
    const newDueAt = new Date(parsed.date);
    if (!Number.isNaN(newDueAt.getTime())) {
      const stillPending =
        runBlock.status === "PENDING" ||
        runBlock.status === "ACTIVE" ||
        runBlock.status === "OVERDUE";
      await prisma.runBlock.update({
        where: { id: runBlock.id },
        data: { dueAt: newDueAt },
      });
      if (stillPending) {
        await removeReminderJob(runBlock.reminderJobId);
        const snapshot = snapshotOf(run);
        const snapBlock = findSnapshotBlock(snapshot, runBlock);
        await scheduleReminder(
          { id: runBlock.id, startedAt: runBlock.startedAt, dueAt: newDueAt, strikeCount: runBlock.strikeCount },
          snapBlock?.reminderInterval ?? 24,
        );
      }
    }
  }

  await prisma.auditLog.create({
    data: {
      runId,
      runBlockId,
      actorId,
      action: "ITEM_COMPLETED",
      detail: {
        runItemId,
        label: runItem.label,
        complete,
        value: parsed,
      } as Prisma.InputJsonValue,
    },
  });

  return updated;
}

// ---------- complete a block & advance the run ----------

export interface CompleteBlockInput {
  runId: string;
  runBlockId: string;
  actorId: string;
}

export interface CompleteBlockResult {
  runBlockId: string;
  runCompleted: boolean;
  activatedNodeIds: string[];
}

export async function completeBlock(input: CompleteBlockInput): Promise<CompleteBlockResult> {
  const { runId, runBlockId, actorId } = input;

  const runBlock = await prisma.runBlock.findUnique({
    where: { id: runBlockId },
    include: { run: true, runItems: true },
  });
  if (!runBlock || runBlock.runId !== runId) throw new ApiHttpError(404, "Step not found");
  const run = runBlock.run;

  if (run.status !== "ACTIVE") throw new ApiHttpError(400, "Run is not active");
  if (runBlock.status === "DONE") throw new ApiHttpError(400, "This step is already completed");
  if (runBlock.status === "SKIPPED") throw new ApiHttpError(400, "This step was skipped");
  // Past-day lock (2026-08-05): a Daily task's day has passed once its
  // dueAt is strictly before today — completion closes for good at that
  // point (server-authoritative; bits.tsx mirrors this for the disabled
  // UI, but this is the check that actually can't be bypassed).
  if (runBlock.cadence === "DAILY" && isPastDueDay(runBlock.dueAt)) {
    throw new ApiHttpError(400, "This task's day has passed and can no longer be marked complete");
  }

  const actor = await getActor(actorId);
  if (runBlock.assigneeId !== actorId && !isElevated(actor)) {
    throw new ApiHttpError(403, "Only the assignee (or an admin) can complete this step");
  }

  // All required items must be complete.
  const missing = runBlock.runItems
    .filter((item) => item.required && !isValueComplete(item.type, item.value))
    .sort((a, b) => a.order - b.order);
  if (missing.length > 0) {
    throw new ApiHttpError(
      400,
      `Missing required items: ${missing.map((m) => m.label).join(", ")}`,
    );
  }

  const snapshot = snapshotOf(run);
  const snapBlock = findSnapshotBlock(snapshot, runBlock);
  if (!snapBlock) {
    // Should never happen — the RunBlock was created from this snapshot.
    throw new ApiHttpError(500, "Step is missing from the run's template snapshot");
  }

  // Values across the WHOLE run — decision conditions may reference items from
  // any completed block.
  const allItems = await prisma.runItem.findMany({
    where: { runBlock: { runId } },
    select: { itemId: true, value: true },
  });
  const values = collectValues(allItems);
  const nextNodeIds = resolveNextBlockNodeIds(snapshot, snapBlock, values);

  const blockByNode = new Map(snapshot.blocks.map((b) => [b.nodeId, b]));
  const now = new Date();

  // Resolve assignees before the transaction (user lookups stay outside it).
  const nextAssignees = new Map<string, string>();
  for (const nodeId of nextNodeIds) {
    const next = blockByNode.get(nodeId);
    if (next) nextAssignees.set(nodeId, await resolveAssignee(next, run.startedById));
  }

  const advance = () =>
    prisma.$transaction(async (tx) => {
      // Serialize concurrent advances of the SAME run. Without this, two users
      // completing the last two parallel blocks at READ COMMITTED each see the
      // other's block as still open (write skew) and neither marks the run
      // COMPLETED — the run would be stuck ACTIVE forever.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${runId}))`;

      // Guarded transition: only ONE request may move this block to DONE. A
      // concurrent double-complete must abort here instead of re-running the
      // advance (which would fire WORKFLOW_CHAIN triggers twice and overwrite
      // completedAt).
      const marked = await tx.runBlock.updateMany({
        where: { id: runBlockId, status: { notIn: ["DONE", "SKIPPED"] } },
        data: { status: "DONE", completedAt: now, reminderJobId: null },
      });
      if (marked.count === 0) {
        throw new ApiHttpError(400, "This step is already completed");
      }

      // Skip nodes that already have a RunBlock in this run; @@unique([runId,nodeId])
      // backstops races (see the P2002 retry below).
      const existing = await tx.runBlock.findMany({
        where: { runId, nodeId: { in: nextNodeIds } },
        select: { nodeId: true },
      });
      const existingNodeIds = new Set(existing.map((e) => e.nodeId));

      const created: RunBlock[] = [];
      for (const nodeId of nextNodeIds) {
        if (existingNodeIds.has(nodeId)) continue;
        const next = blockByNode.get(nodeId);
        if (!next) continue;
        created.push(
          await tx.runBlock.create({
            // `run: { connect }` (not scalar runId): runBlockCreateData returns
            // the CHECKED create shape, and since the recurrence self-relation
            // was added (2026-07-25) mixing it with an unchecked scalar FK no
            // longer satisfies either arm of Prisma's create-input union.
            data: {
              run: { connect: { id: runId } },
              ...runBlockCreateData(next, nextAssignees.get(nodeId) ?? run.startedById, now),
            },
          }),
        );
      }

      const remaining = await tx.runBlock.count({
        where: { runId, status: { in: ["ACTIVE", "PENDING", "OVERDUE"] } },
      });
      let completed = false;
      if (remaining === 0) {
        // Guarded: only the request that actually flips ACTIVE -> COMPLETED owns
        // run completion, so RUN_COMPLETED audits and WORKFLOW_CHAIN triggers
        // fire exactly once.
        const res = await tx.flowRun.updateMany({
          where: { id: runId, status: "ACTIVE" },
          data: { status: "COMPLETED", completedAt: now },
        });
        completed = res.count > 0;
      }
      return { createdBlocks: created, runCompleted: completed };
    });

  // Retry once on the unique-constraint backstop (P2002: a concurrent fan-in
  // created the same next block first) and on serialization failures (P2034) —
  // the re-run's `existing` check then sees the winner's row and skips it, so a
  // race never turns into a failed completion.
  let txResult: Awaited<ReturnType<typeof advance>>;
  for (let attempt = 0; ; attempt++) {
    try {
      txResult = await advance();
      break;
    } catch (err) {
      if (
        attempt < 2 &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        (err.code === "P2002" || err.code === "P2034")
      ) {
        continue;
      }
      throw err;
    }
  }
  const { createdBlocks, runCompleted } = txResult;

  // ---- after the transaction ----

  // Cancel this block's pending reminder job (real removal, not ignoring).
  await removeReminderJob(runBlock.reminderJobId);

  // Schedule reminders for the newly activated blocks.
  for (const created of createdBlocks) {
    const next = blockByNode.get(created.nodeId);
    await scheduleReminder(created, next?.reminderInterval ?? 24);
  }

  // Audit trail.
  await prisma.auditLog.createMany({
    data: [
      {
        runId,
        runBlockId,
        actorId,
        action: "BLOCK_STATUS_CHANGED",
        detail: { status: "DONE", title: runBlock.title },
      },
      ...createdBlocks.map((created) => ({
        runId,
        runBlockId: created.id,
        actorId: "system",
        action: "BLOCK_STATUS_CHANGED",
        detail: { status: "ACTIVE", title: created.title, assigneeId: created.assigneeId },
      })),
      ...(runCompleted
        ? [{ runId, actorId, action: "RUN_COMPLETED", detail: { flowId: run.flowId } }]
        : []),
    ],
  });

  // WORKFLOW_CHAIN: when this run completes, start every flow whose
  // WORKFLOW_CHAIN trigger names this flow as its source. Failures are logged,
  // never thrown — a broken downstream flow must not fail this completion.
  if (runCompleted) {
    try {
      const triggers = await prisma.flowTrigger.findMany({
        where: {
          type: "WORKFLOW_CHAIN",
          config: { path: ["sourceFlowId"], equals: run.flowId },
        },
      });
      for (const trigger of triggers) {
        try {
          await startRun({
            flowId: trigger.flowId,
            startedById: actorId,
            triggerType: "WORKFLOW_CHAIN",
          });
        } catch (err) {
          console.error(
            `[engine] WORKFLOW_CHAIN trigger ${trigger.id} (flow ${trigger.flowId}) failed to start`,
            err,
          );
        }
      }
    } catch (err) {
      console.error(`[engine] WORKFLOW_CHAIN lookup failed for flow ${run.flowId}`, err);
    }
  }

  return {
    runBlockId,
    runCompleted,
    activatedNodeIds: createdBlocks.map((b) => b.nodeId),
  };
}

// ---------- mark a single block N/A ----------

export interface SkipBlockInput {
  runId: string;
  runBlockId: string;
  actorId: string;
}

export interface SkipBlockResult {
  runBlockId: string;
  runCompleted: boolean;
}

/**
 * Mark ONE block N/A (status SKIPPED) — "this isn't happening, for reasons
 * outside the assignee's control," not a completion. Deliberately does NOT
 * evaluate decision conditions or create next-node blocks the way
 * completeBlock does: there's no captured field data to base a branch on,
 * so this only ever terminally closes the one block (mirrors cancelRun's
 * bulk skip — no advancement there either). If this was the run's last open
 * block, the run completes and WORKFLOW_CHAIN triggers fire exactly as they
 * would for a normal completion, since run completion itself doesn't care
 * whether the last block resolved via DONE or SKIPPED.
 */
export async function skipBlock(input: SkipBlockInput): Promise<SkipBlockResult> {
  const { runId, runBlockId, actorId } = input;

  const runBlock = await prisma.runBlock.findUnique({
    where: { id: runBlockId },
    include: { run: true },
  });
  if (!runBlock || runBlock.runId !== runId) throw new ApiHttpError(404, "Step not found");
  const run = runBlock.run;

  if (run.status !== "ACTIVE") throw new ApiHttpError(400, "Run is not active");
  if (runBlock.status === "DONE") throw new ApiHttpError(400, "This step is already completed");
  if (runBlock.status === "SKIPPED") throw new ApiHttpError(400, "This step is already marked N/A");

  const actor = await getActor(actorId);
  if (runBlock.assigneeId !== actorId && !isElevated(actor)) {
    throw new ApiHttpError(403, "Only the assignee (or an admin) can mark this step N/A");
  }

  const now = new Date();

  const { runCompleted } = await prisma.$transaction(async (tx) => {
    // Same per-run serialization as completeBlock — a concurrent
    // complete/skip of the last two open blocks must not both see "1
    // remaining" and neither complete the run.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${runId}))`;

    const marked = await tx.runBlock.updateMany({
      where: { id: runBlockId, status: { notIn: ["DONE", "SKIPPED"] } },
      data: { status: "SKIPPED", completedAt: now, reminderJobId: null },
    });
    if (marked.count === 0) {
      throw new ApiHttpError(400, "This step was already resolved");
    }

    const remaining = await tx.runBlock.count({
      where: { runId, status: { in: ["ACTIVE", "PENDING", "OVERDUE"] } },
    });
    let completed = false;
    if (remaining === 0) {
      const res = await tx.flowRun.updateMany({
        where: { id: runId, status: "ACTIVE" },
        data: { status: "COMPLETED", completedAt: now },
      });
      completed = res.count > 0;
    }
    return { runCompleted: completed };
  });

  // ---- after the transaction ----

  await removeReminderJob(runBlock.reminderJobId);

  await prisma.auditLog.createMany({
    data: [
      {
        runId,
        runBlockId,
        actorId,
        action: "BLOCK_STATUS_CHANGED",
        detail: { status: "SKIPPED", title: runBlock.title },
      },
      ...(runCompleted
        ? [{ runId, actorId, action: "RUN_COMPLETED", detail: { flowId: run.flowId } }]
        : []),
    ],
  });

  if (runCompleted) {
    try {
      const triggers = await prisma.flowTrigger.findMany({
        where: {
          type: "WORKFLOW_CHAIN",
          config: { path: ["sourceFlowId"], equals: run.flowId },
        },
      });
      for (const trigger of triggers) {
        try {
          await startRun({
            flowId: trigger.flowId,
            startedById: actorId,
            triggerType: "WORKFLOW_CHAIN",
          });
        } catch (err) {
          console.error(
            `[engine] WORKFLOW_CHAIN trigger ${trigger.id} (flow ${trigger.flowId}) failed to start`,
            err,
          );
        }
      }
    } catch (err) {
      console.error(`[engine] WORKFLOW_CHAIN lookup failed for flow ${run.flowId}`, err);
    }
  }

  return { runBlockId, runCompleted };
}

// ---------- reopen a single block ----------

export interface ReopenBlockInput {
  runId: string;
  runBlockId: string;
  actorId: string;
}

export interface ReopenBlockResult {
  runBlockId: string;
  runReopened: boolean;
}

/**
 * Reopen a DONE or SKIPPED block back to ACTIVE — the reverse of
 * completeBlock/skipBlock, for the status dropdown's "Pending" option.
 * Deliberately minimal, symmetric with skipBlock's own scope: no reminder
 * job is rescheduled (reopening undoes a status, it doesn't resume the
 * original reminder cadence — a genuinely new due date/reminder is a
 * separate concern this doesn't attempt), and any blocks/runs a completion
 * already created downstream stay created (this only ever reaches back to
 * the ONE block being reopened). If reopening this block leaves its run
 * incorrectly sitting at COMPLETED with an open block inside it, the run is
 * reverted to ACTIVE too — same trigger, opposite direction of skipBlock/
 * completeBlock's own "last block completes the run" check.
 */
export async function reopenBlock(input: ReopenBlockInput): Promise<ReopenBlockResult> {
  const { runId, runBlockId, actorId } = input;

  const runBlock = await prisma.runBlock.findUnique({
    where: { id: runBlockId },
    include: { run: true },
  });
  if (!runBlock || runBlock.runId !== runId) throw new ApiHttpError(404, "Step not found");
  const run = runBlock.run;

  if (runBlock.status !== "DONE" && runBlock.status !== "SKIPPED") {
    throw new ApiHttpError(400, "This step is already open");
  }

  const actor = await getActor(actorId);
  if (runBlock.assigneeId !== actorId && !isElevated(actor)) {
    throw new ApiHttpError(403, "Only the assignee (or an admin) can reopen this step");
  }

  const runReopened = run.status === "COMPLETED";

  await prisma.$transaction([
    prisma.runBlock.update({
      where: { id: runBlockId },
      data: { status: "ACTIVE", completedAt: null },
    }),
    ...(runReopened
      ? [prisma.flowRun.update({ where: { id: runId }, data: { status: "ACTIVE", completedAt: null } })]
      : []),
  ]);

  await prisma.auditLog.create({
    data: {
      runId,
      runBlockId,
      actorId,
      action: "BLOCK_STATUS_CHANGED",
      detail: { status: "ACTIVE", title: runBlock.title, reopened: true },
    },
  });

  return { runBlockId, runReopened };
}

// ---------- cancel run ----------

export interface CancelRunInput {
  runId: string;
  actorId: string;
}

export async function cancelRun(input: CancelRunInput): Promise<FlowRun> {
  const { runId, actorId } = input;

  const run = await prisma.flowRun.findUnique({
    where: { id: runId },
    include: { runBlocks: { select: { id: true, status: true, reminderJobId: true } } },
  });
  if (!run) throw new ApiHttpError(404, "Run not found");
  if (run.status !== "ACTIVE") throw new ApiHttpError(400, "Run is not active");

  const actor = await getActor(actorId);
  if (run.startedById !== actorId && !isElevated(actor)) {
    throw new ApiHttpError(403, "Only the person who started the run (or an admin) can cancel it");
  }

  const pendingJobIds = run.runBlocks
    .filter((b) => b.status !== "DONE" && b.status !== "SKIPPED" && b.reminderJobId)
    .map((b) => b.reminderJobId as string);

  const [updated] = await prisma.$transaction([
    prisma.flowRun.update({ where: { id: runId }, data: { status: "CANCELLED" } }),
    prisma.runBlock.updateMany({
      where: { runId, status: { in: ["PENDING", "ACTIVE", "OVERDUE", "ESCALATED"] } },
      data: { status: "SKIPPED", reminderJobId: null },
    }),
  ]);

  for (const jobId of pendingJobIds) await removeReminderJob(jobId);

  await prisma.auditLog.create({
    data: {
      runId,
      actorId,
      action: "RUN_CANCELLED",
      detail: { skippedJobIds: pendingJobIds },
    },
  });

  return updated;
}
