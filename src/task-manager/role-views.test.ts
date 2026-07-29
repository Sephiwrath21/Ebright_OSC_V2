// The role→sections single source of truth (role-views.ts): resolver cases
// and the consistency invariants that motivated centralization — the same
// personal sections may never differ between Home and Task Manager for a
// role (the class of bug this module exists to prevent).
import { describe, expect, it } from "vitest";

import {
  ROLE_VIEWS,
  resolveViewRole,
  shows,
  showsAddTaskHeader,
  weekdayIncludesSunday,
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

  it("MEMBER splits by branch membership", () => {
    expect(resolveViewRole({ role: "MEMBER", department: "Marketing", branch: null })).toBe("DEPT_MEMBER");
    expect(resolveViewRole({ role: "MEMBER", department: null, branch: "Klang" })).toBe("BRANCH_MEMBER");
    // no department AND no branch (the 61 unplaced real staff) → dept-side view
    expect(resolveViewRole({ role: "MEMBER", department: null, branch: null })).toBe("DEPT_MEMBER");
  });
});

describe("ROLE_VIEWS — confirmed role specs", () => {
  it("BRANCH_MEMBER (Branch Exec / Coaches) is Daily ONLY on both pages", () => {
    expect(ROLE_VIEWS.BRANCH_MEMBER.home).toEqual(["personalDaily"]);
    expect(ROLE_VIEWS.BRANCH_MEMBER.taskManager).toEqual(["personalDaily", "myTasksDaily"]);
  });

  it("HOD has the four confirmed Home sections in order", () => {
    expect(ROLE_VIEWS.HOD.home).toEqual([
      "personalDaily",
      "personalMonthly",
      "ceoAssigned",
      "departmentOverview",
    ]);
  });

  it("DEPT_MEMBER gets the HOD Assigned card on both pages", () => {
    expect(shows("DEPT_MEMBER", "home", "hodAssigned")).toBe(true);
    expect(shows("DEPT_MEMBER", "taskManager", "hodAssigned")).toBe(true);
  });

  it("Branch Manager: Daily/Monthly/Ad hoc personal + Branch Overview, Tue–Sun", () => {
    expect(shows("BRANCH_MANAGER", "home", "personalAdhoc")).toBe(true);
    expect(shows("BRANCH_MANAGER", "taskManager", "myTasksAdhoc")).toBe(true);
    expect(shows("BRANCH_MANAGER", "home", "branchOverview")).toBe(true);
    expect(weekdayIncludesSunday("BRANCH_MANAGER")).toBe(true);
    expect(weekdayIncludesSunday("BRANCH_MEMBER")).toBe(true);
    expect(weekdayIncludesSunday("DEPT_MEMBER")).toBe(false);
    expect(weekdayIncludesSunday("HOD")).toBe(false);
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
  it("every personal card on HOME also exists on the Task Manager page", () => {
    // The bug class this module exists to prevent ("CEO Assigned on Home
    // but missing on Task Manager"). The reverse (TM-only personal cards)
    // is legitimate for org-home roles like OPS, whose Home shows the org
    // grids instead of personal cards.
    const personalKeys = ["personalDaily", "personalMonthly", "personalAdhoc", "ceoAssigned", "hodAssigned"] as const;
    for (const v of Object.keys(ROLE_VIEWS) as ViewRole[]) {
      for (const key of personalKeys) {
        if (shows(v, "home", key)) {
          expect(
            shows(v, "taskManager", key),
            `${v}/${key} is on Home but missing on Task Manager`,
          ).toBe(true);
        }
      }
    }
  });

  it("non-org-home roles have IDENTICAL personal cards on both pages", () => {
    const personalKeys = ["personalDaily", "personalMonthly", "personalAdhoc", "ceoAssigned", "hodAssigned"] as const;
    const orgHome = (v: ViewRole) =>
      shows(v, "home", "orgGrids") || shows(v, "home", "allDeptGrids");
    for (const v of (Object.keys(ROLE_VIEWS) as ViewRole[]).filter((v) => !orgHome(v))) {
      for (const key of personalKeys) {
        expect(
          shows(v, "home", key),
          `${v}/${key}: Home=${shows(v, "home", key)} TM=${shows(v, "taskManager", key)}`,
        ).toBe(shows(v, "taskManager", key));
      }
    }
  });

  it("a My Tasks list implies its personal card (and vice versa for Daily)", () => {
    for (const v of Object.keys(ROLE_VIEWS) as ViewRole[]) {
      expect(shows(v, "taskManager", "myTasksDaily")).toBe(shows(v, "taskManager", "personalDaily"));
      // Monthly list implies the Monthly card (not necessarily the reverse).
      if (shows(v, "taskManager", "myTasksMonthly")) {
        expect(shows(v, "taskManager", "personalMonthly")).toBe(true);
      }
    }
  });
});
