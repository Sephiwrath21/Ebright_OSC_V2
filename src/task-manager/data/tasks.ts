// Task actions: the "+ Task" quick-assign fan-out and the status-dot
// complete / N/A / reopen mutations. Ports of the corresponding
// /api/internal routes; all reuse the REAL engine paths (submitItem/
// completeBlock/skipBlock/reopenBlock) so audit logs, run auto-completion,
// and reminder cancellation still happen. See assign/route.ts's header
// comment in the donor repo for the full cadence/utility-flow rationale.
//
// assignFlowTask's actual fan-out logic lives in ./tasks-internal
// (2026-08-06) — factored out so data/template-groups.ts's
// applyTemplateGroup, which authorizes actors via its own
// requireGroupAssignAccess (a DIFFERENT per-scope allow-list than this
// file's actor check below), can reuse that logic for an already-authorized
// actor without re-running this file's narrower check. That file is
// deliberately NOT re-exported by data.ts's `export *` barrel — see its
// header for the full explanation.
import { z } from "zod";
import type { FlowAssignInput } from "../ui/types";
import { isPastDueDay } from "../ui/types";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { completeBlock, reopenBlock, skipBlock, submitItem } from "../engine/run";
import { isElevatedDeptSite } from "../analytics/_lib";
import { native, requireUserByEmail } from "./core";
import { uploadToDrive, deleteFromDrive } from "@/lib/drive";
import { GUIDELINE_IMAGE_MIMES, assignInputSchema, assignFlowTaskCore } from "./tasks-internal";

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

// Elevated department sites (Operation/Optimisation) are the DEPT_SITE
// logins with assign rights — isElevatedDeptSite from analytics/_lib is the
// single source of truth for that list (it also unlocks their all-departments
// view scope in canViewEntity/canViewMember).

/** The "+ Task" quick form: one RunBlock per (recipient × occurrence).
 *  Auth check ONLY — the actual fan-out logic is assignFlowTaskCore in
 *  ./tasks-internal (2026-08-06 split). The parse-before-auth-resolve
 *  order below is preserved exactly as it always was (a malformed input
 *  throws its ZodError-derived 400 before ever reaching the 403 branch,
 *  same as before this split) — assignFlowTaskCore re-validates the same
 *  input as its own first step, which is redundant but harmless and keeps
 *  this wrapper's observable behavior byte-for-byte identical to before. */
export function assignFlowTask(
  actorEmail: string,
  input: FlowAssignInput,
): Promise<{ created: number }> {
  return native(async () => {
    assignInputSchema.parse(input);
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
    return assignFlowTaskCore(actor, input);
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
