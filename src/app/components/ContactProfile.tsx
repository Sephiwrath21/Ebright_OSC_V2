"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Phone, Mail, MessageSquare, CheckSquare, PhoneCall, User, Tag, Lock,
  StickyNote, ArrowRight, Clock,
} from "lucide-react";

// ─── Types (mirror /api/crm/contacts/[id]) ────────────────────────────────────

interface StageRef { name: string; color: string }
interface OppDetail {
  id: string;
  value: string;
  createdAt: string;
  pipeline: { name: string } | null;
  stage: { name: string; color: string; shortCode: string | null } | null;
  assignedUser: { name: string | null } | null;
  stageHistory: Array<{
    id: string;
    fromStage: StageRef | null;
    toStage: StageRef | null;
    changedByUser: { name: string | null } | null;
    note: string | null;
    changedAt: string;
  }>;
}
type ActivityItem =
  | { type: "note"; id: string; body: string; createdAt: string; user: { name: string | null } | null }
  | { type: "task"; id: string; title: string; dueAt: string | null; completedAt: string | null; createdAt: string; assignedUser: { name: string | null } | null }
  | { type: "call"; id: string; outcome: string | null; notes: string | null; duration: number | null; createdAt: string; user: { name: string | null } | null }
  | { type: "message"; id: string; channel: string; direction: string; body: string; subject: string | null; status: string; createdAt: string; user: { name: string | null } | null }
  | { type: "stage_change"; id: string; fromStage: StageRef | null; toStage: StageRef | null; changedByUser: { name: string | null } | null; note: string | null; changedAt: string };

interface ContactDetail {
  id: string;
  firstName: string; lastName: string | null;
  email: string | null; phone: string | null;
  parentFullName: string | null; campaignName: string | null; remarks: string | null;
  preferredTrialDay: string | null; enrolledPackage: string | null;
  childName1: string | null; childAge1: string | null;
  childName2: string | null; childAge2: string | null;
  childName3: string | null; childAge3: string | null;
  childName4: string | null; childAge4: string | null;
  createdAt: string;
  leadSource: { id: string; name: string } | null;
  assignedUser: { id: string; name: string | null; email: string | null; image: string | null } | null;
  tags: Array<{ id: string; name: string; color: string }>;
  primaryStage: { name: string; color: string; shortCode: string | null } | null;
  opportunities: OppDetail[];
  notes: Array<{ id: string; body: string; createdAt: string; user: { name: string | null } | null }>;
  tasks: Array<{ id: string; title: string; dueAt: string | null; completedAt: string | null; createdAt: string; assignedUser: { name: string | null } | null }>;
  messages: Array<{ id: string; channel: string; direction: string; body: string; subject: string | null; status: string; createdAt: string; user: { name: string | null } | null }>;
  calls: Array<{ id: string; outcome: string | null; notes: string | null; duration: number | null; createdAt: string; user: { name: string | null } | null }>;
  activity: ActivityItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cn(...p: Array<string | false | null | undefined>) { return p.filter(Boolean).join(" "); }

const BADGE_STYLE: Record<string, string> = {
  blue:    "bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 ring-1 ring-inset ring-blue-200/70",
  violet:  "bg-gradient-to-br from-violet-50 to-violet-100 text-violet-700 ring-1 ring-inset ring-violet-200/70",
  purple:  "bg-gradient-to-br from-purple-50 to-purple-100 text-purple-700 ring-1 ring-inset ring-purple-200/70",
  amber:   "bg-gradient-to-br from-amber-50 to-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200/70",
  yellow:  "bg-gradient-to-br from-yellow-50 to-yellow-100 text-yellow-700 ring-1 ring-inset ring-yellow-200/70",
  orange:  "bg-gradient-to-br from-orange-50 to-orange-100 text-orange-700 ring-1 ring-inset ring-orange-200/70",
  emerald: "bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200/70",
  green:   "bg-gradient-to-br from-green-50 to-green-100 text-green-700 ring-1 ring-inset ring-green-200/70",
  cyan:    "bg-gradient-to-br from-cyan-50 to-cyan-100 text-cyan-700 ring-1 ring-inset ring-cyan-200/70",
  sky:     "bg-gradient-to-br from-sky-50 to-sky-100 text-sky-700 ring-1 ring-inset ring-sky-200/70",
  indigo:  "bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-700 ring-1 ring-inset ring-indigo-200/70",
  rose:    "bg-gradient-to-br from-rose-50 to-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200/70",
  red:     "bg-gradient-to-br from-red-50 to-red-100 text-red-700 ring-1 ring-inset ring-red-200/70",
  slate:   "bg-gradient-to-br from-slate-50 to-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200/70",
};
const STAGE_COLOR_BY_CODE: Record<string, string> = {
  NL: "blue", CT: "violet", SU: "amber", ENR: "emerald",
  SNE: "yellow", CNS: "orange", CL: "slate", DND: "red", RSD: "cyan",
  FU1: "sky", FU2: "sky", FU3: "sky", FU3M: "sky",
  URW1: "rose", URW2: "rose", URW3: "rose",
  SG: "indigo", BOD: "indigo", ENRB: "cyan", CTB: "cyan",
};
function stageBadge(shortCode: string | null | undefined, dbColor?: string) {
  const code = (shortCode ?? "").toUpperCase().replace(/[-_]/g, "");
  const canonical = STAGE_COLOR_BY_CODE[code] ?? dbColor ?? "slate";
  return BADGE_STYLE[canonical] ?? BADGE_STYLE.slate;
}

// Timestamps are naive UTC-wall — render as UTC so the browser doesn't add a shift.
function fmtDate(s: string) { return new Date(`${s}Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); }
function fmtDateTime(s: string) { return new Date(`${s}Z`).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }); }
function initials(first: string, last: string | null) { return `${first.slice(0, 1)}${last?.slice(0, 1) ?? ""}`.toUpperCase(); }

type TabKey = "overview" | "activity" | "messages" | "calls" | "notes" | "tasks" | "opportunities";

// ─── Component ────────────────────────────────────────────────────────────────

export default function ContactProfile({ contactId }: { contactId: string }) {
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}`, { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      setContact((await res.json()) as ContactDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contact");
      setContact(null);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-2xl bg-white shadow-sm" />
        <div className="h-64 animate-pulse rounded-2xl bg-white shadow-sm" />
      </div>
    );
  }
  if (error || !contact) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
        {error ?? "Contact not found."}
        <button type="button" onClick={() => void load()} className="ml-3 rounded-md border border-red-300 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100">
          Retry
        </button>
      </div>
    );
  }

  const c = contact;
  const fullName = `${c.firstName} ${c.lastName ?? ""}`.trim();
  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "activity", label: "Activity" },
    { key: "messages", label: `Messages (${c.messages.length})` },
    { key: "calls", label: `Calls (${c.calls.length})` },
    { key: "notes", label: `Notes (${c.notes.length})` },
    { key: "tasks", label: `Tasks (${c.tasks.length})` },
    { key: "opportunities", label: `Opportunities (${c.opportunities.length})` },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xl font-semibold text-indigo-700">
            {initials(c.firstName, c.lastName)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900">{fullName}</h1>
              {c.primaryStage && (
                <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", stageBadge(c.primaryStage.shortCode, c.primaryStage.color))}>
                  {c.primaryStage.name}
                </span>
              )}
              {c.leadSource && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {c.leadSource.name}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <Lock className="h-2.5 w-2.5" /> Read-only
              </span>
            </div>
            {c.childName1 && (
              <p className="mt-0.5 text-sm text-slate-500">
                Parent of {c.childName1}{c.childAge1 ? ` (${c.childAge1})` : ""}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-500">
              {c.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{c.phone}</span>}
              {c.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{c.email}</span>}
              {c.assignedUser?.name && (
                <span className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600">
                    {c.assignedUser.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="text-slate-600">{c.assignedUser.name}</span>
                </span>
              )}
            </div>
          </div>
          {/* Quick actions — WhatsApp / Email are outbound links; Task / Log Call
              are shown for parity with v1 but inert in this read-only view. */}
          <div className="flex flex-wrap items-center gap-2">
            {c.phone && (
              <a
                href={`https://wa.me/${c.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-white px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50"
              >
                <MessageSquare className="h-4 w-4" /> WhatsApp
              </a>
            )}
            {c.email && (
              <a
                href={`mailto:${c.email}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Mail className="h-4 w-4" /> Email
              </a>
            )}
            <button type="button" disabled title="Read-only view" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-400">
              <CheckSquare className="h-4 w-4" /> Task
            </button>
            <button type="button" disabled title="Read-only view" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-400">
              <PhoneCall className="h-4 w-4" /> Log Call
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div>
        <div className="flex flex-wrap gap-1 border-b border-slate-200">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "-mb-px border-b-2 px-3 pb-2 pt-1 text-sm font-medium transition-colors",
                tab === t.key ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === "overview" && <Overview c={c} />}
          {tab === "activity" && <ActivityTimeline items={c.activity} />}
          {tab === "messages" && <MessagesTab items={c.messages} />}
          {tab === "calls" && <CallsTab items={c.calls} />}
          {tab === "notes" && <NotesTab items={c.notes} />}
          {tab === "tasks" && <TasksTab items={c.tasks} />}
          {tab === "opportunities" && <OpportunitiesTab items={c.opportunities} />}
        </div>
      </div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={cn("mt-0.5 text-sm", value ? "text-slate-900" : "text-slate-400")}>{value || "Not set"}</p>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">{icon}{title}</h3>
      {children}
    </div>
  );
}

function Overview({ c }: { c: ContactDetail }) {
  const children = ([1, 2, 3, 4] as const).map((n) => ({
    name: c[`childName${n}` as const] as string | null,
    age: c[`childAge${n}` as const] as string | null,
  }));
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Card title="Personal Info" icon={<User className="h-4 w-4 text-indigo-500" />}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="First Name" value={c.firstName} />
          <Field label="Last Name" value={c.lastName} />
          <Field label="Email" value={c.email} />
          <Field label="Phone" value={c.phone} />
          <Field label="Lead Source" value={c.leadSource?.name} />
          <Field label="Assigned To" value={c.assignedUser?.name} />
          {c.parentFullName && <Field label="Parent" value={c.parentFullName} />}
          {c.campaignName && <Field label="Campaign" value={c.campaignName} />}
        </div>
        {c.remarks && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">Remarks</p>
            <p className="mt-0.5 text-sm text-slate-700">{c.remarks}</p>
          </div>
        )}
      </Card>

      <Card title="Child Info" icon={<Tag className="h-4 w-4 text-indigo-500" />}>
        <div className="grid grid-cols-2 gap-4">
          {children.map((ch, i) => (
            <div key={i} className="space-y-3">
              <Field label={`Child ${i + 1}`} value={ch.name} />
              <Field label={`Age ${i + 1}`} value={ch.age} />
            </div>
          ))}
        </div>
      </Card>

      <Card title="Preferences">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Preferred Trial Day" value={c.preferredTrialDay} />
          <Field label="Enrolled Package" value={c.enrolledPackage} />
          <Field label="Created" value={fmtDate(c.createdAt)} />
        </div>
      </Card>

      <Card title="Tags">
        {c.tags.length === 0 ? (
          <p className="text-xs text-slate-400">No tags assigned</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {c.tags.map((t) => (
              <span key={t.id} className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-white" style={{ backgroundColor: t.color }}>
                {t.name}
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Activity ─────────────────────────────────────────────────────────────────

function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return <EmptyCard label="No activity yet." />;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <ul className="space-y-4">
        {items.map((it) => {
          const when = "changedAt" in it ? it.changedAt : it.createdAt;
          let icon = <Clock className="h-3.5 w-3.5" />;
          let text: React.ReactNode = null;
          if (it.type === "note") { icon = <StickyNote className="h-3.5 w-3.5" />; text = <>Note{it.user?.name ? ` by ${it.user.name}` : ""}: <span className="text-slate-600">{it.body}</span></>; }
          else if (it.type === "task") text = <>Task: <span className="text-slate-600">{it.title}</span>{it.completedAt ? " (completed)" : ""}</>;
          else if (it.type === "call") { icon = <PhoneCall className="h-3.5 w-3.5" />; text = <>Call{it.outcome ? ` — ${it.outcome}` : ""}{it.notes ? <span className="text-slate-600">: {it.notes}</span> : ""}</>; }
          else if (it.type === "message") { icon = <MessageSquare className="h-3.5 w-3.5" />; text = <>{it.direction === "IN" ? "Inbound" : "Outbound"} {it.channel} message: <span className="text-slate-600">{it.body}</span></>; }
          else if (it.type === "stage_change") { icon = <ArrowRight className="h-3.5 w-3.5" />; text = <>Stage moved {it.fromStage ? `${it.fromStage.name} → ` : ""}<span className="font-medium">{it.toStage?.name ?? "?"}</span>{it.changedByUser?.name ? ` by ${it.changedByUser.name}` : ""}{it.note ? <span className="text-slate-500"> — {it.note}</span> : ""}</>; }
          return (
            <li key={`${it.type}-${it.id}`} className="flex gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">{icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-900">{text}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{fmtDateTime(when)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── List tabs ────────────────────────────────────────────────────────────────

function EmptyCard({ label }: { label: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">{label}</div>;
}

function MessagesTab({ items }: { items: ContactDetail["messages"] }) {
  if (items.length === 0) return <EmptyCard label="No messages." />;
  return (
    <div className="space-y-2">
      {items.map((m) => (
        <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-500">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">{m.channel}</span>
            <span>{m.direction === "IN" ? "Inbound" : "Outbound"}</span>
            <span className="ml-auto">{fmtDateTime(m.createdAt)}</span>
          </div>
          {m.subject && <p className="text-sm font-medium text-slate-900">{m.subject}</p>}
          <p className="text-sm text-slate-700">{m.body}</p>
        </div>
      ))}
    </div>
  );
}

function CallsTab({ items }: { items: ContactDetail["calls"] }) {
  if (items.length === 0) return <EmptyCard label="No calls logged." />;
  return (
    <div className="space-y-2">
      {items.map((ca) => (
        <div key={ca.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm">
            <PhoneCall className="h-4 w-4 text-indigo-500" />
            <span className="font-medium text-slate-900">{ca.outcome ?? "Call"}</span>
            {ca.duration != null && <span className="text-xs text-slate-500">· {ca.duration}s</span>}
            <span className="ml-auto text-[11px] text-slate-400">{fmtDateTime(ca.createdAt)}</span>
          </div>
          {ca.notes && <p className="mt-1 text-sm text-slate-600">{ca.notes}</p>}
        </div>
      ))}
    </div>
  );
}

function NotesTab({ items }: { items: ContactDetail["notes"] }) {
  if (items.length === 0) return <EmptyCard label="No notes." />;
  return (
    <div className="space-y-2">
      {items.map((n) => (
        <div key={n.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-700">{n.body}</p>
          <p className="mt-1 text-[11px] text-slate-400">{n.user?.name ? `${n.user.name} · ` : ""}{fmtDateTime(n.createdAt)}</p>
        </div>
      ))}
    </div>
  );
}

function TasksTab({ items }: { items: ContactDetail["tasks"] }) {
  if (items.length === 0) return <EmptyCard label="No tasks." />;
  return (
    <div className="space-y-2">
      {items.map((t) => (
        <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <CheckSquare className={cn("h-4 w-4", t.completedAt ? "text-emerald-500" : "text-slate-300")} />
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm", t.completedAt ? "text-slate-400 line-through" : "text-slate-900")}>{t.title}</p>
            <p className="text-[11px] text-slate-400">
              {t.dueAt ? `Due ${fmtDate(t.dueAt)}` : "No due date"}{t.assignedUser?.name ? ` · ${t.assignedUser.name}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function OpportunitiesTab({ items }: { items: OppDetail[] }) {
  if (items.length === 0) return <EmptyCard label="No opportunities." />;
  return (
    <div className="space-y-4">
      {items.map((o) => (
        <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-900">{o.pipeline?.name ?? "Pipeline"}</span>
            {o.stage && (
              <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", stageBadge(o.stage.shortCode, o.stage.color))}>
                {o.stage.name}
              </span>
            )}
            <span className="ml-auto text-sm font-medium text-slate-700">RM {Number(o.value).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Created {fmtDate(o.createdAt)}{o.assignedUser?.name ? ` · ${o.assignedUser.name}` : ""}
          </p>
          {o.stageHistory.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Stage history</p>
              <ul className="space-y-2">
                {o.stageHistory.map((h) => (
                  <li key={h.id} className="flex items-center gap-2 text-xs text-slate-600">
                    <ArrowRight className="h-3 w-3 shrink-0 text-slate-300" />
                    <span>{h.fromStage ? `${h.fromStage.name} → ` : ""}<span className="font-medium text-slate-800">{h.toStage?.name ?? "?"}</span></span>
                    {h.note && <span className="text-slate-400">— {h.note}</span>}
                    <span className="ml-auto shrink-0 text-[11px] text-slate-400">{fmtDate(h.changedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
