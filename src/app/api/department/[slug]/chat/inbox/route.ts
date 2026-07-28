import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { listInbox, maxMessageId } from "@/lib/department-chat";
import { isDeptMember } from "@/lib/department-members";
import { canSeeAllDepartments } from "@/lib/departments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionUser = { email?: string | null; role?: string | null };

// GET ?sinceId=N  → messages addressed to me (private or Everyone) from others,
// newer than N. ?baseline=1 → just return the current max id (no messages), used
// on first load so old history doesn't fire notifications.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const allowed = canSeeAllDepartments(user.role) || (await isDeptMember(user.email, slug));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    if (req.nextUrl.searchParams.get("baseline")) {
      return NextResponse.json({ messages: [], maxId: await maxMessageId(slug) });
    }
    const sinceId = Number.parseInt(req.nextUrl.searchParams.get("sinceId") ?? "0", 10) || 0;
    const messages = await listInbox(slug, user.email, sinceId);
    return NextResponse.json({ messages });
  } catch (e) {
    console.error("[chat] inbox failed", slug, e instanceof Error ? e.message : e);
    return NextResponse.json({ messages: [] });
  }
}
