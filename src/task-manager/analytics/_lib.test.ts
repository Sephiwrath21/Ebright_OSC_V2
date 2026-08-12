// Pure-helper tests for the analytics shared lib (_lib.ts): window resolution
// (incl. month boundaries), bucket mapping, the dueAt-else-startedAt period rule,
// and Unassigned grouping. The DB modules are vi.mock'ed (repo pattern — see
// server/engine/*.test.ts) so importing _lib never touches Postgres.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/task-manager/prisma", () => ({ prisma: {} }));
vi.mock("@/task-manager/lib/users", () => ({ getUsersByIds: vi.fn() }));

import type { BlockStatus, Role } from "@/generated/task-manager-client";
import {
  analyticsQuerySchema,
  bucketOf,
  CADENCE_FOR_PERIOD,
  clampWindowToMonthDays,
  canViewEntity,
  canViewMember,
  canViewOrg,
  countBuckets,
  dateSchema,
  formatLocalDate,
  groupBranchesByRegion,
  groupByAssignerRole,
  groupByDimension,
  inWindow,
  isElevatedDeptSite,
  memberSortRank,
  parseLocalDate,
  resolveWindow,
  sortTaskRows,
  UNASSIGNED,
  withAllDepartments,
  type ScopeUser,
  type TaskRow,
} from "./_lib";

// ---------- window resolution ----------

describe("resolveWindow", () => {
  it("daily = [startOfDay, startOfNextDay) of the date param, local time", () => {
    const w = resolveWindow("daily", "2026-07-16");
    expect(w.start).toEqual(new Date(2026, 6, 16, 0, 0, 0, 0));
    expect(w.end).toEqual(new Date(2026, 6, 17, 0, 0, 0, 0));
  });

  it("daily defaults to today (now) when no date is given", () => {
    const now = new Date(2026, 6, 16, 15, 42, 13);
    const w = resolveWindow("daily", undefined, now);
    expect(w.start).toEqual(new Date(2026, 6, 16));
    expect(w.end).toEqual(new Date(2026, 6, 17));
  });

  it("daily rolls over month boundaries (Jan 31 → Feb 1 end)", () => {
    const w = resolveWindow("daily", "2026-01-31");
    expect(w.start).toEqual(new Date(2026, 0, 31));
    expect(w.end).toEqual(new Date(2026, 1, 1));
  });

  it("monthly = [1st of month, 1st of next month)", () => {
    const w = resolveWindow("monthly", "2026-07-16");
    expect(w.start).toEqual(new Date(2026, 6, 1));
    expect(w.end).toEqual(new Date(2026, 7, 1));
  });

  it("monthly handles the December → January year boundary", () => {
    const w = resolveWindow("monthly", "2026-12-05");
    expect(w.start).toEqual(new Date(2026, 11, 1));
    expect(w.end).toEqual(new Date(2027, 0, 1));
  });

  it("monthly handles February in a leap year (window covers Feb 29)", () => {
    const w = resolveWindow("monthly", "2028-02-10");
    expect(w.start).toEqual(new Date(2028, 1, 1));
    expect(w.end).toEqual(new Date(2028, 2, 1));
    expect(new Date(2028, 1, 29, 12) >= w.start && new Date(2028, 1, 29, 12) < w.end).toBe(true);
  });

  it("monthly without a date uses now's month", () => {
    const w = resolveWindow("monthly", undefined, new Date(2026, 6, 16, 9));
    expect(w.start).toEqual(new Date(2026, 6, 1));
    expect(w.end).toEqual(new Date(2026, 7, 1));
  });

  it("carries the period through, for fetchPeriodBlocks' cadence-tag branch", () => {
    expect(resolveWindow("daily", "2026-07-16").period).toBe("daily");
    expect(resolveWindow("monthly", "2026-07-16").period).toBe("monthly");
  });
});

describe("clampWindowToMonthDays — the Monthly 7-day range dropdown (2026-07-29)", () => {
  const july = resolveWindow("monthly", "2026-07-15");

  it("1-7 → [1st, 8th) of the anchor month", () => {
    const w = clampWindowToMonthDays(july, 1, 7);
    expect(w.start).toEqual(new Date(2026, 6, 1));
    expect(w.end).toEqual(new Date(2026, 6, 8));
  });

  it("29-31 (last partial chunk) → [29th, next month 1st)", () => {
    const w = clampWindowToMonthDays(july, 29, 31);
    expect(w.start).toEqual(new Date(2026, 6, 29));
    expect(w.end).toEqual(new Date(2026, 7, 1));
  });

  it("29-30 in a 30-day month ends exactly at the next month", () => {
    const june = resolveWindow("monthly", "2026-06-10");
    const w = clampWindowToMonthDays(june, 29, 30);
    expect(w.start).toEqual(new Date(2026, 5, 29));
    expect(w.end).toEqual(new Date(2026, 6, 1));
  });

  it("out-of-range values only shrink, never widen (29-31 in 28-day Feb → empty)", () => {
    const feb = resolveWindow("monthly", "2027-02-10"); // 2027: non-leap, 28 days
    const w = clampWindowToMonthDays(feb, 29, 31);
    // JS date overflow rolls Feb 29 into March; the clamp caps end at the
    // window's own end, so start >= end — an empty range, not a leak.
    expect(w.start >= w.end).toBe(true);
  });

  it("no-op for daily windows", () => {
    const day = resolveWindow("daily", "2026-07-16");
    expect(clampWindowToMonthDays(day, 1, 7)).toEqual(day);
  });
});

describe("CADENCE_FOR_PERIOD", () => {
  it("maps daily/monthly to the RunBlock.cadences enum values", () => {
    expect(CADENCE_FOR_PERIOD.daily).toBe("DAILY");
    expect(CADENCE_FOR_PERIOD.monthly).toBe("MONTHLY");
  });
});

describe("parseLocalDate / formatLocalDate", () => {
  it("parses YYYY-MM-DD as LOCAL midnight, not UTC", () => {
    const d = parseLocalDate("2026-07-16");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(16);
    expect(d.getHours()).toBe(0);
  });

  it("round-trips with formatLocalDate (zero-padded)", () => {
    expect(formatLocalDate(parseLocalDate("2026-01-05"))).toBe("2026-01-05");
    expect(formatLocalDate(new Date(2026, 10, 30, 23, 59))).toBe("2026-11-30");
  });
});

describe("query validation", () => {
  it("accepts a well-formed date and both periods", () => {
    expect(analyticsQuerySchema.parse({ period: "monthly", date: "2026-07-16" })).toEqual({
      period: "monthly",
      date: "2026-07-16",
    });
  });

  it("defaults period to daily when omitted", () => {
    expect(analyticsQuerySchema.parse({}).period).toBe("daily");
  });

  it("rejects a bad period and malformed dates", () => {
    expect(() => analyticsQuerySchema.parse({ period: "weekly" })).toThrow();
    expect(dateSchema.safeParse("2026-7-16").success).toBe(false);
    expect(dateSchema.safeParse("16-07-2026").success).toBe(false);
    expect(dateSchema.safeParse("not-a-date").success).toBe(false);
  });

  it("rejects impossible calendar dates instead of rolling them over", () => {
    expect(dateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(dateSchema.safeParse("2026-13-01").success).toBe(false);
    expect(dateSchema.safeParse("2028-02-29").success).toBe(true); // leap year
  });
});

// ---------- bucket mapping ----------

describe("bucketOf", () => {
  it("maps the confirmed brief mapping exactly", () => {
    expect(bucketOf("DONE")).toBe("completed");
    expect(bucketOf("SKIPPED")).toBe("na");
    expect(bucketOf("PENDING")).toBe("pending");
    expect(bucketOf("ACTIVE")).toBe("pending");
    expect(bucketOf("OVERDUE")).toBe("pending");
    expect(bucketOf("ESCALATED")).toBe("pending");
  });
});

describe("countBuckets", () => {
  it("tallies one count per block into the right bucket", () => {
    const statuses: BlockStatus[] = ["DONE", "DONE", "ACTIVE", "OVERDUE", "SKIPPED"];
    expect(countBuckets(statuses.map((status) => ({ status })))).toEqual({
      completed: 2,
      pending: 2,
      na: 1,
    });
  });
});

// ---------- period rule (dueAt in window, else startedAt) ----------

describe("inWindow", () => {
  const window = { start: new Date(2026, 6, 16), end: new Date(2026, 6, 17) };

  it("includes a block whose dueAt is inside the window", () => {
    expect(inWindow({ dueAt: new Date(2026, 6, 16, 12), startedAt: null }, window)).toBe(true);
  });

  it("window start is inclusive, end is exclusive", () => {
    expect(inWindow({ dueAt: new Date(2026, 6, 16, 0, 0, 0, 0), startedAt: null }, window)).toBe(true);
    expect(inWindow({ dueAt: new Date(2026, 6, 17, 0, 0, 0, 0), startedAt: null }, window)).toBe(false);
  });

  it("falls back to startedAt ONLY when dueAt is null", () => {
    // no dueAt, startedAt inside → in
    expect(inWindow({ dueAt: null, startedAt: new Date(2026, 6, 16, 9) }, window)).toBe(true);
    // no dueAt, startedAt outside → out
    expect(inWindow({ dueAt: null, startedAt: new Date(2026, 6, 15, 9) }, window)).toBe(false);
    // dueAt OUTSIDE the window wins over a startedAt inside it — no fallback
    expect(
      inWindow({ dueAt: new Date(2026, 6, 20), startedAt: new Date(2026, 6, 16, 9) }, window),
    ).toBe(false);
  });

  it("excludes a block with neither dueAt nor startedAt", () => {
    expect(inWindow({ dueAt: null, startedAt: null }, window)).toBe(false);
  });
});

// ---------- Unassigned grouping ----------

describe("groupByDimension", () => {
  const branchByUser: Record<string, string | null> = {
    "u-sofia": "Subang Taipan",
    "u-marcus": "Cyberjaya",
    "u-lone": null, // user exists but has no branch
    // "u-ghost" deliberately absent — unknown assignee
  };
  const dimensionOf = (id: string) => branchByUser[id];

  it("groups counts per dimension value with bucket tallies", () => {
    const rows = groupByDimension(
      [
        { assigneeId: "u-sofia", status: "DONE" },
        { assigneeId: "u-sofia", status: "OVERDUE" },
        { assigneeId: "u-marcus", status: "SKIPPED" },
      ],
      dimensionOf,
    );
    expect(rows).toEqual([
      { name: "Cyberjaya", completed: 0, pending: 0, na: 1 },
      { name: "Subang Taipan", completed: 1, pending: 1, na: 0 },
    ]);
  });

  it("drops null dimensions AND unknown assignees entirely — no Unassigned bucket", () => {
    const rows = groupByDimension(
      [
        { assigneeId: "u-lone", status: "ACTIVE" },
        { assigneeId: "u-ghost", status: "DONE" },
        { assigneeId: "u-marcus", status: "DONE" },
        { assigneeId: "u-sofia", status: "PENDING" },
      ],
      dimensionOf,
    );
    expect(rows.map((r) => r.name)).toEqual(["Cyberjaya", "Subang Taipan"]);
    expect(rows.some((r) => r.name === UNASSIGNED)).toBe(false);
  });

  it("drops null-dimension blocks even when other names would sort after them", () => {
    const rows = groupByDimension(
      [
        { assigneeId: "u-lone", status: "ACTIVE" },
        { assigneeId: "u-z", status: "DONE" },
      ],
      (id) => (id === "u-z" ? "Zenith Branch" : null),
    );
    expect(rows.map((r) => r.name)).toEqual(["Zenith Branch"]);
  });
});

// ---------- TaskRow ordering ----------

describe("sortTaskRows", () => {
  // TaskRow.dueAt is an ISO string (toTaskRow's conversion) — this helper still
  // takes a Date for readability and converts, same as toTaskRow itself does.
  const row = (runBlockId: string, dueAt: Date | null): TaskRow => ({
    runBlockId,
    runId: "run-1",
    blockTitle: "t",
    runName: "r",
    flowName: "f",
    assigneeId: "u",
    dueAt: dueAt ? dueAt.toISOString() : null,
    status: "ACTIVE",
    fromSchedule: false,
    guideline: null,
    categoryId: null,
    categoryName: null,
    assignerId: "u-assigner",
    proofIds: [],
    parentId: null,
    subtaskOrder: null,
    quickCompletable: false,
  });

  it("sorts dueAt ascending with nulls last", () => {
    const sorted = sortTaskRows([
      row("c", null),
      row("b", new Date(2026, 6, 18)),
      row("a", new Date(2026, 6, 16)),
      row("d", null),
    ]);
    expect(sorted.map((r) => r.runBlockId)).toEqual(["a", "b", "c", "d"]);
  });

  it("does not mutate its input", () => {
    const input = [row("b", new Date(2026, 6, 18)), row("a", new Date(2026, 6, 16))];
    sortTaskRows(input);
    expect(input.map((r) => r.runBlockId)).toEqual(["b", "a"]);
  });
});

// ---------- role scoping (brief §Authorization matrix) ----------

describe("role scoping", () => {
  const user = (
    role: Role,
    department: string | null = "Operations",
    branch: string | null = "Subang Taipan",
  ): ScopeUser => ({
    id: "u-me",
    role,
    department,
    branch,
  });

  it("canViewOrg: ADMIN/CEO/OPS yes, HOD/MEMBER/BRANCH/DEPT_SITE/BRANCH_SITE no", () => {
    expect(canViewOrg("ADMIN")).toBe(true);
    expect(canViewOrg("CEO")).toBe(true);
    expect(canViewOrg("OPS")).toBe(true);
    expect(canViewOrg("HOD")).toBe(false);
    expect(canViewOrg("MEMBER")).toBe(false);
    expect(canViewOrg("BRANCH")).toBe(false);
    expect(canViewOrg("DEPT_SITE")).toBe(false);
    expect(canViewOrg("BRANCH_SITE")).toBe(false);
  });

  it("canViewEntity: org roles see any entity", () => {
    expect(canViewEntity(user("CEO"), "branch", "Setia Alam")).toBe(true);
    expect(canViewEntity(user("OPS"), "department", "People")).toBe(true);
    expect(canViewEntity(user("ADMIN"), "branch", "Setia Alam")).toBe(true);
  });

  it("canViewEntity: HOD sees ONLY their own department — no branches", () => {
    expect(canViewEntity(user("HOD"), "department", "Operations")).toBe(true);
    expect(canViewEntity(user("HOD"), "department", "People")).toBe(false);
    expect(canViewEntity(user("HOD"), "branch", "Subang Taipan")).toBe(false);
  });

  it("canViewEntity: HOD with no department maps to the Unassigned entity", () => {
    expect(canViewEntity(user("HOD", null), "department", UNASSIGNED)).toBe(true);
    expect(canViewEntity(user("HOD", null), "department", "Operations")).toBe(false);
  });

  it("canViewEntity: regular DEPT_SITE sees ONLY their own department — no branches (mirrors HOD)", () => {
    // Uses Finance: since the 2026-07-25 rename, "Operations" is an ELEVATED
    // department site (see the elevated tests below), so the fixture default
    // can no longer demonstrate the locked-down case.
    expect(canViewEntity(user("DEPT_SITE", "Finance"), "department", "Finance")).toBe(true);
    expect(canViewEntity(user("DEPT_SITE", "Finance"), "department", "People")).toBe(false);
    expect(canViewEntity(user("DEPT_SITE", "Finance"), "branch", "Subang Taipan")).toBe(false);
  });

  it("canViewEntity: MEMBER sees no entities, of either type", () => {
    expect(canViewEntity(user("MEMBER"), "department", "Operations")).toBe(false);
    expect(canViewEntity(user("MEMBER"), "branch", "Subang Taipan")).toBe(false);
  });

  it("canViewEntity: BRANCH sees ONLY their own branch — no departments", () => {
    expect(canViewEntity(user("BRANCH"), "branch", "Subang Taipan")).toBe(true);
    expect(canViewEntity(user("BRANCH"), "branch", "Setia Alam")).toBe(false);
    expect(canViewEntity(user("BRANCH"), "department", "Operations")).toBe(false);
  });

  it("canViewEntity: BRANCH with no branch maps to the Unassigned entity", () => {
    const noBranchUser = user("BRANCH", "Operations", null);
    expect(canViewEntity(noBranchUser, "branch", UNASSIGNED)).toBe(true);
    expect(canViewEntity(noBranchUser, "branch", "Subang Taipan")).toBe(false);
  });

  it("canViewEntity: BRANCH_SITE sees ONLY their own branch — no departments (mirrors BRANCH)", () => {
    expect(canViewEntity(user("BRANCH_SITE"), "branch", "Subang Taipan")).toBe(true);
    expect(canViewEntity(user("BRANCH_SITE"), "branch", "Setia Alam")).toBe(false);
    expect(canViewEntity(user("BRANCH_SITE"), "department", "Operations")).toBe(false);
  });

  it("canViewMember: BRANCH sees own-branch members only", () => {
    expect(
      canViewMember(user("BRANCH"), {
        id: "u-other",
        department: "Sales",
        branch: "Subang Taipan",
      }),
    ).toBe(true);
    expect(
      canViewMember(user("BRANCH"), {
        id: "u-other",
        department: "Operations",
        branch: "Setia Alam",
      }),
    ).toBe(false);
  });

  it("canViewMember: BRANCH with no branch maps to the Unassigned entity", () => {
    const noBranchUser = user("BRANCH", "Operations", null);
    expect(
      canViewMember(noBranchUser, { id: "u-other", department: "Sales", branch: null }),
    ).toBe(true);
    expect(
      canViewMember(noBranchUser, { id: "u-other", department: "Sales", branch: "Setia Alam" }),
    ).toBe(false);
  });

  it("canViewMember: self always, any role", () => {
    expect(canViewMember(user("MEMBER"), { id: "u-me", department: null })).toBe(true);
  });

  it("canViewMember: HOD sees own-department members only", () => {
    expect(
      canViewMember(user("HOD"), { id: "u-other", department: "Operations" }),
    ).toBe(true);
    expect(
      canViewMember(user("HOD"), { id: "u-other", department: "People" }),
    ).toBe(false);
  });

  it("canViewMember: HOD with no department maps to the Unassigned entity", () => {
    const noDeptUser = user("HOD", null);
    expect(canViewMember(noDeptUser, { id: "u-other", department: null })).toBe(true);
    expect(canViewMember(noDeptUser, { id: "u-other", department: "Operations" })).toBe(false);
  });

  it("canViewMember: regular DEPT_SITE sees own-department members only (mirrors HOD)", () => {
    // Finance, not the fixture default — "Operations" is elevated post-rename.
    expect(
      canViewMember(user("DEPT_SITE", "Finance"), { id: "u-other", department: "Finance" }),
    ).toBe(true);
    expect(
      canViewMember(user("DEPT_SITE", "Finance"), { id: "u-other", department: "People" }),
    ).toBe(false);
  });

  it("canViewMember: BRANCH_SITE sees own-branch members only (mirrors BRANCH)", () => {
    expect(
      canViewMember(user("BRANCH_SITE"), {
        id: "u-other",
        department: "Sales",
        branch: "Subang Taipan",
      }),
    ).toBe(true);
    expect(
      canViewMember(user("BRANCH_SITE"), {
        id: "u-other",
        department: "Operations",
        branch: "Setia Alam",
      }),
    ).toBe(false);
  });

  it("canViewMember: MEMBER cannot see others; org roles see anyone", () => {
    expect(
      canViewMember(user("MEMBER"), { id: "u-other", department: "Operations" }),
    ).toBe(false);
    expect(
      canViewMember(user("ADMIN"), { id: "u-other", department: null }),
    ).toBe(true);
  });

  // ---- elevated department sites (Operations/Optimisation) ----
  // "Operations" replaced "Operation" in the 2026-07-25 rename; the old
  // singular spelling must no longer elevate.

  it("isElevatedDeptSite: only DEPT_SITE with Operations or Optimisation", () => {
    expect(isElevatedDeptSite(user("DEPT_SITE", "Operations"))).toBe(true);
    expect(isElevatedDeptSite(user("DEPT_SITE", "Optimisation"))).toBe(true);
    expect(isElevatedDeptSite(user("DEPT_SITE", "Finance"))).toBe(false);
    expect(isElevatedDeptSite(user("DEPT_SITE", "Operation"))).toBe(false);
    expect(isElevatedDeptSite(user("DEPT_SITE", null))).toBe(false);
    expect(isElevatedDeptSite(user("HOD", "Operations"))).toBe(false);
    expect(isElevatedDeptSite(user("ADMIN", "Optimisation"))).toBe(false);
  });

  it.each(["Operations", "Optimisation"])(
    "canViewEntity: elevated %s DEPT_SITE sees every department AND every branch (2026-07-29 final spec)",
    (dept) => {
      const site = user("DEPT_SITE", dept);
      expect(canViewEntity(site, "department", dept)).toBe(true);
      expect(canViewEntity(site, "department", "Finance")).toBe(true);
      expect(canViewEntity(site, "department", "Human Resource")).toBe(true);
      expect(canViewEntity(site, "branch", "Subang Taipan")).toBe(true);
      expect(canViewEntity(site, "branch", "Klang")).toBe(true);
    },
  );

  it("canViewMember: elevated DEPT_SITE sees any department member, never branch staff", () => {
    const site = user("DEPT_SITE", "Optimisation");
    expect(canViewMember(site, { id: "u-other", department: "Finance" })).toBe(true);
    expect(canViewMember(site, { id: "u-other", department: "Operations" })).toBe(true);
    // Branch-side staff carry department: null — out of the elevated scope.
    expect(
      canViewMember(site, { id: "u-other", department: null, branch: "Klang" }),
    ).toBe(false);
  });
});

describe("memberSortRank — roster ordering (2026-07-25 decision)", () => {
  it("department side: HOD → HQ Exec → Full Time → Part Time → Intern", () => {
    const order = ["HOD", "HQ Exec", "Full Time", "Part Time", "Intern"].map((t) =>
      memberSortRank(t, null),
    );
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(new Set(order).size).toBe(order.length);
  });

  it("branch side: Manager → Branch Exec → Full Time Coach → Part Time Coach", () => {
    const order = [
      memberSortRank("Manager", null),
      memberSortRank("Branch Exec", null),
      memberSortRank("Coach", "Full Time"),
      memberSortRank("Coach", "Part Time"),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(new Set(order).size).toBe(order.length);
  });

  it("a Coach with no recorded schedule sorts with the Part Time Coaches", () => {
    expect(memberSortRank("Coach", null)).toBe(memberSortRank("Coach", "Part Time"));
  });

  it("unknown or missing employment types sort last", () => {
    expect(memberSortRank(null, null)).toBeGreaterThan(memberSortRank("Regional Manager", null));
    expect(memberSortRank("Something Odd", null)).toBeGreaterThan(memberSortRank("Intern", null));
  });
});

// ---------- official department list (zero-filled org rollups) ----------

describe("withAllDepartments", () => {
  const rollup = (name: string, completed = 2) => ({ name, completed, pending: 1, na: 0 });

  it("zero-fills missing official departments in official order", () => {
    const out = withAllDepartments([rollup("Marketing"), rollup("operations")]);
    expect(out.map((d) => d.name)).toEqual([
      "operations", // existing rollup keeps its casing (case-insensitive match)
      "Academy",
      "Marketing",
      "Optimisation",
      "Human Resource",
      "Finance",
    ]);
    expect(out[1]).toEqual({ name: "Academy", completed: 0, pending: 0, na: 0 });
    expect(out[2].completed).toBe(2);
  });

  it("keeps unknown departments (e.g. Unassigned) after the official six", () => {
    const out = withAllDepartments([rollup("Unassigned")]);
    expect(out).toHaveLength(7);
    expect(out[6].name).toBe("Unassigned");
  });
});

// ---------- region grouping (superadmin by-region branch view) ----------

describe("groupBranchesByRegion", () => {
  const rollup = (name: string) => ({ name, completed: 1, pending: 0, na: 0 });

  it("lists EVERY mapped branch per region, zero-filled when idle", () => {
    const grouped = groupBranchesByRegion([
      rollup("subang taipan"), // lower-case on purpose
      rollup("Sri Petaling"),
    ]);
    expect(grouped.map((g) => g.name)).toEqual(["Region A", "Region B", "Region C"]);
    expect(grouped[0].branches).toHaveLength(9);
    expect(grouped[1].branches).toHaveLength(10);
    expect(grouped[2].branches).toHaveLength(9);
    // live rollups matched case-insensitively; idle branches zero-filled
    const subang = grouped[0].branches.find(
      (b) => b.name.toLowerCase() === "subang taipan",
    );
    expect(subang?.completed).toBe(1);
    expect(grouped[0].branches.find((b) => b.name === "Klang")).toEqual({
      name: "Klang",
      completed: 0,
      pending: 0,
      na: 0,
    });
  });

  it("unmapped branches land in Other, last", () => {
    const grouped = groupBranchesByRegion([rollup("Mystery HQ")]);
    expect(grouped.map((g) => g.name)).toEqual([
      "Region A",
      "Region B",
      "Region C",
      "Other",
    ]);
    expect(grouped[3].branches.map((b) => b.name)).toEqual(["Mystery HQ"]);
  });

  it("empty input still lists all mapped branches, all zero", () => {
    const grouped = groupBranchesByRegion([]);
    expect(grouped).toHaveLength(3);
    expect(
      grouped.every((g) =>
        g.branches.every((b) => b.completed === 0 && b.pending === 0 && b.na === 0),
      ),
    ).toBe(true);
  });
});

// ---------- assigner streams (brief §Task streams) ----------

describe("groupByAssignerRole", () => {
  const block = (id: string, startedById: string) => ({
    id,
    run: { startedById },
  });
  const roles = new Map<string, Role>([
    ["u-ceo", "CEO"],
    ["u-hod", "HOD"],
    ["u-me", "MEMBER"],
    ["u-deptsite", "DEPT_SITE"], // Operation dept-site's unrestricted-assign account
  ]);
  const roleOf = (id: string) => roles.get(id);

  it("splits by the run starter's role, self-started under 'self'", () => {
    const streams = groupByAssignerRole(
      [
        block("b1", "u-hod"),
        block("b2", "u-me"),
        block("b3", "u-ceo"),
        block("b4", "u-hod"),
      ],
      "u-me",
      roleOf,
    );
    expect(streams.map((s) => s.key)).toEqual(["CEO", "HOD", "self"]);
    expect(streams[1].blocks.map((b) => b.id)).toEqual(["b1", "b4"]);
  });

  it("orders streams by org hierarchy (CEO first) and skips empty groups", () => {
    const streams = groupByAssignerRole(
      [block("b1", "u-hod"), block("b2", "u-ceo")],
      "u-other",
      roleOf,
    );
    expect(streams.map((s) => s.key)).toEqual(["CEO", "HOD"]);
  });

  it("unknown starters fall back to MEMBER (peer-started)", () => {
    const streams = groupByAssignerRole([block("b1", "u-ghost")], "u-me", roleOf);
    expect(streams).toEqual([{ key: "MEMBER", blocks: [block("b1", "u-ghost")] }]);
  });

  it("gives DEPT_SITE-started blocks their own stream, ordered after ADMIN — not dropped", () => {
    const streams = groupByAssignerRole(
      [block("b1", "u-ceo"), block("b2", "u-deptsite"), block("b3", "u-hod")],
      "u-me",
      roleOf,
    );
    expect(streams.map((s) => s.key)).toEqual(["CEO", "DEPT_SITE", "HOD"]);
    expect(streams[1].blocks.map((b) => b.id)).toEqual(["b2"]);
  });

  it("returns no streams for no blocks", () => {
    expect(groupByAssignerRole([], "u-me", roleOf)).toEqual([]);
  });
});
