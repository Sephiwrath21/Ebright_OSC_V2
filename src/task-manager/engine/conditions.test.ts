// Unit tests for the pure condition evaluator (PROJECT_GUIDE §4).
// These semantics are load-bearing: silent routing bugs strand runs.

import { describe, expect, it } from "vitest";
import type { ConditionalEdge, RunItemValue } from "../lib/types";
import { evaluateConditions } from "./conditions";

const edge = (condition: ConditionalEdge["condition"], targetNodeId: string): ConditionalEdge => ({
  condition,
  targetNodeId,
});

const item = (
  itemId: string,
  op: Extract<ConditionalEdge["condition"], { kind: "item" }>["op"],
  target: string,
  value?: unknown,
): ConditionalEdge => edge({ kind: "item", itemId, op, value }, target);

const values = (entries: Record<string, RunItemValue>) => new Map(Object.entries(entries));

describe("evaluateConditions — basics", () => {
  it("returns [] for empty edges", () => {
    expect(evaluateConditions([], values({}))).toEqual([]);
    expect(evaluateConditions([], {})).toEqual([]);
  });

  it("'always' matches regardless of values", () => {
    expect(evaluateConditions([edge({ kind: "always" }, "n1")], values({}))).toEqual(["n1"]);
  });

  it("accepts a plain Record as the values input", () => {
    const edges = [item("i1", "is_checked", "n1")];
    const record: Record<string, RunItemValue> = { i1: { type: "CHECKBOX", checked: true } };
    expect(evaluateConditions(edges, record)).toEqual(["n1"]);
  });

  it("deduplicates repeated targets", () => {
    const edges = [edge({ kind: "always" }, "n1"), edge({ kind: "always" }, "n1")];
    expect(evaluateConditions(edges, values({}))).toEqual(["n1"]);
  });
});

describe("evaluateConditions — item ops per type", () => {
  it("is_checked / not_checked -> CHECKBOX.checked", () => {
    const checked = values({ i1: { type: "CHECKBOX", checked: true } });
    const unchecked = values({ i1: { type: "CHECKBOX", checked: false } });
    expect(evaluateConditions([item("i1", "is_checked", "yes")], checked)).toEqual(["yes"]);
    expect(evaluateConditions([item("i1", "is_checked", "yes")], unchecked)).toEqual([]);
    expect(evaluateConditions([item("i1", "not_checked", "no")], unchecked)).toEqual(["no"]);
    expect(evaluateConditions([item("i1", "not_checked", "no")], checked)).toEqual([]);
    // a missing value matches NEITHER is_checked nor not_checked
    expect(evaluateConditions([item("i1", "not_checked", "no")], values({}))).toEqual([]);
  });

  it("is_yes / is_no -> YES_NO.answer", () => {
    const yes = values({ q: { type: "YES_NO", answer: "yes" } });
    const no = values({ q: { type: "YES_NO", answer: "no" } });
    expect(evaluateConditions([item("q", "is_yes", "a")], yes)).toEqual(["a"]);
    expect(evaluateConditions([item("q", "is_yes", "a")], no)).toEqual([]);
    expect(evaluateConditions([item("q", "is_no", "b")], no)).toEqual(["b"]);
    expect(evaluateConditions([item("q", "is_no", "b")], yes)).toEqual([]);
  });

  it("approved / rejected -> APPROVAL.decision", () => {
    const ok = values({ ap: { type: "APPROVAL", decision: "approved" } });
    const nope = values({ ap: { type: "APPROVAL", decision: "rejected", note: "budget" } });
    expect(evaluateConditions([item("ap", "approved", "go")], ok)).toEqual(["go"]);
    expect(evaluateConditions([item("ap", "approved", "go")], nope)).toEqual([]);
    expect(evaluateConditions([item("ap", "rejected", "stop")], nope)).toEqual(["stop"]);
    expect(evaluateConditions([item("ap", "rejected", "stop")], ok)).toEqual([]);
  });

  it("gt / gte / lt / lte -> NUMBER.number", () => {
    const v = values({ n: { type: "NUMBER", number: 10 } });
    expect(evaluateConditions([item("n", "gt", "t", 5)], v)).toEqual(["t"]);
    expect(evaluateConditions([item("n", "gt", "t", 10)], v)).toEqual([]);
    expect(evaluateConditions([item("n", "gte", "t", 10)], v)).toEqual(["t"]);
    expect(evaluateConditions([item("n", "gte", "t", 11)], v)).toEqual([]);
    expect(evaluateConditions([item("n", "lt", "t", 11)], v)).toEqual(["t"]);
    expect(evaluateConditions([item("n", "lt", "t", 10)], v)).toEqual([]);
    expect(evaluateConditions([item("n", "lte", "t", 10)], v)).toEqual(["t"]);
    expect(evaluateConditions([item("n", "lte", "t", 9)], v)).toEqual([]);
  });

  it("numeric ops coerce a numeric-string condition value", () => {
    const v = values({ n: { type: "NUMBER", number: 10 } });
    expect(evaluateConditions([item("n", "gt", "t", "5")], v)).toEqual(["t"]);
    expect(evaluateConditions([item("n", "gt", "t", "not-a-number")], v)).toEqual([]);
  });

  it("numeric ops do not match non-NUMBER values", () => {
    const v = values({ n: { type: "TEXT", text: "10" } });
    expect(evaluateConditions([item("n", "gt", "t", 5)], v)).toEqual([]);
  });

  it("eq / neq are type-appropriate", () => {
    const v = values({
      t: { type: "TEXT", text: "hello" },
      n: { type: "NUMBER", number: 5 },
      d: { type: "DROPDOWN", selected: "Legal" },
      q: { type: "YES_NO", answer: "yes" },
    });
    expect(evaluateConditions([item("t", "eq", "a", "hello")], v)).toEqual(["a"]);
    expect(evaluateConditions([item("t", "eq", "a", "world")], v)).toEqual([]);
    expect(evaluateConditions([item("n", "eq", "b", 5)], v)).toEqual(["b"]);
    expect(evaluateConditions([item("n", "eq", "b", "5")], v)).toEqual(["b"]); // coerced
    expect(evaluateConditions([item("d", "eq", "c", "Legal")], v)).toEqual(["c"]);
    expect(evaluateConditions([item("q", "eq", "d1", "yes")], v)).toEqual(["d1"]);
    expect(evaluateConditions([item("t", "neq", "e", "world")], v)).toEqual(["e"]);
    expect(evaluateConditions([item("t", "neq", "e", "hello")], v)).toEqual([]);
  });

  it("neq does NOT match when the value is missing (missing never matches)", () => {
    expect(evaluateConditions([item("ghost", "neq", "t", "anything")], values({}))).toEqual([]);
  });

  it("contains -> substring match on the type-appropriate text", () => {
    const v = values({
      t: { type: "TEXT", text: "Quarterly Budget Review" },
      d: { type: "DROPDOWN", selected: "Finance Dept" },
    });
    expect(evaluateConditions([item("t", "contains", "a", "Budget")], v)).toEqual(["a"]);
    expect(evaluateConditions([item("t", "contains", "a", "budget")], v)).toEqual(["a"]); // case-insensitive
    expect(evaluateConditions([item("t", "contains", "a", "Payroll")], v)).toEqual([]);
    expect(evaluateConditions([item("d", "contains", "b", "finance")], v)).toEqual(["b"]);
  });
});

describe("evaluateConditions — op vs value-type mismatches (no match, no throw)", () => {
  // A wrong branch is the worst silent failure: every boolean-flavoured op is
  // pinned to its one value type; ANY other type must simply not match.
  const mismatches: Array<[string, RunItemValue]> = [
    ["NUMBER", { type: "NUMBER", number: 1 }],
    ["TEXT", { type: "TEXT", text: "yes" }],
    ["DROPDOWN", { type: "DROPDOWN", selected: "yes" }],
    ["DUE_DATE", { type: "DUE_DATE", date: "2026-07-16T00:00:00.000Z" }],
  ];

  it.each(mismatches)("is_yes against a %s value does not match", (_label, value) => {
    const v = values({ x: value });
    expect(() => evaluateConditions([item("x", "is_yes", "t")], v)).not.toThrow();
    expect(evaluateConditions([item("x", "is_yes", "t")], v)).toEqual([]);
  });

  it("is_yes / is_no never match a CHECKBOX, even when checked", () => {
    const v = values({ x: { type: "CHECKBOX", checked: true } });
    expect(evaluateConditions([item("x", "is_yes", "t")], v)).toEqual([]);
    expect(evaluateConditions([item("x", "is_no", "t")], v)).toEqual([]);
  });

  it("is_checked / not_checked never match a YES_NO or SUB_ASSIGNEE_TASK", () => {
    const v = values({
      q: { type: "YES_NO", answer: "yes" },
      s: { type: "SUB_ASSIGNEE_TASK", assigneeId: "u1", done: true },
    });
    expect(evaluateConditions([item("q", "is_checked", "t")], v)).toEqual([]);
    expect(evaluateConditions([item("s", "is_checked", "t")], v)).toEqual([]);
    expect(evaluateConditions([item("q", "not_checked", "t")], v)).toEqual([]);
    expect(evaluateConditions([item("s", "not_checked", "t")], v)).toEqual([]);
  });

  it("approved / rejected never match a YES_NO or TEXT that says 'approved'", () => {
    const v = values({
      q: { type: "YES_NO", answer: "yes" },
      t: { type: "TEXT", text: "approved" },
    });
    expect(evaluateConditions([item("q", "approved", "x")], v)).toEqual([]);
    expect(evaluateConditions([item("t", "approved", "x")], v)).toEqual([]);
    expect(evaluateConditions([item("t", "rejected", "x")], v)).toEqual([]);
  });

  it("numeric ops never match DUE_DATE / TEXT / CHECKBOX values", () => {
    const v = values({
      d: { type: "DUE_DATE", date: "2026-07-16T00:00:00.000Z" },
      t: { type: "TEXT", text: "42" },
      c: { type: "CHECKBOX", checked: true },
    });
    for (const id of ["d", "t", "c"]) {
      expect(evaluateConditions([item(id, "gt", "x", 0)], v)).toEqual([]);
      expect(evaluateConditions([item(id, "lte", "x", 100)], v)).toEqual([]);
    }
  });

  it("a mismatched edge falls through to else", () => {
    const edges = [item("x", "is_yes", "wrong"), edge({ kind: "else" }, "safe")];
    const v = values({ x: { type: "NUMBER", number: 7 } });
    expect(evaluateConditions(edges, v)).toEqual(["safe"]);
  });
});

describe("evaluateConditions — eq/neq/contains on boolean-backed types", () => {
  it("eq on CHECKBOX compares the boolean (accepts boolean or 'true'/'false' strings)", () => {
    const v = values({ c: { type: "CHECKBOX", checked: true } });
    expect(evaluateConditions([item("c", "eq", "a", true)], v)).toEqual(["a"]);
    expect(evaluateConditions([item("c", "eq", "a", "true")], v)).toEqual(["a"]);
    expect(evaluateConditions([item("c", "eq", "a", false)], v)).toEqual([]);
    expect(evaluateConditions([item("c", "neq", "b", false)], v)).toEqual(["b"]);
  });

  it("contains never matches a boolean-backed value", () => {
    const v = values({ c: { type: "CHECKBOX", checked: true } });
    expect(evaluateConditions([item("c", "contains", "a", "tru")], v)).toEqual([]);
  });

  it("eq on APPROVAL compares the decision string", () => {
    const v = values({ ap: { type: "APPROVAL", decision: "approved" } });
    expect(evaluateConditions([item("ap", "eq", "a", "approved")], v)).toEqual(["a"]);
    expect(evaluateConditions([item("ap", "eq", "a", "rejected")], v)).toEqual([]);
  });
});

describe("evaluateConditions — else semantics", () => {
  const edges: ConditionalEdge[] = [
    item("q", "is_yes", "approved-path"),
    item("n", "gt", "big-path", 100),
    edge({ kind: "else" }, "fallback"),
  ];

  it("else fires ONLY when nothing else matched — and fires alone", () => {
    const nothing = values({
      q: { type: "YES_NO", answer: "no" },
      n: { type: "NUMBER", number: 5 },
    });
    expect(evaluateConditions(edges, nothing)).toEqual(["fallback"]);
  });

  it("else does NOT fire when any other edge matched", () => {
    const oneMatch = values({
      q: { type: "YES_NO", answer: "yes" },
      n: { type: "NUMBER", number: 5 },
    });
    expect(evaluateConditions(edges, oneMatch)).toEqual(["approved-path"]);
  });

  it("else is excluded from a multi-match fan-out", () => {
    const bothMatch = values({
      q: { type: "YES_NO", answer: "yes" },
      n: { type: "NUMBER", number: 500 },
    });
    const result = evaluateConditions(edges, bothMatch);
    expect(result).toEqual(["approved-path", "big-path"]);
    expect(result).not.toContain("fallback");
  });

  it("else fires when values are entirely missing", () => {
    expect(evaluateConditions(edges, values({}))).toEqual(["fallback"]);
  });

  it("an edge list of ONLY an else edge fires it (else-fires-alone)", () => {
    expect(evaluateConditions([edge({ kind: "else" }, "only")], values({}))).toEqual(["only"]);
  });

  it("multiple else edges all fire together when nothing matched", () => {
    const onlyElses = [edge({ kind: "else" }, "e1"), edge({ kind: "else" }, "e2")];
    expect(evaluateConditions(onlyElses, values({}))).toEqual(["e1", "e2"]);
  });

  it("else stays suppressed even when listed before the matching edge", () => {
    // Defensive: the canvas keeps else last, but a hand-edited template must not
    // fan out into BOTH the real branch and the fallback.
    const reordered = [edge({ kind: "else" }, "fallback"), item("q", "is_yes", "real")];
    const v = values({ q: { type: "YES_NO", answer: "yes" } });
    expect(evaluateConditions(reordered, v)).toEqual(["real"]);
  });
});

describe("evaluateConditions — parallel fan-out", () => {
  it("multiple non-else matches ALL fire", () => {
    const edges: ConditionalEdge[] = [
      edge({ kind: "always" }, "n1"),
      item("c", "is_checked", "n2"),
      item("num", "gte", "n3", 10),
      item("q", "is_no", "n4"),
    ];
    const v = values({
      c: { type: "CHECKBOX", checked: true },
      num: { type: "NUMBER", number: 10 },
      q: { type: "YES_NO", answer: "yes" },
    });
    expect(evaluateConditions(edges, v)).toEqual(["n1", "n2", "n3"]);
  });
});

describe("evaluateConditions — malformed input never throws", () => {
  it("skips malformed edges and conditions", () => {
    const junk = [
      null,
      undefined,
      42,
      "edge",
      {},
      { targetNodeId: "t1" }, // no condition
      { condition: { kind: "always" } }, // no target
      { condition: { kind: "always" }, targetNodeId: "" }, // empty target
      { condition: { kind: "banana" }, targetNodeId: "t2" }, // unknown kind
      { condition: { kind: "item" }, targetNodeId: "t3" }, // item without itemId/op
      { condition: { kind: "item", itemId: "i", op: "explode" }, targetNodeId: "t4" }, // bad op
      edge({ kind: "always" }, "good"),
    ] as unknown as ConditionalEdge[];
    expect(() => evaluateConditions(junk, values({}))).not.toThrow();
    expect(evaluateConditions(junk, values({}))).toEqual(["good"]);
  });

  it("malformed values never match and never crash", () => {
    const edges = [
      item("a", "is_checked", "n1"),
      item("b", "gt", "n2", 3),
      item("c", "eq", "n3", "x"),
      item("d", "contains", "n4", "x"),
    ];
    const junkValues = {
      a: null,
      b: "hello",
      c: 123,
      d: { nonsense: true },
    } as unknown as Record<string, RunItemValue>;
    expect(() => evaluateConditions(edges, junkValues)).not.toThrow();
    expect(evaluateConditions(edges, junkValues)).toEqual([]);
  });

  it("a NUMBER value with a non-numeric payload does not match", () => {
    const v = { n: { type: "NUMBER", number: "ten" } } as unknown as Record<string, RunItemValue>;
    expect(evaluateConditions([item("n", "gt", "t", 5)], v)).toEqual([]);
    expect(evaluateConditions([item("n", "eq", "t", "ten")], v)).toEqual([]);
  });

  it("non-array edges input returns []", () => {
    expect(evaluateConditions(null as unknown as ConditionalEdge[], values({}))).toEqual([]);
    expect(evaluateConditions({} as unknown as ConditionalEdge[], values({}))).toEqual([]);
  });
});
