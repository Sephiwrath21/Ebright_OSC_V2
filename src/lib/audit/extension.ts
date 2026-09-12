// ─────────────────────────────────────────────────────────────
// Audit log — the Prisma client extension that captures every write.
//
// Wraps `$allOperations` on every model. Reads are passed straight through;
// writes get a before-snapshot (where one is needed), run, and then produce an
// `audit_log` row describing what changed.
//
// Known gaps, deliberate:
//   • $queryRaw / $executeRaw bypass model operations entirely and are not
//     captured. There are ~54 raw call sites in this app.
//   • The other databases (HRFS, leads, FA, PCM, SMS) are reached over their
//     own raw `pg` pools, not this client, so nothing there is audited.
//   • Nested writes (`create` with a nested `create`) log as one row against
//     the parent, with the nested payload inside `after`.
//   • Inside an interactive $transaction the audit row is written through the
//     base client, not the transaction — so a rolled-back transaction can
//     leave an audit row for a change that never landed. Accepted: a rare
//     false positive beats losing real changes, and rollbacks here only
//     happen on an error path that is logged anyway.
// ─────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import { getAuditContext } from "./context";
import { describeAudit } from "./describe";
import { entityIdOf } from "./primary-keys";
import { diffRecords, redactRecord, toJsonSafe } from "./redact";
import { writeAuditRow, type AuditEntry } from "./writer";

/** Operations that change data. Everything else is passed through untouched. */
const WRITE_OPS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

/** Ops whose target rows must be read before the write to diff against. */
const NEEDS_BEFORE = new Set([
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

/**
 * Most rows snapshotted for a single *Many operation. A bulk delete of 5,000
 * rows records the count and the filter, not 5,000 row bodies.
 */
const SNAPSHOT_CAP = 50;

type Row = Record<string, unknown>;

/** `users` → `users`, `User` → `user`. Prisma lower-cases the first letter. */
function delegateKey(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function isPlainRow(value: unknown): value is Row {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Read the rows an update/delete is about to affect, through the *base* client
 * so the read itself is not audited.
 */
async function readBefore(
  base: unknown,
  model: string,
  operation: string,
  args: { where?: unknown },
): Promise<Row[]> {
  if (!args?.where) return [];
  const delegate = (base as Record<string, unknown>)[delegateKey(model)] as
    | { findMany?: (a: unknown) => Promise<Row[]> }
    | undefined;
  if (!delegate?.findMany) return [];

  const single = operation === "update" || operation === "upsert" || operation === "delete";
  try {
    return await delegate.findMany({
      where: args.where,
      take: single ? 1 : SNAPSHOT_CAP,
    });
  } catch {
    // A `where` shape findMany rejects (or a row that no longer exists) must
    // not break the write it belongs to — audit without the before-state.
    return [];
  }
}

/** The `data` payload of a write, normalised to a plain object where possible. */
function patchOf(args: unknown): Row | null {
  const data = (args as { data?: unknown } | undefined)?.data;
  if (Array.isArray(data)) return null;
  return isPlainRow(data) ? data : null;
}

export function auditExtension(base: unknown) {
  return Prisma.defineExtension({
    name: "audit-log",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // Reads, and the audit table itself (which would recurse forever).
          if (!WRITE_OPS.has(operation) || model === "audit_log") {
            return query(args);
          }

          const before = NEEDS_BEFORE.has(operation)
            ? await readBefore(base, model, operation, args as { where?: unknown })
            : [];

          const result = await query(args);

          try {
            const entry = buildEntry(model, operation, args, result, before);
            if (entry) {
              const ctx = await getAuditContext();
              await writeAuditRow(base as Parameters<typeof writeAuditRow>[0], {
                ...entry,
                actorId: ctx.actorId,
                actorEmail: ctx.actorEmail,
                actorName: ctx.actorName,
                actorRole: ctx.actorRole,
                actorType: ctx.actorType,
                route: ctx.route,
                ipAddress: ctx.ipAddress,
                userAgent: ctx.userAgent,
              });
            }
          } catch (err) {
            console.error("[audit] capture failed for", model, operation, err);
          }

          return result;
        },
      },
    },
  });
}

/** Everything about the entry that does not depend on who made the change. */
type PartialEntry = Omit<
  AuditEntry,
  "actorId" | "actorEmail" | "actorName" | "actorRole" | "actorType" | "route" | "ipAddress" | "userAgent"
>;

function buildEntry(
  model: string,
  operation: string,
  args: unknown,
  result: unknown,
  before: Row[],
): PartialEntry | null {
  const batchCount = isPlainRow(result) && typeof result.count === "number" ? result.count : null;

  // ── Bulk creates: Prisma returns { count }, so the payload is the record ──
  if (operation === "createMany" || operation === "createManyAndReturn") {
    const rows = Array.isArray(result) ? (result as Row[]) : null;
    const data = (args as { data?: unknown })?.data;
    const payload = Array.isArray(data) ? data.slice(0, SNAPSHOT_CAP) : data;
    const count = batchCount ?? rows?.length ?? (Array.isArray(data) ? data.length : 1);
    if (count === 0) return null;

    return {
      action: "CREATE",
      entity: model,
      entityId: count === 1 && rows?.[0] ? entityIdOf(model, rows[0]) : null,
      rowCount: count,
      before: null,
      after: { rows: toJsonSafe(payload) },
      changed: [],
      summary: describeAudit({ action: "CREATE", entity: model, rowCount: count }),
    };
  }

  // ── Bulk updates: one row describing the patch applied to N rows ──────────
  if (operation === "updateMany" || operation === "updateManyAndReturn") {
    const count = batchCount ?? (Array.isArray(result) ? result.length : 0);
    if (count === 0) return null;
    const patch = patchOf(args);

    return {
      action: "UPDATE",
      entity: model,
      entityId: count === 1 && before[0] ? entityIdOf(model, before[0]) : null,
      rowCount: count,
      before: before.length ? { rows: before.slice(0, SNAPSHOT_CAP).map(redactRecord) } : null,
      after: patch ? redactRecord(patch) : null,
      changed: patch ? Object.keys(patch) : [],
      summary: describeAudit({ action: "UPDATE", entity: model, rowCount: count }),
    };
  }

  if (operation === "deleteMany") {
    const count = batchCount ?? 0;
    if (count === 0) return null;

    return {
      action: "DELETE",
      entity: model,
      entityId: count === 1 && before[0] ? entityIdOf(model, before[0]) : null,
      rowCount: count,
      before: before.length ? { rows: before.slice(0, SNAPSHOT_CAP).map(redactRecord) } : null,
      after: null,
      changed: [],
      summary: describeAudit({ action: "DELETE", entity: model, rowCount: count }),
    };
  }

  // ── Single-row operations ────────────────────────────────────────────────
  const row = isPlainRow(result) ? result : null;
  const prior = before[0] ?? null;

  if (operation === "create") {
    const entityId = entityIdOf(model, row);
    return {
      action: "CREATE",
      entity: model,
      entityId,
      rowCount: 1,
      before: null,
      after: redactRecord(row),
      changed: row ? Object.keys(row) : [],
      summary: describeAudit({ action: "CREATE", entity: model, entityId }),
    };
  }

  if (operation === "delete") {
    // The deleted row comes back from Prisma, so it is the better snapshot.
    const snapshot = row ?? prior;
    const entityId = entityIdOf(model, snapshot);
    return {
      action: "DELETE",
      entity: model,
      entityId,
      rowCount: 1,
      before: redactRecord(snapshot),
      after: null,
      changed: [],
      summary: describeAudit({ action: "DELETE", entity: model, entityId }),
    };
  }

  // update / upsert — an upsert that had no prior row is really a create.
  const action = operation === "upsert" && !prior ? "CREATE" : "UPDATE";
  const entityId = entityIdOf(model, row ?? prior);

  if (action === "CREATE") {
    return {
      action,
      entity: model,
      entityId,
      rowCount: 1,
      before: null,
      after: redactRecord(row),
      changed: row ? Object.keys(row) : [],
      summary: describeAudit({ action, entity: model, entityId }),
    };
  }

  const diff = diffRecords(prior, row);
  // A write that changed nothing is not a change — don't file it as one.
  if (diff.changed.length === 0) return null;

  return {
    action,
    entity: model,
    entityId,
    rowCount: 1,
    before: diff.before,
    after: diff.after,
    changed: diff.changed,
    summary: describeAudit({ action, entity: model, entityId, changed: diff.changed }),
  };
}
