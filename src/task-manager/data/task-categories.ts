// Task Categories ("Type", 2026-08-12): extensible task grouping —
// Flowghan/CNS/SMS/Inventory/HRMS/Email Marketing, etc, org-defined with no
// fixed list. Flat lookup table, no fan-out/cascade logic (unlike
// TaskTemplateGroup) — a category never owns or reconciles tasks, it's
// just a name a task can optionally point at once, at assignment time.
// Managed EXCLUSIVELY inline from the Assign Task form's Type dropdown
// (2026-08-15: the standalone /task-manager/categories admin page —
// rename/archive/unarchive/reorder/full-list-view — was removed; there is
// no other way to manage categories). Creation stays gated by
// canManageTaskTemplateGroups (Super Admin + elevated Operations/
// Optimisation dept-site), re-enforced server-side in createTaskCategory
// regardless of what the client sends. Any assign-capable user may READ
// the active list via listActiveTaskCategories to populate that dropdown.
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

/** The assign form's flat picker list — active (non-archived) categories
 *  only, no manage-access gate: any assign-capable actor may READ this
 *  list to pick a category for a new task, even though only Super
 *  Admin/Operations may create one. Callers pass the acting user's email
 *  purely to resolve them (requireUserByEmail already 404s an unknown
 *  email) — there is no additional authorization check. */
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

