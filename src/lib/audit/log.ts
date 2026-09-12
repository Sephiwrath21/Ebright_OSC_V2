// ─────────────────────────────────────────────────────────────
// Audit log — the manual API, for things that are not database writes.
//
// The Prisma extension already captures every create/update/delete without a
// call site. This covers what it structurally cannot see: sign-in and sign-out,
// failed sign-in attempts, and data leaving the system (CSV/PDF exports, file
// downloads).
//
// Usage:
//   await logAuditEvent({
//     action: "EXPORT",
//     entity: "claim",
//     detail: "claims to CSV",
//     meta: { rows: 128, filters: { status: "approved" } },
//   })
// ─────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { getAuditContext, type AuditActor } from "./context";
import { describeAudit, type AuditAction } from "./describe";
import { toJsonSafe } from "./redact";
import { writeAuditRow } from "./writer";

export type LogAuditEventInput = {
  action: AuditAction;
  /** The area the event is about — a model name where one fits, else a label. */
  entity: string;
  entityId?: string | number | null;
  /** Rows exported/affected, when the event covers more than one. */
  rowCount?: number;
  /** Phrase completing the summary, e.g. "claims to CSV" → "Exported claims to CSV". */
  detail?: string | null;
  /** Structured extras; stored in `after` so they surface in the row detail. */
  meta?: Record<string, unknown>;
  /**
   * Override the resolved actor. Only needed where the session is not yet (or
   * no longer) readable — the sign-in and failed-sign-in hooks in src/auth.ts.
   */
  actor?: Partial<AuditActor>;
};

/**
 * Record a non-database event. Never throws and never blocks the response —
 * the insert is deferred the same way the extension's are.
 *
 * Writes through the app client; the extension skips the `audit_log` model, so
 * this cannot recurse.
 */
export async function logAuditEvent(input: LogAuditEventInput): Promise<void> {
  try {
    const ctx = await getAuditContext();
    const entityId =
      input.entityId === null || input.entityId === undefined
        ? null
        : String(input.entityId);

    await writeAuditRow(prisma, {
      actorId: input.actor?.actorId ?? ctx.actorId,
      actorEmail: input.actor?.actorEmail ?? ctx.actorEmail,
      actorName: input.actor?.actorName ?? ctx.actorName,
      actorRole: input.actor?.actorRole ?? ctx.actorRole,
      actorType: input.actor?.actorType ?? ctx.actorType,

      action: input.action,
      entity: input.entity,
      entityId,
      rowCount: input.rowCount ?? 1,

      before: null,
      after: input.meta ? (toJsonSafe(input.meta) as Record<string, unknown>) : null,
      changed: [],

      summary: describeAudit({
        action: input.action,
        entity: input.entity,
        entityId,
        rowCount: input.rowCount ?? 1,
        detail: input.detail ?? null,
      }),

      route: ctx.route,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  } catch (err) {
    console.error("[audit] logAuditEvent failed:", err, {
      action: input.action,
      entity: input.entity,
    });
  }
}
