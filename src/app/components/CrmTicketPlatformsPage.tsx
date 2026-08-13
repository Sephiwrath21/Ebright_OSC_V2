"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Home, ChevronRight, Plus, Pencil, Trash2, X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Platform {
  id: string;
  name: string;
  slug: string;
  code: string | null;
  accent: string;
  tickets: number;
}

interface ApiPlatform { id: string; name: string; slug: string | null; code: string | null; accent: string | null; tickets: number }

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  platform: Platform | null;
  onClose: () => void;
  onSave: (p: Platform) => void;
  nextId: string;
}

function PlatformModal({ platform, onClose, onSave, nextId }: ModalProps) {
  const isEdit = platform !== null;
  const [name,   setName]   = useState(platform?.name   ?? "");
  const [slug,   setSlug]   = useState(platform?.slug   ?? "");
  const [accent, setAccent] = useState(platform?.accent ?? "#4a8fd9");

  function handleNameChange(v: string) {
    setName(v);
    if (!isEdit) setSlug(toSlug(v));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id:      isEdit ? platform!.id : nextId,
      name:    name.trim(),
      slug:    slug.trim() || toSlug(name),
      code:    isEdit ? platform!.code : null,
      accent,
      tickets: isEdit ? platform!.tickets : 0,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md dark:bg-slate-900 dark:ring-1 dark:ring-white/10">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {isEdit ? "Edit Platform" : "Add Platform"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Name <span className="text-red-500 dark:text-red-400">*</span></label>
            <input
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="e.g. WhatsApp"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Slug</label>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="e.g. whatsapp"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-950 dark:border-slate-500 dark:text-slate-400"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Accent Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={accent}
                onChange={e => setAccent(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-500 dark:bg-slate-950"
              />
              <span className="text-sm font-mono text-slate-600 dark:text-slate-300">{accent}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 rounded-xl bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              {isEdit ? "Save Changes" : "Add Platform"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CrmTicketPlatformsPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"add" | Platform | null>(null);

  // Read-only: real platforms + ticket counts from ebright_crm (tkt_platform).
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    fetch("/api/crm/tickets/platforms", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `Request failed (${r.status})`);
        }
        return r.json() as Promise<{ platforms: ApiPlatform[] }>;
      })
      .then((d) => {
        if (ignore) return;
        setPlatforms(d.platforms.map((p) => ({
          id: p.id, name: p.name, slug: p.slug ?? "", code: p.code, accent: p.accent ?? "#6b7280", tickets: p.tickets,
        })));
        setError(null);
      })
      .catch((e) => { if (!ignore) setError(e instanceof Error ? e.message : "Failed to load platforms"); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  // Add/Edit/Delete stay local-only (read-only view — never written back).
  function handleSave(p: Platform) {
    if (!platforms.find(x => x.id === p.id)) {
      setPlatforms(prev => [...prev, p]);
    } else {
      setPlatforms(prev => prev.map(x => x.id === p.id ? p : x));
    }
    setModal(null);
  }

  function deletePlatform(id: string) {
    setPlatforms(prev => prev.filter(x => x.id !== id));
  }

  const nextId = `local-${platforms.length + 1}`;

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      {modal !== null && (
        <PlatformModal
          platform={modal === "add" ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
          nextId={nextId}
        />
      )}

      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            <Home className="w-4 h-4" /><span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <Link href="/dashboards/crm" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">CNS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-slate-700 dark:text-slate-300">Ticket</span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Platforms</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Ticket Platforms</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Configured platforms for ticket categorisation</p>
          </div>
          <button
            onClick={() => setModal("add")}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Platform
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden dark:bg-slate-900 dark:border-slate-800">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                {["CODE", "NAME", "SLUG", "ACCENT", "TICKETS", "ACTIONS"].map(h => (
                  <th
                    key={h}
                    className={`px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${h === "ACTIONS" ? "text-right" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600" />
                    <p className="text-sm text-slate-400">Loading platforms…</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-red-500 dark:text-red-400">Couldn&apos;t load platforms: {error}</td>
                </tr>
              ) : platforms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                    No platforms yet. Click &ldquo;Add Platform&rdquo; to get started.
                  </td>
                </tr>
              ) : platforms.map((p, i) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <td className="px-6 py-4 font-mono text-sm font-medium text-slate-500 dark:text-slate-400">
                    {p.code ?? pad(i + 1)}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-800 dark:text-slate-200">
                    {p.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-indigo-500 dark:text-indigo-400">
                    {p.slug}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-4 w-4 rounded-full shadow-sm border border-black/10 shrink-0"
                        style={{ backgroundColor: p.accent }}
                      />
                      <span className="font-mono text-sm text-slate-600 dark:text-slate-300">{p.accent}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-sm font-semibold text-slate-600 min-w-[2.5rem] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {p.tickets}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setModal(p)}
                        className="rounded-lg p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deletePlatform(p.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
