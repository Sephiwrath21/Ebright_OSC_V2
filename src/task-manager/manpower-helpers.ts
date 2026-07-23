// Manpower Schedule — shared helpers for the grid's backend routes. Pure
// decision logic (unit-tested in _manpower.test.ts) is kept separate from
// the Prisma/DB-touching helpers below it.

import type { Prisma, User } from "@/generated/task-manager-client";
import { ApiHttpError } from "./lib/api-server";
import { prisma } from "./prisma";
import { buildTemplateSnapshot } from "./engine/snapshot";
import { parseLocalDate } from "./analytics/_lib";

/** Every mutating manpower-schedule route needs this same check: actor is
 *  the branch manager who owns the schedule's branch. */
export async function requireEditableSchedule(actor: User, scheduleId: string) {
  if (actor.role !== "BRANCH") {
    throw new ApiHttpError(403, "Only a branch manager can edit the manpower schedule");
  }
  const schedule = await prisma.manpowerSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule || schedule.branch !== actor.branch) {
    throw new ApiHttpError(403, "That schedule is not on your branch");
  }
  return schedule;
}

// ---------- pure logic (unit-tested) ----------

export type SlotSyncAction =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "cancel" }
  | { kind: "replace" };

/**
 * Decide what to do to a slot's linked task when its assignment changes.
 * `oldAssigneeId` is the assignee the linked run (if any) was created for —
 * NOT necessarily the slot's current assignedStaffId (which may have already
 * been updated by the caller before this is computed).
 */
export function resolveSlotSync(
  oldRunBlockId: string | null,
  oldAssigneeId: string | null,
  newAssigneeId: string | null,
): SlotSyncAction {
  if (newAssigneeId === null) {
    return oldRunBlockId ? { kind: "cancel" } : { kind: "none" };
  }
  if (!oldRunBlockId) return { kind: "create" };
  if (oldAssigneeId === newAssigneeId) return { kind: "none" };
  return { kind: "replace" };
}

/** Which real-world role a grid column expects, or null if the label doesn't
 *  match the "Manager" / "Coach N" / "Exec N" convention. Manpower Schedule
 *  is always branch-context, so an "Exec N" seat always means Branch Exec
 *  (formerly the shared "Executive" employmentType value — see the
 *  Executive-role-split migration, 20260721041500_split_executive_role). */
export function roleForColumn(roleColumn: string): "Manager" | "Coach" | "Branch Exec" | null {
  if (roleColumn === "Manager") return "Manager";
  if (/^Coach \d+$/.test(roleColumn)) return "Coach";
  if (/^Exec \d+$/.test(roleColumn)) return "Branch Exec";
  return null;
}

/** Next available label for a new seat column, e.g. existing ["Coach 1","Coach 2"] -> "Coach 3". */
export function nextColumnLabel(existing: string[], kind: "Coach" | "Exec"): string {
  const nums = existing
    .map((c) => c.match(new RegExp(`^${kind} (\\d+)$`)))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => Number(m[1]));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${kind} ${next}`;
}

const COLUMN_SORT_KIND: Record<string, number> = { Manager: 0, Coach: 1, Exec: 2 };

/** Manager first, then Coach 1..N, then Exec 1..N. */
export function compareColumns(a: string, b: string): number {
  const kindOf = (c: string) => (c === "Manager" ? "Manager" : c.split(" ")[0]);
  const numOf = (c: string) => Number(c.split(" ")[1] ?? 0);
  const ka = COLUMN_SORT_KIND[kindOf(a)] ?? 9;
  const kb = COLUMN_SORT_KIND[kindOf(b)] ?? 9;
  if (ka !== kb) return ka - kb;
  return numOf(a) - numOf(b);
}

// ---------- DB helpers ----------

const ADHOC_FLOW_ID = "flow-adhoc";

export async function loadAdhocFlow() {
  const flow = await prisma.flow.findUnique({
    where: { id: ADHOC_FLOW_ID },
    include: { blocks: { include: { items: true } } },
  });
  const block = flow?.blocks[0];
  if (!flow || !block) {
    throw new ApiHttpError(500, "Ad hoc utility flow missing — run the seed/bootstrap");
  }
  const snapshot = (await buildTemplateSnapshot(flow.id)) as unknown as Prisma.InputJsonValue;
  return { flow, block, snapshot };
}

type AdhocFlow = Awaited<ReturnType<typeof loadAdhocFlow>>;

/** Creates the ad hoc FlowRun/RunBlock for one slot assignment, tagged with
 *  scheduleSlotId so it shows the "Scheduled" badge and counts as synced. */
export async function createSlotRun(
  adhoc: AdhocFlow,
  opts: {
    slotId: string;
    roleColumn: string;
    startTime: string;
    endTime: string;
    date: string;
    assigneeId: string;
    assigneeName: string;
    actorId: string;
  },
): Promise<string> {
  const blockTitle = `${opts.roleColumn} shift (${opts.startTime}–${opts.endTime})`;
  const d = parseLocalDate(opts.date);
  const [endHour, endMinute] = opts.endTime.split(":").map(Number);
  const dueAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), endHour, endMinute);

  const run = await prisma.flowRun.create({
    data: {
      flowId: adhoc.flow.id,
      flowVersion: adhoc.flow.version,
      templateSnapshot: adhoc.snapshot,
      name: `${blockTitle} — ${opts.assigneeName}`,
      startedById: opts.actorId,
      triggerType: "MANUAL",
      status: "ACTIVE",
    },
  });
  const runBlock = await prisma.runBlock.create({
    data: {
      runId: run.id,
      blockId: adhoc.block.id,
      nodeId: adhoc.block.nodeId,
      title: blockTitle,
      assigneeId: opts.assigneeId,
      status: "ACTIVE",
      startedAt: new Date(),
      dueAt,
      scheduleSlotId: opts.slotId,
      runItems: {
        create: adhoc.block.items.map((it) => ({
          itemId: it.id,
          order: it.order,
          type: it.type,
          label: it.label,
          required: it.required,
          config: it.config as Prisma.InputJsonValue,
        })),
      },
    },
  });
  await prisma.auditLog.create({
    data: {
      runId: run.id,
      actorId: opts.actorId,
      action: "RUN_STARTED",
      detail: { manpowerSchedule: true, slotId: opts.slotId, roleColumn: opts.roleColumn },
    },
  });
  return runBlock.id;
}

/** Cancels the FlowRun behind a synced RunBlock — fetchPeriodBlocks already
 *  excludes CANCELLED runs, so this is all that's needed to "remove" a task. */
export async function cancelSlotRun(runBlockId: string, actorId: string): Promise<void> {
  const block = await prisma.runBlock.findUnique({ where: { id: runBlockId } });
  if (!block) return;
  await prisma.flowRun.update({ where: { id: block.runId }, data: { status: "CANCELLED" } });
  await prisma.auditLog.create({
    data: {
      runId: block.runId,
      runBlockId: block.id,
      actorId,
      action: "RUN_CANCELLED",
      detail: { manpowerSchedule: true },
    },
  });
}
