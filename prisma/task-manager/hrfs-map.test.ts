// Pins the actual shipped hrfs-map.ts config: every test below calls the
// REAL mapHrfsUser against the REAL ROLE_MAP/BRANCH_MAP (no fixtures), and a
// few tests mutate the REAL (normally-empty) OVERRIDES object directly to
// exercise override precedence — mapHrfsUser has no injection point for
// overrides, it reads the module-level export, so that's the only way to
// test that path. Each override test uses its own unique *.invalid email so
// tests never collide with one another regardless of execution order.
//
// hrfs-map.ts imports BRANCH_STAFF_ROLES from analytics/_lib.ts (for its
// FLOW_STAFF_ROLES equivalence assertion — see hrfs-map.ts's file header),
// which transitively imports the real src/task-manager/prisma singleton.
// Mock it (and _lib.ts's other impure import) before anything else, same
// pattern analytics/_lib.test.ts already uses — this keeps the whole suite
// DB-free.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/task-manager/prisma", () => ({ prisma: {} }));
vi.mock("@/task-manager/lib/users", () => ({ getUsersByIds: vi.fn() }));

import { BRANCH_STAFF_ROLES } from "../../src/task-manager/analytics/_lib";
import { FLOW_BRANCH_REGIONS, FLOW_STAFF_ROLES } from "../../src/task-manager/ui/types";
import {
  BRANCH_MAP,
  diffUserFields,
  EXTRA_USERS,
  mapHrfsUser,
  mapPortalEmployee,
  OVERRIDES,
  ROLE_MAP,
  UNRESOLVED_BRANCH_CODES,
  validateHandEditedConfig,
  type DiffableUserFields,
  type HrfsUserRow,
  type PortalEmployeeRow,
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

  it('FT EXEC -> MEMBER, "HQ Exec", department-side — branchName ignored (2026-07-25 decision)', () => {
    // Even with a resolvable branch code, FT EXEC is department-side now:
    // branch stays null and nothing about branchName can skip the row.
    const result = mapHrfsUser(row({ role: "FT EXEC", branchName: "BBB", email: "ftexec@ebright.my" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("MEMBER");
      expect(result.user.employmentType).toBe("HQ Exec");
      expect(result.user.branch).toBeNull();
      expect(result.user.department).toBeNull();
    }
    // The live-data shape: a non-branch marker (HQ) — imports fine too.
    const hq = mapHrfsUser(row({ role: "FT EXEC", branchName: "HQ", email: "ftexec2@ebright.my" }));
    expect(hq.ok).toBe(true);
    if (hq.ok) expect(hq.user.branch).toBeNull();
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
    // department stays null here (not "CEO") — see validateHandEditedConfig:
    // department must be a real FLOW_DEPARTMENTS value or null, matching the
    // corrected OVERRIDES doc-comment example.
    OVERRIDES["promote-to-ceo@example.invalid"] = {
      role: "CEO",
      department: null,
      employmentType: "CEO",
      branch: null,
      coachSchedule: null,
    };
    const result = mapHrfsUser(row({ role: "Full_Time", email: "promote-to-ceo@example.invalid" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("CEO");
      expect(result.user.department).toBeNull();
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

// ---------------------------------------------------------------------------
// load-time validation of the hand-edited config (review follow-up)
// ---------------------------------------------------------------------------

describe("validateHandEditedConfig", () => {
  it("does not throw for the actual shipped OVERRIDES/EXTRA_USERS (this module already called it once at load time)", () => {
    expect(() => validateHandEditedConfig(OVERRIDES, EXTRA_USERS)).not.toThrow();
  });

  it("throws naming the email, field, and value for a bad OVERRIDES department", () => {
    const run = () =>
      validateHandEditedConfig({ "bad-dept@example.invalid": { department: "Not A Real Department" } }, []);
    expect(run).toThrow("bad-dept@example.invalid");
    expect(run).toThrow("department");
    expect(run).toThrow("Not A Real Department");
  });

  it("throws naming the email, field, and value for a bad OVERRIDES branch", () => {
    const run = () => validateHandEditedConfig({ "bad-branch@example.invalid": { branch: "Atlantis" } }, []);
    expect(run).toThrow("bad-branch@example.invalid");
    expect(run).toThrow("branch");
    expect(run).toThrow("Atlantis");
  });

  it("throws naming the email, field, and value for a bad EXTRA_USERS department", () => {
    const run = () =>
      validateHandEditedConfig({}, [
        {
          email: "extra-bad-dept@example.invalid",
          name: "X",
          role: "DEPT_SITE",
          department: "Not A Real Department",
          branch: null,
          employmentType: null,
          coachSchedule: null,
        },
      ]);
    expect(run).toThrow("extra-bad-dept@example.invalid");
    expect(run).toThrow("department");
    expect(run).toThrow("Not A Real Department");
  });

  it("throws naming the email, field, and value for a bad EXTRA_USERS branch", () => {
    const run = () =>
      validateHandEditedConfig({}, [
        {
          email: "extra-bad-branch@example.invalid",
          name: "X",
          role: "BRANCH_SITE",
          department: null,
          branch: "Atlantis",
          employmentType: null,
          coachSchedule: null,
        },
      ]);
    expect(run).toThrow("extra-bad-branch@example.invalid");
    expect(run).toThrow("branch");
    expect(run).toThrow("Atlantis");
  });

  it("does not throw when department/branch are null or absent (both are normal, valid states)", () => {
    expect(() => validateHandEditedConfig({ "no-dept-no-branch@example.invalid": { role: "CEO" } }, [])).not.toThrow();
  });

  it("does not throw for a valid department and a valid branch", () => {
    expect(() =>
      validateHandEditedConfig({ "valid-override@example.invalid": { department: "Finance", branch: "Klang" } }, []),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// FLOW_STAFF_ROLES / BRANCH_STAFF_ROLES equivalence (review follow-up —
// branchPolicy() depends on this; hrfs-map.ts throws at load time on drift)
// ---------------------------------------------------------------------------

describe("FLOW_STAFF_ROLES / BRANCH_STAFF_ROLES equivalence", () => {
  it("hrfs-map.ts loaded without throwing, which already proves its load-time assertion passed (ROLE_MAP is only reachable after it)", () => {
    expect(ROLE_MAP.SUPER_ADMIN).toBeDefined();
  });

  it("are set-equal right now, independent of the load-time throw mechanism", () => {
    expect(new Set(FLOW_STAFF_ROLES)).toEqual(new Set(BRANCH_STAFF_ROLES));
  });
});

// ---------------------------------------------------------------------------
// diffUserFields (review follow-up — the pure half of bootstrap.ts's new
// CHANGED-line feature; lives here alongside MappedUser itself, bootstrap.ts
// just imports it)
// ---------------------------------------------------------------------------

describe("diffUserFields", () => {
  const base: DiffableUserFields = {
    role: "MEMBER",
    department: "Operations",
    branch: null,
    employmentType: "Full Time",
    coachSchedule: null,
  };

  it("returns [] when nothing changed", () => {
    expect(diffUserFields(base, { ...base })).toEqual([]);
  });

  it('reports a single changed field as "<field> <old>→<new>"', () => {
    expect(diffUserFields(base, { ...base, role: "HOD" })).toEqual(["role MEMBER→HOD"]);
  });

  it("reports multiple changed fields, one per entry, in a fixed field order", () => {
    const existing: DiffableUserFields = { ...base, role: "HOD" };
    const next: DiffableUserFields = { ...base, department: null, branch: "Klang" };
    expect(diffUserFields(existing, next)).toEqual([
      "role HOD→MEMBER",
      "department Operations→(none)",
      "branch (none)→Klang",
    ]);
  });

  it('formats null as "(none)" on either side', () => {
    expect(diffUserFields({ ...base, coachSchedule: null }, { ...base, coachSchedule: "Full Time" })).toEqual([
      "coachSchedule (none)→Full Time",
    ]);
    expect(diffUserFields({ ...base, coachSchedule: "Full Time" }, { ...base, coachSchedule: null })).toEqual([
      "coachSchedule Full Time→(none)",
    ]);
  });
});

// ---------- portal second source (2026-07-25) ----------

describe("mapPortalEmployee", () => {
  const emp = (overrides: Partial<PortalEmployeeRow> = {}): PortalEmployeeRow => ({
    email: "portal@example.invalid",
    name: "Portal Person",
    position: "INTERN",
    department: null,
    branch: null,
    ...overrides,
  });

  it("INTERN -> department-side member, department from the employment record", () => {
    const r = mapPortalEmployee(emp({ position: "INTERN", department: "Academy", branch: "HQ" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user.role).toBe("MEMBER");
      expect(r.user.employmentType).toBe("Intern");
      expect(r.user.department).toBe("Academy");
      // "HQ" is an org marker, and interns are dept-side anyway — no branch.
      expect(r.user.branch).toBeNull();
    }
  });

  it("PT COACH requires a resolvable branch — real portal branch names pass", () => {
    const ok = mapPortalEmployee(emp({ position: "PT COACH", branch: "Putrajaya" }));
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.user.employmentType).toBe("Coach");
      expect(ok.user.coachSchedule).toBe("Part Time");
      expect(ok.user.branch).toBe("Putrajaya");
    }
    const bad = mapPortalEmployee(emp({ position: "PT COACH", branch: "HQ" }));
    expect(bad.ok).toBe(false);
  });

  it('the portal\'s "Kajang TTDI Grove" spelling resolves via the alias', () => {
    const r = mapPortalEmployee(emp({ position: "BM", branch: "Kajang TTDI Grove" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user.role).toBe("BRANCH");
      expect(r.user.branch).toBe("Kajang TTDI Groove");
    }
  });

  it("FT HOD -> full HOD with the employment record's department; skips without one", () => {
    const ok = mapPortalEmployee(emp({ position: "FT HOD", department: "Marketing" }));
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.user.role).toBe("HOD");
      expect(ok.user.department).toBe("Marketing");
    }
    const noDept = mapPortalEmployee(emp({ position: "FT HOD", department: null }));
    expect(noDept.ok).toBe(false);
    // Non-Task-Manager units (e.g. "IOP") don't count as a department.
    const iop = mapPortalEmployee(emp({ position: "FT HOD", department: "IOP" }));
    expect(iop.ok).toBe(false);
  });

  it("unknown or missing positions skip loudly", () => {
    expect(mapPortalEmployee(emp({ position: null })).ok).toBe(false);
    expect(mapPortalEmployee(emp({ position: "WIZARD" })).ok).toBe(false);
  });

  it("EXECUTIVE and FT EXEC both read as HQ Exec", () => {
    for (const position of ["EXECUTIVE", "FT EXEC"]) {
      const r = mapPortalEmployee(emp({ position, department: "Finance" }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.user.employmentType).toBe("HQ Exec");
    }
  });

  it("OVERRIDES win over the portal mapping, same as the primary source", () => {
    OVERRIDES["portal-override@example.invalid"] = { department: "Finance" };
    try {
      const r = mapPortalEmployee(
        emp({ email: "portal-override@example.invalid", position: "INTERN", department: "Academy" }),
      );
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.user.department).toBe("Finance");
    } finally {
      delete OVERRIDES["portal-override@example.invalid"];
    }
  });
});
