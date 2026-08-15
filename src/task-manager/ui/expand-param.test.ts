// src/task-manager/ui/expand-param.test.ts
import { describe, expect, it } from "vitest";
import { parseExpandParam, toggleExpandEntry } from "./expand-param";

describe("parseExpandParam", () => {
  it("returns empty lists for undefined", () => {
    expect(parseExpandParam(undefined)).toEqual({ departments: [], branches: [] });
  });

  it("returns empty lists for an empty string", () => {
    expect(parseExpandParam("")).toEqual({ departments: [], branches: [] });
  });

  it("splits department and branch entries by prefix", () => {
    expect(parseExpandParam("dept:Operations,branch:Klang")).toEqual({
      departments: ["Operations"],
      branches: ["Klang"],
    });
  });

  it("ignores entries with no recognized prefix", () => {
    expect(parseExpandParam("Operations,dept:Academy")).toEqual({
      departments: ["Academy"],
      branches: [],
    });
  });

  it("ignores a prefix with no name", () => {
    expect(parseExpandParam("dept:,branch:Klang")).toEqual({
      departments: [],
      branches: ["Klang"],
    });
  });

  it("trims whitespace around entries", () => {
    expect(parseExpandParam(" dept:Operations , branch:Klang ")).toEqual({
      departments: ["Operations"],
      branches: ["Klang"],
    });
  });
});

describe("toggleExpandEntry", () => {
  it("adds an entry when absent, from an undefined starting value", () => {
    expect(toggleExpandEntry(undefined, "dept", "Operations")).toBe("dept:Operations");
  });

  it("removes an entry when present, leaving an empty string", () => {
    expect(toggleExpandEntry("dept:Operations", "dept", "Operations")).toBe("");
  });

  it("preserves other entries when adding", () => {
    expect(toggleExpandEntry("dept:Operations", "branch", "Klang")).toBe(
      "dept:Operations,branch:Klang",
    );
  });

  it("preserves other entries when removing", () => {
    expect(toggleExpandEntry("dept:Operations,branch:Klang", "branch", "Klang")).toBe(
      "dept:Operations",
    );
  });

  it("does not confuse a department and branch sharing a name", () => {
    const withDept = toggleExpandEntry(undefined, "dept", "Klang");
    expect(toggleExpandEntry(withDept, "branch", "Klang")).toBe("dept:Klang,branch:Klang");
  });
});
