import { NextResponse } from "next/server";
import { pcmSessionUser } from "@/lib/pcm/auth";
import { fetchAllStudents } from "@/lib/pcm/students.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await pcmSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { students, report } = await fetchAllStudents();
    return NextResponse.json({ students, report });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/pcm/students] failed:", msg);
    return NextResponse.json({ error: "Failed to load students" }, { status: 500 });
  }
}
