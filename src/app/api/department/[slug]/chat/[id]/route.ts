import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { editMessage, deleteMessage } from "@/lib/department-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionUser = { email?: string | null };

// PATCH { body } → edit your own message.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const n = Number.parseInt(id, 10);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const { body } = (await req.json().catch(() => ({}))) as { body?: string };
  const text = (body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Empty message" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "Too long" }, { status: 400 });

  try {
    const message = await editMessage(n, user.email, text);
    if (!message) return NextResponse.json({ error: "Not found or not yours" }, { status: 403 });
    return NextResponse.json({ message });
  } catch (e) {
    console.error("[chat] edit failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Edit failed" }, { status: 500 });
  }
}

// DELETE → unsend your own message.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const n = Number.parseInt(id, 10);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  try {
    const ok = await deleteMessage(n, user.email);
    if (!ok) return NextResponse.json({ error: "Not found or not yours" }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[chat] unsend failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Unsend failed" }, { status: 500 });
  }
}
