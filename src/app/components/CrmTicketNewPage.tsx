"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Home, ChevronRight, Check, ChevronLeft, CheckCircle2, X,
} from "lucide-react";

// ─── Data ─────────────────────────────────────────────────────────────────────

const PLATFORMS = [
  { code: "01", name: "Lead",           accent: "#ed1c24" },
  { code: "02", name: "Aone",           accent: "#4a8fd9" },
  { code: "03", name: "ClickUp",        accent: "#79f471" },
  { code: "04", name: "Process Street", accent: "#023497" },
  { code: "05", name: "Others",         accent: "#6b7280" },
];

const TICKET_TYPES = [
  { code: "01", name: "Trial Booking",   accent: "#3b82f6" },
  { code: "02", name: "Fee Inquiry",     accent: "#f59e0b" },
  { code: "03", name: "Enrollment",      accent: "#10b981" },
  { code: "04", name: "Complaint",       accent: "#ef4444" },
  { code: "05", name: "Schedule Change", accent: "#8b5cf6" },
  { code: "06", name: "General",         accent: "#6b7280" },
];

const BRANCHES  = ["Desa Aman Puri", "Shah Alam", "Subang Jaya", "Bukit Jalil", "Cheras", "Setapak", "Klang", "Puchong", "Online"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const ASSIGNEES  = ["Ahmad Firdaus (CRM Lead)", "Nur Aisyah (Sales)", "Kelvin Lim (Support)", "Priya Nair (Admin)", "Unassigned"];

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
            {/* Circle */}
            <div className="flex items-center gap-2 shrink-0">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                done   ? "bg-blue-600 text-white" :
                active ? "bg-blue-600 text-white" :
                         "bg-slate-200 text-slate-500"
              }`}>
                {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-sm font-medium transition-colors ${
                active ? "text-slate-900" : done ? "text-blue-600" : "text-slate-400"
              }`}>
                {label}
              </span>
            </div>
            {/* Connector */}
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-3 transition-colors ${done ? "bg-blue-400" : "bg-slate-200"}`} />
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
      className={`flex flex-col items-start gap-1.5 rounded-xl border-2 bg-white p-4 text-left transition-all hover:shadow-md focus:outline-none ${
        selected
          ? "border-blue-500 shadow-sm ring-2 ring-blue-100"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <span className="inline-block h-4 w-4 rounded-full" style={{ backgroundColor: accent }} />
      <span className="text-sm font-semibold" style={{ color: accent }}>{name}</span>
      <span className="text-xs text-slate-400">Code {code}</span>
    </button>
  );
}

// ─── Step 1: Platform ─────────────────────────────────────────────────────────

function StepPlatform({ value, onChange, onNext }: { value: string; onChange: (v: string) => void; onNext: () => void }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-800 mb-4">Select Platform</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {PLATFORMS.map(p => (
          <SelectCard
            key={p.code}
            code={p.code}
            name={p.name}
            accent={p.accent}
            selected={value === p.code}
            onSelect={() => onChange(p.code)}
          />
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

function StepType({ value, onChange, onNext, onBack }: {
  value: string; onChange: (v: string) => void; onNext: () => void; onBack: () => void;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-800 mb-4">Select Ticket Type</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {TICKET_TYPES.map(t => (
          <SelectCard
            key={t.code}
            code={t.code}
            name={t.name}
            accent={t.accent}
            selected={value === t.code}
            onSelect={() => onChange(t.code)}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
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
  assignTo: string;
  description: string;
}

const EMPTY_DETAILS: Details = {
  subject: "", requesterName: "", requesterContact: "",
  branch: "", priority: "Medium", assignTo: "", description: "",
};

function StepDetails({ value, onChange, onSubmit, onBack, platformCode, typeCode }: {
  value: Details;
  onChange: (d: Details) => void;
  onSubmit: () => void;
  onBack: () => void;
  platformCode: string;
  typeCode: string;
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

  const platform = PLATFORMS.find(p => p.code === platformCode);
  const type     = TICKET_TYPES.find(t => t.code === typeCode);

  const inputCls  = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";
  const selectCls = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Summary chips */}
      <div className="flex items-center gap-2 mb-5">
        {platform && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: platform.accent }} />
            {platform.name}
          </span>
        )}
        {type && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: type.accent }} />
            {type.name}
          </span>
        )}
      </div>

      <h2 className="text-base font-semibold text-slate-800 mb-4">Ticket Details</h2>

      <div className="flex flex-col gap-4">
        {/* Subject */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700">Subject <span className="text-red-500">*</span></label>
          <input
            value={value.subject}
            onChange={e => set("subject", e.target.value)}
            placeholder="Brief description of the issue or inquiry"
            className={`${inputCls} ${errors.subject ? "border-red-400" : ""}`}
          />
          {errors.subject && <p className="text-[11px] text-red-500">{errors.subject}</p>}
        </div>

        {/* Requester */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700">Requester Name <span className="text-red-500">*</span></label>
            <input
              value={value.requesterName}
              onChange={e => set("requesterName", e.target.value)}
              placeholder="Full name"
              className={`${inputCls} ${errors.requesterName ? "border-red-400" : ""}`}
            />
            {errors.requesterName && <p className="text-[11px] text-red-500">{errors.requesterName}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700">Contact (phone / email)</label>
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
            <label className="text-xs font-semibold text-slate-700">Branch <span className="text-red-500">*</span></label>
            <select
              value={value.branch}
              onChange={e => set("branch", e.target.value)}
              className={`${selectCls} ${errors.branch ? "border-red-400" : ""}`}
            >
              <option value="">Select branch…</option>
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            {errors.branch && <p className="text-[11px] text-red-500">{errors.branch}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700">Priority</label>
            <select value={value.priority} onChange={e => set("priority", e.target.value)} className={selectCls}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {/* Assign To */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700">Assign To</label>
          <select value={value.assignTo} onChange={e => set("assignTo", e.target.value)} className={selectCls}>
            <option value="">Select assignee…</option>
            {ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700">Description</label>
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
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
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
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 mb-4">
        <CheckCircle2 className="w-7 h-7 text-emerald-600" />
      </div>
      <h2 className="text-lg font-bold text-slate-900 mb-1">Ticket Created</h2>
      <p className="text-sm text-slate-500 mb-6 max-w-xs">
        <span className="font-semibold text-slate-800">&ldquo;{subject}&rdquo;</span> has been submitted and will be assigned shortly.
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
          className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
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

  function reset() {
    setStep(0); setPlatform(""); setType(""); setDetails(EMPTY_DETAILS); setSubmitted(false);
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-3xl mx-auto px-6 pt-4 pb-10">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-4 h-4" /><span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <Link href="/dashboards/crm" className="hover:text-slate-900 transition-colors">CNS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-slate-700">Ticket</span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-slate-900 font-medium">New Ticket</span>
        </nav>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">New Ticket</h1>
          <p className="text-sm text-slate-500 mt-0.5">Submit a new support ticket</p>
        </div>

        {/* Step bar */}
        {!submitted && <StepBar current={step} />}

        {/* Step content card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-8 py-7">
          {submitted ? (
            <SuccessScreen subject={details.subject} onReset={reset} />
          ) : step === 0 ? (
            <StepPlatform
              value={platform}
              onChange={setPlatform}
              onNext={() => setStep(1)}
            />
          ) : step === 1 ? (
            <StepType
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
              platformCode={platform}
              typeCode={ticketType}
            />
          )}
        </div>

      </div>
    </div>
  );
}
