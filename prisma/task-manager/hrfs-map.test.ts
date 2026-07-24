// Pins the actual shipped hrfs-map.ts config: every test below calls the
// REAL mapHrfsUser against the REAL ROLE_MAP/BRANCH_MAP (no fixtures), and a
// few tests mutate the REAL (normally-empty) OVERRIDES object directly to
// exercise override precedence — mapHrfsUser has no injection point for
// overrides, it reads the module-level export, so that's the only way to
// test that path. Each override test uses its own unique *.invalid email so
// tests never collide with one another regardless of execution order.
import { describe, expect, it } from "vitest";
import { FLOW_BRANCH_REGIONS } from "../../src/task-manager/ui/types";
import {
  BRANCH_MAP,
  mapHrfsUser,
  OVERRIDES,
  ROLE_MAP,
  UNRESOLVED_BRANCH_CODES,
  type HrfsUserRow,
} from "./hrfs-map";

function row(overrides: Partial<HrfsUserRow> = {}): HrfsUserRow {
  return {
    email: "person@ebright.my",
    name: "Person Name",
    role: "SUPER_ADMIN",
    branchName: null,
    status: "ACTIVE",
    ...overrides,
  };
}

// ---------- status / unknown role ----------

describe("mapHrfsUser — status and unknown role", () => {
  it("skips a non-ACTIVE row", () => {
    const result = mapHrfsUser(row({ status: "SUSPENDED" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not ACTIVE/i);
  });

  it("skips an unknown HRFS role value, naming it in the reason", () => {
    const result = mapHrfsUser(row({ role: "WIZARD" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("unknown HRFS role: WIZARD");
  });
});

// ---------- ROLE_MAP families ----------

describe("mapHrfsUser — ROLE_MAP families", () => {
  it("SUPER_ADMIN -> ADMIN, no branch/department, email lowercased", () => {
    const result = mapHrfsUser(row({ role: "SUPER_ADMIN", email: "Admin@Ebright.my" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("ADMIN");
      expect(result.user.email).toBe("admin@ebright.my");
      expect(result.user.department).toBeNull();
      expect(result.user.branch).toBeNull();
      expect(result.user.employmentType).toBeNull();
    }
  });

  it("HOD without a department override is skipped, with the loud reason", () => {
    const result = mapHrfsUser(row({ role: "HOD", email: "no-dept-hod@example.invalid" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("HOD needs a department override");
  });

  it("HOD WITH a department override imports successfully", () => {
    OVERRIDES["dept-hod@example.invalid"] = { department: "Marketing" };
    const result = mapHrfsUser(row({ role: "HOD", email: "dept-hod@example.invalid" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("HOD");
      expect(result.user.employmentType).toBe("HOD");
      expect(result.user.department).toBe("Marketing");
    }
  });

  it("BRANCH_MANAGER and BM both -> BRANCH, Manager, with a resolved branch", () => {
    for (const roleKey of ["BRANCH_MANAGER", "BM"]) {
      const result = mapHrfsUser(row({ role: roleKey, branchName: "AMP", email: `${roleKey.toLowerCase()}@ebright.my` }));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.user.role).toBe("BRANCH");
        expect(result.user.employmentType).toBe("Manager");
        expect(result.user.branch).toBe("Ampang");
        expect(result.user.department).toBeNull();
      }
    }
  });

  it("BRANCH_MANAGER with an unresolvable branch code is skipped", () => {
    // DPU is a real, currently-unresolved HRFS code observed in production.
    const result = mapHrfsUser(row({ role: "BRANCH_MANAGER", branchName: "DPU", email: "bm-dpu@example.invalid" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unresolved branch code/i);
  });

  it('FT Coach -> MEMBER, Coach, "Full Time", branch required', () => {
    const result = mapHrfsUser(row({ role: "FT Coach", branchName: "Cyberjaya", email: "ftcoach@ebright.my" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("MEMBER");
      expect(result.user.employmentType).toBe("Coach");
      expect(result.user.coachSchedule).toBe("Full Time");
      expect(result.user.branch).toBe("Cyberjaya");
      expect(result.user.department).toBeNull();
    }
  });

  it('PT Coach -> MEMBER, Coach, "Part Time", branch required (case-insensitive code)', () => {
    const result = mapHrfsUser(row({ role: "PT Coach", branchName: "amp", email: "ptcoach@ebright.my" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.employmentType).toBe("Coach");
      expect(result.user.coachSchedule).toBe("Part Time");
      expect(result.user.branch).toBe("Ampang");
    }
  });

  it("a Coach without a resolvable branch is skipped", () => {
    const result = mapHrfsUser(row({ role: "PT Coach", branchName: "Atlantis", email: "coach-noland@example.invalid" }));
    expect(result.ok).toBe(false);
  });

  it('FT EXEC -> MEMBER, "Branch Exec", branch required', () => {
    const result = mapHrfsUser(row({ role: "FT EXEC", branchName: "BBB", email: "ftexec@ebright.my" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("MEMBER");
      expect(result.user.employmentType).toBe("Branch Exec");
      expect(result.user.branch).toBe("Bandar Baru Bangi");
      expect(result.user.department).toBeNull();
    }
  });

  it('REGIONAL_MANAGER -> MEMBER, "Regional Manager", branch OPTIONAL: resolved when possible, warned-not-skipped otherwise', () => {
    const resolved = mapHrfsUser(row({ role: "REGIONAL_MANAGER", branchName: "KTG", email: "rm-resolved@ebright.my" }));
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.user.employmentType).toBe("Regional Manager");
      expect(resolved.user.branch).toBe("Kajang TTDI Groove");
    }

    // "RM" is a real HRFS branchName used for some Regional Managers that
    // isn't a real branch — must NOT skip (branch is optional for this role).
    const unresolved = mapHrfsUser(row({ role: "REGIONAL_MANAGER", branchName: "RM", email: "rm-unresolved@example.invalid" }));
    expect(unresolved.ok).toBe(true);
    if (unresolved.ok) {
      expect(unresolved.user.branch).toBeNull();
      expect(unresolved.user.department).toBeNull();
      expect(unresolved.warnings.some((w) => /unresolved branch code/i.test(w))).toBe(true);
    }
  });

  it("Full_Time / Part_Time / INTERN / INT -> MEMBER dept-staff family; no override => department null + warning, NOT a skip", () => {
    const cases: Array<[string, string]> = [
      ["Full_Time", "Full Time"],
      ["Part_Time", "Part Time"],
      ["INTERN", "Intern"],
      ["INT", "Intern"],
    ];
    for (const [roleKey, employmentType] of cases) {
      // branchName deliberately set to a real (resolvable) branch code to
      // prove dept-staff NEVER carries a branch, even when one is available.
      const result = mapHrfsUser(row({ role: roleKey, branchName: "AMP", email: `${roleKey}-${employmentType}@example.invalid` }));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.user.role).toBe("MEMBER");
        expect(result.user.employmentType).toBe(employmentType);
        expect(result.user.department).toBeNull();
        expect(result.user.branch).toBeNull();
        expect(result.warnings.some((w) => /no department/i.test(w))).toBe(true);
      }
    }
  });

  it("dept-staff family WITH a department override imports with it and has no warning", () => {
    OVERRIDES["dept-staff-with-override@example.invalid"] = { department: "Finance" };
    const result = mapHrfsUser(row({ role: "Full_Time", email: "dept-staff-with-override@example.invalid" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.department).toBe("Finance");
      expect(result.warnings).toHaveLength(0);
    }
  });

  it('ACADEMY -> MEMBER, "Full Time", department "Academy" (fixed — no override needed)', () => {
    const result = mapHrfsUser(row({ role: "ACADEMY", email: "academy-person@ebright.my" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("MEMBER");
      expect(result.user.employmentType).toBe("Full Time");
      expect(result.user.department).toBe("Academy");
      expect(result.warnings).toHaveLength(0);
    }
  });

  it('HR -> MEMBER, "Full Time", department "Human Resource" (fixed — no override needed)', () => {
    const result = mapHrfsUser(row({ role: "HR", email: "hr-person@ebright.my" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("MEMBER");
      expect(result.user.employmentType).toBe("Full Time");
      expect(result.user.department).toBe("Human Resource");
      expect(result.warnings).toHaveLength(0);
    }
  });
});

// ---------- branch normalization ----------

describe("branch code resolution", () => {
  it("normalizes case on a short code", () => {
    const result = mapHrfsUser(row({ role: "BM", branchName: "cjy", email: "case1@ebright.my" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.branch).toBe("Cyberjaya");
  });

  it("tolerates surrounding whitespace", () => {
    const result = mapHrfsUser(row({ role: "BM", branchName: "  EGR  ", email: "case2@ebright.my" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.branch).toBe("Eco Grandeur");
  });

  it("passes every canonical FLOW_BRANCH_REGIONS name straight through", () => {
    for (const region of FLOW_BRANCH_REGIONS) {
      for (const branch of region.branches) {
        const result = mapHrfsUser(row({ role: "BM", branchName: branch, email: `${branch.replace(/\s+/g, "-")}@ebright.my` }));
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.user.branch).toBe(branch);
      }
    }
  });

  it("resolves every given confirmed short code to its canonical branch", () => {
    const given: Record<string, string> = {
      AMP: "Ampang",
      BBB: "Bandar Baru Bangi",
      BSP: "Bandar Seri Putra",
      BTHO: "Bandar Tun Hussein Onn",
      CJY: "Cyberjaya",
      DK: "Danau Kota",
      DA: "Denai Alam",
      EGR: "Eco Grandeur",
    };
    for (const [code, branch] of Object.entries(given)) {
      expect(BRANCH_MAP[code]).toBe(branch);
    }
  });

  it('treats "CEO" as an unresolvable, non-branch branchName value', () => {
    const result = mapHrfsUser(row({ role: "BM", branchName: "CEO", email: "ceo-branch@example.invalid" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unresolved branch code/i);
  });

  it("UNRESOLVED_BRANCH_CODES are genuinely absent from BRANCH_MAP (case-insensitive)", () => {
    expect(UNRESOLVED_BRANCH_CODES.length).toBeGreaterThan(0);
    const mapKeysLower = new Set(Object.keys(BRANCH_MAP).map((k) => k.toLowerCase()));
    for (const code of UNRESOLVED_BRANCH_CODES) {
      expect(mapKeysLower.has(code.toLowerCase())).toBe(false);
    }
  });

  it("an unresolved code skips a branch-required role but only warns (branchless import) for an optional-branch role", () => {
    const skip = mapHrfsUser(row({ role: "BM", branchName: "DPU", email: "skip-req@example.invalid" }));
    expect(skip.ok).toBe(false);

    const warn = mapHrfsUser(row({ role: "REGIONAL_MANAGER", branchName: "DPU", email: "warn-opt@example.invalid" }));
    expect(warn.ok).toBe(true);
    if (warn.ok) {
      expect(warn.user.branch).toBeNull();
      expect(warn.warnings.some((w) => /unresolved branch code/i.test(w))).toBe(true);
    }
  });
});

// ---------- overrides ----------

describe("override precedence", () => {
  it("fills a missing department (see also the HOD-with-override case above)", () => {
    OVERRIDES["fill-department@example.invalid"] = { department: "Optimisation" };
    const result = mapHrfsUser(row({ role: "Part_Time", email: "fill-department@example.invalid" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.department).toBe("Optimisation");
  });

  it("can promote a role entirely (e.g. dept staff -> CEO), and the override's fields win", () => {
    OVERRIDES["promote-to-ceo@example.invalid"] = {
      role: "CEO",
      department: "CEO",
      employmentType: "CEO",
      branch: null,
      coachSchedule: null,
    };
    const result = mapHrfsUser(row({ role: "Full_Time", email: "promote-to-ceo@example.invalid" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("CEO");
      expect(result.user.department).toBe("CEO");
      expect(result.user.employmentType).toBe("CEO");
    }
  });

  it("an override is keyed by the LOWERCASED email, matched after normalization", () => {
    OVERRIDES["case-key@example.invalid"] = { department: "Academy" };
    const result = mapHrfsUser(row({ role: "Part_Time", email: "Case-Key@Example.INVALID" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.department).toBe("Academy");
  });
});

// ---------- email / name normalization ----------

describe("email and name normalization", () => {
  it("lowercases the email", () => {
    const result = mapHrfsUser(row({ role: "SUPER_ADMIN", email: "MiXeDCaSe@Ebright.MY" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.email).toBe("mixedcase@ebright.my");
  });

  it("falls back to the email local-part when name is null", () => {
    const result = mapHrfsUser(row({ role: "SUPER_ADMIN", name: null, email: "noname@ebright.my" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.name).toBe("noname");
  });

  it("falls back to the email local-part when name is blank/whitespace", () => {
    const result = mapHrfsUser(row({ role: "SUPER_ADMIN", name: "   ", email: "blankname@ebright.my" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.name).toBe("blankname");
  });

  it("keeps a real, trimmed name as-is", () => {
    const result = mapHrfsUser(row({ role: "SUPER_ADMIN", name: "  Farid Osman  ", email: "farid@ebright.my" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.name).toBe("Farid Osman");
  });
});

// ---------- config completeness ----------

describe("ROLE_MAP completeness", () => {
  it("has an entry for every HRFS role value observed in production (verified 2026-07-24)", () => {
    const observed = [
      "ACADEMY",
      "BM",
      "BRANCH_MANAGER",
      "FT Coach",
      "FT EXEC",
      "Full_Time",
      "HOD",
      "HR",
      "INT",
      "INTERN",
      "PT Coach",
      "Part_Time",
      "REGIONAL_MANAGER",
      "SUPER_ADMIN",
    ];
    for (const role of observed) {
      expect(ROLE_MAP[role], `ROLE_MAP is missing an entry for "${role}"`).toBeDefined();
    }
  });
});
