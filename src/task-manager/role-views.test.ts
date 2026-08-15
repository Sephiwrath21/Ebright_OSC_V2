// The role→sections single source of truth (role-views.ts): resolver cases
// and the consistency invariants that motivated centralization — the same
// personal sections may never differ between Home and Task Manager for a
// role (the class of bug this module exists to prevent).
import { describe, expect, it } from "vitest";

import {
  canManageTaskTemplateGroups,
  isPersonalAccountView,
  ROLE_VIEWS,
  resolveViewRole,
  shows,
  showsAddTaskHeader,
  taskManagerNavAccess,
  thisWeekDatesForRange,
  weekdayRangeOf,
  type ViewRole,
} from "./role-views";

describe("resolveViewRole", () => {
  it("maps direct roles", () => {
    expect(resolveViewRole({ role: "ADMIN", department: "Optimisation", branch: null })).toBe("ADMIN");
    expect(resolveViewRole({ role: "CEO", department: null, branch: null })).toBe("CEO");
    expect(resolveViewRole({ role: "OPS", department: null, branch: null })).toBe("OPS");
    expect(resolveViewRole({ role: "HOD", department: "Finance", branch: null })).toBe("HOD");
    expect(resolveViewRole({ role: "BRANCH", department: null, branch: "Klang" })).toBe("BRANCH_MANAGER");
    expect(resolveViewRole({ role: "BRANCH_SITE", department: null, branch: "Klang" })).toBe("BRANCH_SITE");
  });

  it("DEPT_SITE splits by elevation (Operations/Optimisation)", () => {
    expect(resolveViewRole({ role: "DEPT_SITE", department: "Operations", branch: null })).toBe("ELEVATED_DEPT_SITE");
    expect(resolveViewRole({ role: "DEPT_SITE", department: "Optimisation", branch: null })).toBe("ELEVATED_DEPT_SITE");
    expect(resolveViewRole({ role: "DEPT_SITE", department: "Finance", branch: null })).toBe("DEPT_SITE");
  });

  it("MEMBER splits by branch membership, and Coaches split off branch members", () => {
    expect(resolveViewRole({ role: "MEMBER", department: "Marketing", branch: null })).toBe("DEPT_MEMBER");
    expect(
      resolveViewRole({ role: "MEMBER", department: null, branch: "Klang", employmentType: "Branch Exec" }),
    ).toBe("BRANCH_MEMBER");
    expect(
      resolveViewRole({ role: "MEMBER", department: null, branch: "Klang", employmentType: "Coach" }),
    ).toBe("COACH");
    // no department AND no branch (the 61 unplaced real staff) → dept-side view
    expect(resolveViewRole({ role: "MEMBER", department: null, branch: null })).toBe("DEPT_MEMBER");
  });
});

describe("ROLE_VIEWS — 2026-07-29 FINAL role spec", () => {
  it("Branch Exec and Coaches are Daily ONLY on both pages", () => {
    for (const v of ["BRANCH_MEMBER", "COACH"] as ViewRole[]) {
      expect(ROLE_VIEWS[v].home).toEqual(["personalDaily"]);
      expect(ROLE_VIEWS[v].taskManager).toEqual(["myOverview"]);
    }
  });

  it("the THREE weekday ranges: dept Tue–Sat, Manager/Exec Tue–Sun, Coach Wed–Sun", () => {
    expect(weekdayRangeOf("DEPT_MEMBER")).toBe("tue-sat");
    expect(weekdayRangeOf("HOD")).toBe("tue-sat");
    expect(weekdayRangeOf("BRANCH_MANAGER")).toBe("tue-sun");
    expect(weekdayRangeOf("BRANCH_MEMBER")).toBe("tue-sun");
    expect(weekdayRangeOf("COACH")).toBe("wed-sun");
  });

  it("elevated sites are superadmin-equivalent: full org grids + dropdowns + assign", () => {
    expect(ROLE_VIEWS.ELEVATED_DEPT_SITE.home).toEqual(["orgGrids"]);
    expect(ROLE_VIEWS.ELEVATED_DEPT_SITE.taskManager).toEqual(["entityDropdowns"]);
    expect(showsAddTaskHeader("ELEVATED_DEPT_SITE")).toBe(true);
  });

  it("branch sites see Daily, Monthly AND the branch-wide Ad hoc set", () => {
    expect(shows("BRANCH_SITE", "home", "adhocOversight")).toBe(true);
    expect(shows("BRANCH_SITE", "taskManager", "adhocOversight")).toBe(true);
  });

  it("department/branch staff (myOverview roles) have no stream or delegated extras on Task Manager", () => {
    expect(shows("DEPT_MEMBER", "home", "assignerStreams")).toBe(false);
    expect(shows("DEPT_MEMBER", "taskManager", "assignerStreams")).toBe(false);
    expect(shows("DEPT_MEMBER", "taskManager", "delegated")).toBe(false);
    expect(shows("BRANCH_MANAGER", "taskManager", "assignerStreams")).toBe(false);
    expect(shows("BRANCH_MANAGER", "taskManager", "delegated")).toBe(false);
  });

  it("HOD has the four confirmed Home sections in order", () => {
    expect(ROLE_VIEWS.HOD.home).toEqual([
      "personalDaily",
      "personalMonthly",
      "ceoAssigned",
      "departmentOverview",
    ]);
  });

  it("CEO has the three confirmed Home sections in order, including branchRegionOverview", () => {
    expect(ROLE_VIEWS.CEO.home).toEqual(["ceoCombinedList", "ceoKanban", "branchRegionOverview"]);
    expect(shows("CEO", "home", "branchRegionOverview")).toBe(true);
  });

  it("DEPT_MEMBER gets the HOD Assigned card on Home only (2026-08-12: Task Manager's myOverview replaced it with whole-department Daily visibility instead)", () => {
    expect(shows("DEPT_MEMBER", "home", "hodAssigned")).toBe(true);
    expect(shows("DEPT_MEMBER", "taskManager", "hodAssigned")).toBe(false);
    expect(shows("DEPT_MEMBER", "taskManager", "myOverview")).toBe(true);
  });

  it("Branch Manager: Daily/Monthly/Ad hoc personal + Branch Overview + Manpower link", () => {
    expect(shows("BRANCH_MANAGER", "home", "personalAdhoc")).toBe(true);
    expect(shows("BRANCH_MANAGER", "taskManager", "myTasksAdhoc")).toBe(true);
    expect(shows("BRANCH_MANAGER", "home", "branchOverview")).toBe(true);
    expect(shows("BRANCH_MANAGER", "taskManager", "manpowerLink")).toBe(true);
  });

  it("view-only site logins have no personal sections and no + Task", () => {
    for (const v of ["DEPT_SITE", "BRANCH_SITE"] as ViewRole[]) {
      expect(shows(v, "home", "personalDaily")).toBe(false);
      expect(shows(v, "taskManager", "personalDaily")).toBe(false);
      expect(showsAddTaskHeader(v)).toBe(false);
    }
  });

  it("+ Task header exactly for the 5 assign-capable identities", () => {
    const withButton = (Object.keys(ROLE_VIEWS) as ViewRole[]).filter(showsAddTaskHeader).sort();
    expect(withButton).toEqual(["ADMIN", "CEO", "ELEVATED_DEPT_SITE", "HOD", "OPS"]);
  });
});

describe("cross-page consistency invariants", () => {
  it("Ad hoc stays identical on both pages (2026-08-12: NOT part of the stacked-sections redesign, unlike the other personal keys below)", () => {
    for (const v of Object.keys(ROLE_VIEWS) as ViewRole[]) {
      expect(
        shows(v, "home", "personalAdhoc"),
        `${v}/personalAdhoc: Home=${shows(v, "home", "personalAdhoc")} TM=${shows(v, "taskManager", "personalAdhoc")}`,
      ).toBe(shows(v, "taskManager", "personalAdhoc"));
    }
  });

  it("2026-08-12 stacked-sections redesign: personalDaily/personalMonthly/ceoAssigned/hodAssigned are Home-only now, replaced on Task Manager by myOverview/departmentOverview/branchOverview", () => {
    // This intentionally REPLACES the pre-2026-08-12 invariant (these keys
    // used to be required to match on both pages) — the whole point of
    // this redesign is that Task Manager's personal sections were
    // subsumed into the new stacked structure while Home's stayed
    // untouched. Pin exactly which roles now diverge, so an accidental
    // re-introduction of one of these keys to a taskManager array (instead
    // of going through myOverview/departmentOverview/branchOverview) is a
    // conscious, test-breaking decision.
    const retiredFromTaskManager = ["personalDaily", "personalMonthly", "ceoAssigned", "hodAssigned"] as const;
    for (const v of Object.keys(ROLE_VIEWS) as ViewRole[]) {
      for (const key of retiredFromTaskManager) {
        expect(shows(v, "taskManager", key), `${v}/${key} should no longer appear on Task Manager`).toBe(false);
      }
    }
  });

  it("myTasksDaily/myTasksMonthly no longer appear in any taskManager array (2026-08-12: subsumed into myOverview/departmentOverview/branchOverview — this invariant used to be checked implicitly via the old personalDaily/myTasksDaily pairing test, which became vacuous once neither key remained)", () => {
    for (const v of Object.keys(ROLE_VIEWS) as ViewRole[]) {
      expect(shows(v, "taskManager", "myTasksDaily"), `${v} should not show myTasksDaily on Task Manager`).toBe(false);
      expect(shows(v, "taskManager", "myTasksMonthly"), `${v} should not show myTasksMonthly on Task Manager`).toBe(false);
    }
  });

  // The My Tasks Daily table (Task | Proof | Assignee | Due Date,
  // 2026-07-30 column spec) renders from ONE component
  // (ResizableTaskList via task-manager-view's single myTasksDaily gate) —
  // this pins exactly which roles get it, so adding a personal-staff role
  // without the Daily table (or giving it to a site login by accident) is
  // a conscious, test-breaking decision.
  it("every personal-staff role gets SOME Daily-showing surface on Task Manager (2026-08-12: myTasksDaily itself is retired everywhere, replaced by myOverview/departmentOverview/branchOverview/entityDropdowns)", () => {
    const hasDailySurface = (v: ViewRole) =>
      shows(v, "taskManager", "myOverview") ||
      shows(v, "taskManager", "departmentOverview") ||
      shows(v, "taskManager", "branchOverview") ||
      shows(v, "taskManager", "entityDropdowns");
    const withDailySurface = (Object.keys(ROLE_VIEWS) as ViewRole[]).filter(hasDailySurface).sort();
    expect(withDailySurface).toEqual(
      [
        "ADMIN",
        "BRANCH_MANAGER",
        "BRANCH_MEMBER",
        "BRANCH_SITE",
        "CEO",
        "COACH",
        "DEPT_MEMBER",
        "DEPT_SITE",
        "ELEVATED_DEPT_SITE",
        "HOD",
        "OPS",
      ].sort(),
    );
  });
});

describe("canManageTaskTemplateGroups", () => {
  it("true for ADMIN", () => {
    expect(canManageTaskTemplateGroups({ role: "ADMIN", department: null })).toBe(true);
  });
  it("true for elevated dept-site (Operations)", () => {
    expect(canManageTaskTemplateGroups({ role: "DEPT_SITE", department: "Operations" })).toBe(true);
  });
  it("true for elevated dept-site (Optimisation)", () => {
    expect(canManageTaskTemplateGroups({ role: "DEPT_SITE", department: "Optimisation" })).toBe(true);
  });
  it("false for non-elevated dept-site", () => {
    expect(canManageTaskTemplateGroups({ role: "DEPT_SITE", department: "Finance" })).toBe(false);
  });
  it("false for CEO, HOD, OPS, BRANCH, BRANCH_SITE, MEMBER", () => {
    for (const role of ["CEO", "HOD", "OPS", "BRANCH", "BRANCH_SITE", "MEMBER"]) {
      expect(canManageTaskTemplateGroups({ role, department: null })).toBe(false);
    }
  });
});

describe("taskManagerNavAccess", () => {
  it("Super Admin (ADMIN): all three true", () => {
    expect(taskManagerNavAccess({ role: "ADMIN", department: null })).toEqual({
      template: true,
      package: true,
      packageTable: true,
    });
  });
  it("Operation (elevated dept-site): all three true", () => {
    expect(taskManagerNavAccess({ role: "DEPT_SITE", department: "Operations" })).toEqual({
      template: true,
      package: true,
      packageTable: true,
    });
  });
  it("HOD: all three true (view-only, but sidebar-visible)", () => {
    expect(taskManagerNavAccess({ role: "HOD", department: null })).toEqual({
      template: true,
      package: true,
      packageTable: true,
    });
  });
  it("CEO: all three true (view-only, but sidebar-visible)", () => {
    expect(taskManagerNavAccess({ role: "CEO", department: null })).toEqual({
      template: true,
      package: true,
      packageTable: true,
    });
  });
  it("Branch Manager (BRANCH): all three true (2026-08-11 — Template added, same tier as HOD)", () => {
    expect(taskManagerNavAccess({ role: "BRANCH", department: null })).toEqual({
      template: true,
      package: true,
      packageTable: true,
    });
  });
  it("OPS role: all three false (not in the matrix)", () => {
    expect(taskManagerNavAccess({ role: "OPS", department: null })).toEqual({
      template: false,
      package: false,
      packageTable: false,
    });
  });
  it("non-elevated dept-site (Department): all three false", () => {
    expect(taskManagerNavAccess({ role: "DEPT_SITE", department: "Finance" })).toEqual({
      template: false,
      package: false,
      packageTable: false,
    });
  });
  it("BRANCH_SITE (Branch): all three false", () => {
    expect(taskManagerNavAccess({ role: "BRANCH_SITE", department: null })).toEqual({
      template: false,
      package: false,
      packageTable: false,
    });
  });
  it("MEMBER (Intern/HQ Exec/Branch Exec/Coach/unspecified): all three false", () => {
    expect(taskManagerNavAccess({ role: "MEMBER", department: null })).toEqual({
      template: false,
      package: false,
      packageTable: false,
    });
  });
});

describe("thisWeekDatesForRange", () => {
  // Friday 2026-08-14 — a known, fixed reference date (a real Friday).
  const FRIDAY = new Date(2026, 7, 14); // month is 0-indexed: 7 = August

  it("mon-sun: returns all 7 days of the week containing the reference date", () => {
    const result = thisWeekDatesForRange("mon-sun", FRIDAY);
    expect(result).toEqual([
      { weekday: "Monday", date: "2026-08-10" },
      { weekday: "Tuesday", date: "2026-08-11" },
      { weekday: "Wednesday", date: "2026-08-12" },
      { weekday: "Thursday", date: "2026-08-13" },
      { weekday: "Friday", date: "2026-08-14" },
      { weekday: "Saturday", date: "2026-08-15" },
      { weekday: "Sunday", date: "2026-08-16" },
    ]);
  });

  it("tue-sat: returns Tuesday through Saturday of that same week", () => {
    const result = thisWeekDatesForRange("tue-sat", FRIDAY);
    expect(result).toEqual([
      { weekday: "Tuesday", date: "2026-08-11" },
      { weekday: "Wednesday", date: "2026-08-12" },
      { weekday: "Thursday", date: "2026-08-13" },
      { weekday: "Friday", date: "2026-08-14" },
      { weekday: "Saturday", date: "2026-08-15" },
    ]);
  });

  it("tue-sun: returns Tuesday through Sunday of that same week", () => {
    const result = thisWeekDatesForRange("tue-sun", FRIDAY);
    expect(result.map((d) => d.weekday)).toEqual([
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    expect(result[0].date).toBe("2026-08-11");
    expect(result[5].date).toBe("2026-08-16");
  });

  it("wed-sun: returns Wednesday through Sunday of that same week", () => {
    const result = thisWeekDatesForRange("wed-sun", FRIDAY);
    expect(result.map((d) => d.weekday)).toEqual(["Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    expect(result[0].date).toBe("2026-08-12");
  });

  it("works when the reference date is itself a Sunday (week wraps backward correctly)", () => {
    const SUNDAY = new Date(2026, 7, 16); // 2026-08-16 is the Sunday of that same week
    const result = thisWeekDatesForRange("mon-sun", SUNDAY);
    expect(result[0].date).toBe("2026-08-10"); // still Monday of the SAME week, not the next one
    expect(result[6].date).toBe("2026-08-16");
  });

  it("works when the reference date is itself a Monday", () => {
    const MONDAY = new Date(2026, 7, 10);
    const result = thisWeekDatesForRange("tue-sat", MONDAY);
    expect(result[0].date).toBe("2026-08-11");
    expect(result[4].date).toBe("2026-08-15");
  });
});

describe("isPersonalAccountView", () => {
  it("false for the three shared/site views", () => {
    const siteViews: ViewRole[] = ["DEPT_SITE", "BRANCH_SITE", "ELEVATED_DEPT_SITE"];
    for (const view of siteViews) {
      expect(isPersonalAccountView(view)).toBe(false);
    }
  });
  it("true for every individual-person view", () => {
    const personalViews: ViewRole[] = [
      "ADMIN",
      "CEO",
      "OPS",
      "HOD",
      "BRANCH_MANAGER",
      "DEPT_MEMBER",
      "BRANCH_MEMBER",
      "COACH",
    ];
    for (const view of personalViews) {
      expect(isPersonalAccountView(view)).toBe(true);
    }
  });
});
