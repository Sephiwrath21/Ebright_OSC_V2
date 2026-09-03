// src/task-manager/ui/expand-param.ts
//
// Pure helpers for the ?expand= search param that drives Home's org-wide
// department/branch sections (2026-08-15) — which sections show their full
// per-person list vs. just a rollup card. Comma-separated, kind-prefixed
// entries (e.g. "dept:Operations,branch:Klang") so a department and a
// branch that happen to share a name never collide. No React, no I/O —
// safe to unit test directly and reuse from both server and client code.

export interface ParsedExpand {
  departments: string[];
  branches: string[];
}

function splitEntries(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseExpandParam(raw: string | undefined): ParsedExpand {
  const departments: string[] = [];
  const branches: string[] = [];
  for (const entry of splitEntries(raw)) {
    const sep = entry.indexOf(":");
    if (sep === -1) continue;
    const kind = entry.slice(0, sep);
    const name = entry.slice(sep + 1);
    if (!name) continue;
    if (kind === "dept") departments.push(name);
    else if (kind === "branch") branches.push(name);
  }
  return { departments, branches };
}

/** Toggles one entity in the raw ?expand= value — adds it if absent,
 *  removes it if present. Returns "" (never "undefined" or a lone comma)
 *  when nothing is left expanded, so the caller can omit the param
 *  entirely from the URL. */
export function toggleExpandEntry(
  raw: string | undefined,
  kind: "dept" | "branch",
  name: string,
): string {
  const entry = `${kind}:${name}`;
  const current = splitEntries(raw);
  const next = current.includes(entry)
    ? current.filter((e) => e !== entry)
    : [...current, entry];
  return next.join(",");
}
