// Task Categories ("Type", 2026-08-12): admin-managed, extensible task
// grouping — Flowghan/CNS/SMS/Inventory/HRMS/Email Marketing, etc, org-
// defined with no fixed list. Flat lookup table, no fan-out/cascade logic
// (unlike TaskTemplateGroup) — a category never owns or reconciles tasks,
// it's just a name a task can optionally point at once, at assignment
// time. Same permission gate as Template/Package management
// (canManageTaskTemplateGroups): Super Admin + elevated Operations/
// Optimisation dept-site only. There is no separate "view" tier here —
// unlike Template/Package, nobody else needs to manage categories, and the
// assign form only needs the flat active list (see listActiveCategories).
import { z } from "zod";
import { prisma } from "../prisma";
import { ApiHttpError } from "../lib/api-server";
import { native, requireUserByEmail } from "./core";
import { canManageTaskTemplateGroups } from "../role-views";

async function requireCategoryManageAccess(email: string) {
  const user = await requireUserByEmail(email);
  if (!canManageTaskTemplateGroups(user)) {
    throw new ApiHttpError(403, "Only Super Admin and Operations can manage task categories");
  }
  return user;
}

export interface TaskCategorySummary {
  id: string;
  name: string;
  order: number;
  archivedAt: string | null; // ISO
}

/** Admin management list — every category, active AND archived, ordered
 *  for the management page (archived ones render with an Unarchive
 *  action there). Gated the same as the create/rename/archive actions
 *  below (no separate view-only tier for this admin surface). */
export function listTaskCategories(email: string): Promise<TaskCategorySummary[]> {
  return native(async () => {
    await requireCategoryManageAccess(email);
    const categories = await prisma.taskCategory.findMany({
      orderBy: [{ archivedAt: "asc" }, { order: "asc" }],
    });
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      order: c.order,
      archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null,
    }));
  }, "listTaskCategories");
}

/** The assign form's flat picker list — active (non-archived) categories
 *  only, no manage-access gate: any assign-capable actor may READ this
 *  list to pick a category for a new task, even though only Super
 *  Admin/Operations may create/rename/archive them. Callers pass the
 *  acting user's email purely to resolve them (requireUserByEmail already
 *  404s an unknown email) — there is no additional authorization check. */
export function listActiveTaskCategories(email: string): Promise<TaskCategorySummary[]> {
  return native(async () => {
    await requireUserByEmail(email);
    const categories = await prisma.taskCategory.findMany({
      where: { archivedAt: null },
      orderBy: { order: "asc" },
    });
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      order: c.order,
      archivedAt: null,
    }));
  }, "listActiveTaskCategories");
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateTaskCategoryInput = z.input<typeof createSchema>;

/** New categories append to the end of the active order — `order` is the
 *  current max active order + 1 (0 for the very first category). */
export function createTaskCategory(
  email: string,
  input: CreateTaskCategoryInput,
): Promise<{ id: string }> {
  return native(async () => {
    const user = await requireCategoryManageAccess(email);
    const body = createSchema.parse(input);
    const max = await prisma.taskCategory.aggregate({
      where: { archivedAt: null },
      _max: { order: true },
    });
    const category = await prisma.taskCategory.create({
      data: { name: body.name, order: (max._max.order ?? -1) + 1, createdById: user.id },
    });
    return { id: category.id };
  }, "createTaskCategory");
}

const renameSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type RenameTaskCategoryInput = z.input<typeof renameSchema>;

export function renameTaskCategory(
  email: string,
  categoryId: string,
  input: RenameTaskCategoryInput,
): Promise<{ ok: true }> {
  return native(async () => {
    await requireCategoryManageAccess(email);
    const id = z.string().min(1).parse(categoryId);
    const body = renameSchema.parse(input);
    const existing = await prisma.taskCategory.findUnique({ where: { id } });
    if (!existing) throw new ApiHttpError(404, "Category not found");
    await prisma.taskCategory.update({ where: { id }, data: { name: body.name } });
    return { ok: true };
  }, "renameTaskCategory");
}

/** Reversible — sets archivedAt, never deletes the row (tasks already
 *  pointing at it via categoryId keep a live FK; only NEW assignments
 *  won't be able to pick it, since listActiveTaskCategories excludes it). */
export function archiveTaskCategory(email: string, categoryId: string): Promise<{ ok: true }> {
  return native(async () => {
    await requireCategoryManageAccess(email);
    const id = z.string().min(1).parse(categoryId);
    const existing = await prisma.taskCategory.findUnique({ where: { id } });
    if (!existing) throw new ApiHttpError(404, "Category not found");
    await prisma.taskCategory.update({ where: { id }, data: { archivedAt: new Date() } });
    return { ok: true };
  }, "archiveTaskCategory");
}

export function unarchiveTaskCategory(email: string, categoryId: string): Promise<{ ok: true }> {
  return native(async () => {
    await requireCategoryManageAccess(email);
    const id = z.string().min(1).parse(categoryId);
    const existing = await prisma.taskCategory.findUnique({ where: { id } });
    if (!existing) throw new ApiHttpError(404, "Category not found");
    await prisma.taskCategory.update({ where: { id }, data: { archivedAt: null } });
    return { ok: true };
  }, "unarchiveTaskCategory");
}

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(200),
});
export type ReorderTaskCategoriesInput = z.input<typeof reorderSchema>;

/** Full-list reorder (drag-and-drop on the management page submits the
 *  WHOLE new active order, not a single move) — stamps `order` as each
 *  id's index in the submitted array. Only active category ids are valid
 *  here; archived ones keep whatever `order` they had when archived
 *  (irrelevant while archived — listActiveTaskCategories excludes them). */
export function reorderTaskCategories(
  email: string,
  input: ReorderTaskCategoriesInput,
): Promise<{ ok: true }> {
  return native(async () => {
    await requireCategoryManageAccess(email);
    const body = reorderSchema.parse(input);
    await Promise.all(
      body.orderedIds.map((id, index) =>
        prisma.taskCategory.update({ where: { id }, data: { order: index } }),
      ),
    );
    return { ok: true };
  }, "reorderTaskCategories");
}
