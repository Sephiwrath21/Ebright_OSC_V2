"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Home, ChevronRight, Check, ChevronLeft, CheckCircle2,
} from "lucide-react";

// ─── Reference data types (from /api/crm/tickets/ref-data) ────────────────────

interface RefPlatform { id: string; name: string; slug: string | null; code: string | null; accent: string | null }
interface RefBranch { id: string; name: string; code: string | null; branchNumber: string | null }
interface RefData { platforms: RefPlatform[]; branches: RefBranch[]; subTypes: string[] }

interface Option { code: string; name: string; accent: string }

const TYPE_ACCENTS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#6b7280", "#0ea5e9", "#ec4899"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];

function humanize(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ["Platform", "Type", "Details"];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8 max-w-xl">
      {STEPS.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2 shrink-0">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                done   ? "bg-blue-600 text-white" :
                active ? "bg-blue-600 text-white" :
                         "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}>
                {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-sm font-medium transition-colors ${
                active ? "text-slate-900 dark:text-slate-100" : done ? "text-blue-600 dark:text-blue-400" : "text-slate-400"
              }`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-3 transition-colors ${done ? "bg-blue-400" : "bg-slate-200 dark:bg-slate-800"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Selection card ───────────────────────────────────────────────────────────

function SelectCard({
  code, name, accent, selected, onSelect,
}: {
  code: string; name: string; accent: string; selected: boolean; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-start gap-1.5 rounded-xl border-2 bg-white dark:bg-slate-800 p-4 text-left transition-all hover:shadow-md focus:outline-none ${
        selected
          ? "border-blue-500 dark:border-blue-400 shadow-sm ring-2 ring-blue-100 dark:ring-blue-900"
          : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-600"
      }`}
    >
      <span className="inline-block h-4 w-4 rounded-full" style={{ backgroundColor: accent }} />
      <span className="text-sm font-semibold" style={{ color: accent }}>{name}</span>
      <span className="text-xs text-slate-400">Code {code}</span>
    </button>
  );
}

// ─── Step 1: Platform ─────────────────────────────────────────────────────────

function StepPlatform({ platforms, value, onChange, onNext }: {
  platforms: Option[]; value: string; onChange: (v: string) => void; onNext: () => void;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-4">Select Platform</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {platforms.map(p => (
          <SelectCard key={p.code} code={p.code} name={p.name} accent={p.accent}
            selected={value === p.code} onSelect={() => onChange(p.code)} />
        ))}
      </div>
      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!value}
          className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Type ─────────────────────────────────────────────────────────────

function StepType({ types, value, onChange, onNext, onBack }: {
  types: Option[]; value: string; onChange: (v: string) => void; onNext: () => void; onBack: () => void;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-4">Select Ticket Type</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {types.map(t => (
          <SelectCard key={t.code} code={t.code} name={t.name} accent={t.accent}
            selected={value === t.code} onSelect={() => onChange(t.code)} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={onNext}
          disabled={!value}
          className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Details ──────────────────────────────────────────────────────────

interface Details {
  subject: string;
  requesterName: string;
  requesterContact: string;
  branch: string;
  priority: string;
  description: string;
}

const EMPTY_DETAILS: Details = {
  subject: "", requesterName: "", requesterContact: "",
  branch: "", priority: "Medium", description: "",
};

function StepDetails({ value, onChange, onSubmit, onBack, platform, type, branches }: {
  value: Details;
  onChange: (d: Details) => void;
  onSubmit: () => void;
  onBack: () => void;
  platform: Option | undefined;
  type: Option | undefined;
  branches: RefBranch[];
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof Details, string>>>({});

  function set(field: keyof Details, v: string) {
    onChange({ ...value, [field]: v });
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  }

  function validate() {
    const e: Partial<Record<keyof Details, string>> = {};
    if (!value.subject.trim())       e.subject       = "Required.";
    if (!value.requesterName.trim()) e.requesterName = "Required.";
    if (!value.branch)               e.branch        = "Required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) onSubmit();
  }

  const inputCls  = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-400";
  const selectCls = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-400";

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Summary chips */}
      <div className="flex items-center gap-2 mb-5">
        {platform && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: platform.accent }} />
            {platform.name}
          </span>
        )}
        {type && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: type.accent }} />
            {type.name}
          </span>
        )}
      </div>

      <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-4">Ticket Details</h2>

      <div className="flex flex-col gap-4">
        {/* Subject */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Subject <span className="text-red-500 dark:text-red-400">*</span></label>
          <input
            value={value.subject}
            onChange={e => set("subject", e.target.value)}
            placeholder="Brief description of the request"
            className={`${inputCls} ${errors.subject ? "border-red-400" : ""}`}
          />
          {errors.subject && <p className="text-[11px] text-red-500 dark:text-red-400">{errors.subject}</p>}
        </div>

        {/* Requester */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Student / Requester <span className="text-red-500 dark:text-red-400">*</span></label>
            <input
              value={value.requesterName}
              onChange={e => set("requesterName", e.target.value)}
              placeholder="Full name"
              className={`${inputCls} ${errors.requesterName ? "border-red-400" : ""}`}
            />
            {errors.requesterName && <p className="text-[11px] text-red-500 dark:text-red-400">{errors.requesterName}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Contact (phone / email)</label>
            <input
              value={value.requesterContact}
              onChange={e => set("requesterContact", e.target.value)}
              placeholder="+60 12-345 6789"
              className={inputCls}
            />
          </div>
        </div>

        {/* Branch + Priority */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Branch <span className="text-red-500 dark:text-red-400">*</span></label>
            <select
              value={value.branch}
              onChange={e => set("branch", e.target.value)}
              className={`${selectCls} ${errors.branch ? "border-red-400" : ""}`}
            >
              <option value="">Select branch…</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.code ? `${b.code} — ${b.name}` : b.name}</option>)}
            </select>
            {errors.branch && <p className="text-[11px] text-red-500 dark:text-red-400">{errors.branch}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Priority</label>
            <select value={value.priority} onChange={e => set("priority", e.target.value)} className={selectCls}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Description</label>
          <textarea
            value={value.description}
            onChange={e => set("description", e.target.value)}
            placeholder="Additional context, notes, or relevant details…"
            rows={3}
            className={`${inputCls} resize-none`}
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="submit"
          className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          Create Ticket
        </button>
      </div>
    </form>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({ subject, onReset }: { subject: string; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900 mb-4">
        <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-300" />
      </div>
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">Ticket Ready</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-xs">
        <span className="font-semibold text-slate-800 dark:text-slate-200">&ldquo;{subject}&rdquo;</span> is ready to submit. This is a read-only preview — no ticket was written.
      </p>
      <div className="flex gap-3">
        <button
          onClick={onReset}
          className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          New Ticket
        </button>
        <Link
          href="/crm/ticket/my-tickets"
          className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          View My Tickets
        </Link>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CrmTicketNewPage() {
  const [step,         setStep]     = useState(0);
  const [platform,     setPlatform] = useState("");
  const [ticketType,   setType]     = useState("");
  const [details,      setDetails]  = useState(EMPTY_DETAILS);
  const [submitted,    setSubmitted] = useState(false);

  const [platforms, setPlatforms] = useState<Option[]>([]);
  const [types,     setTypes]     = useState<Option[]>([]);
  const [branches,  setBranches]  = useState<RefBranch[]>([]);
  const [loadErr,   setLoadErr]   = useState<string | null>(null);

  // Read-only: real platforms / request-types / branches for the dropdowns.
  useEffect(() => {
    let ignore = false;
    fetch("/api/crm/tickets/ref-data", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `Request failed (${r.status})`);
        }
        return r.json() as Promise<RefData>;
      })
      .then((d) => {
        if (ignore) return;
        setPlatforms(d.platforms.map((p, i) => ({
          code: p.code ?? String(i + 1).padStart(2, "0"),
          name: p.name,
          accent: p.accent ?? "#6b7280",
        })));
        setTypes(d.subTypes.map((s, i) => ({
          code: String(i + 1).padStart(2, "0"),
          name: humanize(s),
          accent: TYPE_ACCENTS[i % TYPE_ACCENTS.length],
        })));
        setBranches(d.branches);
        setLoadErr(null);
      })
      .catch((e) => { if (!ignore) setLoadErr(e instanceof Error ? e.message : "Failed to load form data"); });
    return () => { ignore = true; };
  }, []);

  function reset() {
    setStep(0); setPlatform(""); setType(""); setDetails(EMPTY_DETAILS); setSubmitted(false);
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="max-w-3xl mx-auto px-6 pt-4 pb-10">

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
          <span className="text-slate-900 dark:text-slate-100 font-medium">New Ticket</span>
        </nav>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">New Ticket</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Submit a new support ticket</p>
        </div>

        {/* Step bar */}
        {!submitted && <StepBar current={step} />}

        {loadErr && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-700 dark:bg-red-900 dark:text-red-300">
            Couldn&apos;t load form data: {loadErr}
          </div>
        )}

        {/* Step content card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-8 py-7 dark:bg-slate-900 dark:border-slate-800">
          {submitted ? (
            <SuccessScreen subject={details.subject} onReset={reset} />
          ) : step === 0 ? (
            <StepPlatform
              platforms={platforms}
              value={platform}
              onChange={setPlatform}
              onNext={() => setStep(1)}
            />
          ) : step === 1 ? (
            <StepType
              types={types}
              value={ticketType}
              onChange={setType}
              onNext={() => setStep(2)}
              onBack={() => setStep(0)}
            />
          ) : (
            <StepDetails
              value={details}
              onChange={setDetails}
              onSubmit={() => setSubmitted(true)}
              onBack={() => setStep(1)}
              platform={platforms.find(p => p.code === platform)}
              type={types.find(t => t.code === ticketType)}
              branches={branches}
            />
          )}
        </div>

      </div>
    </div>
  );
}
