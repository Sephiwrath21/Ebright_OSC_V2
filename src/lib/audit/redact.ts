// ─────────────────────────────────────────────────────────────
// Audit log — value masking and field diffing.
//
// Pure functions, no Prisma and no request context, so the whole
// "what actually changed, and what is safe to store" decision is
// unit-testable on its own (see redact.test.ts).
// ─────────────────────────────────────────────────────────────

/** Placeholder written in place of a sensitive value. */
export const MASK = "***";

/**
 * Columns whose *value* never reaches the audit table. The field name still
 * shows up in `changed`, so the log answers "someone changed their bank
 * account" without also handing every audit-log reader the account number.
 *
 * Matched case-insensitively against the exact column name.
 */
const SENSITIVE_EXACT = new Set([
  "password",
  "password_hash",
  "passwordhash",
  "nric",
  "token",
  "token_hash",
  "secret",
  "api_key",
  "access_token",
  "refresh_token",
  "bank_account",
  "account_number",
  "account_no",
]);

/**
 * Columns matched by shape rather than exact name — payroll/salary money
 * columns are spread across many tables (payroll, salary_revision, payslip,
 * employee_rate_history, ...) under slightly different names.
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /(^|_)salary(_|$)/i,
  /(^|_)basic_pay(_|$)/i,
  /(^|_)gross(_|$)/i,
  /(^|_)net_pay(_|$)/i,
  /(^|_)epf(_|$)/i,
  /(^|_)socso(_|$)/i,
  /(^|_)pcb(_|$)/i,
  /(^|_)bank(_|$)/i,
  /password/i,
  /_token$/i,
];

export function isSensitiveField(field: string): boolean {
  if (SENSITIVE_EXACT.has(field.toLowerCase())) return true;
  return SENSITIVE_PATTERNS.some((re) => re.test(field));
}

/**
 * Convert a Prisma value into something `JSON.stringify` handles without
 * throwing or silently losing precision. Dates become ISO strings, Decimals
 * and BigInts become strings (not numbers — a salary Decimal must not round),
 * Buffers become a size marker, and anything nested is walked.
 */
export function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `<binary ${value.byteLength}b>`;
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // Prisma Decimal (decimal.js) — has toFixed but is not a plain object.
    if (typeof obj.toFixed === "function") return String(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = toJsonSafe(v);
    return out;
  }
  return value;
}

/** A single field's value, masked if the field is sensitive. */
export function redactValue(field: string, value: unknown): unknown {
  return isSensitiveField(field) ? MASK : toJsonSafe(value);
}

/** Mask + JSON-normalise an entire row. Used for delete snapshots. */
export function redactRecord(
  row: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = redactValue(k, v);
  return out;
}

/** Deep value equality over already-JSON-safe values. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export type FieldDiff = {
  /** Names of fields whose value actually differs. */
  changed: string[];
  /** Old values for the changed fields only (masked). Null if nothing changed. */
  before: Record<string, unknown> | null;
  /** New values for the changed fields only (masked). Null if nothing changed. */
  after: Record<string, unknown> | null;
};

/**
 * Compare two rows and keep only the fields that genuinely differ.
 *
 * Storing just the delta (rather than both full rows) is what keeps an UPDATE
 * audit row small on wide tables like `users` or `employment`, while still
 * answering "what was it before?".
 *
 * Fields absent from `after` are ignored rather than treated as cleared —
 * Prisma update payloads are partial, so an absent field means "not touched".
 */
export function diffRecords(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): FieldDiff {
  const empty: FieldDiff = { changed: [], before: null, after: null };
  if (!after) return empty;

  const changed: string[] = [];
  const beforeOut: Record<string, unknown> = {};
  const afterOut: Record<string, unknown> = {};

  for (const [field, rawNew] of Object.entries(after)) {
    const newVal = toJsonSafe(rawNew);
    const oldVal = before ? toJsonSafe(before[field]) : null;
    if (before && sameValue(oldVal, newVal)) continue;

    changed.push(field);
    const masked = isSensitiveField(field);
    beforeOut[field] = before ? (masked ? MASK : oldVal) : null;
    afterOut[field] = masked ? MASK : newVal;
  }

  if (changed.length === 0) return empty;
  return {
    changed,
    before: before ? beforeOut : null,
    after: afterOut,
  };
}
