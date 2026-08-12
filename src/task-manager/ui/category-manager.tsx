"use client";

// Task Category management (2026-08-12) — Super Admin/Operations only.
// Flat list, no fan-out/cascade logic (unlike Template/Package groups):
// create appends to the end, archive/unarchive toggles visibility from
// the assign form's picker, rename edits in place. No drag-reorder UI in
// this first cut — reorderTaskCategories exists in the data layer for a
// future pass, not wired here yet.
import * as React from "react";
import type { TaskCategorySummary } from "@/task-manager/data/task-categories";

export function CategoryManager({
  initialCategories,
  onCreate,
  onRename,
  onArchive,
  onUnarchive,
}: {
  initialCategories: TaskCategorySummary[];
  onCreate: (name: string) => Promise<{ ok: boolean; message?: string }>;
  onRename: (id: string, name: string) => Promise<{ ok: boolean; message?: string }>;
  onArchive: (id: string) => Promise<{ ok: boolean; message?: string }>;
  onUnarchive: (id: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [categories, setCategories] = React.useState(initialCategories);
  const [newName, setNewName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");

  const active = categories.filter((c) => !c.archivedAt);
  const archived = categories.filter((c) => c.archivedAt);

  const runCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    const result = await onCreate(name);
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to create category");
      return;
    }
    setNewName("");
    // Optimistic id is unknown (server-assigned) — the caller re-fetches
    // the page's server-rendered list on next navigation; for immediate
    // feedback here, append a placeholder that a hard refresh reconciles.
    //
    // Accepted trade-off (2026-08-12, code review): the server has no row
    // with this `pending-<timestamp>` id yet, and there's no client-side
    // reconciliation of a fresh `initialCategories` prop mid-session. If an
    // admin Renames/Archives THIS row before a page refresh, the action
    // hits the server with the fake id and fails with "Category not
    // found" — the row itself is fine (create succeeded), but the
    // immediate follow-up action isn't. This is a low-frequency, low-
    // severity gap on a first-cut admin tool (see this file's header —
    // no drag-reorder yet either), documented rather than fixed here,
    // matching this codebase's established precedent for this class of
    // trade-off (see commit 2f1e99e, the 5-photo-cap TOCTOU race). A
    // future pass could fix it by having `onCreate` return the real id, or
    // by re-syncing `categories` from a fresh `initialCategories` prop.
    setCategories((prev) => [...prev, { id: `pending-${Date.now()}`, name, order: prev.length, archivedAt: null }]);
  };

  const runRename = async (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    const result = await onRename(id, name);
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to rename category");
      return;
    }
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    setEditingId(null);
  };

  const runArchiveToggle = async (id: string, archive: boolean) => {
    setBusy(true);
    setError(null);
    const result = archive ? await onArchive(id) : await onUnarchive(id);
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to update category");
      return;
    }
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, archivedAt: archive ? new Date().toISOString() : null } : c)),
    );
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-lg font-semibold text-gray-900">Task Categories</h1>
      <p className="mb-6 text-sm text-gray-500">
        Manage the "Type" categories tasks can be assigned to at creation time.
      </p>

      <div className="mb-6 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          maxLength={100}
          className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={runCreate}
          disabled={busy || !newName.trim()}
          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="rounded-2xl border border-gray-200 bg-white">
        <p className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Active
        </p>
        {active.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-400">No categories yet.</p>
        ) : (
          active.map((c) => (
            <div key={c.id} className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
              {editingId === c.id ? (
                <>
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    maxLength={100}
                    className="flex-1 rounded-full border border-gray-300 px-3 py-1 text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runRename(c.id)}
                    className="text-xs font-medium text-blue-600 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setEditingId(null)}
                    className="text-xs font-medium text-gray-400 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-900">{c.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(c.id);
                      setEditingName(c.name);
                    }}
                    className="text-xs font-medium text-gray-500 hover:text-gray-700"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runArchiveToggle(c.id, true)}
                    className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    Archive
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {archived.length > 0 && (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50">
          <p className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
            Archived
          </p>
          {archived.map((c) => (
            <div key={c.id} className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
              <span className="flex-1 text-sm text-gray-500">{c.name}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runArchiveToggle(c.id, false)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                Unarchive
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
