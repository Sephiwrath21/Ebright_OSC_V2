"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Eye, EyeOff, Loader2, Pencil, RotateCcw, Search, Wrench, X } from "lucide-react";
import { TAGS, TAG_BADGE, TAG_LABEL, type Tag } from "@/lib/hotfix/derive";
import type { HotfixDateGroup, HotfixEntry } from "@/lib/hotfix/types";

const NO_GROUPS: HotfixDateGroup[] = [];
const NO_CATEGORIES: string[] = [];

/** "2026-09-15" → "15 September 2026". Formatted in UTC: it is a calendar day. */
function formatDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type ApiResponse = {
  groups: HotfixDateGroup[];
  total: number;
  categories: string[];
  canCurate: boolean;
};

export default function HotfixLogView({ canCurate }: { canCurate: boolean }) {
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [includeHidden, setIncludeHidden] = useState(false);
  const [nonce, setNonce] = useState(0);

  const requestKey = useMemo(
    () => JSON.stringify({ category, tag, search, includeHidden, nonce }),
    [category, tag, search, includeHidden, nonce],
  );

  // Derived loading, as in the audit log: no setState runs synchronously in
  // the effect body, only inside the fetch continuation.
  const [result, setResult] = useState<{
    key: string;
    data: ApiResponse | null;
    error: string | null;
  } | null>(null);

  const [editing, setEditing] = useState<{ id: number; value: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const key = requestKey;
    const sp = new URLSearchParams();
    if (category) sp.set("category", category);
    if (tag) sp.set("tag", tag);
    if (search) sp.set("search", search);
    if (includeHidden) sp.set("includeHidden", "1");

    fetch(`/api/hotfix-log?${sp}`, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        setResult({ key, data: (await res.json()) as ApiResponse, error: null });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setResult({
          key,
          data: null,
          error: err instanceof Error ? err.message : "Failed to load the hotfix log",
        });
      });

    return () => controller.abort();
  }, [requestKey, category, tag, search, includeHidden]);

  const loading = result?.key !== requestKey;
  const groups = result?.data?.groups ?? NO_GROUPS;
  const categories = result?.data?.categories ?? NO_CATEGORIES;
  const total = result?.data?.total ?? 0;
  const error = loading ? null : (result?.error ?? null);

  async function curate(entry: HotfixEntry, body: Record<string, unknown>) {
    setBusyId(entry.id);
    try {
      const res = await fetch(`/api/hotfix-log/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setEditing(null);
      setNonce((n) => n + 1);
    } catch {
      // Surfaced by the list reloading unchanged; a toast system would be
      // better, but the portal has none on this page.
      setNonce((n) => n + 1);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white dark:bg-slate-700">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Hotfix</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Built from commits shipped to production. Visible to Super Admin only.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">All areas</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">All changes</option>
          {TAGS.map((t) => (
            <option key={t} value={t}>
              {TAG_LABEL[t]}
            </option>
          ))}
        </select>

        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
            onBlur={() => setSearch(searchInput)}
            placeholder="Search the changelog…"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={includeHidden}
            onChange={(e) => setIncludeHidden(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300"
          />
          Show hidden
        </label>

        <span className="text-xs text-slate-500 dark:text-slate-400">
          {loading ? "Loading…" : `${total} ${total === 1 ? "entry" : "entries"}`}
        </span>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {loading && groups.length === 0 && (
        <div className="grid place-items-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          <Loader2 className="mb-2 h-5 w-5 animate-spin" />
          Loading the changelog…
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {category || tag || search
              ? "Nothing matches these filters."
              : "No entries yet — the changelog fills in on the next production deploy."}
          </p>
        </div>
      )}

      {/* Date → category → tagged bullets */}
      {groups.map((group) => (
        <section
          key={group.date}
          className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
        >
          <h2 className="border-b border-slate-200 pb-2 text-base font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100">
            {formatDate(group.date)}
          </h2>

          {group.sections.map((section) => (
            <div key={section.category} className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {section.category}
              </h3>

              <ul className="mt-2 space-y-1.5">
                {section.entries.map((entry) => {
                  const busy = busyId === entry.id;
                  const isEditing = editing?.id === entry.id;
                  return (
                    <li
                      key={entry.id}
                      className={`group flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                        entry.hidden ? "opacity-50" : ""
                      }`}
                    >
                      <span
                        className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          TAG_BADGE[entry.tag as Tag] ??
                          "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {TAG_LABEL[entry.tag as Tag] ?? entry.tag}
                      </span>

                      {isEditing ? (
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <input
                            value={editing.value}
                            autoFocus
                            onChange={(e) => setEditing({ id: entry.id, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                void curate(entry, { titleOverride: editing.value });
                              }
                              if (e.key === "Escape") setEditing(null);
                            }}
                            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          />
                          <button
                            type="button"
                            onClick={() => void curate(entry, { titleOverride: editing.value })}
                            className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                            title="Save"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">
                            {entry.title}
                            {entry.titleOverride && (
                              <span
                                className="ml-1.5 text-[10px] text-slate-400"
                                title={`Commit subject: ${entry.originalTitle}`}
                              >
                                (edited)
                              </span>
                            )}
                          </span>

                          {canCurate && (
                            <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                              <button
                                type="button"
                                onClick={() => setEditing({ id: entry.id, value: entry.title })}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"
                                title="Reword this entry"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {entry.titleOverride && (
                                <button
                                  type="button"
                                  onClick={() => void curate(entry, { titleOverride: "" })}
                                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"
                                  title="Restore the commit subject"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void curate(entry, { hidden: !entry.hidden })}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"
                                title={entry.hidden ? "Show in the changelog" : "Hide from the changelog"}
                              >
                                {entry.hidden ? (
                                  <Eye className="h-3.5 w-3.5" />
                                ) : (
                                  <EyeOff className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </span>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
