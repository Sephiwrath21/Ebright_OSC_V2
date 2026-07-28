import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Executive rate is fixed for all PT staff. Mirrors the old project.
const EXECUTIVE_RATE = 11;

// The report is coach-pay only — everything that isn't a PT/FT Coach
// (BM, CEO, HOD, EXEC, INTERN, ...) must never end up in it. A deny-list of
// exclusion keywords drifts out of sync with actual position strings (e.g.
// branch managers are stored as "BM", not "BRANCH MANAGER"), so require the
// position to actually say "COACH" instead of trying to exclude everything
// that isn't one.
const COACH_POSITION_KEYWORD = "COACH";

interface DailyHour {
  day: string;
  date: string;
  coachHrs: number;
  execHrs: number;
  totalHrs: number;
  classes: number;
  scheduleBranch?: string;
}

interface StaffResult {
  name: string;
  nickName: string | null;
  employeeId: string | null;
  branch: string;
  position: string | null;
  rate: number | null;
  isPT: boolean;
  coachHrs: number;
  execHrs: number;
  totalHrs: number;
  classes: number;
  coachPay: number;
  execPay: number;
  totalPay: number;
  days: DailyHour[];
}

// role_id 6 = staff. Combined with a coach position this triggers the
// employee-only view (the user can only see their own row).
const STAFF_ROLE_ID = 6;
const COACH_POSITION_PATTERNS = [
  /^PT(\s|-|$)/,
  /^FT(\s|-|$)/,
  /PART\s*-?\s*TIME/,
  /FULL\s*-?\s*TIME/,
  /COACH/,
];

function isCoachPosition(position: string | null | undefined): boolean {
  if (!position) return false;
  const p = position.toUpperCase().trim();
  return COACH_POSITION_PATTERNS.some(rx => rx.test(p));
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { success: false, error: "Unauthorised" },
      { status: 401 },
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month"); // "YYYY-MM"
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { success: false, error: "month parameter required (YYYY-MM)" },
        { status: 400 },
      );
    }

    // Look up the logged-in user to decide whether to scope results to just
    // their own row (employee view).
    const me = await prisma.users.findUnique({
      where: { email: session.user.email },
      select: {
        user_id: true,
        role_id: true,
        user_profile: { select: { full_name: true, nick_name: true } },
        employment: {
          orderBy: { employment_id: "desc" },
          take: 1,
          select: {
            employee_id: true,
            position: true,
            employment_type: true,
            rate: true,
            branch: { select: { branch_name: true } },
          },
        },
      },
    });
    const myEmployment = me?.employment[0] ?? null;
    const myPosition = myEmployment?.position ?? null;
    const isEmployeeView =
      me?.role_id === STAFF_ROLE_ID && isCoachPosition(myPosition);
    const myFullNameLc = me?.user_profile?.full_name?.toLowerCase().trim() ?? "";
    const myNickLc = me?.user_profile?.nick_name?.toLowerCase().trim() ?? "";

    const [yearStr, monStr] = month.split("-");
    const year = Number(yearStr);
    const mon = Number(monStr);
    const monthStartISO = `${yearStr}-${monStr}-01`;
    const nextMonthISO =
      mon === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(mon + 1).padStart(2, "0")}-01`;
    const monthStart = new Date(`${monthStartISO}T00:00:00Z`);
    const nextMonth = new Date(`${nextMonthISO}T00:00:00Z`);

    // 0. Which weeks have been Finalized & Archived — the cost report follows
    //    the archived schedule, so only these weeks feed it. Keyed by
    //    `${branchName}:::${periodStartISO}` (period_start is the Monday).
    const archivedPeriods = await prisma.schedule_period_status.findMany({
      where: { status: "archived" },
      include: { branch: { select: { branch_name: true } } },
    });
    const archivedWeekKeys = new Set(
      archivedPeriods.map(
        p => `${p.branch.branch_name}:::${p.period_start.toISOString().slice(0, 10)}`,
      ),
    );

    // 1. Fetch the ACTUAL manpower schedules whose date falls in the month.
    //    (Planning/draft rows are ignored — the report tracks what actually
    //    happened, and only for archived weeks, filtered below.)
    const rows = await prisma.manpower_schedule.findMany({
      where: {
        date: { gte: monthStart, lt: nextMonth },
        schedule_type: "actual",
      },
      include: {
        slot: {
          include: {
            branch_operating_day: {
              include: {
                branch: { select: { branch_name: true } },
              },
            },
          },
        },
        branch_position: true,
        user_profile: true,
      },
    });

    const DAYS_LIST = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const WD_ABBREV = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const toMin = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();

    // Operating span per (branch, weekday) — earliest slot start → latest slot
    // end across ALL of the branch's slots that day (opening/closing included).
    // Executive time = this span minus a person's class hours, mirroring the
    // grid's Weekly Hours Summary so the report and the schedule always agree.
    const branchNames = Array.from(
      new Set(rows.map(r => r.slot.branch_operating_day.branch.branch_name)),
    );
    const branchSlots = branchNames.length
      ? await prisma.slot.findMany({
          where: {
            branch_operating_day: {
              is_active: true,
              branch: { branch_name: { in: branchNames } },
            },
          },
          include: {
            branch_operating_day: { include: { branch: { select: { branch_name: true } } } },
          },
        })
      : [];
    const spanAgg = new Map<string, { min: number; max: number }>();
    for (const s of branchSlots) {
      const key = `${s.branch_operating_day.branch.branch_name}:::${s.branch_operating_day.day_of_week}`;
      const start = toMin(s.slot_start);
      const end = toMin(s.slot_end);
      const cur = spanAgg.get(key);
      if (!cur) spanAgg.set(key, { min: start, max: end });
      else {
        if (start < cur.min) cur.min = start;
        if (end > cur.max) cur.max = end;
      }
    }
    const spanHrs = (branch: string, wd: string): number => {
      const v = spanAgg.get(`${branch}:::${wd}`);
      return v ? (v.max - v.min) / 60 : 0;
    };

    // Active seats per date (branch_position_day.is_active) — mirrors the grid's
    // per-day column activation. An assignment left in a seat that was later
    // DEACTIVATED (a "stale"/hidden column) is not shown in the schedule, so it
    // must not count in the report either. Keyed `${position_id}:::${dateISO}`.
    const activeDayRows = await prisma.branch_position_day.findMany({
      where: { date: { gte: monthStart, lt: nextMonth }, is_active: true },
      select: { branch_position_id: true, date: true },
    });
    const activeSeatSet = new Set(
      activeDayRows.map(r => `${r.branch_position_id}:::${r.date.toISOString().slice(0, 10)}`),
    );

    // 2. Fetch all active employees with employment + profile, build name lookup
    const employees = await prisma.users.findMany({
      where: { status: "active", deleted_at: null },
      select: {
        user_id: true,
        user_profile: { select: { full_name: true, nick_name: true } },
        employment: {
          orderBy: { employment_id: "desc" },
          take: 1,
          select: {
            employee_id: true,
            position: true,
            employment_type: true,
            rate: true,
            branch: { select: { branch_name: true } },
          },
        },
      },
    });

    // Lookup map: lowercase name (nickname OR full name) -> employee record.
    // displayName is always full_name — that's what the cost report shows —
    // but we index BOTH the nickname and full_name so lookups against schedule
    // selections still hit (those store whatever was picked in the dropdown,
    // typically the nickname).
    interface EmpInfo {
      displayName: string; // full_name, always
      nickName: string | null;
      employeeId: string | null;
      branch: string;
      position: string | null;
      employmentType: string | null;
      rate: number | null;
    }
    // Multiple employees can share a nickname or even a full name, so each key
    // maps to a LIST of candidates rather than a single record. Blindly
    // overwriting on collision (previous behaviour) silently merged one
    // employee's hours into an unrelated namesake's row.
    const empByName = new Map<string, EmpInfo[]>();
    const addCandidate = (key: string, info: EmpInfo) => {
      const list = empByName.get(key);
      if (list) list.push(info);
      else empByName.set(key, [info]);
    };
    employees.forEach(u => {
      const emp = u.employment[0];
      if (!emp?.branch?.branch_name) return;
      const fullName = u.user_profile?.full_name?.trim();
      const nickName = u.user_profile?.nick_name?.trim();
      if (!fullName && !nickName) return;
      const rateNum = emp.rate ? Number(emp.rate) : null;
      const info: EmpInfo = {
        displayName: fullName || nickName || "",
        nickName: nickName || null,
        employeeId: emp.employee_id ?? null,
        branch: emp.branch.branch_name,
        position: emp.position ?? null,
        employmentType: emp.employment_type ?? null,
        rate: rateNum && !Number.isNaN(rateNum) ? rateNum : null,
      };
      if (fullName) addCandidate(fullName.toLowerCase(), info);
      if (nickName && nickName.toLowerCase() !== fullName?.toLowerCase()) {
        addCandidate(nickName.toLowerCase(), info);
      }
    });
    // Resolve a schedule selection name to a single employee, disambiguating
    // collisions by preferring whichever candidate's home branch matches the
    // branch the schedule itself belongs to (dropdown picks are branch-scoped).
    function resolveEmployee(name: string, scheduleBranch: string): EmpInfo | undefined {
      const candidates = empByName.get(name.toLowerCase());
      if (!candidates || candidates.length === 0) return undefined;
      if (candidates.length === 1) return candidates[0];
      const branchLc = scheduleBranch.toLowerCase();
      return (
        candidates.find(c => c.branch.toLowerCase() === branchLc) ?? candidates[0]
      );
    }

    // 3. Accumulate hours per (person, date) DIRECTLY from the actual DB slots.
    //    Class positions (coach / star_coach / training) contribute their real
    //    slot duration as coach hours + one class each. Manager seats are skipped
    //    entirely; executive time is the day's span remainder (computed below).
    //    Only Finalized & Archived weeks are counted.
    const CLASS_TYPES = new Set(["coach", "star_coach", "training"]);
    type DayAcc = { branch: string; wd: string; coachHrs: number; classes: number };
    const perPersonDate = new Map<string, Map<string, DayAcc>>();
    const personMeta = new Map<string, { name: string; info?: EmpInfo; branch: string }>();
    const weeksSet = new Set<string>();

    for (const r of rows) {
      if (r.branch_position.position_type === "manager") continue;
      const branchName = r.slot.branch_operating_day.branch.branch_name;
      const rawDate = r.date;
      const dateISO = rawDate.toISOString().slice(0, 10);

      // Skip assignments left in a seat that was deactivated for that date
      // (hidden in the schedule → must not count in the report).
      if (!activeSeatSet.has(`${r.position_id}:::${dateISO}`)) continue;

      // Skip weeks that haven't been Finalized & Archived.
      const dow = rawDate.getUTCDay();
      const monDiff = rawDate.getUTCDate() - dow + (dow === 0 ? -6 : 1);
      const monday = new Date(Date.UTC(rawDate.getUTCFullYear(), rawDate.getUTCMonth(), monDiff));
      const mondayISO = monday.toISOString().slice(0, 10);
      if (!archivedWeekKeys.has(`${branchName}:::${mondayISO}`)) continue;

      const rawName = r.user_profile.nick_name || r.user_profile.full_name;
      if (!rawName) continue;
      const info = resolveEmployee(rawName, branchName);
      const homeBranch = info?.branch ?? branchName;
      const personKey = `${(info?.displayName ?? rawName).toLowerCase()}:::${homeBranch.toLowerCase()}`;
      if (!personMeta.has(personKey)) {
        personMeta.set(personKey, { name: info?.displayName ?? rawName, info, branch: homeBranch });
      }

      const wd = WD_ABBREV[dow];
      let dm = perPersonDate.get(personKey);
      if (!dm) { dm = new Map(); perPersonDate.set(personKey, dm); }
      let acc = dm.get(dateISO);
      if (!acc) { acc = { branch: branchName, wd, coachHrs: 0, classes: 0 }; dm.set(dateISO, acc); }

      if (CLASS_TYPES.has(r.branch_position.position_type)) {
        acc.coachHrs += (toMin(r.slot.slot_end) - toMin(r.slot.slot_start)) / 60;
        acc.classes += 1;
      }

      const sunday = new Date(monday);
      sunday.setUTCDate(sunday.getUTCDate() + 6);
      weeksSet.add(`${mondayISO}:::${sunday.toISOString().slice(0, 10)}`);
    }

    // 4. Build a StaffResult per person; exec = day span − class hours per day.
    const aggregated = new Map<string, StaffResult>();
    for (const [personKey, dm] of perPersonDate) {
      const meta = personMeta.get(personKey)!;
      const info = meta.info;
      const days: DailyHour[] = [];
      let coachTotal = 0, execTotal = 0, classesTotal = 0;
      for (const [dateISO, acc] of dm) {
        if (dateISO < monthStartISO || dateISO >= nextMonthISO) continue;
        const span = spanHrs(acc.branch, acc.wd);
        const exec = Math.max(0, span - acc.coachHrs);
        coachTotal += acc.coachHrs;
        execTotal += exec;
        classesTotal += acc.classes;
        const dayName = DAYS_LIST[new Date(`${dateISO}T00:00:00Z`).getUTCDay()];
        days.push({
          day: dayName,
          date: dateISO,
          coachHrs: acc.coachHrs,
          execHrs: exec,
          totalHrs: acc.coachHrs + exec,
          classes: acc.classes,
          scheduleBranch: acc.branch !== meta.branch ? acc.branch : undefined,
        });
      }
      if (days.length === 0) continue;
      days.sort((a, b) => a.date.localeCompare(b.date));
      aggregated.set(personKey, {
        name: meta.name,
        nickName: info?.nickName ?? null,
        employeeId: info?.employeeId ?? null,
        branch: meta.branch,
        position: info?.position ?? null,
        rate: info?.rate ?? null,
        isPT: false,
        coachHrs: coachTotal,
        execHrs: execTotal,
        totalHrs: coachTotal + execTotal,
        classes: classesTotal,
        coachPay: 0,
        execPay: 0,
        totalPay: 0,
        days,
      });
    }

    // 4. Keep only PT/FT Coach positions (drops BM, CEO, HOD, EXEC, INTERN,
    //    unmatched/blank positions, and training rows).
    const allResults: StaffResult[] = [];
    aggregated.forEach(r => {
      const pos = (r.position ?? "").toUpperCase();
      const name = r.name.toUpperCase();
      if (!pos.includes(COACH_POSITION_KEYWORD)) return;
      if (name.includes("(TRAINING)")) return;
      allResults.push(r);
    });

    // 5. Determine PT vs FT and compute pay
    allResults.forEach(r => {
      const roleStr = (r.position ?? "").toUpperCase();
      const isPT =
        roleStr.startsWith("PT") ||
        roleStr.includes("PT -") ||
        roleStr.includes("PART-TIME") ||
        roleStr.includes("PART TIME");
      r.isPT = isPT;
      const hasRate = r.rate !== null && r.rate > 0;
      if (isPT && hasRate) {
        r.coachPay = r.coachHrs * (r.rate ?? 0);
        r.execPay = r.execHrs * EXECUTIVE_RATE;
        r.totalPay = r.coachPay + r.execPay;
      }
      // sort daily entries
      r.days.sort((a, b) => a.date.localeCompare(b.date));
    });

    // Sort: PT first, then by name
    allResults.sort((a, b) => {
      if (a.isPT !== b.isPT) return a.isPT ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    // For employee accounts (role_id 6 + coach position), keep ONLY their own
    // row. Match against full_name OR nick_name (lowercased). Fail closed: if
    // we can't identify them, return an empty list rather than the full set.
    let visibleResults = allResults;
    if (isEmployeeView) {
      visibleResults = allResults.filter(r => {
        const lc = r.name.toLowerCase().trim();
        return (
          (myFullNameLc && lc === myFullNameLc) ||
          (myNickLc && lc === myNickLc)
        );
      });
    }

    // 6. Totals — computed over the visible slice so the KPI cards are
    // consistent with what the user can see.
    const ptResults = visibleResults.filter(r => r.isPT);
    const totals = {
      totalStaff: visibleResults.length,
      ptCount: ptResults.length,
      ftCount: visibleResults.length - ptResults.length,
      totalCoachHrs: visibleResults.reduce((s, r) => s + r.coachHrs, 0),
      totalExecHrs: visibleResults.reduce((s, r) => s + r.execHrs, 0),
      totalHrs: visibleResults.reduce((s, r) => s + r.totalHrs, 0),
      totalCoachPay: ptResults.reduce((s, r) => s + r.coachPay, 0),
      totalExecPay: ptResults.reduce((s, r) => s + r.execPay, 0),
      totalPay: ptResults.reduce((s, r) => s + r.totalPay, 0),
      executiveRate: EXECUTIVE_RATE,
    };

    // Available weeks (for the week filter dropdown) — the archived weeks seen
    // while accumulating above.
    const availableWeeks = Array.from(weeksSet)
      .map(w => {
        const [start, end] = w.split(":::");
        return { start, end };
      })
      .sort((a, b) => a.start.localeCompare(b.start));

    return NextResponse.json({
      success: true,
      month,
      totals,
      staff: visibleResults,
      availableWeeks,
      isEmployeeView,
      viewer: isEmployeeView
        ? (() => {
            const posUpper = (myPosition ?? "").toUpperCase();
            const isPT =
              posUpper.startsWith("PT") ||
              posUpper.includes("PT -") ||
              posUpper.includes("PART-TIME") ||
              posUpper.includes("PART TIME");
            const rateNum = myEmployment?.rate ? Number(myEmployment.rate) : null;
            return {
              name: me?.user_profile?.full_name ?? me?.user_profile?.nick_name ?? "",
              position: myPosition,
              employeeId: myEmployment?.employee_id ?? null,
              branch: myEmployment?.branch?.branch_name ?? "",
              isPT,
              rate: rateNum && !Number.isNaN(rateNum) ? rateNum : null,
            };
          })()
        : null,
    });
  } catch (err) {
    console.error("[GET /api/manpower-cost]", err);
    return NextResponse.json(
      { success: false, error: "Failed to calculate manpower cost" },
      { status: 500 },
    );
  }
}
