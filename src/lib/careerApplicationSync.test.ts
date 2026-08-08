// Pure-logic tests for the per-applicant sync decision. The DB/HRFS modules
// are vi.mock'ed (repo pattern — see task-manager/engine/*.test.ts) so
// importing careerApplicationSync.ts never touches Postgres; the DB-writing
// orchestration itself (syncCareerApplicationsToPreStage) is
// exercised against the live app, not unit-tested here.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ebright-hrfs", () => ({ queryEbrightHrfs: vi.fn() }));
vi.mock("@/lib/employeeQueries", () => ({ STAFF_ROLE_ID: 6 }));

import {
  decideSyncAction,
  normalizeName,
  normalizeEmail,
  type CareerApplicationRow,
  type SyncContext,
  type PlaceholderRecord,
} from "./careerApplicationSync";

function app(overrides: Partial<CareerApplicationRow> = {}): CareerApplicationRow {
  return {
    id: 1,
    name: "Jane Doe",
    position: "Full Time",
    branch: null,
    department: null,
    start_trial: null,
    email: "jane@example.com",
    phone: null,
    gender: null,
    board_stage: null,
    ...overrides,
  };
}

function emptyContext(overrides: Partial<SyncContext> = {}): SyncContext {
  return {
    realEmployeeNames: new Set(),
    placeholdersByName: new Map(),
    branchByCode: new Map(),
    departmentByCodeOrName: new Map(),
    usedEmails: new Set(),
    ...overrides,
  };
}

// Defaults to an already-real (non-placeholder-pattern) email and matching
// phone/gender so, unless a test overrides them, no personalInfo refresh is
// triggered as a side effect — keeps the stage-only tests testing only the
// stage logic. Tests that actually exercise personalInfo refresh override
// these explicitly.
function placeholder(overrides: Partial<PlaceholderRecord> = {}): PlaceholderRecord {
  return {
    userId: 100,
    employmentId: 200,
    status: "pre",
    probation: false,
    email: "jane@example.com",
    phone: null,
    gender: null,
    ...overrides,
  };
}

describe("normalizeName", () => {
  it("uppercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeName("  Farah   Binti C.Rethnam  ")).toBe("FARAH BINTI CRETHNAM");
  });

  it("strips A/P, A/L, S/O, D/O relational honorifics as whole tokens", () => {
    // Same real person written differently across systems — e.g. our own
    // portal has "Ramitha Moghan" while onboarding_candidate has "Ramitha
    // A/P Moghan" — must normalize to the same key or the two get treated
    // as two different people (confirmed live: this silently duplicated her
    // onto the Pre list before this fix).
    expect(normalizeName("Ramitha A/P Moghan")).toBe(normalizeName("Ramitha Moghan"));
    expect(normalizeName("Harshini A/P C.Rethnam")).toBe("HARSHINI CRETHNAM");
    expect(normalizeName("Aadesh Abhayaprada A/L Balamurugan")).toBe("AADESH ABHAYAPRADA BALAMURUGAN");
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Jane@Example.COM ")).toBe("jane@example.com");
  });
});

describe("decideSyncAction — stage routing (board_stage-driven)", () => {
  it("skips as no-board-stage-match when board_stage is null, before checking already-employee", () => {
    const ctx = emptyContext({
      placeholdersByName: new Map([["JANE DOE", placeholder()]]),
      realEmployeeNames: new Set(["JANE DOE"]),
    });
    expect(decideSyncAction(app({ board_stage: null }), ctx)).toEqual({ type: "skip", reason: "no-board-stage-match" });
  });

  it("skips as no-board-stage-match when board_stage isn't in the mapping table (e.g. Rejected)", () => {
    const ctx = emptyContext({ placeholdersByName: new Map([["JANE DOE", placeholder()]]) });
    expect(decideSyncAction(app({ board_stage: "Rejected" }), ctx)).toEqual({ type: "skip", reason: "no-board-stage-match" });
  });

  it("returns update with stage=onboarding for Trial/Training Day/Probation board_stage values", () => {
    for (const stage of ["Trial", "1st Training Day", "2nd Training Day", "3rd Training Day", "Probation"]) {
      const ctx = emptyContext({ placeholdersByName: new Map([["JANE DOE", placeholder()]]) });
      expect(decideSyncAction(app({ board_stage: stage }), ctx)).toEqual({
        type: "update",
        userId: 100,
        employmentId: 200,
        stage: { status: "onboarding", probation: false },
        personalInfo: undefined,
      });
    }
  });

  it("no-ops (skips as duplicate-placeholder) when already at the mapped target stage", () => {
    const ctx = emptyContext({
      placeholdersByName: new Map([["JANE DOE", placeholder({ status: "onboarding", probation: false })]]),
    });
    expect(decideSyncAction(app({ board_stage: "Trial" }), ctx)).toEqual({ type: "skip", reason: "duplicate-placeholder" });
  });

  it("does not advance on a board_stage the mapping doesn't cover, even if a different application row for the same person once implied Trial (name-keyed matching is per-row, not cached)", () => {
    // Regression check for the Chan Ten Kiat case: an application whose OWN
    // board_stage is "Rejected" must never be treated as Trial/Probation —
    // decideSyncAction only ever looks at the row it's given.
    const ctx = emptyContext({ placeholdersByName: new Map([["CHAN TEN KIAT", placeholder()]]) });
    const action = decideSyncAction(app({ name: "Chan Ten Kiat", board_stage: "Rejected" }), ctx);
    expect(action).toEqual({ type: "skip", reason: "no-board-stage-match" });
  });

  it("skips as already-employee when a real user matches by normalized name", () => {
    const ctx = emptyContext({ realEmployeeNames: new Set(["JANE DOE"]) });
    expect(decideSyncAction(app(), ctx)).toEqual({ type: "skip", reason: "already-employee" });
  });

  it("creates when no safety check matches", () => {
    const action = decideSyncAction(app(), emptyContext());
    expect(action.type).toBe("create");
  });
});

describe("decideSyncAction — personal info refresh (already-synced applicants)", () => {
  it("refreshes phone and gender when they differ from career_applications' current value", () => {
    const ctx = emptyContext({
      placeholdersByName: new Map([["JANE DOE", placeholder({ phone: "011-old", gender: "Male" })]]),
    });
    const action = decideSyncAction(app({ phone: " 012-new ", gender: " Female " }), ctx);
    expect(action).toMatchObject({
      type: "update",
      personalInfo: { phone: "012-new", gender: "Female" },
    });
  });

  it("does not include a field in personalInfo when it already matches", () => {
    const ctx = emptyContext({
      placeholdersByName: new Map([["JANE DOE", placeholder({ phone: "012-345", gender: "Female" })]]),
    });
    const action = decideSyncAction(app({ phone: "012-345", gender: "Female" }), ctx);
    expect(action).toEqual({ type: "skip", reason: "no-board-stage-match" });
  });

  it("fills email when the stored value is still the placeholder pattern", () => {
    const ctx = emptyContext({
      placeholdersByName: new Map([["JANE DOE", placeholder({ email: "pre-123-abc@placeholder.ebright.my" })]]),
    });
    const action = decideSyncAction(app({ email: "jane.real@example.com" }), ctx);
    expect(action).toMatchObject({ type: "update", personalInfo: { email: "jane.real@example.com" } });
  });

  it("never overwrites an already-real (non-placeholder) email, even if career_applications' email differs", () => {
    const ctx = emptyContext({
      placeholdersByName: new Map([["JANE DOE", placeholder({ email: "already-set@example.com" })]]),
    });
    const action = decideSyncAction(app({ email: "different@example.com" }), ctx);
    expect(action).toEqual({ type: "skip", reason: "no-board-stage-match" });
  });

  it("does not fill email if it would collide with an existing users.email", () => {
    const ctx = emptyContext({
      placeholdersByName: new Map([["JANE DOE", placeholder({ email: "pre-123-abc@placeholder.ebright.my" })]]),
      usedEmails: new Set(["jane.real@example.com"]),
    });
    const action = decideSyncAction(app({ email: "jane.real@example.com" }), ctx);
    expect(action).toEqual({ type: "skip", reason: "no-board-stage-match" });
  });

  it("combines a stage update and a personalInfo update in the same action when both apply", () => {
    const ctx = emptyContext({
      placeholdersByName: new Map([["JANE DOE", placeholder({ phone: null })]]),
    });
    const action = decideSyncAction(app({ phone: "012-345", board_stage: "Trial" }), ctx);
    expect(action).toEqual({
      type: "update",
      userId: 100,
      employmentId: 200,
      stage: { status: "onboarding", probation: false },
      personalInfo: { phone: "012-345" },
    });
  });
});

describe("decideSyncAction — create path", () => {
  it("carries start_trial through as startDate when present", () => {
    const trial = new Date("2026-09-01T00:00:00Z");
    const action = decideSyncAction(app({ start_trial: trial }), emptyContext());
    expect(action).toMatchObject({ type: "create", startDate: trial });
  });

  it("leaves startDate null when start_trial is null", () => {
    const action = decideSyncAction(app({ start_trial: null }), emptyContext());
    expect(action).toMatchObject({ type: "create", startDate: null });
  });

  it("maps branch by code, case-insensitively, and leaves it null when unmatched", () => {
    const ctx = emptyContext({ branchByCode: new Map([["HQ", 42]]) });
    expect(decideSyncAction(app({ branch: "hq" }), ctx)).toMatchObject({ type: "create", branchId: 42 });
    expect(decideSyncAction(app({ branch: "PJL" }), ctx)).toMatchObject({ type: "create", branchId: null });
    expect(decideSyncAction(app({ branch: null }), ctx)).toMatchObject({ type: "create", branchId: null });
  });

  it("maps department by code OR name, case-insensitively, and leaves it null when unmatched", () => {
    const ctx = emptyContext({
      departmentByCodeOrName: new Map([
        ["HR", 1],
        ["MARKETING", 2],
      ]),
    });
    expect(decideSyncAction(app({ department: "hr" }), ctx)).toMatchObject({ type: "create", departmentId: 1 });
    expect(decideSyncAction(app({ department: "Marketing" }), ctx)).toMatchObject({ type: "create", departmentId: 2 });
    expect(decideSyncAction(app({ department: "Unknown Dept" }), ctx)).toMatchObject({ type: "create", departmentId: null });
  });

  it("carries phone and gender through as-is (trimmed), null when blank", () => {
    expect(decideSyncAction(app({ phone: "  012-345 ", gender: " Female " }), emptyContext())).toMatchObject({
      type: "create",
      phone: "012-345",
      gender: "Female",
    });
    expect(decideSyncAction(app({ phone: "", gender: null }), emptyContext())).toMatchObject({
      type: "create",
      phone: null,
      gender: null,
    });
  });

  it("carries the real email through, case-insensitively deduped against usedEmails", () => {
    const action = decideSyncAction(app({ email: "Jane@Example.com" }), emptyContext());
    expect(action).toMatchObject({ type: "create", email: "Jane@Example.com" });
  });

  it("falls back to null email when it would collide with an existing users.email", () => {
    const ctx = emptyContext({ usedEmails: new Set(["jane@example.com"]) });
    const action = decideSyncAction(app({ email: "Jane@Example.com" }), ctx);
    expect(action).toMatchObject({ type: "create", email: null });
  });

  it("falls back to null email when the applicant's email is blank", () => {
    const action = decideSyncAction(app({ email: "" }), emptyContext());
    expect(action).toMatchObject({ type: "create", email: null });
  });
});
