import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { createAnnouncement, listAnnouncements, MAX_IMAGE_CHARS } from "@/lib/announcements";
import { canPostAnnouncement } from "@/lib/departments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionUser = { email?: string | null; name?: string | null; role?: string | null };

// GET → all announcements + whether the caller may post.
export async function GET() {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const announcements = await listAnnouncements();
    return NextResponse.json({ announcements, canPost: canPostAnnouncement(user.role) });
  } catch (e) {
    console.error("[announcements] list failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ announcements: [], canPost: canPostAnnouncement(user.role) });
  }
}

// POST { title, body, imageData? } → create (admins / HODs only).
export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canPostAnnouncement(user.role)) {
    return NextResponse.json({ error: "Only admins and HODs can post" }, { status: 403 });
  }

  const { title, body, imageData } = (await req.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    imageData?: string | null;
  };
  const t = (title ?? "").trim();
  const b = (body ?? "").trim();
  if (!t || !b) return NextResponse.json({ error: "Title and content required" }, { status: 400 });
  if (imageData && (typeof imageData !== "string" || !imageData.startsWith("data:image/"))) {
    return NextResponse.json({ error: "Invalid image" }, { status: 400 });
  }
  if (imageData && imageData.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ error: "Image too large (max ~1.5MB)" }, { status: 400 });
  }

  try {
    const announcement = await createAnnouncement({
      title: t,
      body: b,
      imageData: imageData ?? null,
      byEmail: user.email,
      byName: user.name ?? null,
    });
    return NextResponse.json({ announcement });
  } catch (e) {
    console.error("[announcements] create failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
