import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { touchPresence } from "@/lib/presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Heartbeat: the browser pings this on an interval; we mark the signed-in user
// as currently active. No body needed — identity comes from the session.
export async function POST() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ ok: false }, { status: 401 });
  touchPresence(email);
  return NextResponse.json({ ok: true });
}
