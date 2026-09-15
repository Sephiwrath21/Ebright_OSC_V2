// ─────────────────────────────────────────────────────────────
// PATCH /api/hotfix-log/:id → curate an entry (reword its title, hide it)
//
// The ONLY write path into hotfix_log from the app. Everything else about a
// row is derived from a commit and owned by scripts/sync-changelog.ts.
//
// The schema accepts exactly two fields and the update names exactly two
// columns, so nothing here can touch what the sync owns — that is what
// guarantees a re-sync overwrites commit data without ever disturbing a
// human's edit, and equally that a curator cannot rewrite history.
//
// There is no DELETE: entries mirror commits, and a commit cannot be unmade.
// Hide it instead.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildAccess } from "@/lib/access/engine";
import { hotfixCurateSchema } from "@/lib/hotfix/types";
import { ENTRY_SELECT, serialiseEntry } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await buildAccess(session.user.email);
    if (!access?.can("hotfix_log", "update")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: idParam } = await params;
    const id = Number.parseInt(idParam, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Bad id" }, { status: 400 });
    }

    const parsed = hotfixCurateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid change", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { titleOverride, hidden } = parsed.data;

    const exists = await prisma.hotfix_log.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const row = await prisma.hotfix_log.update({
      where: { id },
      data: {
        // An empty string clears the override and restores the commit subject.
        ...(titleOverride !== undefined
          ? { title_override: titleOverride?.trim() ? titleOverride.trim() : null }
          : {}),
        ...(hidden !== undefined ? { hidden } : {}),
        curated_by: access.actor.userId,
        curated_at: new Date(),
        updated_at: new Date(),
      },
      select: ENTRY_SELECT,
    });

    // No explicit audit call — an ordinary write on the portal client, so the
    // audit extension records who curated what, before and after.
    return NextResponse.json({ row: serialiseEntry(row) });
  } catch (err) {
    console.error("[PATCH /api/hotfix-log/:id]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
