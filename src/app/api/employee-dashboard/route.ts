import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mytDateOnly } from "@/lib/myt";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";
import {
  getSelfAttendance,
  classifySelfDay,
  hoursForDay,
  overtimeForDay,
} from "@/lib/self-attendance";

export const dynamic = "force-dynamic";

const STAFF_ROLE_ID = 4;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      user_id:    true,
      role_id:    true,
      email:      true,
      created_at: true,
      user_profile: { select: { full_name: true, nick_name: true } },
      employment: {
        orderBy: { employment_id: "desc" },
        take: 1,
        select: {
          employee_id: true,
          position:    true,
          start_date:  true,
          branch:     { select: { branch_name: true, branch_code: true } },
          department: { select: { department_name: true } },
        },
      },
    },
  });

  if (!me) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  const employment = me.employment[0];
  const branchCode = employment?.branch?.branch_code ?? null;

  // Calendar bounds (MYT @db.Date space).
  const today      = mytDateOnly();
  const todayIso   = today.toISOString().slice(0, 10);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(),     1));
  const lastMStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const lastMEnd   = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(),     0));

  // Current ISO-week range (Mon..Sun) containing `today`.
  const dow         = today.getUTCDay();           // 0=Sun..6=Sat
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const weekStart   = new Date(today.getTime()); weekStart.setUTCDate(today.getUTCDate() - daysFromMon);
  const weekEnd     = new Date(weekStart.getTime()); weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  const iso = (d: Date) => d.toISOString().slice(0, 10);

  // One scan-sourced pass over the widest range we need (last month → end of
  // this week), plus the portal-side pending-leave total.
  const rangeStart = lastMStart.getTime() < weekStart.getTime() ? lastMStart : weekStart;
  const rangeEnd   = weekEnd.getTime()   > today.getTime()      ? weekEnd    : today;
  const [selfAtt, pendingLeaveAgg] = await Promise.all([
    getSelfAttendance(me.user_id, iso(rangeStart), iso(rangeEnd)),
    prisma.leave_request.aggregate({
      where: { user_id: me.user_id, status: "pending" },
      _sum:  { total_days: true },
    }),
  ]);
  const attDays = selfAtt.days;

  // ── Monthly KPIs (present / elapsed working days, from scans) ──────────────
  const monthlyStats = (from: Date, to: Date) => {
    let present = 0;
    let elapsed = 0;
    let late = 0;
    let overtime = 0;
    for (const d = new Date(from.getTime()); d.getTime() <= to.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
      const key = iso(d);
      const info = attDays.get(key);
      if (!info) continue;
      const { state } = classifySelfDay(info, key, todayIso);
      // Only real, elapsed working days count toward the ratio.
      if (state === "offday" || state === "holiday" || state === "upcoming") continue;
      elapsed++;
      if (info.checkIn) {
        present++;
        if (state === "late") late++;
      }
      overtime += overtimeForDay(info);
    }
    return { present, elapsed, late, overtime };
  };

  const thisMonth = monthlyStats(monthStart, today);
  const lastMonth = monthlyStats(lastMStart, lastMEnd);

  const thisMonthPercent = thisMonth.elapsed > 0 ? Math.min(100, Math.round((thisMonth.present / thisMonth.elapsed) * 100)) : 0;
  const lastMonthPercent = lastMonth.elapsed > 0 ? Math.min(100, Math.round((lastMonth.present / lastMonth.elapsed) * 100)) : 0;
  const lateThisMonth = thisMonth.late;
  const overtimeHrs = Math.round(thisMonth.overtime * 10) / 10;

  // ── This-week breakdown (the user's own scheduled days) ────────────────────
  const fmtClock = (d: Date) => {
    const h24 = d.getUTCHours();
    const mm = d.getUTCMinutes();
    const ampm = h24 >= 12 ? "PM" : "AM";
    let h = h24 % 12; if (h === 0) h = 12;
    return `${h}:${String(mm).padStart(2, "0")} ${ampm}`;
  };

  type WeekDay = {
    day:      string;
    dateIso:  string;
    state:    "ontime" | "late" | "today" | "absent" | "upcoming" | "holiday";
    label:    string;
    minutesLate?: number;
    justification?: { reason: string | null; status: string };
  };

  const weekDays: WeekDay[] = [];
  let totalWeekHours = 0;
  let onTimeWeek  = 0;
  let lateWeek    = 0;
  let absentWeek  = 0;
  let holidayWeek = 0;
  let elapsedWeekDays = 0;

  for (const cur = new Date(weekStart.getTime()); cur.getTime() <= weekEnd.getTime(); cur.setUTCDate(cur.getUTCDate() + 1)) {
    const key = iso(cur);
    const info = attDays.get(key);
    if (!info || !info.slot) continue; // off day / no schedule → not shown

    const cDow = cur.getUTCDay();
    const { state: rawState, minutesLate: mins } = classifySelfDay(info, key, todayIso);
    if (cur.getTime() <= today.getTime() && !info.holidayName) elapsedWeekDays++;
    totalWeekHours += hoursForDay(info);

    let state: WeekDay["state"];
    let label: string;
    if (info.holidayName) {
      state = "holiday"; label = info.holidayName; holidayWeek++;
    } else if (rawState === "late" && info.checkIn) {
      state = "late"; label = `Late ${mins}m · ${fmtClock(info.checkIn)}`; lateWeek++;
    } else if (rawState === "ontime" && info.checkIn) {
      state = "ontime"; label = `On time · ${fmtClock(info.checkIn)}`; onTimeWeek++;
    } else if (rawState === "today") {
      state = "today"; label = "Today";
    } else if (rawState === "upcoming") {
      state = "upcoming"; label = DAY_NAMES[cDow];
    } else {
      state = "absent"; label = "Absent"; absentWeek++;
    }

    weekDays.push({ day: DAY_NAMES[cDow], dateIso: key, state, label, minutesLate: mins });
  }

  // Annotate absent/late days with any justification the employee has on HRFS
  // (their own pending submissions, or an HR-approved/rejected decision). Best
  // effort — an HRFS outage must not break the dashboard.
  const empNo = selfAtt.empNo ?? "";
  if (empNo) {
    try {
      const jres = await queryEbrightHrfs<{
        just_date: string;
        reason: string | null;
        status: string | null;
      }>(
        `SELECT to_char(just_date, 'YYYY-MM-DD') AS just_date, reason, status
           FROM public.attendance_justification
          WHERE emp_no = $1 AND just_date >= $2::date AND just_date <= $3::date`,
        [empNo, iso(weekStart), iso(weekEnd)],
      );
      const byDate = new Map(jres.rows.map((r) => [r.just_date, r]));
      for (const wd of weekDays) {
        const j = byDate.get(wd.dateIso);
        if (j) wd.justification = { reason: j.reason, status: j.status ?? "pending" };
      }
    } catch {
      // Leave justifications unset; the dashboard still renders.
    }
  }

  const weekOnTimePercent = elapsedWeekDays > 0
    ? Math.round((onTimeWeek / elapsedWeekDays) * 100)
    : 0;

  const pendingLeaveDays = Number(pendingLeaveAgg._sum.total_days ?? 0);

  return NextResponse.json({
    success: true,
    isEmployee: me.role_id === STAFF_ROLE_ID,
    viewer: {
      fullName:   me.user_profile?.full_name ?? null,
      nickName:   me.user_profile?.nick_name ?? null,
      email:      me.email,
      employeeId: employment?.employee_id  ?? null,
      position:   employment?.position     ?? null,
      branchName: employment?.branch?.branch_name ?? null,
      branchCode,
      department: employment?.department?.department_name ?? null,
      startDate:  employment?.start_date   ?? null,
      createdAt:  me.created_at,
    },
    attendance: {
      thisMonthPercent,
      lastMonthPercent,
      delta:         thisMonthPercent - lastMonthPercent,
      lateThisMonth,
    },
    week: {
      rangeStart:    weekStart.toISOString().slice(0, 10),
      rangeEnd:      weekEnd.toISOString().slice(0, 10),
      onTimePercent: weekOnTimePercent,
      onTimeCount:   onTimeWeek,
      lateCount:     lateWeek,
      absentCount:   absentWeek,
      holidayCount:  holidayWeek,
      totalHours:    Math.round(totalWeekHours * 10) / 10,
      days:          weekDays,
    },
    leave:    { pendingDays: pendingLeaveDays },
    overtime: { thisMonthHours: overtimeHrs },
  });
}
