// HOD "My Board" — a freeform personal kanban, NOT the task engine. Owner-only
// everywhere. Ports of the /api/internal/hod-kanban/* routes. `order` is a
// float (fractional indexing): the client computes the new value on drag and
// sends it straight through.
import { z } from "zod";
import type { FlowKanbanCard, FlowKanbanColumnColor, FlowKanbanColumnDef } from "../ui/types";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { native, requireUserByEmail } from "./core";

// Ids are scoped per owner — HodKanbanColumn.id is a global primary key, so
// the lazy-init defaults embed the owner id (see the donor route's comment on
// why a flat "PENDING" literal would break every HOD after the first).
function initialColumns(ownerId: string) {
  return [
    { id: `PENDING-${ownerId}`, label: "Pending", order: 1 },
    { id: `IN_PROGRESS-${ownerId}`, label: "In Progress", order: 2 },
    { id: `COMPLETED-${ownerId}`, label: "Completed", order: 3 },
  ];
}

async function requireHod(email: string) {
  const user = await requireUserByEmail(email);
  if (user.role !== "HOD") {
    throw new ApiHttpError(403, "Only an HOD has a personal board");
  }
  return user;
}

/** A card's `column` must be an existing column row owned by this same HOD. */
async function requireValidColumn(ownerId: string, column: string): Promise<void> {
  const owned = await prisma.hodKanbanColumn.findFirst({ where: { id: column, ownerId } });
  if (!owned) throw new ApiHttpError(404, "Column not found");
}

async function requireOwnedCard(email: string, cardId: string) {
  const user = await requireHod(email);
  const card = await prisma.hodKanbanCard.findUnique({ where: { id: cardId } });
  if (!card || card.ownerId !== user.id) {
    throw new ApiHttpError(404, "Card not found");
  }
  return { user, card };
}

async function requireOwnedColumn(email: string, columnId: string) {
  const user = await requireHod(email);
  const column = await prisma.hodKanbanColumn.findUnique({ where: { id: columnId } });
  if (!column || column.ownerId !== user.id) {
    throw new ApiHttpError(404, "Column not found");
  }
  return { user, column };
}

// Mirrors HOD_KANBAN_COLORS in ui/types.ts — duplicated deliberately, same as
// the donor route did, so the UI package stays import-free of the data layer.
const KANBAN_COLUMN_COLORS = ["blue", "indigo", "violet", "pink", "orange", "teal", "rose"] as const;

export function getHodKanban(
  email: string,
): Promise<{ cards: FlowKanbanCard[]; columns: FlowKanbanColumnDef[] }> {
  return native(async () => {
    const user = await requireHod(email);

    let columns = await prisma.hodKanbanColumn.findMany({
      where: { ownerId: user.id },
      orderBy: { order: "asc" },
    });
    if (columns.length === 0) {
      // skipDuplicates guards a race between two concurrent first-loads.
      await prisma.hodKanbanColumn.createMany({
        data: initialColumns(user.id).map((c) => ({ ...c, ownerId: user.id })),
        skipDuplicates: true,
      });
      columns = await prisma.hodKanbanColumn.findMany({
        where: { ownerId: user.id },
        orderBy: { order: "asc" },
      });
    }

    const cards = await prisma.hodKanbanCard.findMany({
      where: { ownerId: user.id },
      orderBy: { order: "asc" },
    });
    return {
      cards: cards as unknown as FlowKanbanCard[],
      columns: columns as unknown as FlowKanbanColumnDef[],
    };
  }, "getHodKanban");
}

export function createKanbanCard(
  email: string,
  column: string,
  title: string,
): Promise<{ card: FlowKanbanCard }> {
  return native(async () => {
    const body = z
      .object({ column: z.string().min(1).max(100), title: z.string().trim().min(1).max(200) })
      .parse({ column, title });
    const user = await requireHod(email);
    await requireValidColumn(user.id, body.column);

    const top = await prisma.hodKanbanCard.findFirst({
      where: { ownerId: user.id, column: body.column },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const card = await prisma.hodKanbanCard.create({
      data: {
        ownerId: user.id,
        column: body.column,
        title: body.title,
        order: (top?.order ?? 0) + 1,
      },
    });
    return { card: card as unknown as FlowKanbanCard };
  }, "createKanbanCard");
}

export function moveKanbanCard(
  email: string,
  cardId: string,
  column: string,
  order: number,
): Promise<{ card: FlowKanbanCard }> {
  return native(async () => {
    const body = z
      .object({ column: z.string().min(1).max(100), order: z.number() })
      .parse({ column, order });
    const { user } = await requireOwnedCard(email, cardId);
    await requireValidColumn(user.id, body.column);

    const card = await prisma.hodKanbanCard.update({
      where: { id: cardId },
      data: { column: body.column, order: body.order },
    });
    return { card: card as unknown as FlowKanbanCard };
  }, "moveKanbanCard");
}

export function deleteKanbanCard(email: string, cardId: string): Promise<{ deleted: true }> {
  return native(async () => {
    await requireOwnedCard(email, cardId);
    await prisma.hodKanbanCard.delete({ where: { id: cardId } });
    return { deleted: true as const };
  }, "deleteKanbanCard");
}

export function createKanbanColumn(
  email: string,
  label: string,
): Promise<{ column: FlowKanbanColumnDef }> {
  return native(async () => {
    const body = z.object({ label: z.string().trim().min(1).max(60) }).parse({ label });
    const user = await requireHod(email);

    const top = await prisma.hodKanbanColumn.findFirst({
      where: { ownerId: user.id },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const column = await prisma.hodKanbanColumn.create({
      data: {
        ownerId: user.id,
        label: body.label,
        order: (top?.order ?? 0) + 1,
      },
    });
    return { column: column as unknown as FlowKanbanColumnDef };
  }, "createKanbanColumn");
}

const columnPatchSchema = z
  .object({
    label: z.string().trim().min(1).max(60).optional(),
    order: z.number().optional(),
    color: z.enum(KANBAN_COLUMN_COLORS).nullable().optional(),
  })
  .refine((b) => b.label !== undefined || b.order !== undefined || b.color !== undefined, {
    message: "Provide label, order, and/or color",
  });

/** Shared PATCH body — rename / reorder / recolor are one route upstream. */
async function patchKanbanColumn(
  email: string,
  columnId: string,
  patch: { label?: string; order?: number; color?: FlowKanbanColumnColor | null },
): Promise<{ column: FlowKanbanColumnDef }> {
  const body = columnPatchSchema.parse(patch);
  await requireOwnedColumn(email, columnId);

  const column = await prisma.hodKanbanColumn.update({
    where: { id: columnId },
    data: {
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.order !== undefined ? { order: body.order } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
    },
  });
  return { column: column as unknown as FlowKanbanColumnDef };
}

export function renameKanbanColumn(
  email: string,
  columnId: string,
  label: string,
): Promise<{ column: FlowKanbanColumnDef }> {
  return native(() => patchKanbanColumn(email, columnId, { label }), "renameKanbanColumn");
}

/** Drag-reorder the column itself (not its cards). */
export function moveKanbanColumn(
  email: string,
  columnId: string,
  order: number,
): Promise<{ column: FlowKanbanColumnDef }> {
  return native(() => patchKanbanColumn(email, columnId, { order }), "moveKanbanColumn");
}

/** Column title color — a preset key, or null to reset to the neutral default. */
export function recolorKanbanColumn(
  email: string,
  columnId: string,
  color: FlowKanbanColumnColor | null,
): Promise<{ column: FlowKanbanColumnDef }> {
  return native(() => patchKanbanColumn(email, columnId, { color }), "recolorKanbanColumn");
}

export function deleteKanbanColumn(email: string, columnId: string): Promise<{ deleted: true }> {
  return native(async () => {
    await requireOwnedColumn(email, columnId);

    const cardCount = await prisma.hodKanbanCard.count({ where: { column: columnId } });
    if (cardCount > 0) {
      throw new ApiHttpError(
        400,
        `Move or remove this column's ${cardCount} card${cardCount === 1 ? "" : "s"} first`,
      );
    }

    await prisma.hodKanbanColumn.delete({ where: { id: columnId } });
    return { deleted: true as const };
  }, "deleteKanbanColumn");
}
