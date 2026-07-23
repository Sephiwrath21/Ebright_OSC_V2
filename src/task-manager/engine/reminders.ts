// Reminder / escalation engine (PROJECT_GUIDE §4 "Reminder job fires").
//
// `decideReminderAction` is PURE (unit-tested without DB/Redis). `processReminder`
// is the side-effect wrapper the BullMQ worker calls; it dynamically imports the
// impure modules (prisma / queues / email / users) so importing this file in
// vitest never touches Postgres or Redis.
//
// Normative behaviour (strikeLimit = 3): the jobs fire at strikes 1 and 2 as
// reminders; the firing that RAISES strikeCount to the limit escalates and does
// NOT re-queue (stop nagging after escalation).

import type { BlockStatus, RunStatus } from "@/generated/task-manager-client";
import type { TemplateSnapshot } from "../lib/types";
import { escalationEmail, reminderEmail } from "../email/templates";

// ---------- pure decision ----------

export interface ReminderDecisionInput {
  blockStatus: BlockStatus;
  runStatus: RunStatus;
  strikeCount: number;
  strikeLimit: number;
  dueAt: Date | null;
  now: Date;
}

export type ReminderAction = "skip" | "remind" | "escalate";

export interface ReminderDecision {
  action: ReminderAction;
  /** true when dueAt has passed and the block is still ACTIVE (not yet OVERDUE). */
  markOverdue: boolean;
}

export function decideReminderAction(input: ReminderDecisionInput): ReminderDecision {
  const { blockStatus, runStatus, strikeCount, strikeLimit, dueAt, now } = input;

  if (
    blockStatus === "DONE" ||
    blockStatus === "SKIPPED" ||
    blockStatus === "ESCALATED" ||
    runStatus !== "ACTIVE"
  ) {
    return { action: "skip", markOverdue: false };
  }

  const markOverdue =
    blockStatus === "ACTIVE" && dueAt !== null && dueAt.getTime() <= now.getTime();

  // This firing increments the strike; reaching the limit escalates.
  const nextStrike = strikeCount + 1;
  return { action: nextStrike >= strikeLimit ? "escalate" : "remind", markOverdue };
}

// ---------- side-effect wrapper (worker entry point) ----------

const HOUR_MS = 3_600_000;

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

/**
 * Process one reminder firing for a RunBlock: apply `decideReminderAction`,
 * update strike/status, send the reminder or escalation email, write
 * NotificationLog + AuditLog rows, and re-queue the next reminder (or stop
 * after escalation).
 */
export async function processReminder(runBlockId: string): Promise<void> {
  const [{ prisma }, { getReminderQueue, reminderJobId }, { sendEmail }, { getUsersByIds }] =
    await Promise.all([
      import("../prisma"),
      import("../lib/queues"),
      import("../lib/email"),
      import("../lib/users"),
    ]);

  const runBlock = await prisma.runBlock.findUnique({
    where: { id: runBlockId },
    include: { run: true },
  });
  if (!runBlock) {
    console.warn(`[reminders] runBlock ${runBlockId} not found — job dropped`);
    return;
  }

  const run = runBlock.run;
  const snapshot = run.templateSnapshot as unknown as TemplateSnapshot;
  const snapBlock =
    snapshot?.blocks?.find((b) => b.id === runBlock.blockId) ??
    snapshot?.blocks?.find((b) => b.nodeId === runBlock.nodeId);
  const strikeLimit = snapBlock?.strikeLimit ?? 3;
  const reminderInterval = snapBlock?.reminderInterval ?? 24;

  const now = new Date();
  const decision = decideReminderAction({
    blockStatus: runBlock.status,
    runStatus: run.status,
    strikeCount: runBlock.strikeCount,
    strikeLimit,
    dueAt: runBlock.dueAt,
    now,
  });

  if (decision.action === "skip") return;

  const newStrike = runBlock.strikeCount + 1;
  // The job that just fired carries this deterministic id (queues.ts scheme).
  const firedJobId = reminderJobId(runBlockId, newStrike);
  const url = `${appUrl()}/runs/${run.id}`;

  const escalateToUserId = snapBlock?.escalateToUserId ?? "";
  const users = await getUsersByIds(
    [runBlock.assigneeId, escalateToUserId].filter(Boolean) as string[],
  );
  const assignee = users.get(runBlock.assigneeId);
  const supervisor = escalateToUserId ? users.get(escalateToUserId) : undefined;

  if (decision.action === "escalate") {
    // Guarded write: the block may have been completed/skipped (or this strike
    // already applied by an earlier delivery of the same job) between the read
    // above and now — firing must then no-op instead of resurrecting a closed
    // block to ESCALATED and emailing about a finished step (guide §4).
    const escalated = await prisma.runBlock.updateMany({
      where: {
        id: runBlockId,
        status: { in: ["ACTIVE", "OVERDUE"] },
        strikeCount: runBlock.strikeCount,
        run: { status: "ACTIVE" },
      },
      data: { status: "ESCALATED", strikeCount: newStrike, reminderJobId: null },
    });
    if (escalated.count === 0) {
      console.warn(
        `[reminders] runBlock ${runBlockId} advanced concurrently — escalation skipped`,
      );
      return;
    }

    let sentTo: string | null = null;
    if (supervisor) {
      const email = escalationEmail({
        supervisorName: supervisor.name,
        assigneeName: assignee?.name ?? "the assignee",
        blockTitle: runBlock.title,
        runName: run.name,
        flowName: snapshot?.flowName ?? "Workflow",
        dueAt: runBlock.dueAt,
        strikeCount: newStrike,
        url,
      });
      try {
        await sendEmail({ to: supervisor.email, subject: email.subject, html: email.html });
        sentTo = supervisor.email;
        await prisma.notificationLog.create({
          data: { runBlockId, type: "ESCALATION", sentTo, jobId: firedJobId },
        });
      } catch (err) {
        console.error(`[reminders] escalation email failed for runBlock ${runBlockId}`, err);
      }
    } else {
      console.warn(
        `[reminders] runBlock ${runBlockId} escalated but escalation target ${escalateToUserId || "(none)"} was not found — no email sent`,
      );
    }

    await prisma.auditLog.create({
      data: {
        runId: run.id,
        runBlockId,
        actorId: "system",
        action: "BLOCK_ESCALATED",
        detail: {
          strikeCount: newStrike,
          strikeLimit,
          escalateToUserId: escalateToUserId || null,
          sentTo,
          markedOverdue: decision.markOverdue,
        },
      },
    });
    return;
  }

  // --- remind: re-queue the next firing, then persist state, then notify ---
  // The deterministic job id makes the queue.add idempotent (BullMQ dedupes by
  // jobId), so a retried job that failed before committing re-queues the SAME
  // next firing instead of a second one.
  const nextJobId = reminderJobId(runBlockId, newStrike + 1);
  const queue = (() => {
    try {
      return getReminderQueue();
    } catch (err) {
      console.error(`[reminders] reminder queue unavailable for ${runBlockId}`, err);
      return null;
    }
  })();
  try {
    await queue?.add(
      "reminder",
      { runBlockId },
      { jobId: nextJobId, delay: reminderInterval * HOUR_MS },
    );
  } catch (err) {
    console.error(`[reminders] failed to re-queue next reminder for ${runBlockId}`, err);
  }

  // Strike + status + the OVERDUE audit commit atomically, and the write is
  // guarded on the status AND the strike we read: a block completed/cancelled
  // concurrently (or a BullMQ retry whose strike already landed) matches 0 rows
  // and the firing becomes a no-op — never a resurrected block, a double strike
  // or a premature escalation.
  const applied = await prisma.$transaction(async (tx) => {
    const updated = await tx.runBlock.updateMany({
      where: {
        id: runBlockId,
        status: { in: ["ACTIVE", "OVERDUE"] },
        strikeCount: runBlock.strikeCount,
        run: { status: "ACTIVE" },
      },
      data: {
        strikeCount: newStrike,
        reminderJobId: nextJobId,
        ...(decision.markOverdue ? { status: "OVERDUE" as BlockStatus } : {}),
      },
    });
    if (updated.count === 0) return false;
    if (decision.markOverdue) {
      await tx.auditLog.create({
        data: {
          runId: run.id,
          runBlockId,
          actorId: "system",
          action: "BLOCK_STATUS_CHANGED",
          detail: { status: "OVERDUE", reason: "dueAt passed at reminder firing" },
        },
      });
    }
    return true;
  });
  if (!applied) {
    // The block advanced concurrently — drop the next firing we just queued.
    try {
      await queue?.remove(nextJobId);
    } catch (err) {
      console.warn(`[reminders] failed to remove orphaned reminder job ${nextJobId}`, err);
    }
    console.warn(`[reminders] runBlock ${runBlockId} advanced concurrently — reminder skipped`);
    return;
  }

  if (assignee) {
    const email = reminderEmail({
      assigneeName: assignee.name,
      blockTitle: runBlock.title,
      runName: run.name,
      flowName: snapshot?.flowName ?? "Workflow",
      dueAt: runBlock.dueAt,
      strikeCount: newStrike,
      strikeLimit,
      url,
    });
    try {
      await sendEmail({ to: assignee.email, subject: email.subject, html: email.html });
      await prisma.notificationLog.create({
        data: { runBlockId, type: "REMINDER", sentTo: assignee.email, jobId: firedJobId },
      });
      await prisma.auditLog.create({
        data: {
          runId: run.id,
          runBlockId,
          actorId: "system",
          action: "REMINDER_SENT",
          detail: { strikeCount: newStrike, strikeLimit, sentTo: assignee.email },
        },
      });
    } catch (err) {
      console.error(`[reminders] reminder email failed for runBlock ${runBlockId}`, err);
    }
  } else {
    console.warn(
      `[reminders] assignee ${runBlock.assigneeId} not found for runBlock ${runBlockId} — reminder recorded without email`,
    );
  }
}
