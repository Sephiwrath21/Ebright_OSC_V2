// ─────────────────────────────────────────────────────────────
// GET /api/audit-log        → paginated, filtered audit trail (JSON)
// GET /api/audit-log?format=csv → the same rows as a CSV download
//
// Read-only by design. Audit rows are written by src/lib/audit/ and removed
// only by scripts/prune-audit-log.ts, so there is no POST/PATCH/DELETE here.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildAccess } from "@/lib/access/engine";
import { logAuditEvent } from "@/lib/audit/log";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
/** Hard ceiling on an export, so one click cannot stream a million rows. */
const MAX_EXPORT_ROWS = 10_000;

export type AuditLogRow = {
  id: string;
  occurredAt: string;
  actorId: number | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  actorType: string;
  action: string;
  entity: string;
  entityId: string | null;
  rowCount: number;
  changed: string[];
  before: unknown;
  after: unknown;
  summary: string | null;
  route: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

function parseFilters(sp: URLSearchParams) {
  return {
    page: Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1),
    pageSize: Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number.parseInt(sp.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
    ),
    search: sp.get("search")?.trim() || null,
    action: sp.get("action")?.trim() || null,
    entity: sp.get("entity")?.trim() || null,
    entityId: sp.get("entityId")?.trim() || null,
    actorId: sp.get("actorId")?.trim() || null,
    // The attendance sync writes far more rows than people do, so the default
    // view is human activity; "all" opts into system rows as well.
    actorType: sp.get("actorType")?.trim() || "user",
    dateFrom: sp.get("dateFrom")?.trim() || null,
    dateTo: sp.get("dateTo")?.trim() || null,
  };
}

type Filters = ReturnType<typeof parseFilters>;

function buildWhere(f: Filters): Prisma.audit_logWhereInput {
  const where: Prisma.audit_logWhereInput = {};

  if (f.actorType !== "all") where.actor_type = f.actorType;
  if (f.action) where.action = f.action;
  if (f.entity) where.entity = f.entity;
  if (f.entityId) where.entity_id = f.entityId;

  const actorId = f.actorId ? Number.parseInt(f.actorId, 10) : NaN;
  if (Number.isFinite(actorId)) where.actor_id = actorId;

  if (f.dateFrom || f.dateTo) {
    const occurred: Prisma.DateTimeFilter = {};
    if (f.dateFrom) occurred.gte = new Date(`${f.dateFrom}T00:00:00.000Z`);
    if (f.dateTo) occurred.lte = new Date(`${f.dateTo}T23:59:59.999Z`);
    where.occurred_at = occurred;
  }

  if (f.search) {
    where.OR = [
      { actor_name: { contains: f.search, mode: "insensitive" } },
      { actor_email: { contains: f.search, mode: "insensitive" } },
      { summary: { contains: f.search, mode: "insensitive" } },
      { entity: { contains: f.search, mode: "insensitive" } },
      { entity_id: { equals: f.search } },
    ];
  }

  return where;
}

/** `id` is a BigInt, which JSON.stringify refuses outright. */
function serialise(row: {
  id: bigint;
  occurred_at: Date;
  actor_id: number | null;
  actor_name: string | null;
  actor_email: string | null;
  actor_role: string | null;
  actor_type: string;
  action: string;
  entity: string;
  entity_id: string | null;
  row_count: number;
  changed: string[];
  before: unknown;
  after: unknown;
  summary: string | null;
  route: string | null;
  ip_address: string | null;
  user_agent: string | null;
}): AuditLogRow {
  return {
    id: row.id.toString(),
    occurredAt: row.occurred_at.toISOString(),
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    actorType: row.actor_type,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    rowCount: row.row_count,
    changed: row.changed,
    before: row.before,
    after: row.after,
    summary: row.summary,
    route: row.route,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
  };
}

const CSV_COLUMNS = [
  "When",
  "Who",
  "Email",
  "Role",
  "Type",
  "Action",
  "Record",
  "Record ID",
  "Rows",
  "What happened",
  "Changed fields",
  "Page",
  "IP address",
] as const;

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // Excel treats a leading =, +, - or @ as a formula; prefix to neutralise.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(rows: AuditLogRow[]): string {
  const lines = [CSV_COLUMNS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.occurredAt,
        r.actorName ?? "",
        r.actorEmail ?? "",
        r.actorRole ?? "",
        r.actorType,
        r.action,
        r.entity,
        r.entityId ?? "",
        r.rowCount,
        r.summary ?? "",
        r.changed.join(" | "),
        r.route ?? "",
        r.ipAddress ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  // BOM so Excel opens the UTF-8 correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await buildAccess(session.user.email);
    if (!access?.can("audit_log", "view")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const filters = parseFilters(sp);
    const where = buildWhere(filters);
    const wantsCsv = sp.get("format") === "csv";

    if (wantsCsv) {
      if (!access.can("audit_log", "export")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const rows = await prisma.audit_log.findMany({
        where,
        orderBy: { occurred_at: "desc" },
        take: MAX_EXPORT_ROWS,
      });

      // An export is itself an auditable event — data leaving the system.
      await logAuditEvent({
        action: "EXPORT",
        entity: "audit_log",
        rowCount: rows.length,
        detail: "audit log to CSV",
        meta: { rows: rows.length, filters },
      });

      const stamp = new Date().toISOString().slice(0, 10);
      return new NextResponse(toCsv(rows.map(serialise)), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="audit-log-${stamp}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const [rows, total] = await Promise.all([
      prisma.audit_log.findMany({
        where,
        orderBy: { occurred_at: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.audit_log.count({ where }),
    ]);

    return NextResponse.json({
      rows: rows.map(serialise),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      canExport: access.can("audit_log", "export"),
    });
  } catch (err) {
    console.error("[GET /api/audit-log]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
