import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { deleteAnnouncement, updateAnnouncement, MAX_IMAGE_CHARS } from "@/lib/announcements";
import { canPostAnnouncement } from "@/lib/departments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionUser = { email?: string | null; role?: string | null };

// PATCH { title, body, imageData? } → edit an announcement (admins / HODs only).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canPostAnnouncement(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const n = Number.parseInt(id, 10);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

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
    const announcement = await updateAnnouncement(n, { title: t, body: b, imageData: imageData ?? null });
    if (!announcement) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ announcement });
  } catch (e) {
    console.error("[announcements] update failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

// DELETE → remove an announcement (admins / HODs only).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canPostAnnouncement(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const n = Number.parseInt(id, 10);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try {
    await deleteAnnouncement(n);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[announcements] delete failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
