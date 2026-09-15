// ─────────────────────────────────────────────────────────────
// GET /api/hotfix-log → the changelog, grouped date → category → entries
//
// Read-only. Entries come from commits via scripts/sync-changelog.ts, so there
// is no POST here — the only writes are curation, on PATCH /api/hotfix-log/:id.
//
// Superadmin only. The gate is ACTION_CEILINGS in src/lib/access/types.ts,
// checked by Access.can() *before* the CEO view short-circuit — so this stays
// closed to the CEO too, unlike /api/audit-log.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildAccess } from "@/lib/access/engine";
import { groupEntries, type HotfixEntry } from "@/lib/hotfix/types";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Enough history to be useful without ever returning the whole table. */
const MAX_ENTRIES = 1000;

export const ENTRY_SELECT = {
  id: true,
  commit_sha: true,
  shipped_on: true,
  category: true,
  tag: true,
  title: true,
  title_override: true,
  details: true,
  author_name: true,
  hidden: true,
  curator: { select: { user_profile: { select: { full_name: true } }, email: true } },
} satisfies Prisma.hotfix_logSelect;

type Row = Prisma.hotfix_logGetPayload<{ select: typeof ENTRY_SELECT }>;

export function serialiseEntry(row: Row): HotfixEntry {
  const original = row.title;
  return {
    id: row.id,
    commitSha: row.commit_sha,
    // A @db.Date is UTC midnight; slice rather than localise, or the calendar
    // day shifts backwards in negative-offset timezones.
    shippedOn: row.shipped_on.toISOString().slice(0, 10),
    category: row.category,
    tag: row.tag,
    title: row.title_override?.trim() || original,
    originalTitle: original,
    titleOverride: row.title_override,
    details: row.details,
    authorName: row.author_name,
    hidden: row.hidden,
    curatedByName: row.curator?.user_profile?.full_name ?? row.curator?.email ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await buildAccess(session.user.email);
    if (!access?.can("hotfix_log", "view")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const category = sp.get("category")?.trim() || null;
    const tag = sp.get("tag")?.trim() || null;
    const search = sp.get("search")?.trim() || null;
    const includeHidden = sp.get("includeHidden") === "1";

    const where: Prisma.hotfix_logWhereInput = {
      ...(includeHidden ? {} : { hidden: false }),
      ...(category ? { category } : {}),
      ...(tag ? { tag } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { title_override: { contains: search, mode: "insensitive" } },
              { details: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, categories] = await Promise.all([
      prisma.hotfix_log.findMany({
        where,
        select: ENTRY_SELECT,
        // Newest day first; within a day, newest commit first.
        orderBy: [{ shipped_on: "desc" }, { id: "desc" }],
        take: MAX_ENTRIES,
      }),
      // Filter options come from the data, since categories are derived and
      // the set grows as the codebase does.
      prisma.hotfix_log.findMany({
        distinct: ["category"],
        select: { category: true },
        orderBy: { category: "asc" },
      }),
    ]);

    const entries = rows.map(serialiseEntry);

    return NextResponse.json({
      groups: groupEntries(entries),
      total: entries.length,
      categories: categories.map((c) => c.category),
      canCurate: access.can("hotfix_log", "update"),
    });
  } catch (err) {
    console.error("[GET /api/hotfix-log]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
