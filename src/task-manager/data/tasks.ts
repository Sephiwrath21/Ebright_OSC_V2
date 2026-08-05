// Task actions: the "+ Task" quick-assign fan-out and the status-dot
// complete / N/A / reopen mutations. Ports of the corresponding
// /api/internal routes; all reuse the REAL engine paths (submitItem/
// completeBlock/skipBlock/reopenBlock) so audit logs, run auto-completion,
// and reminder cancellation still happen. See assign/route.ts's header
// comment in the donor repo for the full cadence/utility-flow rationale.
import { z } from "zod";
import type { Cadence, Prisma } from "@/generated/task-manager-client";
import type { FlowAssignInput } from "../ui/types";
import { isPastDueDay } from "../ui/types";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { buildTemplateSnapshot } from "../engine/snapshot";
import { completeBlock, reopenBlock, skipBlock, submitItem } from "../engine/run";
import { BRANCH_STAFF_ROLES, isElevatedDeptSite, parseLocalDate } from "../analytics/_lib";
import { native, requireUserByEmail } from "./core";
import { uploadToDrive, deleteFromDrive } from "@/lib/drive";

const CADENCE_OPTIONS = ["daily", "monthly", "adhoc"] as const;
type CadenceOption = (typeof CADENCE_OPTIONS)[number];

/** Mirrors visibleCadenceOptions in ui/types.ts — re-validated server-side so
 *  a crafted request can't submit a cadence the picker wouldn't have offered. */
function allowedCadenceOptions(targets: { employmentType: string | null }[]): CadenceOption[] {
  if (targets.some((t) => t.employmentType === "Manager")) return ["daily", "monthly", "adhoc"];
  if (targets.some((t) => t.employmentType === "Coach" || t.employmentType === "Branch Exec")) {
    return ["daily"];
  }
  return ["daily", "monthly"];
}

const CADENCE_ENUM: Record<CadenceOption, Cadence> = {
  daily: "DAILY",
  monthly: "MONTHLY",
  adhoc: "ADHOC",
};

const DAYS = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_INDEX: Record<(typeof DAYS)[number], number> = {
  Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0,
};

/** Guideline image cap: 2 MB binary ≈ ~2.8M base64 chars. */
const GUIDELINE_IMAGE_MAX_BASE64 = 2 * 1024 * 1024 * 1.37;
const GUIDELINE_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;

const assignInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  branches: z.array(z.string().min(1).max(100)).max(50).default([]),
  role: z.enum(["All", ...BRANCH_STAFF_ROLES]).default("All"),
  days: z.array(z.enum(DAYS)).max(DAYS.length).default([]),
  userIds: z.array(z.string().min(1).max(100)).max(100).default([]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cadence: z.enum(CADENCE_OPTIONS),
  repeatWeekly: z.boolean().optional().default(false),
  // Optional Guideline (2026-07-30): SOP link and/or reference image —
  // never required, never blocks submission.
  guidelineUrl: z.string().trim().url().max(2000).optional(),
  guidelineImage: z
    .object({
      mime: z.enum(GUIDELINE_IMAGE_MIMES),
      dataBase64: z.string().min(1).max(GUIDELINE_IMAGE_MAX_BASE64),
    })
    .optional(),
  // Optional Subtasks (2026-07-30): each becomes a full task of its own
  // linked under the main task (see the pairs loop below).
  subtasks: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  // Optional "Save as Template" (2026-07-31): also persist this
  // assignment's STRUCTURE as a reusable TaskTemplate owned by the actor.
  // Same-name save overwrites (the template edit path).
  saveAsTemplate: z.object({ name: z.string().trim().min(1).max(100) }).optional(),
  // Set when the form was pre-filled via "Start from a template" — stamps
  // every created block with the template's id so template deletion can
  // find (and cancel) its pending assignments.
  fromTemplateId: z.string().min(1).optional(),
});

/** "Assign to Others" (2026-07-25): move ONE pending task to a new assignee.
 *  Allowed for the same identities as assignFlowTask; HOD additionally
 *  scoped to their own department on BOTH ends (the task's current assignee
 *  AND the new one must be in the HOD's department). */
export function reassignFlowTask(
  actorEmail: string,
  runBlockId: string,
  newAssigneeId: string,
): Promise<void> {
  return native(async () => {
    const actor = await requireUserByEmail(actorEmail);
    // The CEO is excluded here (2026-08-01) — view-only on the org-wide/
    // department/branch drill-downs, bypass-proof alongside the UI gate in
    // app/task-manager/page.tsx's canReassign.
    const allowed =
      actor.role === "ADMIN" ||
      actor.role === "OPS" ||
      actor.role === "HOD" ||
      isElevatedDeptSite(actor);
    if (!allowed) {
      throw new ApiHttpError(
        403,
        "Only superadmin, operations, HOD, or the Operation/Optimisation department accounts can reassign tasks",
      );
    }

    const block = await prisma.runBlock.findUnique({ where: { id: runBlockId } });
    if (!block) throw new ApiHttpError(404, "Task not found");
    if (block.status === "DONE" || block.status === "SKIPPED") {
      throw new ApiHttpError(400, "Only pending tasks can be reassigned");
    }

    const [current, next] = await Promise.all([
      prisma.user.findUnique({ where: { id: block.assigneeId } }),
      prisma.user.findUnique({ where: { id: newAssigneeId } }),
    ]);
    if (!next) throw new ApiHttpError(404, "New assignee not found");
    if (actor.role === "HOD") {
      const dept = actor.department;
      if (!dept || current?.department !== dept || next.department !== dept) {
        throw new ApiHttpError(403, "HODs can only reassign tasks within their own department");
      }
    }
    if (next.id === block.assigneeId) return;

    await prisma.runBlock.update({
      where: { id: block.id },
      data: { assigneeId: next.id },
    });
    await prisma.auditLog.create({
      data: {
        runId: block.runId,
        runBlockId: block.id,
        actorId: actor.id,
        action: "BLOCK_REASSIGNED",
        detail: { from: block.assigneeId, to: next.id },
      },
    });
    // TODO(reminders): when the Redis reminder worker goes live (spec §6),
    // cancel this block's scheduled reminder job and reschedule it for the
    // new assignee — today reminders are dormant (REDIS_URL unset), so
    // there's nothing to move yet.
  }, "reassignFlowTask");
}

const ADHOC_FLOW_ID = "flow-adhoc";
const CEO_ASSIGN_FLOW_ID = "flow-ceo-assign";
const HOD_ASSIGN_FLOW_ID = "flow-hod-assign";
const ADMIN_ASSIGN_FLOW_ID = "flow-admin-assign";
const OPS_ASSIGN_FLOW_ID = "flow-ops-assign";
const DUE_HOUR = 17;

function nextOccurrence(day: (typeof DAYS)[number], from = new Date()): Date {
  const diff = (DAY_INDEX[day] - from.getDay() + 7) % 7;
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + diff, DUE_HOUR);
}

// Elevated department sites (Operation/Optimisation) are the DEPT_SITE
// logins with assign rights — isElevatedDeptSite from analytics/_lib is the
// single source of truth for that list (it also unlocks their all-departments
// view scope in canViewEntity/canViewMember).

/** The "+ Task" quick form: one RunBlock per (recipient × occurrence). */
export function assignFlowTask(
  actorEmail: string,
  input: FlowAssignInput,
): Promise<{ created: number }> {
  return native(async () => {
    const body = assignInputSchema.parse(input);
    const actor = await requireUserByEmail(actorEmail);
    const allowed =
      actor.role === "ADMIN" ||
      actor.role === "OPS" ||
      actor.role === "CEO" ||
      actor.role === "HOD" ||
      isElevatedDeptSite(actor);
    if (!allowed) {
      throw new ApiHttpError(
        403,
        "Only superadmin, operations, HOD, the CEO, or the Operation/Optimisation department accounts can assign tasks",
      );
    }

    const roles = body.role === "All" ? [...BRANCH_STAFF_ROLES] : [body.role];
    const targets = await prisma.user.findMany({
      where:
        body.userIds.length > 0
          ? { id: { in: body.userIds } }
          : {
              employmentType: { in: roles },
              ...(body.branches.length > 0 ? { branch: { in: body.branches } } : {}),
            },
      orderBy: { name: "asc" },
    });
    if (targets.length === 0) {
      throw new ApiHttpError(400, "No staff match that selection");
    }
    // The CEO assigns to HODs ONLY, plus themselves via the "Myself" quick
    // pick (2026-08-01) — the form's recipient picker already restricts;
    // this is the bypass-proof check.
    if (
      actor.role === "CEO" &&
      targets.some((t) => t.role !== "HOD" && t.id !== actor.id)
    ) {
      throw new ApiHttpError(400, "The CEO can only assign tasks to HODs or themselves");
    }
    const allowedCadences = allowedCadenceOptions(targets);
    if (!allowedCadences.includes(body.cadence)) {
      throw new ApiHttpError(
        400,
        `${allowedCadences.join("/")} ${allowedCadences.length > 1 ? "are" : "is"} the only cadence option${allowedCadences.length > 1 ? "s" : ""} for this recipient selection`,
      );
    }

    const flowId =
      actor.role === "CEO"
        ? CEO_ASSIGN_FLOW_ID
        : actor.role === "HOD"
          ? HOD_ASSIGN_FLOW_ID
          : actor.role === "OPS"
            ? OPS_ASSIGN_FLOW_ID
            : actor.role === "ADMIN" || isElevatedDeptSite(actor)
              ? ADMIN_ASSIGN_FLOW_ID
              : ADHOC_FLOW_ID; // unreachable given the allow-list — safe fallback only
    const flow = await prisma.flow.findUnique({
      where: { id: flowId },
      include: { blocks: { include: { items: true } } },
    });
    const block = flow?.blocks[0];
    if (!flow || !block) {
      throw new ApiHttpError(500, "Assignment utility flow missing — run the seed/bootstrap");
    }
    const snapshot = (await buildTemplateSnapshot(flow.id)) as unknown as Prisma.InputJsonValue;

    let occurrences: { dueAt: Date | null; runName: string }[];
    if (body.dueDate) {
      const d = parseLocalDate(body.dueDate);
      occurrences = [
        { dueAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), DUE_HOUR), runName: body.title },
      ];
    } else if (body.days.length > 0) {
      occurrences = body.days.map((day) => ({
        dueAt: nextOccurrence(day),
        runName: `${body.title} (${day})`,
      }));
    } else {
      occurrences = [{ dueAt: null, runName: body.title }];
    }
    const cadence: Cadence = CADENCE_ENUM[body.cadence];

    // ONE shared Guideline row for the whole assignment (all recipients ×
    // occurrences reference it; recurrence successors inherit the id) —
    // the image bytes are stored exactly once.
    let guidelineId: string | null = null;
    if (body.guidelineUrl || body.guidelineImage) {
      const guideline = await prisma.guideline.create({
        data: {
          url: body.guidelineUrl ?? null,
          imageMime: body.guidelineImage?.mime ?? null,
          imageData: body.guidelineImage
            ? Buffer.from(body.guidelineImage.dataBase64, "base64")
            : null,
        },
      });
      guidelineId = guideline.id;
    }

    // "Save as Template" (2026-07-31): runs BEFORE the fan-out so the
    // template's id can stamp every created block (templateId) — that link
    // is what lets deleting the template cancel its pending assignments.
    // Structure only: recipients, days, and due date deliberately excluded
    // (they reset per use). Image bytes are copied INTO the template so
    // task-side changes can never hollow it out; using the template later
    // creates a fresh Guideline row through the normal path.
    let savedTemplateId: string | null = null;
    if (body.saveAsTemplate) {
      const templateData = {
        title: body.title,
        subtasks: body.subtasks as unknown as Prisma.InputJsonValue,
        cadence,
        guidelineUrl: body.guidelineUrl ?? null,
        guidelineMime: body.guidelineImage?.mime ?? null,
        guidelineImage: body.guidelineImage
          ? Buffer.from(body.guidelineImage.dataBase64, "base64")
          : null,
      };
      const existing = await prisma.taskTemplate.findFirst({
        where: { createdById: actor.id, name: body.saveAsTemplate.name },
        select: { id: true },
      });
      const saved = existing
        ? await prisma.taskTemplate.update({ where: { id: existing.id }, data: templateData })
        : await prisma.taskTemplate.create({
            data: { createdById: actor.id, name: body.saveAsTemplate.name, ...templateData },
          });
      savedTemplateId = saved.id;
    }
    const templateId = body.fromTemplateId ?? savedTemplateId ?? null;

    // Pairs touch disjoint rows — no shared transaction ties them together
    // (each create was already its own implicit transaction in the donor's
    // loop form), so they run concurrently on purpose. Do not "fix" into a
    // sequential loop.
    const pairs = targets.flatMap((target) => occurrences.map((occ) => ({ target, occ })));
    const runIds = await Promise.all(
      pairs.map(async ({ target, occ }) => {
        const run = await prisma.flowRun.create({
          data: {
            flowId: flow.id,
            flowVersion: flow.version,
            templateSnapshot: snapshot,
            name: `${occ.runName} — ${target.name}`,
            startedById: actor.id,
            triggerType: "MANUAL",
            status: "ACTIVE",
          },
        });
        const parentBlock = await prisma.runBlock.create({
          data: {
            runId: run.id,
            blockId: block.id,
            nodeId: block.nodeId,
            title: body.title,
            assigneeId: target.id,
            status: "ACTIVE",
            startedAt: new Date(),
            dueAt: occ.dueAt,
            cadence,
            guidelineId,
            templateId,
            runItems: {
              create: block.items.map((it) => ({
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
        // Subtasks (2026-07-30): each is a FULL task — its own run + block,
        // same assignee/due/cadence, linked via parentId. Its own run keeps
        // every existing path (complete/N-A/reopen, run auto-completion,
        // proof, audit) working identically to a normal task; only the UI
        // groups them. subtaskOrder (2026-07-31) records the checklist-
        // builder sequence explicitly.
        for (const [subtaskIndex, subtaskTitle] of body.subtasks.entries()) {
          const subRun = await prisma.flowRun.create({
            data: {
              flowId: flow.id,
              flowVersion: flow.version,
              templateSnapshot: snapshot,
              name: `${subtaskTitle} — ${target.name}`,
              startedById: actor.id,
              triggerType: "MANUAL",
              status: "ACTIVE",
            },
          });
          await prisma.runBlock.create({
            data: {
              runId: subRun.id,
              blockId: block.id,
              nodeId: block.nodeId,
              title: subtaskTitle,
              assigneeId: target.id,
              status: "ACTIVE",
              startedAt: new Date(),
              dueAt: occ.dueAt,
              cadence,
              parentId: parentBlock.id,
              templateId,
              subtaskOrder: subtaskIndex,
              runItems: {
                create: block.items.map((it) => ({
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
              runId: subRun.id,
              actorId: actor.id,
              action: "RUN_STARTED",
              detail: {
                runName: subtaskTitle,
                trigger: "MANUAL",
                adhoc: flowId === ADHOC_FLOW_ID,
                assignee: target.name,
                subtaskOf: parentBlock.id,
              },
            },
          });
        }
        await prisma.auditLog.create({
          data: {
            runId: run.id,
            actorId: actor.id,
            action: "RUN_STARTED",
            detail: {
              runName: occ.runName,
              trigger: "MANUAL",
              adhoc: flowId === ADHOC_FLOW_ID,
              assignee: target.name,
            },
          },
        });
        return run.id;
      }),
    );

    // Subtask runs aren't counted — "created" answers "how many tasks did
    // this assignment fan out to" (recipients × days), same as before.
    return { created: runIds.length };
  }, "assignFlowTask");
}

/** Click-to-complete: assignee-only, single-required-CHECKBOX tasks only. */
export function completeFlowTask(
  actorEmail: string,
  runBlockId: string,
): Promise<{ completed: boolean; runBlockId: string; runCompleted: boolean }> {
  return native(async () => {
    const id = z.string().min(1).parse(runBlockId);
    const user = await requireUserByEmail(actorEmail);

    const runBlock = await prisma.runBlock.findUnique({
      where: { id },
      include: { runItems: true },
    });
    if (!runBlock) throw new ApiHttpError(404, "Task not found");
    if (runBlock.assigneeId !== user.id) {
      throw new ApiHttpError(403, "You can only complete your own tasks");
    }

    // Re-verify eligibility server-side — never trust the client's view.
    const required = runBlock.runItems.filter((it) => it.required);
    if (required.length !== 1 || required[0].type !== "CHECKBOX") {
      throw new ApiHttpError(400, "This task can't be quick-completed — open it in the full run view.");
    }

    await submitItem({
      runId: runBlock.runId,
      runBlockId: runBlock.id,
      runItemId: required[0].id,
      value: { type: "CHECKBOX", checked: true },
      actorId: user.id,
    });
    const result = await completeBlock({
      runId: runBlock.runId,
      runBlockId: runBlock.id,
      actorId: user.id,
    });

    return { completed: true, ...result } as {
      completed: boolean;
      runBlockId: string;
      runCompleted: boolean;
    };
  }, "completeFlowTask");
}

/** Status dropdown "N/A": assignee-only, any of the caller's own non-terminal tasks. */
export function skipFlowTask(
  actorEmail: string,
  runBlockId: string,
): Promise<{ skipped: boolean; runBlockId: string; runCompleted: boolean }> {
  return native(async () => {
    const id = z.string().min(1).parse(runBlockId);
    const user = await requireUserByEmail(actorEmail);

    const runBlock = await prisma.runBlock.findUnique({ where: { id } });
    if (!runBlock) throw new ApiHttpError(404, "Task not found");
    if (runBlock.assigneeId !== user.id) {
      throw new ApiHttpError(403, "You can only mark your own tasks N/A");
    }

    const result = await skipBlock({
      runId: runBlock.runId,
      runBlockId: runBlock.id,
      actorId: user.id,
    });

    return { skipped: true, ...result } as {
      skipped: boolean;
      runBlockId: string;
      runCompleted: boolean;
    };
  }, "skipFlowTask");
}

/** Status dropdown "Pending" on a Completed/N-A task: assignee-only reopen. */
export function reopenFlowTask(
  actorEmail: string,
  runBlockId: string,
): Promise<{ reopened: boolean; runBlockId: string; runReopened: boolean }> {
  return native(async () => {
    const id = z.string().min(1).parse(runBlockId);
    const user = await requireUserByEmail(actorEmail);

    const runBlock = await prisma.runBlock.findUnique({ where: { id } });
    if (!runBlock) throw new ApiHttpError(404, "Task not found");
    if (runBlock.assigneeId !== user.id) {
      throw new ApiHttpError(403, "You can only reopen your own tasks");
    }

    const result = await reopenBlock({
      runId: runBlock.runId,
      runBlockId: runBlock.id,
      actorId: user.id,
    });

    return { reopened: true, ...result } as {
      reopened: boolean;
      runBlockId: string;
      runReopened: boolean;
    };
  }, "reopenFlowTask");
}

/** The My Tasks "Proof" column (2026-07-30): assignee-only upload of ONE
 *  completion-evidence image per task. Always optional — never gates the
 *  status-dot completion path above. Re-uploading replaces the previous
 *  image (upsert on runBlockId). 2 MB cap (2026-08-01 storage decision:
 *  images are compressed CLIENT-side to ≤1280px JPEG before upload — see
 *  ui/image-compress.ts — so this server cap is the bypass-proof
 *  enforcement of the same limit, not the primary size control).
 *
 *  Storage (2026-08-04): the compressed image is uploaded to Google Drive
 *  (src/lib/drive.ts — the SAME shared helper the HR module's resume/
 *  payslip/etc. uploads use, called here as-is, never modified) under its
 *  OWN dedicated folder (GOOGLE_DRIVE_TASK_PROOF_FOLDER_ID — separate from
 *  the shared GOOGLE_DRIVE_FOLDER_ID root every other module defaults to,
 *  since this is a high-volume feature that deserves its own space).
 *  Only the returned Drive file id is stored (Proof.driveFileId); a
 *  replace deletes the previous file from Drive. The original in-DB-bytes
 *  columns (imageMime/imageData) were dropped 2026-08-04 once their only 7
 *  rows — all test data pre-dating this cutover — were deleted; every row
 *  now goes through Drive, no fallback branch needed anymore.
 *
 *  Folder structure (2026-08-04, mirrors the Inventory repo's dated-
 *  hierarchy convention for the same reason — easing QA/QC of a high-
 *  volume photo stream): {root}/{YYYY}/{MM}/{DD}/{Department-or-Branch}/
 *  — Department for HOD/department-side staff, Branch for Branch Manager/
 *  branch-side staff (the exact split role-views.ts uses everywhere else);
 *  "Unassigned" when a staff record has neither (the ~61 unplaced real
 *  staff role-views.ts already documents elsewhere). The filename is built
 *  from the assignee + task title as uploadToDrive's `prefix` — its own
 *  `${prefix}-${Date.now()}-${fileName}` naming already bakes in a
 *  timestamp, so nothing here duplicates one. */
const PROOF_IMAGE_MAX_BASE64 = 2 * 1024 * 1024 * 1.37;
const proofImageSchema = z.object({
  mime: z.enum(GUIDELINE_IMAGE_MIMES),
  dataBase64: z.string().min(1).max(PROOF_IMAGE_MAX_BASE64),
});
const PROOF_IMAGE_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};
/** Drive folder/file names tolerate most characters, but keep it to a safe
 *  ASCII-ish set so a stray "/" in a task title (or similar) can never be
 *  misread as a path separator by anyone browsing the Drive tree by hand. */
function sanitizeDriveNamePart(value: string): string {
  return value.replace(/[^a-z0-9.\-_ ]/gi, "_").trim();
}

export function uploadFlowTaskProof(
  actorEmail: string,
  runBlockId: string,
  image: { mime: string; dataBase64: string },
): Promise<{ proofId: string }> {
  return native(async () => {
    const id = z.string().min(1).parse(runBlockId);
    const img = proofImageSchema.parse(image);
    const user = await requireUserByEmail(actorEmail);

    const runBlock = await prisma.runBlock.findUnique({
      where: { id },
      select: { assigneeId: true, title: true, cadence: true, dueAt: true },
    });
    if (!runBlock) throw new ApiHttpError(404, "Task not found");
    if (runBlock.assigneeId !== user.id) {
      throw new ApiHttpError(403, "You can only upload proof for your own tasks");
    }
    // Past-day lock (2026-08-05): same rule as completeBlock's — a Daily
    // task's day has passed once its dueAt is strictly before today, so
    // proof can no longer be attached OR replaced for it either.
    if (runBlock.cadence === "DAILY" && isPastDueDay(runBlock.dueAt)) {
      throw new ApiHttpError(400, "This task's day has passed and can no longer accept proof");
    }

    const existing = await prisma.proof.findUnique({
      where: { runBlockId: id },
      select: { driveFileId: true },
    });

    // Department for dept-side staff, Branch for branch-side staff — same
    // split as role-views.ts. "Unassigned" is the documented fallback for
    // staff with neither (rare, but real — see User.department's comment).
    const orgUnit = user.department ?? user.branch ?? "Unassigned";
    const now = new Date();
    const folderPath = [
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      orgUnit,
    ];
    const prefix = sanitizeDriveNamePart(`${user.name}-${runBlock.title}`).slice(0, 150);

    const buffer = Buffer.from(img.dataBase64, "base64");
    const file = new File([buffer], `proof${PROOF_IMAGE_EXT[img.mime] ?? ""}`, { type: img.mime });
    const uploaded = await uploadToDrive(file, {
      prefix,
      folderPath,
      folderEnvVar: "GOOGLE_DRIVE_TASK_PROOF_FOLDER_ID",
    });

    const proof = await prisma.proof.upsert({
      where: { runBlockId: id },
      create: { runBlockId: id, driveFileId: uploaded.id },
      update: { driveFileId: uploaded.id },
    });

    if (existing?.driveFileId && existing.driveFileId !== uploaded.id) {
      await deleteFromDrive(existing.driveFileId);
    }

    return { proofId: proof.id };
  }, "uploadFlowTaskProof");
}
