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
// requireGroupEditAccess (Super Admin + elevated Operations/Optimisation
// dept-site only, identical for both TEMPLATE and PACKAGE scope — a
// DIFFERENT allow-list than this file's own actor check below), can reuse
// that fan-out logic without re-running this file's separate check.
// Keeping the two allow-lists decoupled this way avoids double-gating
// (an already-authorized caller getting silently rejected by a second,
// differently-shaped check) even where today's requireGroupEditAccess
// allow-list happens to be a subset of this one. That file is deliberately
// NOT re-exported by data.ts's `export *` barrel — see its header for the
// full explanation.
import { z } from "zod";
import type { FlowAssignInput } from "../ui/types";
import { isPastDueDay, isFutureDueDay } from "../ui/types";
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

/** The My Tasks "Proof" column (2026-07-30, multi-photo 2026-08-08):
 *  assignee-only upload of completion-evidence images, up to
 *  MAX_PROOFS_PER_TASK per task. Always optional — never gates the
 *  status-dot completion path above. Uploading APPENDS a new `Proof` row
 *  rather than replacing any existing one (2026-08-08 — previously this
 *  was an upsert-on-runBlockId that deleted the prior Drive file; `Proof`
 *  is now 1:many with `RunBlock`, so every accepted upload simply adds a
 *  row, and removing a specific photo is its own explicit action, see
 *  removeFlowTaskProof below). 2 MB cap per image (2026-08-01 storage
 *  decision: images are compressed CLIENT-side to ≤1280px JPEG before
 *  upload — see ui/image-compress.ts — so this server cap is the
 *  bypass-proof enforcement of the same limit, not the primary size
 *  control).
 *
 *  Storage (2026-08-04): the compressed image is uploaded to Google Drive
 *  (src/lib/drive.ts — the SAME shared helper the HR module's resume/
 *  payslip/etc. uploads use, called here as-is, never modified) under its
 *  OWN dedicated folder (GOOGLE_DRIVE_TASK_PROOF_FOLDER_ID — separate from
 *  the shared GOOGLE_DRIVE_FOLDER_ID root every other module defaults to,
 *  since this is a high-volume feature that deserves its own space). Only
 *  the returned Drive file id is stored (Proof.driveFileId). The original
 *  in-DB-bytes columns (imageMime/imageData) were dropped 2026-08-04 once
 *  their only 7 rows — all test data pre-dating this cutover — were
 *  deleted; every row now goes through Drive, no fallback branch needed
 *  anymore.
 *
 *  Folder structure (2026-08-04, mirrors the Inventory repo's dated-
 *  hierarchy convention for the same reason — easing QA/QC of a high-
 *  volume photo stream): {root}/{YYYY}/{MM}/{DD}/{Department-or-Branch}/
 *  — Department for HOD/department-side staff, Branch for Branch Manager/
 *  branch-side staff (the exact split role-views.ts uses everywhere else);
 *  "Unassigned" when a staff record has neither (the ~61 unplaced real
 *  staff role-views.ts already documents elsewhere). Filename (2026-08-11):
 *  Date (YYYYMMDD) - Time (HHMM) - Name (assignee) - Task title, passed as
 *  uploadToDrive's `prefix`; its own `${prefix}-${Date.now()}-${fileName}`
 *  naming appends a second, millisecond-precision timestamp after that (not
 *  worth a targeted change to drive.ts to drop it), which is also how
 *  multiple photos for the same task never collide on a filename. */
const PROOF_IMAGE_MAX_BASE64 = 2 * 1024 * 1024 * 1.37;
/** Multi-photo cap (2026-08-08 design decision #1): reject the 6th upload
 *  attempt for a task with a clear error rather than silently dropping or
 *  replacing anything. */
const MAX_PROOFS_PER_TASK = 5;
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
      select: { assigneeId: true, title: true, cadence: true, dueAt: true, status: true },
    });
    if (!runBlock) throw new ApiHttpError(404, "Task not found");
    if (runBlock.assigneeId !== user.id) {
      throw new ApiHttpError(403, "You can only upload proof for your own tasks");
    }
    // Due-day lock (2026-08-05 past-day, extended 2026-08-11 to
    // future-day): same rule as completeBlock's — a Daily task's day has
    // passed once its dueAt is strictly before today, so proof can no
    // longer be attached OR replaced for it; symmetrically, proof can't
    // be attached before the task's own due day arrives either.
    if (runBlock.cadence === "DAILY" && isPastDueDay(runBlock.dueAt)) {
      throw new ApiHttpError(400, "This task's day has passed and can no longer accept proof");
    }
    if (runBlock.cadence === "DAILY" && isFutureDueDay(runBlock.dueAt)) {
      throw new ApiHttpError(400, "This task isn't due yet and can't accept proof until its day arrives");
    }
    // Completion lock (2026-08-09): once marked Complete, the attached
    // photos become the frozen record of what was submitted — no further
    // uploads (or removes, see removeFlowTaskProof below). Reopening a task
    // (if that ever happens) flips status back off DONE, which naturally
    // un-locks this too — no separate unlock path needed.
    if (runBlock.status === "DONE") {
      throw new ApiHttpError(400, "This task is already complete and can no longer accept proof");
    }

    // Count-then-create, not a transaction: two uploads landing in the same
    // instant could both pass this check and land 6 rows. Accepted — this
    // is a soft UX cap (nudge the assignee to stop attaching more, not a
    // security/storage boundary), and a one-photo overshoot under a real
    // concurrent-upload race is harmless enough not to justify serializing
    // every upload through a transaction.
    const existingCount = await prisma.proof.count({ where: { runBlockId: id } });
    if (existingCount >= MAX_PROOFS_PER_TASK) {
      throw new ApiHttpError(400, `You can attach at most ${MAX_PROOFS_PER_TASK} photos to this task`);
    }

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
    // Filename (2026-08-11): Date (YYYYMMDD) - Time (HHMM) - Name - Task,
    // reusing the same `now` as folderPath above so the file's date/time
    // always matches the dated folder it lands in. uploadToDrive appends
    // its own `-${Date.now()}-${fileName}` suffix after this prefix (that
    // call is out of scope to change here), which still doubles as the
    // multi-photo-per-task collision guard noted below.
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const timePart = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const prefix = sanitizeDriveNamePart(`${datePart}-${timePart}-${user.name}-${runBlock.title}`).slice(0, 150);

    const buffer = Buffer.from(img.dataBase64, "base64");
    const file = new File([buffer], `proof${PROOF_IMAGE_EXT[img.mime] ?? ""}`, { type: img.mime });
    const uploaded = await uploadToDrive(file, {
      prefix,
      folderPath,
      folderEnvVar: "GOOGLE_DRIVE_TASK_PROOF_FOLDER_ID",
    });

    const proof = await prisma.proof.create({
      data: { runBlockId: id, driveFileId: uploaded.id },
    });

    return { proofId: proof.id };
  }, "uploadFlowTaskProof");
}

/** Remove ONE proof photo (2026-08-08, the gallery's per-thumbnail ×):
 *  assignee-only, deletes exactly the one `Proof` row identified by its OWN
 *  id — every other photo on the same task is untouched. Same ownership
 *  (403), past-due-day (400), and completion-lock (400, 2026-08-09) guards
 *  as uploadFlowTaskProof above, applied symmetrically: a task whose day has
 *  passed, or that's already marked Complete, shouldn't have its evidence
 *  altered in either direction.
 *
 *  Ordering (deliberate, mirrors template-groups.ts's multi-step-write
 *  trade-off documentation): the DB row is deleted BEFORE the Drive file is
 *  trashed. If the Drive delete then fails, the file is orphaned-but-harmless
 *  in Drive (nothing in the DB points at it anymore, so it never surfaces
 *  through the proof-image proxy route); the reverse order would risk the
 *  DB still pointing at a Drive file that's already gone, which is the worse
 *  failure mode of the two. */
export function removeFlowTaskProof(
  actorEmail: string,
  proofId: string,
): Promise<{ ok: true }> {
  return native(async () => {
    const id = z.string().min(1).parse(proofId);
    const user = await requireUserByEmail(actorEmail);

    const proof = await prisma.proof.findUnique({
      where: { id },
      select: {
        driveFileId: true,
        runBlock: { select: { assigneeId: true, cadence: true, dueAt: true, status: true } },
      },
    });
    if (!proof) throw new ApiHttpError(404, "Proof not found");
    if (proof.runBlock.assigneeId !== user.id) {
      throw new ApiHttpError(403, "You can only remove proof from your own tasks");
    }
    // Due-day lock (2026-08-05 past-day, extended 2026-08-11 to
    // future-day) — same rule as uploadFlowTaskProof's, applied
    // symmetrically to removal.
    if (proof.runBlock.cadence === "DAILY" && isPastDueDay(proof.runBlock.dueAt)) {
      throw new ApiHttpError(400, "This task's day has passed and can no longer be changed");
    }
    if (proof.runBlock.cadence === "DAILY" && isFutureDueDay(proof.runBlock.dueAt)) {
      throw new ApiHttpError(400, "This task isn't due yet and can't be changed until its day arrives");
    }
    if (proof.runBlock.status === "DONE") {
      throw new ApiHttpError(400, "This task is already complete and can no longer be changed");
    }

    await prisma.proof.delete({ where: { id } });
    if (proof.driveFileId) {
      await deleteFromDrive(proof.driveFileId);
    }

    return { ok: true };
  }, "removeFlowTaskProof");
}
