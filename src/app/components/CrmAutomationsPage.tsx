"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Home, ChevronRight, Plus, Zap, CheckCircle2, XCircle,
  Loader2, Pencil, Copy, Trash2, ChevronDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TriggerType = "NEW_LEAD" | "STAGE_CHANGED" | "TIME_IN_STAGE" | "SCHEDULED" | "FORM_SUBMITTED";
type RunStatus   = "COMPLETED" | "FAILED" | "RUNNING";
type Tab         = "custom" | "builtin";

interface Automation {
  id: string;
  name: string;
  triggerType: TriggerType;
  enabled: boolean;
  branchName: string | null;
  lastRun: { status: RunStatus; when: string } | null;
}

// ─── Static data ──────────────────────────────────────────────────────────────

const TRIGGER_BADGE: Record<TriggerType, { label: string; cls: string }> = {
  NEW_LEAD:       { label: "New Lead",       cls: "bg-blue-100 text-blue-700" },
  STAGE_CHANGED:  { label: "Stage Changed",  cls: "bg-violet-100 text-violet-700" },
  TIME_IN_STAGE:  { label: "Time in Stage",  cls: "bg-amber-100 text-amber-700" },
  SCHEDULED:      { label: "Scheduled",      cls: "bg-indigo-100 text-indigo-700" },
  FORM_SUBMITTED: { label: "Form Submitted", cls: "bg-emerald-100 text-emerald-700" },
};

const INITIAL: Automation[] = [
  { id: "1", name: "WhatsApp Welcome Message", triggerType: "NEW_LEAD",       enabled: true,  branchName: null,               lastRun: { status: "COMPLETED", when: "5m ago" } },
  { id: "2", name: "CT Reminder 24h Before",   triggerType: "STAGE_CHANGED",  enabled: true,  branchName: null,               lastRun: { status: "COMPLETED", when: "2h ago" } },
  { id: "3", name: "FU1 Auto Follow-Up",        triggerType: "TIME_IN_STAGE",  enabled: false, branchName: "02 Subang Taipan", lastRun: { status: "FAILED",    when: "1h ago" } },
  { id: "4", name: "Enrolment Confirmation",    triggerType: "STAGE_CHANGED",  enabled: true,  branchName: null,               lastRun: { status: "COMPLETED", when: "3h ago" } },
  { id: "5", name: "RSD Win-Back Sequence",     triggerType: "TIME_IN_STAGE",  enabled: false, branchName: null,               lastRun: null },
];

const TEMPLATES = [
  { id: "t1", name: "New Lead Welcome",        summary: "Send a WhatsApp greeting and apply a tag when a new lead is created.",   trigger: "NEW_LEAD"       as TriggerType, steps: 2 },
  { id: "t2", name: "Trial Reminder Sequence", summary: "Remind the parent 24h before trial class, with 2 follow-up messages.",   trigger: "STAGE_CHANGED"  as TriggerType, steps: 3 },
  { id: "t3", name: "Inactive Lead Re-Engage", summary: "Automatically follow up on leads stuck in FU1 for more than 48h.",       trigger: "TIME_IN_STAGE"  as TriggerType, steps: 4 },
];

const BUILTIN = [
  {
    category: "Lead Ingestion",
    items: [
      { name: "Form submit → branch assignment", trigger: "FORM_SUBMITTED", actions: ["Assign to branch based on form field", "Send notification to branch manager"] },
    ],
  },
  {
    category: "Stage Transition",
    items: [
      { name: "Log stage change to activity feed", trigger: "STAGE_CHANGED", actions: ["Create activity log entry", "Update lead updatedAt timestamp"] },
      { name: "Record stage entry timestamp",       trigger: "STAGE_CHANGED", actions: ["Store stageEnteredAt for lead aging calculation"] },
    ],
  },
  {
    category: "Notifications",
    items: [
      { name: "Alert branch manager on RSD", trigger: "STAGE_CHANGED (RSD)", actions: ["Send in-app notification to assigned branch manager"] },
    ],
  },
  {
    category: "Sibling Handling",
    items: [
      { name: "Link siblings from same parent", trigger: "NEW_LEAD", actions: ["Match contact by phone number", "Create sibling link if existing contact found"] },
    ],
  },
];

const BUILTIN_COUNT = BUILTIN.reduce((n, c) => n + c.items.length, 0);

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      aria-label={enabled ? "Disable" : "Enable"}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
        enabled ? "bg-emerald-500" : "bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CrmAutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>(INITIAL);
  const [tab,         setTab]         = useState<Tab>("custom");
  const [openCats,    setOpenCats]    = useState<Set<string>>(new Set(["Lead Ingestion"]));

  const live  = automations.filter(a => a.enabled).length;
  const draft = automations.filter(a => !a.enabled).length;

  function toggleEnabled(id: string) {
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  }

  function deleteAuto(id: string) {
    setAutomations(prev => prev.filter(a => a.id !== id));
  }

  function duplicateAuto(id: string) {
    const src = automations.find(a => a.id === id);
    if (!src) return;
    setAutomations(prev => [
      ...prev,
      { ...src, id: String(Date.now()), name: src.name + " (copy)", enabled: false, lastRun: null },
    ]);
  }

  function toggleCat(cat: string) {
    setOpenCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-10">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors rounded">
            <Home className="w-4 h-4" aria-hidden="true" /><span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <Link href="/dashboards/crm" className="hover:text-slate-900 transition-colors">CNS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-slate-700">Lead</span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-slate-900 font-medium">Automations</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Automations</h1>
            <p className="text-sm text-slate-500 mt-0.5">Automate follow-ups, notifications, and stage transitions.</p>
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> New Automation
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Built-in",  value: BUILTIN_COUNT,        sub: "system automations" },
            { label: "Custom",    value: automations.length,   sub: `${live} live · ${draft} draft` },
            { label: "Live",      value: live,                 sub: "currently active" },
            { label: "Last 24h",  value: 34,                   sub: "33 success · 1 failed" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{s.label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{s.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Templates */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Starter Templates</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TEMPLATES.map(t => {
              const badge = TRIGGER_BADGE[t.trigger];
              return (
                <div
                  key={t.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors leading-snug">
                      {t.name}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed mb-3">{t.summary}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">{t.steps} steps</span>
                    <button className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors">
                      <Plus className="w-3 h-3" /> Use template
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-slate-200 mb-4">
          {([
            { id: "custom",  label: `Custom (${automations.length})` },
            { id: "builtin", label: `Built-in (${BUILTIN_COUNT})` },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Custom tab ── */}
        {tab === "custom" && (
          automations.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
              <Zap className="mx-auto mb-2 w-8 h-8 text-slate-300" />
              <p className="text-sm text-slate-500">No custom automations yet.</p>
              <button className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Create your first automation
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {automations.map((a, i) => {
                const badge = TRIGGER_BADGE[a.triggerType];
                return (
                  <div
                    key={a.id}
                    className={`flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 transition-colors ${
                      i < automations.length - 1 ? "border-b border-slate-100" : ""
                    }`}
                  >
                    {/* Status icon */}
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      a.enabled ? "bg-emerald-100" : "bg-slate-100"
                    }`}>
                      <Zap className={`w-4 h-4 ${a.enabled ? "text-emerald-600" : "text-slate-400"}`} />
                    </div>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-900 truncate">{a.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {a.branchName && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                            {a.branchName}
                          </span>
                        )}
                      </div>
                      {a.lastRun && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {a.lastRun.status === "COMPLETED" && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                          {a.lastRun.status === "FAILED"    && <XCircle      className="w-3 h-3 text-red-500" />}
                          {a.lastRun.status === "RUNNING"   && <Loader2      className="w-3 h-3 text-blue-500 animate-spin" />}
                          <span className="text-[11px] text-slate-400">{a.lastRun.when}</span>
                        </div>
                      )}
                    </div>

                    {/* Toggle */}
                    <Toggle enabled={a.enabled} onChange={() => toggleEnabled(a.id)} />

                    {/* Action buttons */}
                    <div className="flex items-center gap-0.5">
                      <button
                        title="Edit"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title="Duplicate"
                        onClick={() => duplicateAuto(a.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title="Delete"
                        onClick={() => deleteAuto(a.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── Built-in tab ── */}
        {tab === "builtin" && (
          <div className="space-y-3">
            {BUILTIN.map(cat => (
              <div key={cat.category} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleCat(cat.category)}
                  className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{cat.category}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      {cat.items.length}
                    </span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${
                    openCats.has(cat.category) ? "rotate-180" : ""
                  }`} />
                </button>

                {openCats.has(cat.category) && (
                  <div className="border-t border-slate-100">
                    {cat.items.map((item, idx) => (
                      <div
                        key={idx}
                        className={`px-4 py-3 ${idx < cat.items.length - 1 ? "border-b border-slate-100" : ""}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 mt-0.5">
                            <Zap className="w-3.5 h-3.5 text-slate-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{item.name}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">Trigger: {item.trigger}</p>
                            <ul className="mt-1.5 space-y-0.5">
                              {item.actions.map((act, j) => (
                                <li key={j} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                  <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                                  {act}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
