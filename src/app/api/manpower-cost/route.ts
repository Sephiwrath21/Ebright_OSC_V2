import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  COLUMNS,
  getTimeSlotsForDay,
  getWorkingDaysForBranch,
  isAdminSlot,
  isOpeningClosingSlot,
} from "@/lib/manpowerUtils";

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
  coachPay: number;
  execPay: number;
  totalPay: number;
  days: DailyHour[];
}

// Walk a schedule's selections and accumulate coach/exec hours per name per day.
function calculateHoursFromSelections(
  selections: Record<string, string>,
  branch: string,
): Record<string, { coachHrs: number; execHrs: number; totalHrs: number; days: { day: string; coachHrs: number; execHrs: number; totalHrs: number }[] }> {
  const allNames = new Set<string>();
  Object.values(selections).forEach(v => {
    if (v && v !== "None") allNames.add(v);
  });

  const stats: Record<
    string,
    {
      coachHrs: number;
      execHrs: number;
      totalHrs: number;
      days: { day: string; coachHrs: number; execHrs: number; totalHrs: number }[];
    }
  > = {};
  allNames.forEach(n => {
    stats[n] = { coachHrs: 0, execHrs: 0, totalHrs: 0, days: [] };
  });

  getWorkingDaysForBranch(branch).forEach(dayName => {
    const isWeekend = dayName === "Saturday" || dayName === "Sunday";
    const dailyTarget = isWeekend ? 10.5 : 5.0;

    allNames.forEach(emp => {
      let coach = 0;
      let worked = false;
      getTimeSlotsForDay(dayName, branch).forEach(slot => {
        if (isOpeningClosingSlot(slot, branch)) return;
        COLUMNS.forEach(col => {
          if (selections[`${dayName}-${slot}-${col.id}`] === emp) {
            worked = true;
            if (col.type === "coach") {
              coach += isAdminSlot(slot, branch) ? 0.25 : 1.25;
            }
          }
        });
      });
      if (worked) {
        const exec = Math.max(0, dailyTarget - coach);
        stats[emp].coachHrs += coach;
        stats[emp].execHrs += exec;
        stats[emp].totalHrs = stats[emp].coachHrs + stats[emp].execHrs;
        stats[emp].days.push({
          day: dayName,
          coachHrs: coach,
          execHrs: exec,
          totalHrs: coach + exec,
        });
      }
    });
  });

  return stats;
}

// Convert a day name + week start date to the actual ISO date for that day.
function dayNameToDate(dayName: string, startDateISO: string): string {
  const dayMap: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };
  const [sy, sm, sd] = startDateISO.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd);
  const startDow = start.getDay();
  const targetDow = dayMap[dayName] ?? 0;
  let diff = targetDow - startDow;
  if (diff < 0) diff += 7;
  const result = new Date(sy, sm - 1, sd + diff);
  const yyyy = result.getFullYear();
  const mm = String(result.getMonth() + 1).padStart(2, "0");
  const dd = String(result.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

    // 1. Fetch manpower schedules whose date falls within the requested month
    const rows = await prisma.manpower_schedule.findMany({
      where: {
        date: { gte: monthStart, lt: nextMonth },
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
        branch_duty_position: true,
        user_profile: true,
      },
    });

    const groups = new Map<string, {
      branchName: string;
      mondayISO: string;
      sundayISO: string;
      start_date: Date;
      end_date: Date;
      selections: Record<string, string>;
      branch: { branch_name: string };
    }>();

    const DAYS_LIST = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    function parseSingleTime(t: string) {
      const clean = t.toUpperCase().replace(/\s+/g, "");
      const isPM = clean.includes("PM");
      const timePart = clean.replace("AM", "").replace("PM", "");
      const sep = timePart.includes(".") ? "." : ":";
      const parts = timePart.split(sep);
      if (parts.length === 0) return null;
      let h = Number(parts[0]);
      const m = parts.length > 1 ? Number(parts[1]) : 0;
      if (isPM && h < 12) h += 12;
      if (!isPM && h === 12) h = 0;
      return { h, m };
    }

    function formatSlotTime(start: Date, end: Date): string {
      const fmt = (d: Date) => {
        const hours = d.getUTCHours();
        const minutes = d.getUTCMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 === 0 ? 12 : hours % 12;
        const displayMinutes = String(minutes).padStart(2, '0');
        return `${displayHours}:${displayMinutes} ${ampm}`;
      };
      return `${fmt(start)} - ${fmt(end)}`;
    }

    function parseWireSlotTimeRange(wireSlot: string) {
      const parts = wireSlot.split(/[-–—]/).map(s => s.trim());
      if (parts.length !== 2) return null;
      const start = parseSingleTime(parts[0]);
      const end = parseSingleTime(parts[1]);
      if (!start || !end) return null;
      return {
        startH: start.h,
        startM: start.m,
        endH: end.h,
        endM: end.m,
      };
    }

    function matchDbSlotToWireString(slotStart: Date, slotEnd: Date, branchName: string, dayName: string): string {
      const startH = slotStart.getUTCHours();
      const startM = slotStart.getUTCMinutes();
      const endH = slotEnd.getUTCHours();
      const endM = slotEnd.getUTCMinutes();

      const availableSlots = getTimeSlotsForDay(dayName, branchName);
      for (const wireSlot of availableSlots) {
        const parsed = parseWireSlotTimeRange(wireSlot);
        if (
          parsed &&
          parsed.startH === startH &&
          parsed.startM === startM &&
          parsed.endH === endH &&
          parsed.endM === endM
        ) {
          return wireSlot;
        }
      }
      return formatSlotTime(slotStart, slotEnd);
    }

    function normalizePositionToColId(label: string): string {
      const clean = label.toLowerCase().replace(/\s+/g, "");
      if (clean.includes("manager")) return "MANAGER";
      return clean;
    }

    rows.forEach(r => {
      const branchName = r.slot.branch_operating_day.branch.branch_name;
      const rowDate = r.date;
      
      const dayOfWeek = rowDate.getUTCDay(); // 0 is Sunday, 1 is Monday...
      const diff = rowDate.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(Date.UTC(rowDate.getUTCFullYear(), rowDate.getUTCMonth(), diff));
      const mondayISO = monday.toISOString().slice(0, 10);

      const sunday = new Date(monday);
      sunday.setUTCDate(sunday.getUTCDate() + 6);

      const key = `${branchName}:::${mondayISO}`;
      if (!groups.has(key)) {
        groups.set(key, {
          branchName,
          mondayISO,
          sundayISO: sunday.toISOString().slice(0, 10),
          start_date: monday,
          end_date: sunday,
          selections: {},
          branch: { branch_name: branchName },
        });
      }

      const g = groups.get(key)!;
      const dayName = DAYS_LIST[rowDate.getUTCDay()];
      const slotText = matchDbSlotToWireString(r.slot.slot_start, r.slot.slot_end, branchName, dayName);
      const colId = normalizePositionToColId(r.branch_duty_position.position_label);
      
      const selectionKey = `${dayName}-${slotText}-${colId}`;
      g.selections[selectionKey] = r.user_profile.nick_name || r.user_profile.full_name;
    });

    const schedules = Array.from(groups.values());

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

    // 3. Walk every schedule, compute hours per employee per day
    const aggregated = new Map<string, StaffResult>();

    schedules.forEach(sch => {
      const selections = (sch.selections ?? {}) as Record<string, string>;
      if (Object.keys(selections).length === 0) return;
      const branchName = sch.branch.branch_name;
      const startISO = sch.start_date.toISOString().slice(0, 10);

      const stats = calculateHoursFromSelections(selections, branchName);

      Object.entries(stats).forEach(([name, hrs]) => {
        if (hrs.totalHrs === 0) return;

        // Map day names to actual dates, filter to days within the month
        const daysInMonth = hrs.days
          .map(d => ({ ...d, date: dayNameToDate(d.day, startISO) }))
          .filter(d => d.date >= monthStartISO && d.date < nextMonthISO);
        if (daysInMonth.length === 0) return;

        const filteredCoach = daysInMonth.reduce((s, d) => s + d.coachHrs, 0);
        const filteredExec = daysInMonth.reduce((s, d) => s + d.execHrs, 0);

        // Resolve employee from selection name
        const info = resolveEmployee(name, branchName);
        const homeBranch = info?.branch ?? branchName;
        const key = `${(info?.displayName ?? name).toLowerCase()}:::${homeBranch.toLowerCase()}`;

        if (!aggregated.has(key)) {
          aggregated.set(key, {
            name: info?.displayName ?? name,
            nickName: info?.nickName ?? null,
            employeeId: info?.employeeId ?? null,
            branch: homeBranch,
            position: info?.position ?? null,
            rate: info?.rate ?? null,
            isPT: false,
            coachHrs: 0,
            execHrs: 0,
            totalHrs: 0,
            coachPay: 0,
            execPay: 0,
            totalPay: 0,
            days: [],
          });
        }
        const agg = aggregated.get(key)!;
        agg.coachHrs += filteredCoach;
        agg.execHrs += filteredExec;
        agg.totalHrs += filteredCoach + filteredExec;
        daysInMonth.forEach(d => {
          agg.days.push({
            day: d.day,
            date: d.date,
            coachHrs: d.coachHrs,
            execHrs: d.execHrs,
            totalHrs: d.totalHrs,
            scheduleBranch: branchName !== homeBranch ? branchName : undefined,
          });
        });
      });
    });

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

    // Available weeks (for the week filter dropdown)
    const weeksSet = new Set<string>();
    schedules.forEach(s => {
      const start = s.start_date.toISOString().slice(0, 10);
      const end = s.end_date.toISOString().slice(0, 10);
      weeksSet.add(`${start}:::${end}`);
    });
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
