import { describe, it, expect } from "vitest";
import { resolveTaskScope } from "./clickup-access";

describe("resolveTaskScope", () => {
  it("gives an HOD with a department the department scope", () => {
    expect(resolveTaskScope({ role: "staff", position: "FT HOD", departmentId: 7 }))
      .toEqual({ kind: "department", departmentId: 7 });
  });

  it("gives a 'department' role with a department the department scope", () => {
    expect(resolveTaskScope({ role: "department", position: null, departmentId: 3 }))
      .toEqual({ kind: "department", departmentId: 3 });
  });

  it("falls back to own scope for an HOD with no department", () => {
    expect(resolveTaskScope({ role: "staff", position: "FT HOD", departmentId: null }))
      .toEqual({ kind: "own" });
  });

  it("gives regular staff own scope", () => {
    expect(resolveTaskScope({ role: "staff", position: "Server", departmentId: 7 }))
      .toEqual({ kind: "own" });
  });

  it("gives oversight roles own scope (no company-wide view)", () => {
    expect(resolveTaskScope({ role: "superadmin", position: null, departmentId: 1 }))
      .toEqual({ kind: "own" });
    expect(resolveTaskScope({ role: "admin", position: null, departmentId: 1 }))
      .toEqual({ kind: "own" });
  });
});
