// ─────────────────────────────────────────────────────────────
// Audit log — the single place an `audit_log` row is inserted.
//
// Takes the Prisma client as an argument rather than importing it: the audit
// extension must write through the *unextended* base client (or it would audit
// its own writes forever), while the manual logAuditEvent() API writes through
// the ordinary app client. Both funnel through here.
//
// Two rules hold for every call:
//   1. A failure to audit must never fail the request that caused it.
//   2. The insert must not block the response — it is handed to next/server's
//      `after()` when one is available.
// ─────────────────────────────────────────────────────────────

import type { Prisma } from "@prisma/client";
import type { AuditAction } from "./describe";

/**
 * A client with an `audit_log` delegate — the base client or the extended one,
 * both qualify.
 *
 * Declared with method shorthand rather than an arrow property on purpose:
 * Prisma's generated `create` is generic over `Exact<A, …>`, which is not
 * assignable to an arrow-typed property under `strictFunctionTypes`. Method
 * shorthand is checked bivariantly, which is what lets both clients fit.
 */
type AuditCapableClient = {
  audit_log: {
    create(args: { data: Prisma.audit_logUncheckedCreateInput }): Promise<unknown>;
  };
};

export type AuditEntry = {
  actorId: number | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  actorType: "user" | "system";

  action: AuditAction | string;
  entity: string;
  entityId: string | null;
  rowCount: number;

  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changed: string[];

  summary: string;
  route: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

/** Postgres varchar widths from prisma/schema.prisma — trim rather than throw. */
const LIMITS: Record<string, number> = {
  actorEmail: 255,
  actorName: 255,
  actorRole: 50,
  action: 20,
  entity: 64,
  entityId: 128,
  route: 255,
  ipAddress: 64,
};

function clamp(value: string | null, limit: number): string | null {
  if (value === null) return null;
  return value.length > limit ? value.slice(0, limit) : value;
}

/**
 * Schedule the insert for after the response. Falls back to an unawaited
 * promise outside a request scope (scripts, workers, the attendance cron),
 * where `after()` is unavailable.
 */
async function defer(work: () => Promise<void>): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(work);
    return;
  } catch {
    // Not in a request scope — run it detached instead.
  }
  void work().catch(() => {});
}

export async function writeAuditRow(
  client: AuditCapableClient,
  entry: AuditEntry,
): Promise<void> {
  const data: Prisma.audit_logUncheckedCreateInput = {
    actor_id: entry.actorId,
    actor_email: clamp(entry.actorEmail, LIMITS.actorEmail),
    actor_name: clamp(entry.actorName, LIMITS.actorName),
    actor_role: clamp(entry.actorRole, LIMITS.actorRole),
    actor_type: entry.actorType,
    action: clamp(entry.action, LIMITS.action) ?? entry.action,
    entity: clamp(entry.entity, LIMITS.entity) ?? entry.entity,
    entity_id: clamp(entry.entityId, LIMITS.entityId),
    row_count: entry.rowCount,
    // Already masked and JSON-normalised by redact.ts.
    before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
    after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
    changed: entry.changed,
    summary: entry.summary,
    route: clamp(entry.route, LIMITS.route),
    ip_address: clamp(entry.ipAddress, LIMITS.ipAddress),
    user_agent: entry.userAgent,
  };

  await defer(async () => {
    try {
      await client.audit_log.create({ data });
    } catch (err) {
      // Rule 1: never propagate. A dropped audit row is bad; a 500 on a leave
      // approval because the audit insert failed is worse.
      console.error("[audit] failed to write audit row:", err, {
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
      });
    }
  });
}
