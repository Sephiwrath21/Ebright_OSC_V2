// Pure condition evaluation (PROJECT_GUIDE §4 "Condition evaluation").
// NO runtime imports — type-only imports keep this module loadable anywhere
// (vitest, worker, Next) with zero side effects.
//
// Semantics (normative):
//   - `always` matches unconditionally.
//   - `item` ops compare against the submitted RunItemValue for that itemId:
//       is_checked / not_checked -> CHECKBOX.checked
//       is_yes / is_no           -> YES_NO.answer
//       approved / rejected      -> APPROVAL.decision
//       gt / gte / lt / lte      -> NUMBER.number (condition value coerced to number)
//       eq / neq / contains      -> type-appropriate primitive (text, number,
//                                   selected, answer, decision, date, checked...)
//   - `else` matches ONLY if no non-else edge matched, and then fires alone.
//   - Multiple non-else matches ALL fire (parallel fan-out).
//   - Malformed edges / missing values NEVER throw — they simply don't match.

import type {
  Condition,
  ConditionalEdge,
  ConditionOp,
  RunItemValue,
} from "../lib/types";

export type ConditionValues =
  | Map<string, RunItemValue>
  | Record<string, RunItemValue>;

const VALID_OPS: ReadonlySet<string> = new Set<ConditionOp>([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "is_checked",
  "not_checked",
  "is_yes",
  "is_no",
  "approved",
  "rejected",
]);

function lookup(values: ConditionValues, itemId: string): RunItemValue | undefined {
  if (values instanceof Map) return values.get(itemId);
  if (values && typeof values === "object" && Object.prototype.hasOwnProperty.call(values, itemId)) {
    return values[itemId];
  }
  return undefined;
}

/** Best-effort numeric coercion; undefined when not a clean finite number. */
function toNumber(raw: unknown): number | undefined {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asString(raw: unknown): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

function asBoolean(raw: unknown): boolean | undefined {
  return typeof raw === "boolean" ? raw : undefined;
}

/**
 * The single primitive an eq/neq/contains comparison targets, per value type.
 * Each field is type-checked so a malformed payload (e.g. NUMBER.number = "ten")
 * yields undefined — malformed values must never match.
 */
function comparablePrimitive(value: RunItemValue): string | number | boolean | undefined {
  switch (value.type) {
    case "CHECKBOX":
      return asBoolean(value.checked);
    case "TEXT":
      return asString(value.text);
    case "YES_NO":
      return asString(value.answer);
    case "NUMBER":
      return typeof value.number === "number" && Number.isFinite(value.number)
        ? value.number
        : undefined;
    case "DROPDOWN":
      return asString(value.selected);
    case "DUE_DATE":
      return asString(value.date);
    case "APPROVAL":
      return asString(value.decision);
    case "SUB_ASSIGNEE_TASK":
      return asBoolean(value.done);
    case "FILE_UPLOAD":
      return asString(value.fileName);
    case "IMAGE_EMBED":
      return asString(value.caption) ?? asString(value.url);
    default:
      return undefined;
  }
}

function equals(prim: string | number | boolean, expected: unknown): boolean {
  if (typeof prim === "number") {
    const n = toNumber(expected);
    return n !== undefined && n === prim;
  }
  if (typeof prim === "boolean") {
    if (typeof expected === "boolean") return expected === prim;
    return typeof expected === "string" && expected.toLowerCase() === String(prim);
  }
  return (
    (typeof expected === "string" || typeof expected === "number") &&
    String(expected) === prim
  );
}

function matchesItemCondition(
  condition: Extract<Condition, { kind: "item" }>,
  value: RunItemValue | undefined,
): boolean {
  // Missing / malformed values never match (and never throw).
  if (!value || typeof value !== "object" || typeof (value as { type?: unknown }).type !== "string") {
    return false;
  }
  const op = condition.op;
  if (typeof op !== "string" || !VALID_OPS.has(op)) return false;

  switch (op) {
    case "is_checked":
      return value.type === "CHECKBOX" && value.checked === true;
    case "not_checked":
      return value.type === "CHECKBOX" && value.checked === false;
    case "is_yes":
      return value.type === "YES_NO" && value.answer === "yes";
    case "is_no":
      return value.type === "YES_NO" && value.answer === "no";
    case "approved":
      return value.type === "APPROVAL" && value.decision === "approved";
    case "rejected":
      return value.type === "APPROVAL" && value.decision === "rejected";
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (value.type !== "NUMBER" || typeof value.number !== "number") return false;
      const expected = toNumber(condition.value);
      if (expected === undefined || !Number.isFinite(value.number)) return false;
      switch (op) {
        case "gt":
          return value.number > expected;
        case "gte":
          return value.number >= expected;
        case "lt":
          return value.number < expected;
        case "lte":
          return value.number <= expected;
      }
      return false;
    }
    case "eq": {
      const prim = comparablePrimitive(value);
      return prim !== undefined && equals(prim, condition.value);
    }
    case "neq": {
      const prim = comparablePrimitive(value);
      return prim !== undefined && !equals(prim, condition.value);
    }
    case "contains": {
      const prim = comparablePrimitive(value);
      if (prim === undefined || typeof prim === "boolean") return false;
      const expected = condition.value;
      if (typeof expected !== "string" && typeof expected !== "number") return false;
      return String(prim).toLowerCase().includes(String(expected).toLowerCase());
    }
    default:
      return false;
  }
}

/**
 * Evaluate an ordered list of conditional edges against submitted item values.
 * Returns the targetNodeIds of ALL matching non-else edges (parallel fan-out);
 * if none matched, returns the else edges' targets (the fallback fires alone).
 * Never throws — malformed edges/conditions/values simply do not match.
 */
export function evaluateConditions(
  edges: ConditionalEdge[],
  values: ConditionValues,
): string[] {
  if (!Array.isArray(edges)) return [];

  const matched: string[] = [];
  const elseTargets: string[] = [];

  for (const edge of edges) {
    try {
      if (!edge || typeof edge !== "object") continue;
      const target = edge.targetNodeId;
      if (typeof target !== "string" || target.length === 0) continue;
      const condition = edge.condition as Condition | undefined;
      if (!condition || typeof condition !== "object") continue;

      switch (condition.kind) {
        case "always":
          matched.push(target);
          break;
        case "else":
          elseTargets.push(target);
          break;
        case "item": {
          if (typeof condition.itemId !== "string" || condition.itemId.length === 0) break;
          if (matchesItemCondition(condition, lookup(values, condition.itemId))) {
            matched.push(target);
          }
          break;
        }
        default:
          // unknown kind — malformed, skip
          break;
      }
    } catch {
      // defensive: a malformed edge must never break routing
    }
  }

  const winners = matched.length > 0 ? matched : elseTargets;
  return [...new Set(winners)];
}
