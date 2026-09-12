import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, describeAudit, entityLabel } from "./describe";

describe("entityLabel", () => {
  it("uses the friendly name where one is defined", () => {
    expect(entityLabel("leave_request")).toBe("leave request");
    expect(entityLabel("users")).toBe("user account");
  });

  it("falls back to the de-underscored model name for unmapped tables", () => {
    expect(entityLabel("some_new_table")).toBe("some new table");
  });
});

describe("describeAudit", () => {
  it("names the record and the fields that changed on an update", () => {
    expect(
      describeAudit({
        action: "UPDATE",
        entity: "leave_request",
        entityId: "412",
        changed: ["status", "approved_by"],
      }),
    ).toBe("Updated leave request #412 (status, approved_by)");
  });

  it("truncates a long field list", () => {
    const changed = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(describeAudit({ action: "UPDATE", entity: "users", entityId: "1", changed })).toBe(
      "Updated user account #1 (a, b, c, d, e, f +2 more)",
    );
  });

  it("describes a create", () => {
    expect(describeAudit({ action: "CREATE", entity: "claim", entityId: "88" })).toBe(
      "Created claim #88",
    );
  });

  it("describes a delete", () => {
    expect(describeAudit({ action: "DELETE", entity: "announcement", entityId: "3" })).toBe(
      "Deleted announcement #3",
    );
  });

  it("pluralises bulk operations and drops the id", () => {
    expect(describeAudit({ action: "DELETE", entity: "attendance", rowCount: 3 })).toBe(
      "Deleted 3 attendance records",
    );
  });

  it("omits the id when there is none", () => {
    expect(describeAudit({ action: "CREATE", entity: "claim" })).toBe("Created claim");
  });

  it("does not list changed fields on a bulk update", () => {
    expect(
      describeAudit({ action: "UPDATE", entity: "claim", rowCount: 5, changed: ["status"] }),
    ).toBe("Updated 5 claims");
  });

  it("uses the detail phrase for exports", () => {
    expect(
      describeAudit({ action: "EXPORT", entity: "audit_log", detail: "audit log to CSV" }),
    ).toBe("Exported audit log to CSV");
  });

  it("renders sign-in events without an entity", () => {
    expect(describeAudit({ action: "LOGIN", entity: "users" })).toBe("Logged in");
    expect(
      describeAudit({ action: "LOGIN_FAILED", entity: "users", detail: "wrong password" }),
    ).toBe("Failed login (wrong password)");
  });

  it("falls back to the raw action for anything unmapped", () => {
    expect(describeAudit({ action: "FROBNICATE", entity: "claim", entityId: "1" })).toBe(
      "FROBNICATE claim #1",
    );
  });

  it("has a verb for every action it advertises", () => {
    for (const action of AUDIT_ACTIONS) {
      const out = describeAudit({ action, entity: "claim", entityId: "1" });
      expect(out).not.toContain(action);
    }
  });
});
