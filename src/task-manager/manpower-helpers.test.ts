import { describe, expect, it } from "vitest";
import { compareColumns, nextColumnLabel, resolveSlotSync, roleForColumn } from "./manpower-helpers";

describe("resolveSlotSync", () => {
  it("unassigning an unsynced slot does nothing", () => {
    expect(resolveSlotSync(null, null, null)).toEqual({ kind: "none" });
  });

  it("unassigning a synced slot cancels its run", () => {
    expect(resolveSlotSync("rb-1", "u-a", null)).toEqual({ kind: "cancel" });
  });

  it("assigning a previously-empty slot creates a run", () => {
    expect(resolveSlotSync(null, null, "u-a")).toEqual({ kind: "create" });
  });

  it("re-picking the same assignee is a no-op", () => {
    expect(resolveSlotSync("rb-1", "u-a", "u-a")).toEqual({ kind: "none" });
  });

  it("reassigning to a different person replaces the run", () => {
    expect(resolveSlotSync("rb-1", "u-a", "u-b")).toEqual({ kind: "replace" });
  });
});

describe("roleForColumn", () => {
  it("recognizes Manager, Coach N, Exec N", () => {
    expect(roleForColumn("Manager")).toBe("Manager");
    expect(roleForColumn("Coach 1")).toBe("Coach");
    expect(roleForColumn("Coach 12")).toBe("Coach");
    expect(roleForColumn("Exec 3")).toBe("Branch Exec");
  });

  it("rejects anything else", () => {
    expect(roleForColumn("Coach")).toBeNull();
    expect(roleForColumn("Exec")).toBeNull();
    expect(roleForColumn("Intern 1")).toBeNull();
    expect(roleForColumn("")).toBeNull();
  });
});

describe("nextColumnLabel", () => {
  it("starts at 1 with no existing columns of that kind", () => {
    expect(nextColumnLabel([], "Coach")).toBe("Coach 1");
    expect(nextColumnLabel(["Manager"], "Exec")).toBe("Exec 1");
  });

  it("continues past the highest existing number, ignoring the other kind", () => {
    expect(nextColumnLabel(["Coach 1", "Coach 2", "Exec 1"], "Coach")).toBe("Coach 3");
    expect(nextColumnLabel(["Coach 1", "Coach 2", "Exec 1"], "Exec")).toBe("Exec 2");
  });

  it("fills the gap by continuing past the max, not the count, after a deletion", () => {
    // Coach 1 was deleted, leaving Coach 2 — next should be 3, not 2.
    expect(nextColumnLabel(["Coach 2"], "Coach")).toBe("Coach 3");
  });
});

describe("compareColumns", () => {
  it("sorts Manager first, then Coach ascending, then Exec ascending", () => {
    const columns = ["Exec 2", "Coach 1", "Manager", "Exec 1", "Coach 2"];
    expect([...columns].sort(compareColumns)).toEqual([
      "Manager",
      "Coach 1",
      "Coach 2",
      "Exec 1",
      "Exec 2",
    ]);
  });
});
