import { NextResponse } from "next/server";
import { faSessionUser } from "@/lib/fa/auth";
import { fetchAllStudents } from "@/lib/fa/students.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Live + archived students from ebrightleads_db, mapped onto the FA Student
// shape, plus a load report describing any dropped rows.
export async function GET() {
  const user = await faSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { students, report } = await fetchAllStudents();
    return NextResponse.json({ students, report });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/fa/students] failed:", msg);
    return NextResponse.json({ error: "Failed to load students" }, { status: 500 });
  }
}
