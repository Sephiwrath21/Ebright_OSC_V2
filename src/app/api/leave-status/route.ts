import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";

export const dynamic = "force-dynamic";

// GET /api/leave-status?date=YYYY-MM-DD            → leaves on a single date
// GET /api/leave-status?from=YYYY-MM-DD&to=YYYY-MM-DD → leaves in a date range (inclusive)
//
// Returns leaves from HRFS public."LeaveTransaction" keyed by EmployeeCode
// AND EmployeeName (legacy rows have NULL EmployeeCode). Caller picks the
// match strategy. Approved leaves only (ApplyStatus = 'A').

interface LeaveRow {
  EmployeeCode: string | null;
  EmployeeName: string | null;
  LeaveTypeCode: string | null;
  LeaveDate: string; // to_char'd
  ApplyReason: string | null;
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
    from = dateParam;
    to = dateParam;
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

  const res = await queryEbrightHrfs<LeaveRow>(
    `SELECT "EmployeeCode", "EmployeeName", "LeaveTypeCode",
            to_char("LeaveDate", 'YYYY-MM-DD') AS "LeaveDate",
            "ApplyReason"
       FROM public."LeaveTransaction"
      WHERE "LeaveDate" >= $1::date AND "LeaveDate" <= $2::date
        AND "ApplyStatus" = 'A'`,
    [from, to],
  );

  // Two indexed maps for convenience — by empNo and by name (lowercased,
  // legacy rows often lack EmployeeCode).
  const byEmpNo: Record<string, LeaveRow[]> = {};
  const byName: Record<string, LeaveRow[]> = {};
  for (const r of res.rows) {
    if (r.EmployeeCode) (byEmpNo[r.EmployeeCode] ??= []).push(r);
    if (r.EmployeeName) (byName[r.EmployeeName.trim().toLowerCase()] ??= []).push(r);
  }

  return NextResponse.json({ from, to, rows: res.rows, byEmpNo, byName });
}
