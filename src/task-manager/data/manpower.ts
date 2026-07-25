// Manpower Schedule (branch staffing grid): read/create the day grid, add/
// rename/delete time rows, add/delete seat columns, assign cells, publish.
// Ports of the /api/internal/manpower-schedule/* routes. Reads are open to
// anyone on the branch (canEdit tells the UI); writes are branch-manager-only
// via requireEditableSchedule.
import { z } from "zod";
import type { FlowManpowerScheduleResponse } from "../ui/types";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { parseLocalDate } from "../analytics/_lib";
import {
  cancelSlotRun,
  compareColumns,
  createSlotRun,
  loadAdhocFlow,
  nextColumnLabel,
  requireEditableSchedule,
  resolveSlotSync,
  roleForColumn,
} from "../manpower-helpers";
import { native, requireUserByEmail } from "./core";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function assertOrder(startTime: string, endTime: string) {
  if (startTime >= endTime) {
    throw new ApiHttpError(400, "Start time must be before end time");
  }
}

async function loadGrid(branch: string, date: string) {
  const schedule = await prisma.manpowerSchedule.findUnique({
    where: { branch_date: { branch, date } },
    include: { slots: true },
  });
  if (!schedule) return null;

  const staffIds = [
    ...new Set(
      schedule.slots.map((s) => s.assignedStaffId).filter((id): id is string => id !== null),
    ),
  ];
  const staff = staffIds.length
    ? await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(staff.map((u) => [u.id, u.name]));

  return {
    id: schedule.id,
    branch: schedule.branch,
    date: schedule.date,
    status: schedule.status,
    cells: [...schedule.slots]
      .sort((a, b) => {
        const t = a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime);
        return t !== 0 ? t : compareColumns(a.roleColumn, b.roleColumn);
      })
      .map((s) => ({
        slotId: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        roleColumn: s.roleColumn,
        assignedStaffId: s.assignedStaffId,
        assignedStaffName: s.assignedStaffId ? (nameById.get(s.assignedStaffId) ?? null) : null,
        synced: s.runBlockId !== null,
      })),
  };
}

export function getManpowerSchedule(
  email: string,
  date: string,
): Promise<FlowManpowerScheduleResponse> {
  return native(async () => {
    const parsedDate = z.string().regex(DATE_RE).parse(date);
    const actor = await requireUserByEmail(email);
    if (!actor.branch) {
      return { schedule: null, canEdit: false } as FlowManpowerScheduleResponse;
    }
    return {
      schedule: await loadGrid(actor.branch, parsedDate),
      canEdit: actor.role === "BRANCH",
    } as FlowManpowerScheduleResponse;
  }, "getManpowerSchedule");
}

export function createManpowerSchedule(
  email: string,
  date: string,
): Promise<FlowManpowerScheduleResponse> {
  return native(async () => {
    const parsedDate = z.string().regex(DATE_RE).parse(date);
    const actor = await requireUserByEmail(email);
    if (actor.role !== "BRANCH" || !actor.branch) {
      throw new ApiHttpError(403, "Only a branch manager can create a schedule");
    }
    const existing = await prisma.manpowerSchedule.findUnique({
      where: { branch_date: { branch: actor.branch, date: parsedDate } },
    });
    if (!existing) {
      await prisma.manpowerSchedule.create({
        data: {
          branch: actor.branch,
          date: parsedDate,
          createdById: actor.id,
          slots: { create: [{ startTime: "09:00", endTime: "10:00", roleColumn: "Manager" }] },
        },
      });
    }
    return {
      schedule: await loadGrid(actor.branch, parsedDate),
      canEdit: true,
    } as FlowManpowerScheduleResponse;
  }, "createManpowerSchedule");
}

export function addScheduleRow(
  email: string,
  scheduleId: string,
  startTime: string,
  endTime: string,
): Promise<{ ok: true }> {
  return native(async () => {
    const body = z
      .object({
        scheduleId: z.string().min(1),
        startTime: z.string().regex(TIME_RE),
        endTime: z.string().regex(TIME_RE),
      })
      .parse({ scheduleId, startTime, endTime });
    assertOrder(body.startTime, body.endTime);
    const actor = await requireUserByEmail(email);
    await requireEditableSchedule(actor, body.scheduleId);

    const existing = await prisma.scheduleSlot.findMany({
      where: { scheduleId: body.scheduleId },
      distinct: ["roleColumn"],
      select: { roleColumn: true },
    });
    if (existing.length === 0) {
      throw new ApiHttpError(400, "Add at least one seat column before adding a row");
    }
    await prisma.scheduleSlot.createMany({
      data: existing.map((c) => ({
        scheduleId: body.scheduleId,
        startTime: body.startTime,
        endTime: body.endTime,
        roleColumn: c.roleColumn,
      })),
    });
    return { ok: true as const };
  }, "addScheduleRow");
}

export function renameScheduleRow(
  email: string,
  scheduleId: string,
  oldStartTime: string,
  oldEndTime: string,
  newStartTime: string,
  newEndTime: string,
): Promise<{ ok: true }> {
  return native(async () => {
    const body = z
      .object({
        scheduleId: z.string().min(1),
        oldStartTime: z.string().regex(TIME_RE),
        oldEndTime: z.string().regex(TIME_RE),
        newStartTime: z.string().regex(TIME_RE),
        newEndTime: z.string().regex(TIME_RE),
      })
      .parse({ scheduleId, oldStartTime, oldEndTime, newStartTime, newEndTime });
    assertOrder(body.newStartTime, body.newEndTime);
    const actor = await requireUserByEmail(email);
    const schedule = await requireEditableSchedule(actor, body.scheduleId);

    const slots = await prisma.scheduleSlot.findMany({
      where: { scheduleId: body.scheduleId, startTime: body.oldStartTime, endTime: body.oldEndTime },
    });
    if (slots.length === 0) throw new ApiHttpError(404, "Row not found");

    for (const slot of slots) {
      await prisma.scheduleSlot.update({
        where: { id: slot.id },
        data: { startTime: body.newStartTime, endTime: body.newEndTime },
      });
      // Update the linked task in place — same slot, same assignee, new time.
      if (slot.runBlockId) {
        const blockTitle = `${slot.roleColumn} shift (${body.newStartTime}–${body.newEndTime})`;
        const d = parseLocalDate(schedule.date);
        const [endHour, endMinute] = body.newEndTime.split(":").map(Number);
        const dueAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), endHour, endMinute);
        const runBlock = await prisma.runBlock.update({
          where: { id: slot.runBlockId },
          data: { title: blockTitle, dueAt },
        });
        const assignee = await prisma.user.findUnique({ where: { id: runBlock.assigneeId } });
        await prisma.flowRun.update({
          where: { id: runBlock.runId },
          data: { name: `${blockTitle} — ${assignee?.name ?? "Staff"}` },
        });
      }
    }
    return { ok: true as const };
  }, "renameScheduleRow");
}

export function deleteScheduleRow(
  email: string,
  scheduleId: string,
  startTime: string,
  endTime: string,
): Promise<{ ok: true }> {
  return native(async () => {
    const body = z
      .object({
        scheduleId: z.string().min(1),
        startTime: z.string().regex(TIME_RE),
        endTime: z.string().regex(TIME_RE),
      })
      .parse({ scheduleId, startTime, endTime });
    const actor = await requireUserByEmail(email);
    await requireEditableSchedule(actor, body.scheduleId);

    const slots = await prisma.scheduleSlot.findMany({
      where: { scheduleId: body.scheduleId, startTime: body.startTime, endTime: body.endTime },
    });
    for (const slot of slots) {
      if (slot.runBlockId) await cancelSlotRun(slot.runBlockId, actor.id);
    }
    await prisma.scheduleSlot.deleteMany({
      where: { scheduleId: body.scheduleId, startTime: body.startTime, endTime: body.endTime },
    });
    return { ok: true as const };
  }, "deleteScheduleRow");
}

export function addScheduleColumn(
  email: string,
  scheduleId: string,
  kind: "Coach" | "Exec",
): Promise<{ roleColumn: string }> {
  return native(async () => {
    const body = z
      .object({ scheduleId: z.string().min(1), kind: z.enum(["Coach", "Exec"]) })
      .parse({ scheduleId, kind });
    const actor = await requireUserByEmail(email);
    await requireEditableSchedule(actor, body.scheduleId);

    const rows = await prisma.scheduleSlot.findMany({
      where: { scheduleId: body.scheduleId },
      distinct: ["startTime", "endTime"],
      select: { startTime: true, endTime: true },
    });
    if (rows.length === 0) {
      throw new ApiHttpError(400, "Add at least one time row before adding a seat");
    }
    const existingColumns = (
      await prisma.scheduleSlot.findMany({
        where: { scheduleId: body.scheduleId },
        distinct: ["roleColumn"],
        select: { roleColumn: true },
      })
    ).map((c) => c.roleColumn);
    const roleColumn = nextColumnLabel(existingColumns, body.kind);

    await prisma.scheduleSlot.createMany({
      data: rows.map((r) => ({
        scheduleId: body.scheduleId,
        startTime: r.startTime,
        endTime: r.endTime,
        roleColumn,
      })),
    });
    return { roleColumn };
  }, "addScheduleColumn");
}

export function deleteScheduleColumn(
  email: string,
  scheduleId: string,
  roleColumn: string,
): Promise<{ ok: true }> {
  return native(async () => {
    const body = z
      .object({ scheduleId: z.string().min(1), roleColumn: z.string().min(1) })
      .parse({ scheduleId, roleColumn });
    if (body.roleColumn === "Manager") {
      throw new ApiHttpError(400, "The Manager seat can't be removed");
    }
    const actor = await requireUserByEmail(email);
    await requireEditableSchedule(actor, body.scheduleId);

    const columnCount = (
      await prisma.scheduleSlot.findMany({
        where: { scheduleId: body.scheduleId },
        distinct: ["roleColumn"],
        select: { roleColumn: true },
      })
    ).length;
    if (columnCount <= 1) {
      throw new ApiHttpError(400, "The schedule needs at least one seat column");
    }

    const slots = await prisma.scheduleSlot.findMany({
      where: { scheduleId: body.scheduleId, roleColumn: body.roleColumn },
    });
    for (const slot of slots) {
      if (slot.runBlockId) await cancelSlotRun(slot.runBlockId, actor.id);
    }
    await prisma.scheduleSlot.deleteMany({
      where: { scheduleId: body.scheduleId, roleColumn: body.roleColumn },
    });
    return { ok: true as const };
  }, "deleteScheduleColumn");
}

export function assignScheduleCell(
  email: string,
  slotId: string,
  assignedStaffId: string | null,
): Promise<{
  slotId: string;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  synced: boolean;
}> {
  return native(async () => {
    const body = z
      .object({ slotId: z.string().min(1), assignedStaffId: z.string().min(1).nullable() })
      .parse({ slotId, assignedStaffId });
    const actor = await requireUserByEmail(email);

    const slot = await prisma.scheduleSlot.findUnique({ where: { id: body.slotId } });
    if (!slot) throw new ApiHttpError(404, "Slot not found");
    const schedule = await requireEditableSchedule(actor, slot.scheduleId);

    let assignee = null as Awaited<ReturnType<typeof prisma.user.findUnique>>;
    if (body.assignedStaffId) {
      assignee = await prisma.user.findUnique({ where: { id: body.assignedStaffId } });
      if (!assignee || assignee.branch !== actor.branch) {
        throw new ApiHttpError(400, "Pick a staff member from your branch");
      }
      const expectedRole = roleForColumn(slot.roleColumn);
      if (expectedRole && assignee.employmentType !== expectedRole) {
        throw new ApiHttpError(400, `${slot.roleColumn} needs a ${expectedRole}`);
      }
    }

    const action = resolveSlotSync(slot.runBlockId, slot.assignedStaffId, body.assignedStaffId);
    let runBlockId = slot.runBlockId;

    if (schedule.status === "PUBLISHED") {
      if (action.kind === "cancel" || action.kind === "replace") {
        if (slot.runBlockId) await cancelSlotRun(slot.runBlockId, actor.id);
        runBlockId = null;
      }
      if ((action.kind === "create" || action.kind === "replace") && assignee) {
        const adhoc = await loadAdhocFlow();
        runBlockId = await createSlotRun(adhoc, {
          slotId: slot.id,
          roleColumn: slot.roleColumn,
          startTime: slot.startTime,
          endTime: slot.endTime,
          date: schedule.date,
          assigneeId: assignee.id,
          assigneeName: assignee.name,
          actorId: actor.id,
        });
      }
    }

    await prisma.scheduleSlot.update({
      where: { id: slot.id },
      data: { assignedStaffId: body.assignedStaffId, runBlockId },
    });

    return {
      slotId: slot.id,
      assignedStaffId: body.assignedStaffId,
      assignedStaffName: assignee?.name ?? null,
      synced: runBlockId !== null,
    };
  }, "assignScheduleCell");
}

export function publishSchedule(
  email: string,
  scheduleId: string,
): Promise<{ ok: true; synced: number }> {
  return native(async () => {
    const body = z.object({ scheduleId: z.string().min(1) }).parse({ scheduleId });
    const actor = await requireUserByEmail(email);
    const schedule = await requireEditableSchedule(actor, body.scheduleId);
    if (schedule.status === "PUBLISHED") {
      throw new ApiHttpError(400, "Already published");
    }

    const toSync = await prisma.scheduleSlot.findMany({
      where: { scheduleId: body.scheduleId, assignedStaffId: { not: null }, runBlockId: null },
    });

    if (toSync.length > 0) {
      const assignees = await prisma.user.findMany({
        where: { id: { in: toSync.map((s) => s.assignedStaffId as string) } },
      });
      const nameById = new Map(assignees.map((u) => [u.id, u.name]));
      const adhoc = await loadAdhocFlow();
      // Known window (donor parity): a crash between createSlotRun and the
      // link-back update can orphan a run; re-publish would then duplicate
      // that slot's task. Hardening ticket: wrap per-slot sync in a transaction.
      for (const slot of toSync) {
        const assigneeId = slot.assignedStaffId as string;
        const runBlockId = await createSlotRun(adhoc, {
          slotId: slot.id,
          roleColumn: slot.roleColumn,
          startTime: slot.startTime,
          endTime: slot.endTime,
          date: schedule.date,
          assigneeId,
          assigneeName: nameById.get(assigneeId) ?? "Staff",
          actorId: actor.id,
        });
        await prisma.scheduleSlot.update({ where: { id: slot.id }, data: { runBlockId } });
      }
    }

    await prisma.manpowerSchedule.update({
      where: { id: body.scheduleId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    return { ok: true as const, synced: toSync.length };
  }, "publishSchedule");
}
