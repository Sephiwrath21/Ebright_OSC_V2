import { describe, expect, it } from "vitest";
import {
  MASK,
  diffRecords,
  isSensitiveField,
  redactRecord,
  toJsonSafe,
} from "./redact";

describe("isSensitiveField", () => {
  it("matches the exact-name denylist regardless of case", () => {
    expect(isSensitiveField("password")).toBe(true);
    expect(isSensitiveField("NRIC")).toBe(true);
    expect(isSensitiveField("account_number")).toBe(true);
  });

  it("matches money and credential columns by shape", () => {
    expect(isSensitiveField("basic_salary")).toBe(true);
    expect(isSensitiveField("net_pay")).toBe(true);
    expect(isSensitiveField("epf_employee")).toBe(true);
    expect(isSensitiveField("bank_name")).toBe(true);
    expect(isSensitiveField("reset_token")).toBe(true);
  });

  it("leaves ordinary columns alone", () => {
    expect(isSensitiveField("status")).toBe(false);
    expect(isSensitiveField("full_name")).toBe(false);
    expect(isSensitiveField("branch_id")).toBe(false);
    // "amount" on a claim is the point of the audit trail, not a secret.
    expect(isSensitiveField("amount")).toBe(false);
  });
});

describe("toJsonSafe", () => {
  it("renders dates as ISO strings", () => {
    expect(toJsonSafe(new Date("2026-09-12T03:04:05.000Z"))).toBe("2026-09-12T03:04:05.000Z");
  });

  it("stringifies bigints rather than throwing", () => {
    // BigInt(...) rather than a `n` literal: tsconfig targets below ES2020.
    expect(toJsonSafe(BigInt("9007199254740993"))).toBe("9007199254740993");
  });

  it("stringifies Decimal-like values instead of coercing to a lossy number", () => {
    // Stand-in for Prisma's Decimal: an object exposing toFixed.
    const decimal = { toFixed: () => "1234.56", toString: () => "1234.56" };
    expect(toJsonSafe(decimal)).toBe("1234.56");
  });

  it("walks nested structures", () => {
    expect(toJsonSafe({ a: [new Date(0)], b: { c: BigInt(1) } })).toEqual({
      a: ["1970-01-01T00:00:00.000Z"],
      b: { c: "1" },
    });
  });

  it("normalises undefined to null", () => {
    expect(toJsonSafe(undefined)).toBeNull();
  });
});

describe("redactRecord", () => {
  it("masks sensitive values but keeps the field present", () => {
    const out = redactRecord({ user_id: 7, email: "a@b.my", password: "hunter2" });
    expect(out).toEqual({ user_id: 7, email: "a@b.my", password: MASK });
  });

  it("returns null for a missing row", () => {
    expect(redactRecord(null)).toBeNull();
  });
});

describe("diffRecords", () => {
  it("keeps only the fields that actually changed", () => {
    const before = { id: 1, status: "pending", note: "same", updated_by: 3 };
    const after = { id: 1, status: "approved", note: "same", updated_by: 9 };

    const diff = diffRecords(before, after);
    expect(diff.changed).toEqual(["status", "updated_by"]);
    expect(diff.before).toEqual({ status: "pending", updated_by: 3 });
    expect(diff.after).toEqual({ status: "approved", updated_by: 9 });
  });

  it("reports no change when a write rewrites identical values", () => {
    const row = { id: 1, status: "approved" };
    expect(diffRecords(row, { ...row }).changed).toEqual([]);
  });

  it("treats a field absent from `after` as untouched, not cleared", () => {
    const diff = diffRecords({ id: 1, a: "x", b: "y" }, { id: 1, a: "x" });
    expect(diff.changed).toEqual([]);
  });

  it("compares dates by value, not identity", () => {
    const diff = diffRecords(
      { at: new Date("2026-01-01T00:00:00Z") },
      { at: new Date("2026-01-01T00:00:00Z") },
    );
    expect(diff.changed).toEqual([]);
  });

  it("detects a real date change", () => {
    const diff = diffRecords(
      { at: new Date("2026-01-01T00:00:00Z") },
      { at: new Date("2026-02-01T00:00:00Z") },
    );
    expect(diff.changed).toEqual(["at"]);
    expect(diff.after).toEqual({ at: "2026-02-01T00:00:00.000Z" });
  });

  it("masks a changed sensitive field on both sides", () => {
    const diff = diffRecords({ password: "old" }, { password: "new" });
    expect(diff.changed).toEqual(["password"]);
    expect(diff.before).toEqual({ password: MASK });
    expect(diff.after).toEqual({ password: MASK });
  });

  it("records every field as new when there is no before-state", () => {
    const diff = diffRecords(null, { id: 1, status: "draft" });
    expect(diff.changed).toEqual(["id", "status"]);
    expect(diff.before).toBeNull();
    expect(diff.after).toEqual({ id: 1, status: "draft" });
  });

  it("compares nested objects structurally", () => {
    expect(diffRecords({ meta: { a: 1 } }, { meta: { a: 1 } }).changed).toEqual([]);
    expect(diffRecords({ meta: { a: 1 } }, { meta: { a: 2 } }).changed).toEqual(["meta"]);
  });

  it("returns an empty diff when there is no after-state at all", () => {
    expect(diffRecords({ a: 1 }, null).changed).toEqual([]);
  });
});
