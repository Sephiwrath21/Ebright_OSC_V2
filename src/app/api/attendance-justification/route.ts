import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";

export const dynamic = "force-dynamic";

// GET /api/attendance-justification?date=YYYY-MM-DD              → all justifications on a date
// GET /api/attendance-justification?from=YYYY-MM-DD&to=YYYY-MM-DD → date range
//
// Reads HRFS public.attendance_justification (the spec's table schema —
// emp_no, branch, emp_name, just_date, reason, evidence_url, evidence_name,
// justified_by, ...). Read-only for now; writes (POST/DELETE) come later.

interface JustRow {
  id: string;
  emp_no: string | null;
  branch: string | null;
  emp_name: string | null;
  just_date: string;
  reason: string | null;
  evidence_url: string | null;
  evidence_name: string | null;
  justified_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  let from: string;
  let to: string;
  if (dateParam) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    from = to = dateParam;
  } else if (fromParam && toParam) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromParam) || !/^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
      return NextResponse.json({ error: "Invalid from/to" }, { status: 400 });
    }
    from = fromParam;
    to = toParam;
  } else {
    return NextResponse.json(
      { error: "Provide ?date=YYYY-MM-DD or ?from=&to=" },
      { status: 400 },
    );
  }

  const res = await queryEbrightHrfs<JustRow>(
    `SELECT id::text, emp_no, branch, emp_name,
            to_char(just_date, 'YYYY-MM-DD') AS just_date,
            reason, evidence_url, evidence_name, justified_by,
            created_at::text, updated_at::text
       FROM public.attendance_justification
      WHERE just_date >= $1::date AND just_date <= $2::date
      ORDER BY just_date ASC, emp_no ASC`,
    [from, to],
  );

  // Convenience: index by (emp_no | date) so the Summary can ask "is X
  // justified on Y" in O(1).
  const byEmpNoDate: Record<string, JustRow> = {};
  for (const r of res.rows) {
    if (r.emp_no) byEmpNoDate[`${r.emp_no}|${r.just_date}`] = r;
  }

  return NextResponse.json({ from, to, rows: res.rows, byEmpNoDate });
}
