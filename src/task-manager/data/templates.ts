// Task Templates (2026-07-31): reusable "+ Task" structures — title,
// subtasks, cadence, guideline (link + image bytes) — owned per creator.
// CREATION happens inside assignFlowTask (the "Save as Template" flag on
// the assign input; same-name save overwrites = the edit path); this
// module is the read/manage side: list, load-for-prefill, rename, delete.
// Same allow-list as assigning — templates only exist for people who can
// use them.
import { z } from "zod";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { isElevatedDeptSite } from "../analytics/_lib";
import { native, requireUserByEmail } from "./core";

const CADENCE_OPTION_OF = { DAILY: "daily", MONTHLY: "monthly", ADHOC: "adhoc" } as const;

export interface TaskTemplateSummary {
  id: string;
  name: string;
  title: string;
  subtaskCount: number;
  hasGuidelineUrl: boolean;
  hasGuidelineImage: boolean;
  updatedAt: string; // ISO
}

export interface TaskTemplateDetail {
  id: string;
  name: string;
  title: string;
  subtasks: string[];
  cadence: "daily" | "monthly" | "adhoc" | null;
  guidelineUrl: string | null;
  guidelineImage: { mime: string; dataBase64: string } | null;
}

async function requireAssigner(email: string) {
  const user = await requireUserByEmail(email);
  const allowed =
    user.role === "ADMIN" ||
    user.role === "OPS" ||
    user.role === "CEO" ||
    user.role === "HOD" ||
    isElevatedDeptSite(user);
  if (!allowed) {
    throw new ApiHttpError(403, "Only assign-capable accounts can manage task templates");
  }
  return user;
}

export function listTaskTemplates(email: string): Promise<TaskTemplateSummary[]> {
  return native(async () => {
    const user = await requireAssigner(email);
    const rows = await prisma.taskTemplate.findMany({
      where: { createdById: user.id },
      orderBy: { updatedAt: "desc" },
      // Never select the image BYTES for a list — load-for-prefill only.
      select: {
        id: true,
        name: true,
        title: true,
        subtasks: true,
        guidelineUrl: true,
        guidelineMime: true,
        updatedAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      title: r.title,
      subtaskCount: Array.isArray(r.subtasks) ? r.subtasks.length : 0,
      hasGuidelineUrl: r.guidelineUrl !== null,
      hasGuidelineImage: r.guidelineMime !== null,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }, "listTaskTemplates");
}

/** Full template incl. the guideline image as base64 — feeds straight into
 *  the assign form's prefill (same shape the form submits back). */
export function getTaskTemplate(email: string, templateId: string): Promise<TaskTemplateDetail> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(templateId);
    const row = await prisma.taskTemplate.findFirst({
      where: { id, createdById: user.id },
    });
    if (!row) throw new ApiHttpError(404, "Template not found");
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      subtasks: Array.isArray(row.subtasks) ? (row.subtasks as string[]) : [],
      cadence: row.cadence ? CADENCE_OPTION_OF[row.cadence] : null,
      guidelineUrl: row.guidelineUrl,
      guidelineImage:
        row.guidelineMime && row.guidelineImage
          ? { mime: row.guidelineMime, dataBase64: Buffer.from(row.guidelineImage).toString("base64") }
          : null,
    };
  }, "getTaskTemplate");
}

export function renameTaskTemplate(
  email: string,
  templateId: string,
  name: string,
): Promise<{ renamed: boolean }> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(templateId);
    const newName = z.string().trim().min(1).max(100).parse(name);
    const result = await prisma.taskTemplate.updateMany({
      where: { id, createdById: user.id },
      data: { name: newName },
    });
    if (result.count === 0) throw new ApiHttpError(404, "Template not found");
    return { renamed: true };
  }, "renameTaskTemplate");
}

export function deleteTaskTemplate(email: string, templateId: string): Promise<{ deleted: boolean }> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(templateId);
    const result = await prisma.taskTemplate.deleteMany({
      where: { id, createdById: user.id },
    });
    if (result.count === 0) throw new ApiHttpError(404, "Template not found");
    return { deleted: true };
  }, "deleteTaskTemplate");
}
