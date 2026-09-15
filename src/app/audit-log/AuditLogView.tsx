"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RotateCw,
  Search,
  ScrollText,
  X,
} from "lucide-react";
import type { AuditLogRow } from "@/app/api/audit-log/route";

// ─── Presentation constants ───────────────────────────────────────────────────

const ACTION_STYLE: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
  UPDATE: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300",
  LOGIN: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300",
  LOGOUT: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  LOGIN_FAILED: "bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300",
  EXPORT: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
  DOWNLOAD: "bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300",
};

const ACTION_LABEL: Record<string, string> = {
  LOGIN_FAILED: "LOGIN FAILED",
};

const PAGE_SIZE = 50;

// ─── Filters ──────────────────────────────────────────────────────────────────

type Filters = {
  search: string;
  action: string;
  entity: string;
  actorType: "user" | "all";
  dateFrom: string;
  dateTo: string;
};

const EMPTY_FILTERS: Filters = {
  search: "",
  action: "",
  entity: "",
  actorType: "user",
  dateFrom: "",
  dateTo: "",
};

function toQuery(filters: Filters, page: number): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set("page", String(page));
  sp.set("pageSize", String(PAGE_SIZE));
  sp.set("actorType", filters.actorType);
  if (filters.search) sp.set("search", filters.search);
  if (filters.action) sp.set("action", filters.action);
  if (filters.entity) sp.set("entity", filters.entity);
  if (filters.dateFrom) sp.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) sp.set("dateTo", filters.dateTo);
  return sp;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** Malaysia is UTC+8 and the whole company is there — show local wall time. */
const TIME_ZONE = "Asia/Kuala_Lumpur";

function formatWhen(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-GB", {
      timeZone: TIME_ZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("en-GB", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

/** Render a stored JSON value compactly; `null` reads better as "—". */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value === "" ? '""' : value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

type RecordMap = Record<string, unknown> | null;

function asRecord(value: unknown): RecordMap {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// ─── Row detail ───────────────────────────────────────────────────────────────

function DetailRow({ row, columns }: { row: AuditLogRow; columns: number }) {
  const before = asRecord(row.before);
  const after = asRecord(row.after);

  // Bulk operations store { rows: [...] } rather than a field-level diff.
  const bulkBefore = Array.isArray((before as { rows?: unknown })?.rows)
    ? ((before as { rows: unknown[] }).rows as unknown[])
    : null;
  const bulkAfter = Array.isArray((after as { rows?: unknown })?.rows)
    ? ((after as { rows: unknown[] }).rows as unknown[])
    : null;

  const fields = useMemo(() => {
    if (bulkBefore || bulkAfter) return [];
    const keys = new Set<string>([
      ...row.changed,
      ...(before ? Object.keys(before) : []),
      ...(after ? Object.keys(after) : []),
    ]);
    return [...keys].sort();
  }, [row.changed, before, after, bulkBefore, bulkAfter]);

  return (
    <tr className="bg-slate-50 dark:bg-slate-900/40">
      <td colSpan={columns} className="px-4 py-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            {fields.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800">
                    <tr className="text-left text-slate-600 dark:text-slate-300">
                      <th className="px-3 py-2 font-medium">Field</th>
                      <th className="px-3 py-2 font-medium">Before</th>
                      <th className="px-3 py-2 font-medium">After</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {fields.map((field) => (
                      <tr key={field} className="align-top">
                        <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">
                          {field}
                        </td>
                        <td className="px-3 py-2 break-all text-red-700 dark:text-red-300">
                          {formatValue(before?.[field])}
                        </td>
                        <td className="px-3 py-2 break-all text-emerald-700 dark:text-emerald-300">
                          {formatValue(after?.[field])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : bulkBefore || bulkAfter ? (
              <div className="space-y-3">
                {bulkBefore && (
                  <LabelledJson label={`Rows before (${bulkBefore.length} shown)`} value={bulkBefore} />
                )}
                {bulkAfter ? (
                  <LabelledJson label={`Rows after (${bulkAfter.length} shown)`} value={bulkAfter} />
                ) : after ? (
                  <LabelledJson label="Change applied" value={after} />
                ) : null}
              </div>
            ) : after ? (
              <LabelledJson label="Details" value={after} />
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No field-level detail recorded for this entry.
              </p>
            )}
          </div>

          <dl className="space-y-2 text-xs">
            <Meta label="Entry ID" value={row.id} />
            <Meta label="Record type" value={row.entity} mono />
            <Meta label="Record ID" value={row.entityId ?? "—"} mono />
            <Meta label="Rows affected" value={String(row.rowCount)} />
            <Meta label="Page" value={row.route ?? "—"} mono />
            {/* No IP address row: client IPs are not collected at all as of
                2026-09-15 — not captured, not stored, not exported, and the
                column has been dropped. */}
            <Meta label="Browser" value={row.userAgent ?? "—"} />
          </dl>
        </div>
      </td>
    </tr>
  );
}

function LabelledJson({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
      <dd
        className={`min-w-0 break-all text-slate-700 dark:text-slate-200 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function AuditLogView({
  actionOptions,
  entityOptions,
  canExport,
}: {
  actionOptions: readonly string[];
  entityOptions: { value: string; label: string }[];
  canExport: boolean;
}) {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const [expanded, setExpanded] = useState<string | null>(null);
  /** Bumped by Refresh to re-run the same query. */
  const [nonce, setNonce] = useState(0);

  // `loading` is derived from "the result on hand is not for the query we
  // want" rather than stored, so the effect below never calls setState
  // synchronously — only inside the fetch continuation. Keeping the previous
  // rows on screen while the next page loads falls out of this for free.
  const requestKey = useMemo(
    () => JSON.stringify({ applied, page, nonce }),
    [applied, page, nonce],
  );

  const [result, setResult] = useState<{
    key: string;
    rows: AuditLogRow[];
    total: number;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const key = requestKey;

    fetch(`/api/audit-log?${toQuery(applied, page)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as { rows: AuditLogRow[]; total: number };
        setResult({ key, rows: data.rows, total: data.total, error: null });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setResult({
          key,
          rows: [],
          total: 0,
          error: err instanceof Error ? err.message : "Failed to load the audit log",
        });
      });

    return () => controller.abort();
  }, [requestKey, applied, page]);

  const loading = result?.key !== requestKey;
  const rows = result?.rows ?? [];
  const total = result?.total ?? 0;
  const error = loading ? null : (result?.error ?? null);

  function applyFilters() {
    setPage(1);
    setApplied(draft);
  }

  function resetFilters() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(page * PAGE_SIZE, total);
  const filtersDirty = JSON.stringify(draft) !== JSON.stringify(EMPTY_FILTERS);
  const COLUMNS = 6;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white dark:bg-slate-700">
            <ScrollText className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Log</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Every change made in the portal — who did it, what changed, and when.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {canExport && (
            // A plain link, not a fetch + blob: the response already carries
            // Content-Disposition, and the server records the EXPORT event.
            <a
              href={`/api/audit-log?${toQuery(applied, 1)}&format=csv`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </a>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={draft.search}
              onChange={(e) => setDraft({ ...draft, search: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              placeholder="Search person, description, record ID…"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <select
            value={draft.action}
            onChange={(e) => setDraft({ ...draft, action: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">All actions</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a] ?? a}
              </option>
            ))}
          </select>

          <select
            value={draft.entity}
            onChange={(e) => setDraft({ ...draft, entity: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">All record types</option>
            {entityOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={draft.dateFrom}
            onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            aria-label="From date"
          />
          <input
            type="date"
            value={draft.dateTo}
            onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            aria-label="To date"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {/* The attendance sync writes far more rows than people do, so system
              activity is opt-in rather than the default view. */}
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={draft.actorType === "all"}
              onChange={(e) => setDraft({ ...draft, actorType: e.target.checked ? "all" : "user" })}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Include automated system changes (syncs, cron jobs, scripts)
          </label>

          <div className="flex items-center gap-2">
            {filtersDirty && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={applyFilters}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="w-10 px-3 py-3" />
                <th className="px-3 py-3 font-medium">When</th>
                <th className="px-3 py-3 font-medium">Who</th>
                <th className="px-3 py-3 font-medium">Action</th>
                <th className="px-3 py-3 font-medium">What happened</th>
                <th className="px-3 py-3 font-medium">Record</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS} className="px-4 py-12 text-center text-slate-500">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Loading audit entries…
                  </td>
                </tr>
              )}

              {!loading && error && (
                <tr>
                  <td colSpan={COLUMNS} className="px-4 py-12 text-center text-sm text-red-600 dark:text-red-400">
                    {error}
                  </td>
                </tr>
              )}

              {!loading && !error && rows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                    No audit entries match these filters.
                  </td>
                </tr>
              )}

              {rows.map((row) => {
                const when = formatWhen(row.occurredAt);
                const isOpen = expanded === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : row.id)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <td className="px-3 py-3 text-slate-400">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="text-slate-800 dark:text-slate-100">{when.date}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{when.time}</div>
                      </td>
                      <td className="px-3 py-3">
                        {row.actorType === "system" ? (
                          <span className="text-slate-500 dark:text-slate-400">System</span>
                        ) : (
                          <>
                            <div className="text-slate-800 dark:text-slate-100">
                              {row.actorName ?? row.actorEmail ?? "Unknown"}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {row.actorRole ?? row.actorEmail ?? ""}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            ACTION_STYLE[row.action] ??
                            "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {ACTION_LABEL[row.action] ?? row.action}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                        {row.summary ?? "—"}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {row.entity}
                        {row.entityId ? ` #${row.entityId}` : ""}
                      </td>
                    </tr>
                    {isOpen && <DetailRow row={row} columns={COLUMNS} />}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
          <span>
            {total === 0
              ? "No entries"
              : `Showing ${showingFrom.toLocaleString()}–${showingTo.toLocaleString()} of ${total.toLocaleString()}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 disabled:opacity-40 dark:border-slate-600"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <span>
              Page {page.toLocaleString()} of {totalPages.toLocaleString()}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 disabled:opacity-40 dark:border-slate-600"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
