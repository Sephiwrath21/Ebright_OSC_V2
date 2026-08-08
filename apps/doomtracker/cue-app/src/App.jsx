import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard, GitBranch, ListChecks, Users, Calendar, CalendarDays, Plus, Mail,
  Circle, CheckCircle2, AlertTriangle, Clock, ChevronRight, ChevronLeft, X, Trash2,
  Send, Sparkles, BookOpen, Play, CheckSquare, BarChart2, GripVertical, ListTodo, Braces, Paperclip, Grid, GitMerge, Link, Square, Type, Minus, MousePointer, Diamond, Undo2, Redo2, LogOut, Folder, ChevronDown, Pencil, Maximize, Lock, Upload, Eye, Download, ClipboardList, Copy, ExternalLink, Kanban, Filter, ArrowUpDown, Check
} from "lucide-react";
import { storage, login, logout, ssoLogin, getCurrentUser, sendNotification, setAuthExpiredHandler, setSaveErrorHandler, listUsers, createUser, updateUser, getDepartmentsOverview, listPeople } from "./storage";

// EMBEDDED = this is the build served inside the Ebright portal (base
// /flowghan-embed/). In that mode there is no password login — the app signs in
// via the portal session (SSO). Standalone/dev builds (base "/") keep the normal
// login page untouched.
const EMBEDDED = (import.meta.env.BASE_URL || "/").startsWith("/flowghan-embed");
import { showcaseTemplate, minusWeek15Template, parentConfirmationTemplate, createRunFromTemplate, setFieldValue, toggleSubtask, resolveFieldVariables, evaluateConditions, interpolateVariables, groupTasksByField } from "./models";

/* ---------------------------------------------------------------
   ORG DATA  (from Ebright Dept & Branch List, updated 10 June 2026)
--------------------------------------------------------------- */
const DEPARTMENTS = [
  { name: "MD Office", head: "Under MD" },
  { name: "Optimisation", head: "Iqbal" },
  { name: "Academy", head: "Athirah" },
  { name: "Marketing", head: "Didi" },
  { name: "Operations", head: "Manjeet" },
  { name: "Industrial-Organisational Psychology", head: "Fazween" },
  { name: "Finance", head: "Alyaa" },
  { name: "Human Resources & Legal", head: "Najwa" },
];

const BRANCHES = [
  { name: "Online", short: "ONL", pic: "Ummu", region: "C" },
  { name: "Subang Taipan", short: "ST", pic: "Qistina", region: "A" },
  { name: "Setia Alam", short: "SA", pic: "Ain", region: "A" },
  { name: "Sri Petaling", short: "SP", pic: "Mahlini", region: "B" },
  { name: "Kota Damansara", short: "KD", pic: "Suraj", region: "B" },
  { name: "Putrajaya", short: "PJY", pic: "Rafiq", region: "C" },
  { name: "Ampang", short: "AMP", pic: "Zahid", region: "B" },
  { name: "Cyberjaya", short: "CJY", pic: "Hannah", region: "C" },
  { name: "Klang", short: "KLG", pic: "Niki", region: "A" },
  { name: "Denai Alam", short: "DA", pic: "Guken", region: "A" },
  { name: "Bandar Baru Bangi", short: "BBB", pic: "Kishantini", region: "C" },
  { name: "Danau Kota", short: "DK", pic: "Kirtikha", region: "B" },
  { name: "Shah Alam", short: "SHA", pic: "Irfan", region: "A" },
  { name: "Bandar Tun Hussein Onn", short: "BTHO", pic: "Selva Raj", region: "B" },
  { name: "Eco Grandeur", short: "EGR", pic: "Zikry", region: "A" },
  { name: "Bandar Seri Putra", short: "BSP", pic: "Izzati", region: "C" },
  { name: "Bandar Rimbayu", short: "RBY", pic: "Nureen", region: "A" },
  { name: "Taman Sri Gombak", short: "TSG", pic: "Ezry", region: "B" },
  { name: "Kota Warisan", short: "KW", pic: "Laila", region: "C" },
  { name: "Kajang TTDI Grove", short: "KTG", pic: "Irfan", region: "B" },
  { name: "Anggun City Rawang", short: "AC", pic: "TBA", region: "A" },
  { name: "Sungai Buloh", short: "SBY", pic: "TBA", region: "A" },
  { name: "Selayang", short: "SLY", pic: "TBA", region: "B" },
  { name: "Desa Sri Hartamas", short: "DSH", pic: "TBA", region: "B" },
  { name: "Senawang Taipan", short: "SNT", pic: "TBA", region: "C" },
  { name: "Seremban", short: "SBN", pic: "TBA", region: "C" },
  { name: "Dataran Puchong Utama", short: "DP", pic: "TBA", region: "C" },
];

const DEPT_HEADS = {
  "Academy": "Athirah",
  "Marketing": "Didi",
  "Finance": "Alyaa",
  "Human Resources & Legal": "Najwa",
};

/* ---------------------------------------------------------------
   HELPERS
--------------------------------------------------------------- */
const todayStr = () => new Date().toISOString().slice(0, 10);

function computeDueDate(eventDate, week) {
  const d = new Date(eventDate + "T00:00:00");
  d.setDate(d.getDate() + week * 7);
  return d.toISOString().slice(0, 10);
}

function weekLabel(week) {
  if (week === 0) return "Event day";
  return week < 0 ? `T-${Math.abs(week)}w` : `T+${week}w`;
}

function getDefaultAssignee(dept, branch) {
  if (dept === "Operations" || dept === "All Departments") return branch.pic;
  return DEPT_HEADS[dept] || "Unassigned";
}

function daysUntil(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date(todayStr() + "T00:00:00");
  return Math.round((d - t) / 86400000);
}

function cueStatus(task) {
  if (task.status === "delivered") return "delivered";
  const diff = daysUntil(task.dueDate);
  if (diff < 0) return "missed";
  if (diff <= 7) return "on-deck";
  return "standing-by";
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Renders text that has already been passed through resolveFieldVariables: resolved
// values are plain text, while any leftover {{variable}} tokens are highlighted
// in muted amber so it's clear they haven't been filled in yet.
function renderResolvedText(text) {
  if (!text) return text;
  const parts = String(text).split(/(\{\{\s*[^}]+?\s*\}\})/g);
  return parts.map((part, i) =>
    /^\{\{\s*[^}]+?\s*\}\}$/.test(part) ? (
      <span key={i} style={{
        color: C.spotlightDeep, background: "#FBF0DC", borderRadius: 4,
        padding: "0 4px", fontStyle: "italic",
      }}>{part}</span>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

// Matches a single "Label: {{field_label}}" line, capturing the label text and
// the {{...}} token separately.
const KV_LINE = /^\s*([^:{}][^:]*?)\s*:\s*(\{\{\s*[^}]+?\s*\}\})\s*$/;

// Renders a step description. When one or more lines use the "Label: {{field}}"
// convention, the description is shown as a clean key-value block (Process
// Street style): the label in bold dark text, the value in a muted tone -
// sage once resolved, amber while it's still an unfilled variable. Plain
// descriptions (no key-value lines) fall back to renderResolvedText. Pass
// `tasks` so variables resolve in the live runsheet; omit it in the template
// editor, where nothing is filled in yet.
function DescriptionDisplay({ text, tasks, style }) {
  if (!text || String(text).trim() === "") return null;
  const rawLines = String(text).split("\n");
  const hasKv = rawLines.some((line) => KV_LINE.test(line));
  const resolved = tasks ? resolveFieldVariables(text, tasks) : text;

  if (!hasKv) {
    return <div style={style}>{renderResolvedText(resolved)}</div>;
  }

  const resolvedLines = String(resolved).split("\n");
  return (
    <div style={{ ...style, display: "flex", flexDirection: "column", gap: 5 }}>
      {rawLines.map((line, i) => {
        if (line.trim() === "") return null;
        const m = line.match(KV_LINE);
        if (!m) {
          return <div key={i}>{renderResolvedText(resolvedLines[i] ?? line)}</div>;
        }
        const label = m[1];
        const innerLabel = m[2].replace(/^\{\{\s*|\s*\}\}$/g, "");
        const resolvedLine = resolvedLines[i] ?? line;
        const colonIdx = resolvedLine.indexOf(":");
        const value = colonIdx >= 0 ? resolvedLine.slice(colonIdx + 1).trim() : "";
        const unresolved = value === "" || /^\{\{\s*[^}]+?\s*\}\}$/.test(value);
        return (
          <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
            <span style={{ fontWeight: 600, color: C.ink }}>{label}:</span>
            <span style={{
              color: unresolved ? C.spotlightDeep : C.sageDeep,
              fontStyle: unresolved ? "italic" : "normal",
            }}>{unresolved ? innerLabel : value}</span>
          </div>
        );
      })}
    </div>
  );
}

function runToRunsheet(run) {
  return {
    id: run.id,
    templateId: run.templateId,
    branchShort: run.branch.short,
    branchName: run.branch.name,
    eventDate: run.startDate,
    variables: run.variables ?? {},
    drawings: run.drawings ?? [],
    completedWeeks: run.completedWeeks ?? [],
    createdAt: todayStr(),
    tasks: run.tasks.map((task) => {
      const dueDate = new Date(task.dueDate + "T00:00:00");
      const startDate = new Date(run.startDate + "T00:00:00");
      const week = Math.round((dueDate - startDate) / (7 * 24 * 60 * 60 * 1000));
      return {
        id: task.id,
        stepId: task.stepId,
        stepType: task.stepType ?? "task",
        title: task.title,
        dept: task.dept,
        week,
        dependsOn: task.dependsOn,
        dueDate: task.dueDate ?? "",
        startDate: task.startDate ?? null,
        assignee: task.assignee ?? getDefaultAssignee(task.dept, run.branch),
        status: task.status,
        active: task.active ?? true,
        values: task.values ?? {},
        subtasks: task.subtasks ?? [],
        rejectionReason: task.rejectionReason ?? "",
        comments: task.comments ?? [],
      };
    }),
  };
}

/**
 * Rebuilds a Run object from a saved runsheet so it can be passed back through
 * the model layer (setFieldValue / evaluateConditions). The runsheet carries
 * stepId and values, which is everything the conditions need; assignee/status
 * are carried through so a re-render via runToRunsheet doesn't reset them.
 */
function runsheetToRun(runsheet) {
  const branch = BRANCHES.find((b) => b.short === runsheet.branchShort)
    || { short: runsheet.branchShort, name: runsheet.branchName };
  return {
    id: runsheet.id,
    templateId: runsheet.templateId ?? showcaseTemplate.id,
    branch,
    startDate: runsheet.eventDate,
    variables: runsheet.variables ?? {},
    drawings: runsheet.drawings ?? [],
    completedWeeks: runsheet.completedWeeks ?? [],
    tasks: runsheet.tasks.map((t) => ({
      id: t.id,
      stepId: t.stepId,
      stepType: t.stepType ?? "task",
      title: t.title,
      dept: t.dept,
      dependsOn: t.dependsOn,
      dueDate: t.dueDate ?? "",
      startDate: t.startDate ?? null,
      status: t.status,
      assignee: t.assignee,
      active: t.active,
      values: t.values ?? {},
      subtasks: t.subtasks ?? [],
      rejectionReason: t.rejectionReason ?? "",
      comments: t.comments ?? [],
    })),
  };
}

function seedRunsheet(template) {
  const branch = BRANCHES.find((b) => b.short === "SA");
  const eventDate = computeDueDate(todayStr(), 3);
  const run = createRunFromTemplate(template, eventDate, branch);
  return runToRunsheet(run);
}

/* ---------------------------------------------------------------
   STYLE TOKENS
--------------------------------------------------------------- */
const C = {
  ink: "#1A1A1A",
  inkSoft: "#2D2D2D",
  paper: "#F5F5F5",
  paperDim: "#EBEBEB",
  card: "#FFFFFF",
  spotlight: "#E62427",
  spotlightDeep: "#A8181B",
  curtain: "#E53935",
  curtainDeep: "#B71C1C",
  sage: "#4F8F6B",
  sageDeep: "#33654A",
  slate: "#6B6B6B",
  slateLight: "#9E9E9E",
  line: "#E0E0E0",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Work+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
`;

const STATUS_META = {
  "standing-by": { label: "Standing by", color: C.slate, bg: "#EEEDF0" },
  "on-deck": { label: "On deck", color: C.spotlightDeep, bg: "#FBF0DC" },
  "missed": { label: "Missed cue", color: C.curtainDeep, bg: "#FBE7E9" },
  "delivered": { label: "Delivered", color: C.sageDeep, bg: "#E7F1EB" },
  "approved": { label: "Approved", color: C.sageDeep, bg: "#E7F1EB" },
  "rejected": { label: "Rejected", color: C.curtainDeep, bg: "#FBE7E9" },
};

const ASSIGNEE_POOL = Array.from(
  new Set([...Object.values(DEPT_HEADS), ...BRANCHES.map((b) => b.pic), "Unassigned"])
);

/* ---------------------------------------------------------------
   SMALL UI PIECES
--------------------------------------------------------------- */
function StatusPill({ status }) {
  const m = STATUS_META[status];
  const Icon = status === "delivered" || status === "approved" ? CheckCircle2 : status === "rejected" ? X : status === "missed" ? AlertTriangle : status === "on-deck" ? Clock : Circle;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600,
      color: m.color, background: m.bg, padding: "3px 9px", borderRadius: 999,
      whiteSpace: "nowrap",
    }}>
      <Icon size={12} strokeWidth={2.5} />
      {m.label}
    </span>
  );
}

function DeptBadge({ dept }) {
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 500,
      color: C.slate, border: `1px solid ${C.line}`, borderRadius: 6,
      padding: "2px 7px", whiteSpace: "nowrap",
    }}>
      {dept}
    </span>
  );
}

function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 11, width: "100%",
      padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer",
      background: active ? "rgba(232,166,61,0.14)" : "transparent",
      color: active ? C.spotlight : "rgba(250,247,240,0.72)",
      fontFamily: "'Work Sans', sans-serif", fontSize: 14, fontWeight: 500,
      textAlign: "left", transition: "background 0.15s",
    }}>
      <Icon size={17} strokeWidth={2} />
      {label}
    </button>
  );
}

/* ---------------------------------------------------------------
   MY WORK
--------------------------------------------------------------- */
// The assignee's real inbox: every flowchart step the HOD assigned to the email this
// person logged in with, gathered across all workflows. They tick off and attach proof
// right here; "View flowchart" opens the HOD's chart. Locks are honoured exactly as in
// the editor (shared fcLockInfo).
function MyFlowchartWork({ templates, authUser, onUpdateNode, onViewFlowchart }) {
  const myEmail = (authUser?.email || "").trim().toLowerCase();
  const panelCard = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 };
  const labelStyle = { fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, fontWeight: 600, color: C.slate, textTransform: "uppercase", letterSpacing: "0.04em" };

  const items = useMemo(() => {
    const rows = [];
    if (!myEmail) return rows;
    (templates || []).forEach((t) => {
      const nodes = t.flowchart?.nodes;
      if (!Array.isArray(nodes) || !nodes.length) return;
      const edges = t.flowchart?.edges || [];
      const tasks = nodes.filter(fcIsTask).slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
      const locks = fcLockInfo(tasks);
      // Which nodes are actually in play right now, given the decisions answered so far.
      const status = fcActiveSet(nodes, edges);
      // Flow-order "1.0 / 2.0 …" numbers so My Work shows the same numbering as the chart.
      const nodeNums = fcNodeNumbers(nodes, edges);
      // Form answers captured on earlier tasks + the HOD's fill-once {{variables}},
      // both resolved in what the assignee reads (variables win on a name collision).
      const vars = { ...fcFormAnswerMap(nodes) };
      (t.flowchart?.variables || []).forEach((v) => { if (v.key) vars[v.key] = v.value ?? ""; });
      tasks.forEach((n) => {
        // Decisions are routed by the HOD in the editor now, not the assignee — the
        // assignee only sees the real tasks the chosen branch activates. So a decision
        // node never shows up as someone's My Work item.
        if (n.type === "decision") return;
        // A branch that wasn't taken simply isn't this person's work — hide it.
        if (status[n.id] === "skipped") return;
        const taskEmail = (n.assignee?.email || "").trim().toLowerCase();
        const mineTask = taskEmail === myEmail;
        const subs = n.subtasks || [];
        // A subtask with no email of its own inherits the task's assignee.
        const subEmail = (s) => (s.assignee?.email || "").trim().toLowerCase() || taskEmail;
        const mySubIds = new Set(subs.filter((s) => subEmail(s) === myEmail).map((s) => s.id));
        if (!mineTask && mySubIds.size === 0) return; // nothing here is mine
        // Waiting on an upstream decision reads exactly like a lock, so surface it as one.
        let lock = locks[n.id] || {};
        if (status[n.id] === "pending" && !fcNodeDone(n)) {
          lock = { ...lock, locked: true, lockedByDecision: true, lockReason: "Waiting on an earlier decision — this opens once that choice is made." };
        }
        rows.push({ templateId: t.id, templateName: t.name || "Untitled workflow", node: n, lock, mineTask, mySubIds, vars, num: nodeNums[n.id] });
      });
    });
    return rows;
  }, [templates, myEmail]);

  // A card is "done" only when the whole task is (its own tick, or every subtask
  // done). Until then it stays in To-do — even if my own part is finished — so I can
  // see it's still waiting on the others.
  const todo = items.filter((it) => !fcNodeDone(it.node)).sort((a, b) => (a.node.due || "9999").localeCompare(b.node.due || "9999"));
  const done = items.filter((it) => fcNodeDone(it.node));

  const readProof = (file, cb) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => cb({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result, at: new Date().toISOString() });
    reader.readAsDataURL(file);
  };

  const renderTask = (it) => {
    const n = it.node;
    const lock = it.lock || {};
    const locked = !!lock.locked;
    const subs = n.subtasks || [];
    const hasSubs = subs.length > 0;
    const subsDone = subs.filter((s) => s.done).length;
    const nDone = fcNodeDone(n);
    const dm = fcDueMeta(n.due, nDone);
    const mineTask = it.mineTask;
    const taskWho = n.assignee?.name || n.assignee?.email || "someone";
    // Resolve the HOD's {{variables}} in what the assignee reads.
    const rv = (t) => interpolateVariables(t, it.vars || {});
    const updateSub = (subId, patch) => onUpdateNode(it.templateId, n.id, { subtasks: subs.map((s) => (s.id === subId ? { ...s, ...patch } : s)) });
    // Form fields (capture-only): the assignee fills these in; answers live in
    // n.formValues keyed by field id. Required ones gate the mark-done action.
    const fields = n.formFields || [];
    const fvals = n.formValues || {};
    const setFormVal = (fldId, val) => onUpdateNode(it.templateId, n.id, { formValues: { ...fvals, [fldId]: val } });
    const formReady = fcFormComplete(n);
    const fieldInput = { width: "100%", fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.ink, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7, padding: "7px 9px", outline: "none", boxSizing: "border-box" };
    const fieldOptions = (f) => (f.options || []).map((o) => o.trim()).filter(Boolean);
    const renderFieldInput = (f, val, onChange) => {
      switch (f.type) {
        case "longtext":
          return <textarea value={val || ""} onChange={(e) => onChange(e.target.value)} rows={3} placeholder="Type your answer…" style={{ ...fieldInput, resize: "vertical", lineHeight: 1.4 }} />;
        case "date":
          return <input type="date" value={val || ""} onChange={(e) => onChange(e.target.value)} style={fieldInput} />;
        case "number":
          return <input type="number" value={val ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="Enter a number…" style={fieldInput} />;
        case "email":
          return <input type="email" value={val || ""} onChange={(e) => onChange(e.target.value)} placeholder="name@email.com" style={fieldInput} />;
        case "url":
          return <input type="url" value={val || ""} onChange={(e) => onChange(e.target.value)} placeholder="https://…" style={fieldInput} />;
        case "dropdown":
          return (
            <select value={val || ""} onChange={(e) => onChange(e.target.value)} style={{ ...fieldInput, cursor: "pointer" }}>
              <option value="">Choose…</option>
              {fieldOptions(f).map((o, i) => <option key={i} value={o}>{o}</option>)}
            </select>
          );
        case "multiselect": {
          const arr = Array.isArray(val) ? val : [];
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {fieldOptions(f).map((o, i) => (
                <label key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.ink, cursor: "pointer" }}>
                  <input type="checkbox" checked={arr.includes(o)} onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} style={{ accentColor: C.sageDeep, cursor: "pointer" }} /> {o}
                </label>
              ))}
            </div>
          );
        }
        case "checkbox":
          return (
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.ink, cursor: "pointer" }}>
              <input type="checkbox" checked={val === true} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: C.sageDeep, cursor: "pointer" }} /> Yes
            </label>
          );
        case "file":
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7, padding: "7px 10px", cursor: "pointer", fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: C.spotlight, flexShrink: 0 }}>
                <input type="file" accept="image/*,application/pdf" onChange={(e) => { const file = e.target.files?.[0]; if (file) readProof(file, (proof) => onChange(proof)); e.target.value = ""; }} style={{ display: "none" }} />
                {val?.dataUrl ? <Paperclip size={13} /> : <Upload size={13} />} {val?.dataUrl ? "Replace file" : "Upload file"}
              </label>
              {val?.dataUrl && <a href={val.dataUrl} download={val.name} style={{ flex: 1, minWidth: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.spotlight, textDecoration: "none", wordBreak: "break-all" }}>{val.name}</a>}
            </div>
          );
        default:
          return <input value={val || ""} onChange={(e) => onChange(e.target.value)} placeholder="Type your answer…" style={fieldInput} />;
      }
    };
    const renderFieldReadonly = (f, val) => {
      if (!fcFieldFilled(f, val)) return <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.slateLight, fontStyle: "italic" }}>Not filled in yet</span>;
      if (f.type === "file") return <a href={val.dataUrl} download={val.name} style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.spotlight, textDecoration: "none", wordBreak: "break-all" }}>{val.name}</a>;
      if (f.type === "checkbox") return <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.ink }}>Yes</span>;
      const text = f.type === "multiselect" ? (Array.isArray(val) ? val.join(", ") : "") : String(val);
      return <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.ink, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</span>;
    };
    return (
      <div key={`${it.templateId}-${n.id}`} style={{ ...panelCard, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${C.line}`, background: C.paperDim }}>
          <GitMerge size={13} color={C.slateLight} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: C.slate, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.templateName}</span>
          <button onClick={() => onViewFlowchart(it.templateId)} title="Open the flowchart your HOD made" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 7, cursor: "pointer", padding: "5px 9px", fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, fontWeight: 600, color: C.spotlight }}><GitMerge size={12} /> View flowchart</button>
        </div>
        <div style={{ padding: "13px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1, minWidth: 0, fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600, color: C.ink }}>{it.num ? `${it.num} ` : ""}{rv(n.label || FC_META[n.type].name)}</span>
            <span style={{ flexShrink: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 600, color: dm.color, background: dm.bg, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{dm.label}</span>
          </div>
          {!mineTask && (
            <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.slateLight }}>Main task owned by <b style={{ color: C.slate }}>{taskWho}</b> — you're assigned a subtask below.</div>
          )}
          {(n.instructions || "").trim() && (
            <p style={{ margin: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{rv(n.instructions)}</p>
          )}

          {locked && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#FBF3E0", border: "1px solid #EBD9A8", borderRadius: 8, padding: "10px 12px" }}>
              <Lock size={15} color={C.spotlightDeep} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: C.inkSoft, lineHeight: 1.4 }}>{lock.lockReason}</div>
                {lock.lockedByKey && (n.guidance || "").trim() && (
                  <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, marginTop: 5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{n.guidance}</div>
                )}
                {lock.lockedByKey && !lock.lockedByPrev && (
                  <button onClick={() => onUpdateNode(it.templateId, n.id, { keyAck: true })} style={{ marginTop: 9, display: "inline-flex", alignItems: "center", gap: 6, background: C.spotlight, color: "#fff", border: "none", borderRadius: 7, padding: "6px 11px", cursor: "pointer", fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600 }}><CheckCircle2 size={13} /> I've read this — unlock step</button>
                )}
              </div>
            </div>
          )}

          {subs.length > 0 && (
            <div>
              <span style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}><ListTodo size={14} color={C.spotlightDeep} /> Subtasks · {subs.filter((s) => s.done).length}/{subs.length}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {subs.map((s, si) => {
                  const mineSub = it.mySubIds.has(s.id);
                  const subWho = (s.assignee?.name || s.assignee?.email) || taskWho;
                  return (
                  <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 6, background: mineSub ? C.paper : C.paperDim, border: `1px solid ${mineSub ? C.line : C.line}`, borderRadius: 8, padding: "6px 8px", opacity: mineSub ? 1 : 0.9 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {mineSub ? (
                        <input type="checkbox" checked={!!s.done} disabled={!s.proof || locked} onChange={(e) => updateSub(s.id, { done: e.target.checked })} title={locked ? "This step is locked" : !s.proof ? "Attach proof first" : s.done ? "Untick this subtask" : "Tick off — proof attached"} style={{ accentColor: C.sageDeep, cursor: (s.proof && !locked) ? "pointer" : "not-allowed", flexShrink: 0 }} />
                      ) : (
                        s.done ? <CheckCircle2 size={15} color={C.sageDeep} style={{ flexShrink: 0 }} /> : <Circle size={15} color={C.slateLight} style={{ flexShrink: 0 }} />
                      )}
                      <span style={{ flex: 1, minWidth: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: s.done ? C.slateLight : C.ink, textDecoration: s.done ? "line-through" : "none" }}>{it.num && <b style={{ color: C.slateLight, fontWeight: 700 }}>{fcSubNumber(it.num, si)} </b>}{s.title || "Subtask"}</span>
                      {mineSub && !locked ? (
                        <label title={s.proof ? "Replace proof" : "Attach proof (image or PDF)"} style={{ flexShrink: 0, cursor: "pointer", padding: 4, color: s.proof ? C.sageDeep : C.spotlight, display: "flex", alignItems: "center" }}>
                          <input type="file" accept="image/*,application/pdf" onChange={(e) => readProof(e.target.files?.[0], (proof) => updateSub(s.id, { proof }))} style={{ display: "none" }} />
                          {s.proof ? <Paperclip size={14} /> : <Upload size={14} />}
                        </label>
                      ) : !mineSub ? (
                        <span style={{ flexShrink: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: s.done ? C.sageDeep : C.slateLight, background: s.done ? "#EAF4EC" : "transparent", borderRadius: 999, padding: "2px 8px" }}>{s.done ? "Done" : "Pending"}</span>
                      ) : null}
                    </div>
                    {!mineSub && (
                      <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, color: C.slateLight, paddingLeft: 23 }}>Assigned to {subWho}</div>
                    )}
                    {s.proof && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 26 }}>
                        {s.proof.type?.startsWith("image/") ? <img src={s.proof.dataUrl} alt="proof" style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 5 }} /> : <Paperclip size={13} color={C.slate} />}
                        <a href={s.proof.dataUrl} download={s.proof.name} style={{ flex: 1, minWidth: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.spotlight, textDecoration: "none", wordBreak: "break-all" }}>{s.proof.name}</a>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {fields.length > 0 && (
            <div>
              <span style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}><ClipboardList size={14} color={C.spotlightDeep} /> {fields.length > 1 ? "Form fields" : "Form field"}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 8 }}>
                {fields.map((f) => {
                  const val = fvals[f.id];
                  const editable = mineTask && !locked && !n.done;
                  return (
                    <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: C.slate }}>{rv(f.label) || "Field"}{f.required && <span style={{ color: "#B23A2E" }}> *</span>}</span>
                      {editable ? renderFieldInput(f, val, (v) => setFormVal(f.id, v)) : renderFieldReadonly(f, val)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {hasSubs ? (
            nDone ? (
            <div style={{ display: "flex", alignItems: "center", gap: 9, background: "#F1F8F3", border: "1px solid #Bfe0Cc", borderRadius: 8, padding: "10px 12px" }}>
              <CheckCircle2 size={16} color={C.sageDeep} style={{ flexShrink: 0 }} />
              <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: C.sageDeep }}>All {subs.length} subtasks done — this task completed automatically.</span>
            </div>
            ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 9, background: C.paperDim, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 12px" }}>
              <Clock size={15} color={C.slateLight} style={{ flexShrink: 0 }} />
              <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate }}>Completes automatically when all subtasks are ticked off · <b>{subsDone}/{subs.length}</b> done.</span>
            </div>
            )
          ) : mineTask ? (
            n.done ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F1F8F3", border: "1px solid #Bfe0Cc", borderRadius: 8, padding: 10 }}>
              {n.proof?.type?.startsWith("image/") ? <img src={n.proof.dataUrl} alt="proof" style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} /> : <CheckCircle2 size={18} color={C.sageDeep} style={{ flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 600, color: C.sageDeep, textTransform: "uppercase", letterSpacing: "0.04em" }}>Done{n.completedAt ? ` · ${fcFmtDate(String(n.completedAt).slice(0, 10))}` : ""}</div>
                {n.proof && <a href={n.proof.dataUrl} download={n.proof.name} style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.spotlight, textDecoration: "none", wordBreak: "break-all" }}>{n.proof.name}</a>}
              </div>
              <button onClick={() => onUpdateNode(it.templateId, n.id, { done: false })} title="Reopen this task" style={{ flexShrink: 0, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, cursor: "pointer", padding: "6px 10px", fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: C.slate }}>Reopen</button>
            </div>
            ) : locked ? (
            <button disabled title={lock.lockReason} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: C.paperDim, border: `1px solid ${C.line}`, borderRadius: 8, cursor: "not-allowed", padding: "10px", fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600, color: C.slateLight }}><Lock size={14} /> Locked</button>
            ) : !formReady ? (
            <button disabled title="Fill in the required form fields (marked *) before ticking this off" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: C.paperDim, border: `1px solid ${C.line}`, borderRadius: 8, cursor: "not-allowed", padding: "10px", fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600, color: C.slateLight }}><ClipboardList size={14} /> Fill required fields first</button>
            ) : (
            <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: C.sageDeep, borderRadius: 8, cursor: "pointer", padding: "10px", fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#fff" }}>
              <input type="file" accept="image/*,application/pdf" onChange={(e) => readProof(e.target.files?.[0], (proof) => onUpdateNode(it.templateId, n.id, { done: true, proof, completedAt: new Date().toISOString() }))} style={{ display: "none" }} />
              <CheckSquare size={15} /> Tick off — attach proof
            </label>
            )
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 9, background: C.paperDim, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 12px" }}>
              {nDone ? <CheckCircle2 size={15} color={C.sageDeep} style={{ flexShrink: 0 }} /> : <Clock size={15} color={C.slateLight} style={{ flexShrink: 0 }} />}
              <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate }}>Main task {nDone ? "completed" : "not done yet"} by <b>{taskWho}</b>.</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: C.ink, margin: 0 }}>My work</h1>
        <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, margin: "4px 0 0" }}>
          {myEmail ? <>Every task assigned to <b>{authUser.email}</b>, across every workflow.</> : "Sign in to see the tasks assigned to you."}
        </p>
      </div>

      {items.length === 0 ? (
        <div style={emptyState}>
          <Sparkles size={20} color={C.spotlight} />
          <p style={{ margin: "10px 0 2px", fontFamily: "'Fraunces', serif", fontSize: 17, color: C.ink }}>You're all caught up.</p>
          <p style={{ margin: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate }}>No workflow steps are assigned to your email right now.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 640 }}>
          <div>
            <span style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>To do · {todo.length}</span>
            {todo.length === 0 ? (
              <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slateLight, margin: 0 }}>Nothing outstanding — every assigned step is done.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{todo.map(renderTask)}</div>
            )}
          </div>
          {done.length > 0 && (
            <div>
              <span style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>Completed · {done.length}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{done.map(renderTask)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MyWork({ runsheets, currentUser, onToggle }) {
  const mine = useMemo(() => {
    const rows = [];
    runsheets.forEach((rs) => {
      rs.tasks.forEach((t) => {
        if (t.assignee !== currentUser) return;
        if (t.status === "delivered") return;
        rows.push({ ...t, branchName: rs.branchName });
      });
    });
    return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [runsheets, currentUser]);

  const groups = [
    { key: "missed", label: "Overdue", tasks: mine.filter((t) => cueStatus(t) === "missed") },
    { key: "on-deck", label: "Due this week", tasks: mine.filter((t) => cueStatus(t) === "on-deck") },
    { key: "standing-by", label: "Upcoming", tasks: mine.filter((t) => cueStatus(t) === "standing-by") },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: C.ink, margin: 0 }}>My work</h1>
          <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, margin: "4px 0 0" }}>Every cue assigned to you, across all runsheets.</p>
        </div>
      </div>

      {mine.length === 0 ? (
        <div style={emptyState}>
          <Sparkles size={20} color={C.spotlight} />
          <p style={{ margin: "10px 0 2px", fontFamily: "'Fraunces', serif", fontSize: 17, color: C.ink }}>You're all caught up.</p>
          <p style={{ margin: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate }}>Nothing assigned to {currentUser} right now.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {groups.filter((g) => g.tasks.length > 0).map((g) => (
            <div key={g.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <h3 style={{ ...sectionHeading, margin: 0 }}>{g.label}</h3>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: C.slateLight }}>{g.tasks.length}</span>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
                {g.tasks.map((t, i) => (
                  <div key={t.id} style={{
                    display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                    borderBottom: i === g.tasks.length - 1 ? "none" : `1px solid ${C.line}`,
                  }}>
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => onToggle(t.id)}
                      title="Mark as delivered"
                      style={{ width: 17, height: 17, accentColor: C.sage, cursor: "pointer", flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 14, fontWeight: 500, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                      <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, marginTop: 2 }}>
                        {t.branchName} &middot; due {fmtDate(t.dueDate)}
                      </div>
                    </div>
                    <StatusPill status={cueStatus(t)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   DASHBOARD
--------------------------------------------------------------- */
// Inline-SVG charts for the dashboard task list — no external libraries.
function DashboardCharts({ deptBars, statusSlices }) {
  const barMax = Math.max(1, ...deptBars.map((d) => d.count));
  const total = statusSlices.reduce((sum, s) => sum + s.value, 0);

  // Donut arc geometry.
  const R = 70, INNER = 42, CX = 90, CY = 90;
  const polar = (angle, radius) => [
    CX + radius * Math.cos((angle - 90) * Math.PI / 180),
    CY + radius * Math.sin((angle - 90) * Math.PI / 180),
  ];
  let acc = 0;
  const arcs = statusSlices.filter((s) => s.value > 0).map((s) => {
    const start = (acc / total) * 360;
    acc += s.value;
    const end = (acc / total) * 360;
    const large = end - start > 180 ? 1 : 0;
    const [x1, y1] = polar(start, R);
    const [x2, y2] = polar(end, R);
    const [x3, y3] = polar(end, INNER);
    const [x4, y4] = polar(start, INNER);
    const d = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${INNER} ${INNER} 0 ${large} 0 ${x4} ${y4} Z`;
    return { ...s, d };
  });

  const cardStyle = {
    background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "18px 20px", flex: 1, minWidth: 260,
  };
  const titleStyle = {
    fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600, color: C.ink, margin: "0 0 16px",
  };

  const BAR_H = 22, BAR_GAP = 12, LABEL_W = 84, TRACK_W = 190;
  const chartH = deptBars.length * (BAR_H + BAR_GAP);

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {/* Bar chart — missed + on-deck tasks per department */}
      <div style={cardStyle}>
        <p style={titleStyle}>Open cues by department</p>
        {deptBars.length === 0 ? (
          <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, margin: 0 }}>No open cues.</p>
        ) : (
          <svg width="100%" viewBox={`0 0 ${LABEL_W + TRACK_W + 34} ${chartH}`} style={{ display: "block" }}>
            {deptBars.map((d, i) => {
              const y = i * (BAR_H + BAR_GAP);
              const w = Math.max(2, (d.count / barMax) * TRACK_W);
              return (
                <g key={d.dept}>
                  <text x={0} y={y + BAR_H / 2} dominantBaseline="middle" style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, fill: C.slate }}>
                    {d.dept.length > 12 ? d.dept.slice(0, 11) + "…" : d.dept}
                  </text>
                  <rect x={LABEL_W} y={y} width={TRACK_W} height={BAR_H} rx={5} fill={C.paperDim} />
                  <rect x={LABEL_W} y={y} width={w} height={BAR_H} rx={5} fill={C.spotlight} />
                  <text x={LABEL_W + w + 8} y={y + BAR_H / 2} dominantBaseline="middle" style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, fill: C.ink }}>
                    {d.count}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Donut chart — status breakdown */}
      <div style={cardStyle}>
        <p style={titleStyle}>Status breakdown</p>
        {total === 0 ? (
          <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, margin: 0 }}>No open cues.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <svg width={180} height={180} viewBox="0 0 180 180">
              {arcs.map((a) => <path key={a.key} d={a.d} fill={a.color} />)}
              <text x={CX} y={CY - 4} textAnchor="middle" style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, fill: C.ink }}>{total}</text>
              <text x={CX} y={CY + 16} textAnchor="middle" style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, fill: C.slate }}>open cues</text>
            </svg>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>
              {statusSlices.map((s) => (
                <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.inkSoft }}>{s.label} ({s.value})</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Dashboard({ runsheets, isAdmin, onOpen, onNotify }) {
  // A logged-in account only ever holds its OWN department's data (the backend
  // scopes every request by department), so a department filter is meaningless
  // and misleading for a normal user — it would just let them "select" other
  // departments and see an empty list. Only admins, who work across departments,
  // get the filter; everyone else is implicitly pinned to "All" (= their own).
  const [deptFilter, setDeptFilter] = useState("All");
  const [taskView, setTaskView] = useState("table");

  const allTasks = useMemo(() => {
    const rows = [];
    runsheets.forEach((rs) => {
      rs.tasks.forEach((t) => {
        rows.push({ ...t, runsheetId: rs.id, branchName: rs.branchName, eventDate: rs.eventDate });
      });
    });
    return rows;
  }, [runsheets]);

  const relevant = allTasks.filter((t) => {
    const s = cueStatus(t);
    if (s === "delivered" || s === "standing-by") return false;
    if (deptFilter !== "All" && t.dept !== deptFilter) return false;
    return true;
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const missedCount = relevant.filter((t) => cueStatus(t) === "missed").length;
  const onDeckCount = relevant.filter((t) => cueStatus(t) === "on-deck").length;

  const byAssignee = useMemo(() => {
    const m = {};
    relevant.forEach((t) => {
      if (!m[t.assignee]) m[t.assignee] = [];
      m[t.assignee].push(t);
    });
    return m;
  }, [relevant]);

  // Bar chart data — count of missed + on-deck tasks per department.
  const deptBars = useMemo(() => {
    const m = {};
    relevant.forEach((t) => { m[t.dept] = (m[t.dept] || 0) + 1; });
    return Object.entries(m).map(([dept, count]) => ({ dept, count })).sort((a, b) => b.count - a.count);
  }, [relevant]);

  // Pie chart data — status breakdown (missed / on-deck / standing-by) of every
  // open task in the current department filter (delivered excluded).
  const statusSlices = useMemo(() => {
    const counts = { missed: 0, "on-deck": 0, "standing-by": 0 };
    allTasks.forEach((t) => {
      const s = cueStatus(t);
      if (s === "delivered") return;
      if (deptFilter !== "All" && t.dept !== deptFilter) return;
      if (counts[s] !== undefined) counts[s] += 1;
    });
    return [
      { key: "missed", label: "Missed", value: counts.missed, color: C.curtain },
      { key: "on-deck", label: "On deck", value: counts["on-deck"], color: C.spotlight },
      { key: "standing-by", label: "Standing by", value: counts["standing-by"], color: C.slate },
    ];
  }, [allTasks, deptFilter]);

  return (
    <div>
      <div style={{
        background: C.ink, borderRadius: 16, padding: "28px 32px", marginBottom: 28,
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: -60, right: -40, width: 220, height: 220, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(232,166,61,0.22) 0%, rgba(232,166,61,0) 70%)",
        }} />
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 1.5, color: C.spotlight, margin: 0, textTransform: "uppercase" }}>
          RISE & GRIND! 🔥
        </p>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 30, color: C.paper, margin: "6px 0 8px" }}>
          Champions don't wait — they deliver!
        </h1>
        <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 14, color: "rgba(250,247,240,0.65)", margin: 0, maxWidth: 480, textAlign: "justify" }}>
          Here's what's standing between you and a flawless showcase. Attack every cue, back your teammates, and let's make this one for the books!
        </p>
        <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 14, color: "rgba(250,247,240,0.65)", margin: "8px 0 0", maxWidth: 480, textAlign: "justify" }}>
          ⚠️ Warning: Dr. Doom sees every unchecked cue. Don't test him.
        </p>
        <div style={{ display: "flex", gap: 28, marginTop: 22 }}>
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, color: C.curtain }}>{missedCount}</div>
            <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: "rgba(250,247,240,0.55)" }}>Missed cues</div>
          </div>
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, color: C.spotlight }}>{onDeckCount}</div>
            <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: "rgba(250,247,240,0.55)" }}>On deck</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
        {isAdmin ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate }}>Department</span>
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} style={selectStyle}>
              <option>All</option>
              {DEPARTMENTS.map((d) => <option key={d.name}>{d.name}</option>)}
              <option>All Departments</option>
            </select>
          </div>
        ) : <div />}
        <button onClick={() => onNotify(byAssignee)} disabled={relevant.length === 0} style={{
          ...primaryBtn, opacity: relevant.length === 0 ? 0.45 : 1, cursor: relevant.length === 0 ? "default" : "pointer",
        }}>
          <Mail size={15} /> Notify everyone with an open cue
        </button>
      </div>

      {relevant.length === 0 ? (
        <div style={emptyState}>
          <Sparkles size={20} color={C.spotlight} />
          <p style={{ margin: "10px 0 2px", fontFamily: "'Fraunces', serif", fontSize: 17, color: C.ink }}>All clear backstage</p>
          <p style={{ margin: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate }}>No missed or upcoming cues match this filter.</p>
        </div>
      ) : (
      <>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <div style={{ display: "flex", background: C.paperDim, borderRadius: 10, padding: 3 }}>
            <button onClick={() => setTaskView("table")} style={toggleBtn(taskView === "table")}><ListChecks size={15} /> Table</button>
            <button onClick={() => setTaskView("chart")} style={toggleBtn(taskView === "chart")}><BarChart2 size={15} /> Chart</button>
          </div>
        </div>
        {taskView === "chart" ? (
          <DashboardCharts deptBars={deptBars} statusSlices={statusSlices} />
        ) : (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
          {relevant.map((t, i) => (
            <div key={t.id} onClick={() => onOpen(t.runsheetId)} style={{
              display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
              borderBottom: i === relevant.length - 1 ? "none" : `1px solid ${C.line}`,
              cursor: "pointer", background: "transparent",
            }}
              onMouseEnter={(e) => e.currentTarget.style.background = C.paperDim}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <StatusPill status={cueStatus(t)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 14, fontWeight: 500, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, marginTop: 2 }}>
                  {t.branchName} &middot; assigned to {t.assignee} &middot; due {fmtDate(t.dueDate)}
                </div>
              </div>
              <DeptBadge dept={t.dept} />
              <ChevronRight size={16} color={C.slateLight} />
            </div>
          ))}
        </div>
        )}
      </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   REPORTS
--------------------------------------------------------------- */
function ReportStatCard({ label, value, sub }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 500, color: C.slate, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 600, color: C.ink, marginTop: 6, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function runsheetStatus(missed) {
  if (missed === 0) return { label: "On track", color: C.sageDeep, bg: "#E7F1EB" };
  if (missed <= 2) return { label: "At risk", color: C.spotlightDeep, bg: "#FBF0DC" };
  return { label: "Overdue", color: C.curtainDeep, bg: "#FBE7E9" };
}

// Inline-SVG report charts — no external libraries.
function ReportsCharts({ timeline, deptBreakdown, statusTotals, overallPct }) {
  const cardStyle = {
    background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "18px 22px", marginBottom: 20,
  };
  const titleStyle = {
    fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600, color: C.ink, margin: "0 0 18px",
  };
  const emptyLine = { fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, margin: 0 };

  // --- Line chart geometry: completion over time ---
  const LW = 640, LH = 200, LPAD_L = 34, LPAD_R = 16, LPAD_T = 14, LPAD_B = 44;
  const plotW = LW - LPAD_L - LPAD_R, plotH = LH - LPAD_T - LPAD_B;
  const xAt = (i) => LPAD_L + (timeline.length <= 1 ? plotW / 2 : (i / (timeline.length - 1)) * plotW);
  const yAt = (pct) => LPAD_T + (1 - pct / 100) * plotH;
  const linePath = timeline.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(p.pct)}`).join(" ");

  // --- Bar chart geometry: tasks by department ---
  const barMax = Math.max(1, ...deptBreakdown.map((d) => d.total));
  const BW = 640, BH = 220, BPAD_B = 52, BPAD_T = 14, BPLOT_H = BH - BPAD_B - BPAD_T;
  const slotW = deptBreakdown.length ? BW / deptBreakdown.length : BW;
  const barW = Math.min(46, slotW * 0.5);

  // --- Donut geometry: overall status ---
  const donutTotal = statusTotals.reduce((sum, s) => sum + s.value, 0);
  const R = 70, INNER = 44, CX = 90, CY = 90;
  const polar = (angle, radius) => [
    CX + radius * Math.cos((angle - 90) * Math.PI / 180),
    CY + radius * Math.sin((angle - 90) * Math.PI / 180),
  ];
  let acc = 0;
  const arcs = statusTotals.filter((s) => s.value > 0).map((s) => {
    const start = (acc / donutTotal) * 360;
    acc += s.value;
    const end = (acc / donutTotal) * 360;
    const large = end - start > 180 ? 1 : 0;
    const [x1, y1] = polar(start, R);
    const [x2, y2] = polar(end, R);
    const [x3, y3] = polar(end, INNER);
    const [x4, y4] = polar(start, INNER);
    const d = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${INNER} ${INNER} 0 ${large} 0 ${x4} ${y4} Z`;
    return { ...s, d };
  });

  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  return (
    <div>
      {/* Chart 1 — completion over time */}
      <div style={cardStyle}>
        <p style={titleStyle}>Completion over time</p>
        {timeline.length === 0 ? (
          <p style={emptyLine}>No runsheets to plot yet.</p>
        ) : (
          <svg width="100%" viewBox={`0 0 ${LW} ${LH}`} style={{ display: "block" }}>
            {[0, 25, 50, 75, 100].map((g) => (
              <g key={g}>
                <line x1={LPAD_L} y1={yAt(g)} x2={LW - LPAD_R} y2={yAt(g)} stroke={C.line} strokeWidth={1} />
                <text x={LPAD_L - 8} y={yAt(g)} textAnchor="end" dominantBaseline="middle" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fill: C.slateLight }}>{g}</text>
              </g>
            ))}
            <path d={linePath} fill="none" stroke={C.sage} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {timeline.map((p, i) => (
              <g key={i}>
                <circle cx={xAt(i)} cy={yAt(p.pct)} r={4} fill={C.sage} />
                <text x={xAt(i)} y={LH - LPAD_B + 16} textAnchor="middle" style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 10, fill: C.slate }}>{clip(p.label, 12)}</text>
                <text x={xAt(i)} y={LH - LPAD_B + 30} textAnchor="middle" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fill: C.slateLight }}>{p.pct}%</text>
              </g>
            ))}
          </svg>
        )}
      </div>

      {/* Chart 2 — tasks by department */}
      <div style={cardStyle}>
        <p style={titleStyle}>Tasks by department</p>
        {deptBreakdown.length === 0 ? (
          <p style={emptyLine}>No cues to break down yet.</p>
        ) : (
          <svg width="100%" viewBox={`0 0 ${BW} ${BH}`} style={{ display: "block" }}>
            {deptBreakdown.map((d, i) => {
              const cx = i * slotW + slotW / 2;
              const totalH = (d.total / barMax) * BPLOT_H;
              const delivH = (d.delivered / barMax) * BPLOT_H;
              const baseY = BH - BPAD_B;
              return (
                <g key={d.dept}>
                  <rect x={cx - barW / 2} y={baseY - totalH} width={barW} height={totalH} rx={5} fill={C.spotlight} />
                  <rect x={cx - barW / 2} y={baseY - delivH} width={barW} height={delivH} rx={5} fill={C.spotlightDeep} />
                  <text x={cx} y={baseY - totalH - 6} textAnchor="middle" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, fill: C.ink }}>{d.total}</text>
                  <text x={cx} y={baseY + 16} textAnchor="middle" style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 10, fill: C.slate }}>{clip(d.dept, 10)}</text>
                </g>
              );
            })}
          </svg>
        )}
        {deptBreakdown.length > 0 && (
          <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: C.spotlight, flexShrink: 0 }} />
              <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.inkSoft }}>Total tasks</span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: C.spotlightDeep, flexShrink: 0 }} />
              <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.inkSoft }}>Delivered</span>
            </span>
          </div>
        )}
      </div>

      {/* Chart 3 — overall status breakdown */}
      <div style={cardStyle}>
        <p style={titleStyle}>Overall status breakdown</p>
        {donutTotal === 0 ? (
          <p style={emptyLine}>No cues to break down yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <svg width={180} height={180} viewBox="0 0 180 180">
              {arcs.map((a) => <path key={a.key} d={a.d} fill={a.color} />)}
              <text x={CX} y={CY - 4} textAnchor="middle" style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, fill: C.ink }}>{overallPct}%</text>
              <text x={CX} y={CY + 16} textAnchor="middle" style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, fill: C.slate }}>completion</text>
            </svg>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>
              {statusTotals.map((s) => (
                <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.inkSoft }}>{s.label} ({s.value})</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Reports({ runsheets, templates }) {
  const [templateFilter, setTemplateFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [view, setView] = useState("table");

  const templateName = useCallback(
    (templateId) => templates.find((t) => t.id === templateId)?.name ?? "Unknown template",
    [templates]
  );

  const templateNames = useMemo(() => {
    const names = new Set(runsheets.map((rs) => templateName(rs.templateId)));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [runsheets, templateName]);

  const stats = useMemo(() => {
    let totalTasks = 0;
    let delivered = 0;
    runsheets.forEach((rs) => {
      rs.tasks.forEach((t) => {
        totalTasks += 1;
        if (t.status === "delivered") delivered += 1;
      });
    });
    const pct = totalTasks === 0 ? 0 : Math.round((delivered / totalTasks) * 100);
    return { totalTasks, delivered, pct };
  }, [runsheets]);

  const rows = useMemo(() => runsheets.map((rs) => {
    const total = rs.tasks.length;
    const done = rs.tasks.filter((t) => t.status === "delivered").length;
    const missed = rs.tasks.filter((t) => cueStatus(t) === "missed").length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return {
      id: rs.id, branchName: rs.branchName, branchShort: rs.branchShort, eventDate: rs.eventDate,
      template: templateName(rs.templateId), status: runsheetStatus(missed).label,
      pct, done, total, missed,
    };
  }), [runsheets, templateName]);

  const filteredRows = useMemo(() => rows.filter((r) => {
    if (templateFilter !== "All" && r.template !== templateFilter) return false;
    if (statusFilter !== "All" && r.status !== statusFilter) return false;
    return true;
  }), [rows, templateFilter, statusFilter]);

  const deptBreakdown = useMemo(() => {
    const m = {};
    runsheets.forEach((rs) => {
      rs.tasks.forEach((t) => {
        if (!m[t.dept]) m[t.dept] = { total: 0, delivered: 0 };
        m[t.dept].total += 1;
        if (t.status === "delivered") m[t.dept].delivered += 1;
      });
    });
    return Object.entries(m)
      .map(([dept, v]) => ({ dept, ...v, pct: v.total === 0 ? 0 : Math.round((v.delivered / v.total) * 100) }))
      .sort((a, b) => b.total - a.total);
  }, [runsheets]);

  // Completion-over-time series — one point per runsheet, chronological.
  const timeline = useMemo(() =>
    rows.filter((r) => r.eventDate)
      .slice()
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
      .map((r) => ({ label: r.branchName, eventDate: r.eventDate, pct: r.pct })),
    [rows]);

  // Overall status breakdown across every task.
  const statusTotals = useMemo(() => {
    const counts = { delivered: 0, missed: 0, "on-deck": 0, "standing-by": 0 };
    runsheets.forEach((rs) => rs.tasks.forEach((t) => {
      const s = cueStatus(t);
      if (counts[s] !== undefined) counts[s] += 1;
    }));
    return [
      { key: "delivered", label: "Delivered", value: counts.delivered, color: C.sage },
      { key: "missed", label: "Missed", value: counts.missed, color: C.curtain },
      { key: "on-deck", label: "On deck", value: counts["on-deck"], color: C.spotlight },
      { key: "standing-by", label: "Standing by", value: counts["standing-by"], color: C.slate },
    ];
  }, [runsheets]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: C.ink, margin: 0 }}>Reports</h1>
        <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, margin: "4px 0 0" }}>How every showcase runsheet is tracking, at a glance.</p>
      </div>

      <div style={{ display: "flex", marginBottom: 24 }}>
        <div style={{ display: "flex", background: C.paperDim, borderRadius: 10, padding: 3 }}>
          <button onClick={() => setView("table")} style={toggleBtn(view === "table")}><ListChecks size={15} /> Table</button>
          <button onClick={() => setView("chart")} style={toggleBtn(view === "chart")}><BarChart2 size={15} /> Chart</button>
        </div>
      </div>

      {view === "chart" ? (
        <ReportsCharts timeline={timeline} deptBreakdown={deptBreakdown} statusTotals={statusTotals} overallPct={stats.pct} />
      ) : (
      <>
      {/* Section 1 — Overview cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 32 }}>
        <ReportStatCard label="Active runsheets" value={runsheets.length} />
        <ReportStatCard label="Total cues" value={stats.totalTasks} sub="across all runsheets" />
        <ReportStatCard label="Delivered" value={stats.delivered} sub={`${stats.totalTasks - stats.delivered} still open`} />
        <ReportStatCard label="Completion" value={`${stats.pct}%`} sub="overall" />
      </div>

      {/* Section 2 — Runsheet progress table */}
      <h3 style={sectionHeading}>Runsheet progress</h3>
      {rows.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate }}>Template</span>
            <select value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)} style={selectStyle}>
              <option value="All">All templates</option>
              {templateNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate }}>Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
              <option value="All">All statuses</option>
              <option value="On track">On track</option>
              <option value="At risk">At risk</option>
              <option value="Overdue">Overdue</option>
            </select>
          </div>
        </div>
      )}
      {rows.length === 0 ? (
        <div style={{ ...emptyState, marginBottom: 32 }}>
          <BarChart2 size={20} color={C.spotlight} />
          <p style={{ margin: "10px 0 2px", fontFamily: "'Fraunces', serif", fontSize: 17, color: C.ink }}>Nothing to report yet</p>
          <p style={{ margin: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate }}>Create a runsheet to start tracking progress here.</p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div style={{ ...emptyState, marginBottom: 32 }}>
          <BarChart2 size={20} color={C.spotlight} />
          <p style={{ margin: "10px 0 2px", fontFamily: "'Fraunces', serif", fontSize: 17, color: C.ink }}>No runsheets match these filters</p>
          <p style={{ margin: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate }}>Try a different template or status.</p>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", marginBottom: 32 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead>
                <tr>
                  {["Branch", "Event date", "Progress", "Missed cues", "Status"].map((h) => (
                    <th key={h} style={{
                      textAlign: h === "Progress" ? "left" : (h === "Missed cues" ? "center" : "left"),
                      fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 600, color: C.slate,
                      textTransform: "uppercase", letterSpacing: 0.6, padding: "12px 16px",
                      borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, i) => {
                  const st = runsheetStatus(r.missed);
                  return (
                    <tr key={r.id}>
                      <td style={{ padding: "13px 16px", borderBottom: i === filteredRows.length - 1 ? "none" : `1px solid ${C.line}` }}>
                        <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13.5, fontWeight: 500, color: C.ink }}>{r.branchName}</div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: C.slateLight }}>{r.branchShort}</div>
                      </td>
                      <td style={{ padding: "13px 16px", borderBottom: i === filteredRows.length - 1 ? "none" : `1px solid ${C.line}`, fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, whiteSpace: "nowrap" }}>{fmtDate(r.eventDate)}</td>
                      <td style={{ padding: "13px 16px", borderBottom: i === filteredRows.length - 1 ? "none" : `1px solid ${C.line}`, minWidth: 180 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ flex: 1, height: 6, background: C.paperDim, borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${r.pct}%`, background: C.sage, borderRadius: 4 }} />
                          </div>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: C.slate, minWidth: 34, textAlign: "right" }}>{r.pct}%</span>
                        </div>
                        <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, color: C.slateLight, marginTop: 4 }}>{r.done}/{r.total} delivered</div>
                      </td>
                      <td style={{ padding: "13px 16px", borderBottom: i === filteredRows.length - 1 ? "none" : `1px solid ${C.line}`, textAlign: "center", fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600, color: r.missed > 0 ? C.curtainDeep : C.slateLight }}>{r.missed}</td>
                      <td style={{ padding: "13px 16px", borderBottom: i === filteredRows.length - 1 ? "none" : `1px solid ${C.line}` }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", fontFamily: "'Work Sans', sans-serif",
                          fontSize: 12, fontWeight: 600, color: st.color, background: st.bg,
                          padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap",
                        }}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 3 — Department breakdown */}
      <h3 style={sectionHeading}>Department breakdown</h3>
      {deptBreakdown.length === 0 ? (
        <div style={emptyState}>
          <p style={{ margin: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate }}>No cues to break down yet.</p>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          {deptBreakdown.map((d) => (
            <div key={d.dept}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 500, color: C.ink }}>{d.dept}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: C.slate }}>{d.delivered}/{d.total} · {d.pct}%</span>
              </div>
              <div style={{ height: 12, background: C.paperDim, borderRadius: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${d.pct}%`, background: C.spotlight, borderRadius: 6, transition: "width 0.3s" }} />
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   CALENDAR
--------------------------------------------------------------- */
const CAL_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CAL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const CAL_HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 08:00 – 20:00

function calDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calChipColor(ev) {
  return ev.type === "task" ? "rgba(79,143,107,0.85)" : "rgba(180,140,60,0.85)";
}

function CalendarView({ runsheets, onOpenRunsheet }) {
  const today = new Date();
  const todayKey = calDateKey(today);
  const [view, setView] = useState("month"); // "month" | "week"
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const onCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  // Event banners come from each runsheet's event day; task pills come from each
  // task's due date. Both carry the runsheet id so a click opens that runsheet.
  const { bannersByDate, pillsByDate } = useMemo(() => {
    const banners = {};
    const pills = {};
    const push = (map, dateStr, item) => {
      if (!dateStr) return;
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(item);
    };
    runsheets.forEach((rs) => {
      if (rs.eventDate) push(banners, rs.eventDate, { runsheetId: rs.id, branchShort: rs.branchShort });
      rs.tasks.forEach((t) => {
        if (t.dueDate) push(pills, t.dueDate, { runsheetId: rs.id, title: t.title, status: cueStatus(t) });
      });
    });
    return { bannersByDate: banners, pillsByDate: pills };
  }, [runsheets]);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
    const start = new Date(year, month, 1 - startWeekday);
    return Array.from({ length: totalCells }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [year, month]);

  const weekDays = useMemo(() => {
    const start = new Date(cursor);
    start.setDate(cursor.getDate() - cursor.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const onCurrentWeek = weekDays.some((d) => calDateKey(d) === todayKey);
  const showTodayBtn = view === "month" ? !onCurrentMonth : !onCurrentWeek;

  const goPrev = () => {
    if (view === "week") {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() - 7);
      setCursor(d);
    } else {
      setCursor(new Date(year, month - 1, 1));
    }
  };
  const goNext = () => {
    if (view === "week") {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + 7);
      setCursor(d);
    } else {
      setCursor(new Date(year, month + 1, 1));
    }
  };
  const goToday = () => setCursor(new Date(today.getFullYear(), today.getMonth(), today.getDate()));

  const pillStyle = (status) => {
    const meta = STATUS_META[status] || STATUS_META["standing-by"];
    return {
      background: meta.bg, color: meta.color, borderRadius: 5, padding: "2px 6px",
      fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 500,
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer",
    };
  };

  // Shared day-cell renderer for both views. maxPills / minHeight / dim differ.
  const dayCell = (d, { maxPills, minHeight, dim }) => {
    const key = calDateKey(d);
    const isToday = key === todayKey;
    const banners = bannersByDate[key] || [];
    const pills = pillsByDate[key] || [];
    const visiblePills = pills.slice(0, maxPills);
    const overflow = pills.length - visiblePills.length;
    return (
      <div key={key} style={{
        background: C.card, minHeight, padding: 7,
        display: "flex", flexDirection: "column", gap: 4,
        opacity: dim ? 0.35 : 1,
      }}>
        <div style={{ marginBottom: 2 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            minWidth: 20, height: 20, padding: "0 5px", borderRadius: 999,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5,
            fontWeight: isToday ? 700 : 500,
            background: isToday ? C.spotlight : "transparent",
            color: isToday ? "#FFFFFF" : C.slate,
          }}>{d.getDate()}</span>
        </div>
        {banners.map((b, i) => (
          <div
            key={`b-${i}`}
            onClick={() => onOpenRunsheet && onOpenRunsheet(b.runsheetId)}
            title={`${b.branchShort} — event day`}
            style={{
              background: C.curtain, color: "#FFFFFF", borderRadius: 5, padding: "2px 6px",
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, fontWeight: 600,
              letterSpacing: 0.3, overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", cursor: "pointer",
            }}
          >{b.branchShort}</div>
        ))}
        {visiblePills.map((p, i) => (
          <div
            key={`p-${i}`}
            onClick={() => onOpenRunsheet && onOpenRunsheet(p.runsheetId)}
            title={p.title}
            style={pillStyle(p.status)}
          >{p.title}</div>
        ))}
        {overflow > 0 && (
          <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 10.5, fontWeight: 600, color: C.slate }}>
            +{overflow} more
          </div>
        )}
      </div>
    );
  };

  const weekLabel = (() => {
    const a = weekDays[0], b = weekDays[6];
    const left = a.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const right = b.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return `${left} – ${right}`;
  })();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: C.ink, margin: 0 }}>Calendar</h1>
          <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, margin: "4px 0 0" }}>Event days and cues across all runsheets, laid out by date.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", background: C.paperDim, borderRadius: 10, padding: 3 }}>
            <button onClick={() => setView("month")} style={toggleBtn(view === "month")}>Month</button>
            <button onClick={() => setView("week")} style={toggleBtn(view === "week")}>Week</button>
          </div>
          {showTodayBtn && <button onClick={goToday} style={secondaryBtn}>Today</button>}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={goPrev} title={view === "week" ? "Previous week" : "Previous month"} style={{ ...secondaryBtn, padding: "8px 10px" }}><ChevronLeft size={16} /></button>
            <button onClick={goNext} title={view === "week" ? "Next week" : "Next month"} style={{ ...secondaryBtn, padding: "8px 10px" }}><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, color: C.ink, margin: 0 }}>
          {view === "week" ? weekLabel : `${CAL_MONTHS[month]} ${year}`}
        </h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: C.line, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
        {CAL_WEEKDAYS.map((wd) => (
          <div key={wd} style={{
            background: C.paperDim, padding: "9px 8px", textAlign: "center",
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
            color: C.slate, textTransform: "uppercase", letterSpacing: 0.5,
          }}>{wd}</div>
        ))}
        {view === "week"
          ? weekDays.map((d) => dayCell(d, { maxPills: 6, minHeight: 220, dim: false }))
          : cells.map((d) => dayCell(d, { maxPills: 3, minHeight: 104, dim: d.getMonth() !== month }))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   RUNSHEETS LIST
--------------------------------------------------------------- */
function RunsheetsList({ runsheets, onOpen, onNew, onDelete, onReorder }) {
  const [runsheetDragIndex, setRunsheetDragIndex] = useState(null);
  const [runsheetDragOverIndex, setRunsheetDragOverIndex] = useState(null);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: C.ink, margin: 0 }}>Showcase runsheets</h1>
          <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, margin: "4px 0 0" }}>One runsheet per mall showcase, counting down week by week to event day.</p>
        </div>
        <button onClick={onNew} style={primaryBtn}><Plus size={15} /> New runsheet</button>
      </div>

      {runsheets.length === 0 && (
        <div style={emptyState}>
          <Calendar size={20} color={C.spotlight} />
          <p style={{ margin: "10px 0 2px", fontFamily: "'Fraunces', serif", fontSize: 17, color: C.ink }}>No runsheets yet</p>
          <p style={{ margin: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate }}>Create one to start counting down to your next showcase.</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {runsheets.map((rs, i) => {
          const done = rs.tasks.filter((t) => t.status === "delivered").length;
          const pct = Math.round((done / rs.tasks.length) * 100);
          const missed = rs.tasks.filter((t) => cueStatus(t) === "missed").length;
          const isDropTarget = runsheetDragOverIndex === i && runsheetDragIndex !== null && runsheetDragIndex !== i;
          return (
            <div
              key={rs.id}
              onDragOver={(e) => { e.preventDefault(); setRunsheetDragOverIndex(i); }}
              onDrop={(e) => { e.preventDefault(); onReorder(runsheetDragIndex, i); setRunsheetDragIndex(null); setRunsheetDragOverIndex(null); }}
              style={{
                background: isDropTarget ? "rgba(79,143,107,0.16)" : C.card,
                border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, position: "relative",
                opacity: runsheetDragIndex === i ? 0.5 : 1,
              }}
            >
              <button onClick={() => onDelete(rs.id)} title="Delete runsheet" style={{
                position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: C.slateLight,
              }}><Trash2 size={15} /></button>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span
                  draggable
                  onDragStart={() => setRunsheetDragIndex(i)}
                  onDragEnd={() => { setRunsheetDragIndex(null); setRunsheetDragOverIndex(null); }}
                  title="Drag to reorder"
                  style={{ display: "flex", alignItems: "center", flexShrink: 0, color: C.slateLight, cursor: "grab" }}
                >
                  <GripVertical size={14} />
                </span>
              </div>
              <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: C.ink, margin: "0 0 4px" }}>{rs.branchName}</h3>
              <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.slate, margin: "0 0 14px" }}>Event day: {fmtDate(rs.eventDate)}</p>
              <div style={{ height: 6, background: C.paperDim, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: C.sage, borderRadius: 4 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate }}>{done}/{rs.tasks.length} cues delivered</span>
                {missed > 0 && <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: C.curtainDeep }}>{missed} missed</span>}
              </div>
              <button onClick={() => onOpen(rs.id)} style={{ ...secondaryBtn, width: "100%", marginTop: 14, justifyContent: "center" }}>
                Open runsheet <ChevronRight size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   DEPARTMENT WORKFLOWS  (the "Runsheets" tab for non-Marketing depts)
   Showcase runsheets are Marketing-only. Every other department instead
   sees a Process-Street-style progress view over ITS OWN flowchart
   templates: each card shows how many task-nodes are done and expands to
   a read-only step checklist. Read-only — completion still happens in the
   flowchart / My Work; this only reflects it.
--------------------------------------------------------------- */
function DeptWorkflows({ templates, onOpenTemplate }) {
  const [expanded, setExpanded] = useState({}); // { [templateId]: true }
  const today = todayStr();
  const flows = templates.map((t) => {
    const tasks = (t.flowchart?.nodes || [])
      .filter(fcIsTask)
      .slice()
      .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
    const total = tasks.length;
    const done = tasks.filter(fcNodeDone).length;
    const overdue = tasks.filter((n) => !fcNodeDone(n) && n.due && n.due < today).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { t, tasks, total, done, overdue, pct };
  });

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: C.ink, margin: 0 }}>Workflow progress</h1>
        <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, margin: "4px 0 0" }}>Every workflow your department has built, and how far each has been completed.</p>
      </div>

      {flows.length === 0 && (
        <div style={emptyState}>
          <ListChecks size={20} color={C.spotlight} />
          <p style={{ margin: "10px 0 2px", fontFamily: "'Fraunces', serif", fontSize: 17, color: C.ink }}>No workflows yet</p>
          <p style={{ margin: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate }}>Build one in the Library — it'll show up here with live progress.</p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {flows.map(({ t, tasks, total, done, overdue, pct }) => {
          const open = !!expanded[t.id];
          return (
            <div key={t.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: C.ink, margin: "0 0 8px" }}>{t.name || "Untitled workflow"}</h3>
                  <div style={{ height: 6, background: C.paperDim, borderRadius: 4, overflow: "hidden", marginBottom: 8, maxWidth: 420 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? C.sageDeep : C.sage, borderRadius: 4 }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.slate }}>
                      {total === 0 ? "No steps yet" : `${done}/${total} steps done · ${pct}%`}
                    </span>
                    {overdue > 0 && (
                      <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: "#B23A2E" }}>{overdue} overdue</span>
                    )}
                  </div>
                </div>
                <button onClick={() => onOpenTemplate(t.id)} style={{ ...secondaryBtn, flexShrink: 0 }}>
                  Open <ChevronRight size={14} />
                </button>
              </div>

              {total > 0 && (
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [t.id]: !e[t.id] }))}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 12, background: "none", border: "none", cursor: "pointer", fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: C.slate, padding: 0 }}
                >
                  <ChevronDown size={14} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                  {open ? "Hide steps" : "Show steps"}
                </button>
              )}

              {open && total > 0 && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
                  {tasks.map((n) => {
                    const nd = fcNodeDone(n);
                    const due = fcDueMeta(n.due, nd);
                    const who = n.assignee?.name || n.assignee?.email;
                    return (
                      <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {nd ? <CheckCircle2 size={16} color={C.sageDeep} style={{ flexShrink: 0 }} /> : <Circle size={16} color={C.slateLight} style={{ flexShrink: 0 }} />}
                        <span style={{ flex: 1, minWidth: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: nd ? C.slateLight : C.ink, textDecoration: nd ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.label || "Untitled step"}</span>
                        {who && <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.slateLight, flexShrink: 0 }}>{who}</span>}
                        <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 600, color: due.color, background: due.bg, padding: "2px 8px", borderRadius: 999, flexShrink: 0 }}>{due.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   CUE MAP (flow diagram)
--------------------------------------------------------------- */
function CueMap({ tasks }) {
  const weeks = useMemo(() => [...new Set(tasks.map((t) => t.week))].sort((a, b) => a - b), [tasks]);
  const colW = 208, nodeW = 178, nodeH = 72, rowH = 96, topPad = 50, leftPad = 16;

  const byWeek = weeks.map((w) => tasks.filter((t) => t.week === w));
  const maxRows = Math.max(...byWeek.map((arr) => arr.length));
  const pos = {};
  byWeek.forEach((arr, ci) => {
    arr.forEach((t, ri) => {
      pos[t.id] = { x: leftPad + ci * colW, y: topPad + ri * rowH, cx: leftPad + ci * colW + nodeW / 2, cy: topPad + ri * rowH + nodeH / 2 };
    });
  });

  const width = leftPad * 2 + weeks.length * colW;
  const height = topPad + maxRows * rowH + 16;

  return (
    <div style={{ overflowX: "auto", background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: 8 }}>
      <div style={{ position: "relative", width, height }}>
        {weeks.map((w, i) => (
          <div key={w} style={{
            position: "absolute", left: leftPad + i * colW, top: 10, width: nodeW,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 500,
            color: C.slate, textAlign: "left", letterSpacing: 0.5,
          }}>
            {weekLabel(w).toUpperCase()}
          </div>
        ))}
        <svg width={width} height={height} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
          {tasks.map((t) =>
            t.dependsOn.filter((d) => pos[d]).map((d) => {
              const a = pos[d], b = pos[t.id];
              const x1 = a.x + nodeW, y1 = a.cy, x2 = b.x, y2 = b.cy;
              const mx = (x1 + x2) / 2;
              return (
                <path key={d + "-" + t.id} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                  stroke={C.slateLight} strokeWidth={1.5} fill="none" strokeDasharray="4 3" />
              );
            })
          )}
        </svg>
        {tasks.map((t) => {
          const p = pos[t.id];
          const st = cueStatus(t);
          const meta = STATUS_META[st];
          const border = st === "missed" ? C.curtain : st === "delivered" ? C.sage : st === "on-deck" ? C.spotlight : C.line;
          const isInactive = t.active === false;
          return (
            <div key={t.id} style={{
              position: "absolute", left: p.x, top: p.y, width: nodeW, minHeight: nodeH,
              background: C.card, border: `1.5px ${isInactive ? "dashed" : "solid"} ${isInactive ? C.slateLight : border}`, borderRadius: 10, padding: "9px 11px",
              boxShadow: "0 1px 2px rgba(28,27,42,0.06)", opacity: isInactive ? 0.4 : 1,
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%", background: isInactive ? C.slateLight : border, position: "absolute", top: 9, right: 9,
              }} />
              <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 500, color: C.ink, lineHeight: 1.3, paddingRight: 14 }}>
                {t.title}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.slate, marginTop: 6 }}>
                {isInactive ? "Hidden by condition" : t.assignee}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   CUE LIST (checklist)
--------------------------------------------------------------- */
const activeFieldInput = {
  fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.ink, background: C.card,
  border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", width: "100%",
  maxWidth: 360, boxSizing: "border-box",
};

/* ---------------------------------------------------------------
   EMAIL STEP CARD
--------------------------------------------------------------- */
const EMAIL_FIELD_LABELS = ["To", "CC", "Subject", "Body"];

// Returns a step's email fields in canonical To/CC/Subject/Body order when it's
// an "email step": every field it has is one of those recognised labels, and it
// includes a Body plus at least one other. Returns null for any other step, so
// callers can fall back to the normal field rendering.
function getEmailFields(fields) {
  const list = fields || [];
  if (list.length === 0) return null;
  if (list.some((f) => !EMAIL_FIELD_LABELS.includes(f.label))) return null;
  const byLabel = {};
  list.forEach((f) => { byLabel[f.label] = f; });
  if (!byLabel["Body"]) return null;
  const present = EMAIL_FIELD_LABELS.filter((l) => byLabel[l]);
  if (present.length < 2) return null;
  return present.map((l) => byLabel[l]);
}

const EMAIL_TINT = "#FBEDEF";
const EMAIL_TINT_HEAD = "#F5DCE0";
const EMAIL_ROW_LINE = "rgba(178,58,72,0.14)";

const emailRowLabel = {
  width: 62, flexShrink: 0, fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11, fontWeight: 600, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4,
};

function emailInputStyle(disabled) {
  return {
    flex: 1, minWidth: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 13,
    color: disabled ? C.slate : C.ink, background: disabled ? "rgba(255,255,255,0.55)" : C.card,
    border: `1px solid ${C.line}`, borderRadius: 7, padding: "7px 9px",
    boxSizing: "border-box", cursor: disabled ? "not-allowed" : "text",
  };
}

const EMAIL_PLACEHOLDERS = {
  To: "recipient@example.com", CC: "cc@example.com",
  Subject: "Email subject", Body: "Write the email body...",
};

// Renders To/CC/Subject/Body as an email card. In preview mode (template editor)
// the inputs are disabled placeholders; otherwise they're bound to the task's
// values through onFieldChange(fieldId, value).
function EmailCard({ fields, values, onFieldChange, preview }) {
  return (
    <div style={{
      background: EMAIL_TINT, border: `1px solid ${C.line}`, borderRadius: 12,
      overflow: "hidden", maxWidth: 480,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 7, padding: "8px 14px",
        background: EMAIL_TINT_HEAD, borderBottom: `1px solid ${C.line}`,
      }}>
        <Mail size={14} color={C.curtainDeep} />
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
          color: C.curtainDeep, textTransform: "uppercase", letterSpacing: 0.5,
        }}>Email</span>
      </div>
      <div style={{ padding: "2px 14px 10px" }}>
        {fields.map((f, idx) => {
          const isBody = f.label === "Body";
          const value = values ? (values[f.id] ?? "") : "";
          return (
            <div key={f.id} style={{
              display: "flex", alignItems: isBody ? "flex-start" : "center", gap: 12,
              padding: "9px 0",
              borderBottom: idx === fields.length - 1 ? "none" : `1px solid ${EMAIL_ROW_LINE}`,
            }}>
              <span style={{ ...emailRowLabel, paddingTop: isBody ? 8 : 0 }}>{f.label}</span>
              {isBody ? (
                <textarea
                  disabled={preview}
                  value={preview ? "" : value}
                  onChange={preview ? undefined : (e) => onFieldChange(f.id, e.target.value)}
                  rows={5}
                  placeholder={EMAIL_PLACEHOLDERS.Body}
                  style={{ ...emailInputStyle(preview), resize: "vertical", overflow: "auto", minHeight: 92, maxHeight: 220 }}
                />
              ) : (
                <input
                  type="text"
                  disabled={preview}
                  value={preview ? "" : value}
                  onChange={preview ? undefined : (e) => onFieldChange(f.id, e.target.value)}
                  placeholder={EMAIL_PLACEHOLDERS[f.label] ?? ""}
                  style={emailInputStyle(preview)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskComments({ comments, currentUser, onAddComment }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const list = comments || [];
  const post = () => {
    const text = draft.trim();
    if (!text) return;
    onAddComment(text);
    setDraft("");
  };
  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        background: "none", border: "none", padding: 0, cursor: "pointer",
        fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 500, color: C.slate,
      }}>💬 Comments ({list.length})</button>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, maxWidth: 480 }}>
          {list.map((c) => (
            <div key={c.id} style={{ background: C.paperDim, borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: C.ink }}>{c.author}</span>
                <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, color: C.slate }}>{new Date(c.timestamp).toLocaleString()}</span>
              </div>
              <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.inkSoft, whiteSpace: "pre-wrap" }}>{c.text}</div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") post(); }}
              placeholder={`Comment as ${currentUser}…`}
              style={{ ...activeFieldInput, maxWidth: "none", flex: 1 }}
            />
            <button onClick={post} style={{
              background: C.ink, color: C.paper, border: "none", borderRadius: 8, padding: "8px 14px",
              fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
            }}>Post</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CueList({ tasks, template, currentUser, activeStepId, onToggle, onReassign, onFieldChange, onApprove, onReject, onRejectionReason, onAddComment, onReorderTasks, onToggleSubtask }) {
  const weeks = [...new Set(tasks.map((t) => t.week))].sort((a, b) => a - b);
  // Only the selected step is shown; keep the label for its week so the user
  // still sees where it sits in the timeline.
  const activeTask = tasks.find((t) => t.id === activeStepId);
  // Enrich each task with its step's field definitions so resolveVariables can
  // match {{field_label}} tokens against the values answered across all tasks.
  const varTasks = tasks.map((t) => ({
    ...t,
    fields: template?.steps.find((s) => s.id === t.stepId)?.fields || [],
  }));
  const [taskDragIndex, setTaskDragIndex] = useState(null);
  const [taskDragOverIndex, setTaskDragOverIndex] = useState(null);
  const [taskDragWeek, setTaskDragWeek] = useState(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {weeks.filter((w) => activeTask && w === activeTask.week).map((w) => (
        <div key={w}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: C.spotlightDeep,
              background: "#FBF0DC", padding: "3px 9px", borderRadius: 6,
            }}>{weekLabel(w)}</span>
            <div style={{ flex: 1, height: 1, background: C.line }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tasks.filter((t) => t.week === w).map((t, i) => {
              if (t.id !== activeStepId) return null;
              const st = cueStatus(t);
              const done = t.status === "delivered";
              const isInactive = t.active === false;
              const step = template?.steps.find((s) => s.id === t.stepId);
              const fields = step?.fields || [];
              const isApproval = (step?.stepType ?? t.stepType) === "approval";
              // Block delivery until every subtask is done, unless the step opts out.
              const subtasksBlocked = (t.subtasks?.length ?? 0) > 0
                && t.subtasks.some((s) => !s.done)
                && !step?.optionalCompletion;
              const approved = t.status === "approved";
              const rejected = t.status === "rejected";
              const blockedByApproval = isInactive && (t.dependsOn || []).some((depId) => {
                const dep = tasks.find((x) => x.id === depId);
                if (!dep) return false;
                const depStep = template?.steps.find((s) => s.id === dep.stepId);
                return ((depStep?.stepType ?? dep.stepType) === "approval") && dep.status !== "approved";
              });
              const inactiveLabel = blockedByApproval ? "Waiting for approval" : "Hidden by condition";
              const isDropTarget = taskDragOverIndex === i && taskDragWeek === w && taskDragIndex !== null && taskDragIndex !== i;
              const isDragging = taskDragIndex === i && taskDragWeek === w;
              return (
                <div
                  key={t.id}
                  onDragOver={(e) => { if (taskDragWeek !== w) return; e.preventDefault(); setTaskDragOverIndex(i); }}
                  onDrop={(e) => { if (taskDragWeek !== w) return; e.preventDefault(); onReorderTasks(w, taskDragIndex, i); setTaskDragIndex(null); setTaskDragOverIndex(null); setTaskDragWeek(null); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    background: isDropTarget ? "rgba(79,143,107,0.16)" : C.card,
                    border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", position: "relative",
                    opacity: isDragging ? 0.5 : isInactive ? 0.4 : 1,
                  }}
                >
                  <span
                    draggable
                    onDragStart={() => { setTaskDragIndex(i); setTaskDragWeek(w); }}
                    onDragEnd={() => { setTaskDragIndex(null); setTaskDragOverIndex(null); setTaskDragWeek(null); }}
                    title="Drag to reorder"
                    style={{ display: "flex", alignItems: "center", flexShrink: 0, color: C.slateLight, cursor: "grab" }}
                  >
                    <GripVertical size={14} />
                  </span>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", background: C.paperDim, border: `1px solid ${C.line}`,
                    position: "absolute", left: 12, top: 12,
                  }} />
                  {isApproval ? (
                    <div style={{ width: 20, marginLeft: 8, flexShrink: 0 }} />
                  ) : (
                    <button onClick={() => onToggle(t.id)} disabled={isInactive || subtasksBlocked} style={{
                      background: "none", border: "none", cursor: (isInactive || subtasksBlocked) ? "not-allowed" : "pointer", padding: 4, marginLeft: 8,
                      color: done ? C.sage : C.slateLight, opacity: (isInactive || subtasksBlocked) ? 0.5 : 1,
                    }} title={isInactive ? inactiveLabel : subtasksBlocked ? "Complete all subtasks first" : done ? "Mark as standing by" : "Mark as delivered"}>
                      {done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                    </button>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'Work Sans', sans-serif", fontSize: 14, fontWeight: 500,
                      color: done ? C.slate : C.ink, textDecoration: done ? "line-through" : "none",
                    }}>{renderResolvedText(resolveFieldVariables(t.title, varTasks))}</div>
                    {step?.optionalCompletion && (
                      <div style={{
                        fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontStyle: "italic",
                        color: C.slate, marginTop: 3,
                      }}>Can be completed independently of subtasks.</div>
                    )}
                    {step?.description && step.description.trim() !== "" && (
                      <DescriptionDisplay
                        text={step.description}
                        tasks={varTasks}
                        style={{
                          fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate,
                          marginTop: 3, whiteSpace: "pre-wrap",
                        }}
                      />
                    )}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                      <DeptBadge dept={t.dept} />
                      <span
                        title={t.week === 0 ? "Due on start day" : t.week > 0 ? `Due ${t.week * 7} days after start` : `Due ${Math.abs(t.week) * 7} days before start`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, cursor: "default" }}
                      >
                        <Calendar size={12} color={C.slateLight} />
                        Due {fmtDate(t.dueDate)}
                      </span>
                    </div>
                    {fields.length > 0 && (() => {
                      const emailFields = getEmailFields(fields);
                      if (emailFields) {
                        return (
                          <div style={{ marginTop: 8 }}>
                            <EmailCard
                              fields={emailFields}
                              values={t.values}
                              onFieldChange={(fieldId, val) => onFieldChange(t.id, fieldId, val)}
                            />
                          </div>
                        );
                      }
                      return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                        {fields.map((field) => {
                          const value = t.values ? t.values[field.id] : undefined;
                          if (field.type === "checkbox") {
                            return (
                              <label key={field.id} style={{
                                display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                                fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.inkSoft,
                              }}>
                                <input
                                  type="checkbox"
                                  checked={value ?? false}
                                  onChange={(e) => onFieldChange(t.id, field.id, e.target.checked)}
                                  style={{ accentColor: C.spotlightDeep, cursor: "pointer" }}
                                />
                                {field.label}
                              </label>
                            );
                          }
                          return (
                            <div key={field.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.inkSoft }}>{field.label}</span>
                              {field.type === "long_text" ? (
                                <textarea
                                  value={value ?? ""}
                                  rows={3}
                                  onChange={(e) => onFieldChange(t.id, field.id, e.target.value)}
                                  style={{ ...activeFieldInput, resize: "none" }}
                                />
                              ) : field.type === "dropdown" ? (
                                <select value={value ?? ""} onChange={(e) => onFieldChange(t.id, field.id, e.target.value)} style={activeFieldInput}>
                                  <option value="">Select an option</option>
                                  {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              ) : field.type === "assignee" ? (
                                <select value={value ?? ""} onChange={(e) => onFieldChange(t.id, field.id, e.target.value)} style={activeFieldInput}>
                                  <option value="">Unassigned</option>
                                  {ASSIGNEE_POOL.map((a) => <option key={a} value={a}>{a}</option>)}
                                </select>
                              ) : field.type === "date" ? (
                                <input type="date" value={value ?? ""} onChange={(e) => onFieldChange(t.id, field.id, e.target.value)} style={activeFieldInput} />
                              ) : field.type === "number" ? (
                                <input type="number" value={value ?? ""} onChange={(e) => onFieldChange(t.id, field.id, e.target.value)} style={activeFieldInput} />
                              ) : field.type === "file" ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 360 }}>
                                  <label style={{
                                    display: "inline-flex", alignItems: "center", gap: 7, alignSelf: "flex-start", cursor: "pointer",
                                    fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 500, color: C.spotlightDeep,
                                    background: "#FBF0DC", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px",
                                  }}>
                                    <Paperclip size={14} />
                                    {value ? "Replace file" : "Upload file"}
                                    <input
                                      type="file"
                                      onChange={(e) => onFieldChange(t.id, field.id, e.target.files?.[0]?.name ?? "")}
                                      style={{ display: "none" }}
                                    />
                                  </label>
                                  {value && (
                                    <span style={{
                                      display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start",
                                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 500, color: C.sageDeep,
                                      background: "#E7F1EB", borderRadius: 6, padding: "3px 9px",
                                    }}>
                                      <Paperclip size={11} />
                                      {value}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <input type="text" value={value ?? ""} onChange={(e) => onFieldChange(t.id, field.id, e.target.value)} style={activeFieldInput} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      );
                    })()}
                    {(t.subtasks?.length ?? 0) > 0 && (() => {
                      const subs = t.subtasks;
                      const doneCount = subs.filter((s) => s.done).length;
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <ListTodo size={13} color={C.slate} />
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: C.slate }}>{doneCount}/{subs.length}</span>
                            <div style={{ flex: 1, height: 5, background: C.paperDim, borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${(doneCount / subs.length) * 100}%`, height: "100%", background: C.sage, borderRadius: 3 }} />
                            </div>
                          </div>
                          {subs.map((s) => (
                            <label key={s.id} style={{
                              display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                              fontFamily: "'Work Sans', sans-serif", fontSize: 12,
                              color: s.done ? C.slate : C.inkSoft,
                            }}>
                              <input
                                type="checkbox"
                                checked={!!s.done}
                                onChange={() => onToggleSubtask(t.id, s.id)}
                                style={{ accentColor: C.sage, cursor: "pointer" }}
                              />
                              <span style={{ textDecoration: s.done ? "line-through" : "none" }}>{s.title}</span>
                            </label>
                          ))}
                        </div>
                      );
                    })()}
                    <TaskComments
                      comments={t.comments}
                      currentUser={currentUser}
                      onAddComment={(text) => onAddComment(t.id, text)}
                    />
                  </div>
                  <select value={t.assignee} onChange={(e) => onReassign(t.id, e.target.value)} style={{ ...selectStyle, minWidth: 110 }}>
                    {ASSIGNEE_POOL.map((a) => <option key={a}>{a}</option>)}
                  </select>
                  {isInactive ? (
                    <span style={{
                      fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 500,
                      color: C.slate, whiteSpace: "nowrap",
                    }}>{inactiveLabel}</span>
                  ) : isApproval ? (
                    approved ? (
                      <StatusPill status="approved" />
                    ) : rejected ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                        <StatusPill status="rejected" />
                        <input
                          type="text"
                          value={t.rejectionReason ?? ""}
                          onChange={(e) => onRejectionReason(t.id, e.target.value)}
                          placeholder="Reason for rejection"
                          style={{ ...selectStyle, minWidth: 180 }}
                        />
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => onApprove(t.id)} style={{
                          display: "inline-flex", alignItems: "center", gap: 5, background: C.sage,
                          color: C.paper, border: "none", borderRadius: 8, padding: "6px 12px",
                          fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                        }}>Approve</button>
                        <button onClick={() => onReject(t.id)} style={{
                          display: "inline-flex", alignItems: "center", gap: 5, background: C.curtain,
                          color: C.paper, border: "none", borderRadius: 8, padding: "6px 12px",
                          fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                        }}>Reject</button>
                      </div>
                    )
                  ) : (
                    <StatusPill status={st} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------
   RUNSHEET DETAIL
--------------------------------------------------------------- */
function RunsheetDetail({ runsheet, template, currentUser, onBack, onToggle, onReassign, onFieldChange, onApprove, onReject, onRejectionReason, onAddComment, onReorderTasks, onToggleSubtask, onUpdateStep, onUpdateTask, onSaveDrawings, onToggleWeekComplete }) {
  const [view, setView] = useState("list");
  const [activeStepId, setActiveStepId] = useState(null);

  // List tasks in the same order the cue list renders them: by week ascending,
  // preserving each week's task order. The panel numbers follow this order.
  const orderedTasks = useMemo(() => {
    const weeks = [...new Set(runsheet.tasks.map((t) => t.week))].sort((a, b) => a - b);
    return weeks.flatMap((w) => runsheet.tasks.filter((t) => t.week === w));
  }, [runsheet.tasks]);

  // Default to the first step when nothing has been picked yet.
  const currentStepId = activeStepId ?? orderedTasks[0]?.id;

  // Weeks in nav order, plus which ones the user has marked complete.
  const navWeeks = [...new Set(orderedTasks.map((t) => t.week))].sort((a, b) => a - b);
  const completedWeeks = runsheet.completedWeeks ?? [];
  const weekBtn = (bg, color) => ({
    fontFamily: "'Work Sans', sans-serif", fontSize: 10.5, fontWeight: 600,
    padding: "2px 7px", borderRadius: 6, border: "none", cursor: "pointer",
    background: bg, color, marginLeft: "auto", flexShrink: 0,
  });

  return (
    <div>
      <button onClick={onBack} style={{ ...secondaryBtn, marginBottom: 16 }}>&larr; All runsheets</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.slate, margin: 0, textTransform: "uppercase", letterSpacing: 0.5 }}>Showcase</p>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, color: C.ink, margin: "4px 0 0" }}>{runsheet.branchName}</h1>
          <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, margin: "4px 0 0" }}>Event day {fmtDate(runsheet.eventDate)}</p>
          {Object.keys(runsheet.variables ?? {}).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {Object.entries(runsheet.variables).map(([key, value]) => (
                <span key={key} style={{
                  display: "inline-flex", alignItems: "baseline", gap: 5,
                  background: "#FBF0DC", border: `1px solid ${C.line}`, borderRadius: 999,
                  padding: "3px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                }}>
                  <span style={{ color: C.spotlightDeep, fontWeight: 600 }}>{key}:</span>
                  <span style={{ color: C.inkSoft }}>{String(value) === "" ? "—" : String(value)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", background: C.paperDim, borderRadius: 10, padding: 3 }}>
          <button onClick={() => setView("list")} style={toggleBtn(view === "list")}><ListChecks size={15} /> Flowghan list</button>
          <button onClick={() => setView("map")} style={toggleBtn(view === "map")}><GitBranch size={15} /> Flowghan map</button>
          <button onClick={() => setView("board")} style={toggleBtn(view === "board")}><Grid size={15} /> Board</button>
          <button onClick={() => setView("flowchart")} style={toggleBtn(view === "flowchart")}><GitMerge size={15} /> Flowchart</button>
        </div>
      </div>
      {view === "list" ? (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <div style={{
            width: 220, flexShrink: 0, background: C.ink, borderRadius: 14, padding: 12,
            position: "sticky", top: 20, maxHeight: "calc(100vh - 40px)", overflowY: "auto",
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, fontWeight: 600,
              color: "rgba(250,247,240,0.5)", textTransform: "uppercase", letterSpacing: 0.5,
              padding: "4px 10px 10px",
            }}>Steps</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {navWeeks.map((w) => {
                const weekTasks = orderedTasks.filter((t) => t.week === w);
                const isComplete = completedWeeks.includes(w);
                const allDelivered = weekTasks.length > 0 && weekTasks.every((t) => t.status === "delivered");
                return (
                  <div key={w}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 10px 5px" }}>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, fontWeight: 600,
                        color: "rgba(250,247,240,0.5)", textTransform: "uppercase", letterSpacing: 0.5,
                        textDecoration: isComplete ? "underline" : "none",
                      }}>{weekLabel(w)}</span>
                      {isComplete && <CheckCircle2 size={12} color={C.sage} />}
                      {isComplete ? (
                        <button onClick={() => onToggleWeekComplete(w)} style={weekBtn("transparent", C.slate)}>Undo</button>
                      ) : allDelivered ? (
                        <button onClick={() => onToggleWeekComplete(w)} style={weekBtn(C.sage, C.paper)}>Complete</button>
                      ) : null}
                    </div>
                    {weekTasks.map((t) => {
                      const i = orderedTasks.indexOf(t);
                      const active = currentStepId === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setActiveStepId(t.id)}
                          title={t.title}
                          style={{
                            display: "flex", alignItems: "baseline", gap: 9, width: "100%", textAlign: "left",
                            padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                            background: active ? "rgba(232,166,61,0.14)" : "transparent",
                            color: active ? C.spotlight : "rgba(250,247,240,0.72)",
                            fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 500,
                            transition: "background 0.15s",
                          }}
                        >
                          <span style={{
                            fontFamily: "'JetBrains Mono', monospace", fontSize: 11, flexShrink: 0,
                            color: active ? C.spotlight : "rgba(250,247,240,0.45)",
                          }}>{i + 1}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{t.title}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CueList tasks={runsheet.tasks} template={template} currentUser={currentUser} activeStepId={currentStepId} onToggle={onToggle} onReassign={onReassign} onFieldChange={onFieldChange} onApprove={onApprove} onReject={onReject} onRejectionReason={onRejectionReason} onAddComment={onAddComment} onReorderTasks={onReorderTasks} onToggleSubtask={onToggleSubtask} />
          </div>
        </div>
      ) : view === "board" ? (
        <BoardView tasks={runsheet.tasks} />
      ) : view === "flowchart" ? (
        <FlowChart
          steps={template.steps}
          onUpdateStep={onUpdateStep}
          onUpdateTask={(stepId, patch) => {
            const task = runsheet.tasks.find((t) => t.stepId === stepId);
            if (task) onUpdateTask(task.id, patch);
          }}
          onSaveDrawings={onSaveDrawings}
        />
      ) : (
        <CueMap tasks={runsheet.tasks} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   BOARD VIEW
--------------------------------------------------------------- */
// Fixed 8-color palette for assignee tokens: teal, purple, orange, pink,
// blue, green, red, brown. Each unique assignee maps to one by sorted index.
const BOARD_PALETTE = ["#2A9D8F", "#7C4D9B", "#E67E22", "#E75A8B", "#3B82C4", "#4F8F6B", "#C0392B", "#8D6748"];

function boardInitials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name).trim().slice(0, 2).toUpperCase();
}

function BoardView({ tasks }) {
  // Number steps in the same week-ascending order as the nav panel.
  const weeks = [...new Set(tasks.map((t) => t.week))].sort((a, b) => a - b);
  const ordered = weeks.flatMap((w) => tasks.filter((t) => t.week === w));

  const COLS = 5;
  const rows = [];
  for (let i = 0; i < ordered.length; i += COLS) rows.push(ordered.slice(i, i + COLS));

  // Status tints mirror the pills used elsewhere; standing-by uses C.paperDim.
  const tint = (status) => {
    if (status === "missed") return "#FBE7E9";
    if (status === "on-deck") return "#FBF0DC";
    if (status === "delivered") return "#E7F1EB";
    return C.paperDim;
  };

  // Unique assignees, sorted, each mapped to a stable palette color.
  const assignees = [...new Set(tasks.map((t) => t.assignee).filter(Boolean))].sort();
  const colorFor = (a) => BOARD_PALETTE[assignees.indexOf(a) % BOARD_PALETTE.length];

  // Token position: the highest board-order cell where the assignee has a
  // delivered task; otherwise cell 0 (the first step).
  const tokensByCell = {};
  assignees.forEach((a) => {
    let cell = 0;
    ordered.forEach((t, i) => {
      if (t.assignee === a && t.status === "delivered") cell = i;
    });
    (tokensByCell[cell] = tokensByCell[cell] || []).push(a);
  });

  const renderToken = (a) => (
    <span key={a} title={a} style={{
      width: 28, height: 28, borderRadius: "50%", background: colorFor(a), color: "#FFFFFF",
      display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 600,
    }}>{boardInitials(a)}</span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 640, width: "100%" }}>
      {rows.map((row, r) => {
        // Snake layout: even rows left-to-right, odd rows right-to-left.
        const cells = r % 2 === 1 ? [...row].reverse() : row;
        return (
          <div key={r} style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            {cells.map((t) => {
              const idx = ordered.indexOf(t);
              const num = idx + 1;
              const st = cueStatus(t);
              const cellTokens = tokensByCell[idx] || [];
              return (
                <div key={t.id} style={{
                  background: tint(st), border: `1px solid ${C.line}`, borderRadius: 10,
                  padding: 8, minHeight: 96, display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: C.slate }}>{num}</span>
                  <span
                    title={t.title}
                    style={{
                      fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 500, color: C.ink,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >{t.title}</span>
                  {cellTokens.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: "auto" }}>
                      {cellTokens.map((a) => renderToken(a))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {assignees.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 4, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
          {assignees.map((a) => (
            <span key={a} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {renderToken(a)}
              <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.inkSoft }}>{a}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   KANBAN VIEW
--------------------------------------------------------------- */
// Same runsheet.tasks as every other view here — Kanban is just those tasks
// grouped by a chosen field and laid out in columns. Switching the group-by
// never touches the underlying tasks, only how they're bucketed for display.
const KANBAN_GROUP_OPTIONS = [
  { key: "status", label: "Status" },
  { key: "dept", label: "Department" },
  { key: "assignee", label: "Assignee" },
];
const KANBAN_STATUS_ORDER = ["missed", "on-deck", "standing-by", "delivered", "approved", "rejected"];

function KanbanView({ tasks }) {
  const [groupBy, setGroupBy] = useState("status");

  const groups = useMemo(() => {
    if (groupBy === "dept") {
      return groupTasksByField(tasks, (t) => t.dept || "No department");
    }
    if (groupBy === "assignee") {
      return groupTasksByField(tasks, (t) => t.assignee || "Unassigned");
    }
    return groupTasksByField(tasks, (t) => cueStatus(t), KANBAN_STATUS_ORDER);
  }, [tasks, groupBy]);

  return (
    <div>
      <div style={{ display: "inline-flex", background: C.paperDim, borderRadius: 10, padding: 3, marginBottom: 16 }}>
        {KANBAN_GROUP_OPTIONS.map((opt) => (
          <button key={opt.key} onClick={() => setGroupBy(opt.key)} style={toggleBtn(groupBy === opt.key)}>
            {opt.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
        {groups.map((group) => (
          <div key={group.key} style={{ flexShrink: 0, width: 260, background: C.paperDim, borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              {groupBy === "status" ? (
                <StatusPill status={group.key} />
              ) : (
                <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600, color: C.ink }}>{group.key}</span>
              )}
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.slate }}>{group.tasks.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {group.tasks.length === 0 && (
                <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slateLight, padding: "8px 0" }}>No tasks</div>
              )}
              {group.tasks.map((task) => (
                <div key={task.id} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10 }}>
                  <div title={task.title} style={{
                    fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 6,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}>{task.title}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: C.slate }}>
                    <span>{task.dept}</span>
                    <span>{fmtDate(task.dueDate)}</span>
                  </div>
                  {task.assignee && (
                    <div style={{ marginTop: 6, fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.slateLight }}>{task.assignee}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   FLOWCHART KANBAN  (builder-side)
--------------------------------------------------------------- */
// A board of the flowchart's own task-nodes — the same tasks the Editor lists,
// laid out in columns. It lives beside the Editor tab (and is unlocked by the
// same rule: the chart must be valid and have tasks first), so once the HOD has
// built the workflow they can read it either as a task list (Editor) or a board
// (Kanban). Grouping never changes the tasks, only how they're bucketed.
const FC_KANBAN_GROUPS = [
  { key: "assignee", label: "Assignee" },
  { key: "stage", label: "Stage" },
  { key: "due", label: "Due" },
  { key: "week", label: "Week" },
];
const FC_STAGE_ORDER = ["Ready", "Locked", "Off-branch", "Done"];
const FC_STAGE_STYLE = {
  Ready: { bg: "#FBF3E0", color: C.spotlightDeep },
  Locked: { bg: C.paperDim, color: C.slate },
  "Off-branch": { bg: "#EEF0F3", color: C.slateLight },
  Done: { bg: "#E8F3EC", color: C.sageDeep },
};
const FC_DUE_ORDER = ["Overdue", "This week", "Later", "No date"];
// Calendar-week helpers for the "Week" board. Everything is done in UTC so it lines
// up with todayStr()/n.due (both UTC date strings) — no off-by-a-day near midnight.
const WEEK_MS = 7 * 24 * 3600 * 1000;
// Monday (UTC midnight) of the week containing an ISO date string.
const fcWeekStart = (isoStr) => {
  const x = new Date(isoStr + "T00:00:00Z");
  const day = (x.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  x.setUTCDate(x.getUTCDate() - day);
  return x;
};
// "Aug 4 – Aug 10" for the week starting at the given Monday (UTC midnight).
const fcWeekLabel = (monday) => {
  const sun = new Date(monday.getTime() + 6 * 24 * 3600 * 1000);
  const opt = { month: "short", day: "numeric", timeZone: "UTC" };
  return `${monday.toLocaleDateString(undefined, opt)} – ${sun.toLocaleDateString(undefined, opt)}`;
};
// View-only reading aids (AppFlowy-style). Filter hides cards; sort orders them
// inside each column. Neither ever writes to a node — they only change what you see.
const FC_FILTERS = [
  { key: "all", label: "All tasks" },
  { key: "overdue", label: "Overdue" },
  { key: "week", label: "Due this week" },
  { key: "open", label: "Not done" },
  { key: "unassigned", label: "Unassigned" },
];
const FC_SORTS = [
  { key: "canvas", label: "Flowchart order" },
  { key: "due", label: "Due date" },
  { key: "title", label: "Title A–Z" },
  { key: "stage", label: "Stage" },
];

function FcKanban({ nodes, edges, onPatch, onPatchQuiet, onRecord, chosenEnd, showOffBranch }) {
  const [groupBy, setGroupBy] = useState("assignee");
  const [filterBy, setFilterBy] = useState("all");
  const [sortBy, setSortBy] = useState("canvas");
  const [collapsed, setCollapsed] = useState({}); // { [columnKey]: true } — folded columns
  const [dragId, setDragId] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  // A soft "that move isn't allowed" message (option a: refuse, don't fake).
  const [notice, setNotice] = useState(null);
  // When a card is dropped into a dated column, the HOD picks the real day here
  // instead of the system guessing: { nodeId, bucket, value }.
  const [pendingDue, setPendingDue] = useState(null);
  // Click a card to edit it in place (label / instructions / subtasks) without
  // leaving for the Editor tab. Holds the node id being edited.
  const [editId, setEditId] = useState(null);
  // Click a status badge to expand a small read-only panel under it (without
  // opening the edit popup): { nodeId, kind: "subtasks"|"proof"|"overdue" }.
  const [badgePop, setBadgePop] = useState(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  const tasks = useMemo(
    () => nodes.filter(fcIsTask).slice().sort((a, b) => (a.y - b.y) || (a.x - b.x)),
    [nodes]
  );
  const status = useMemo(() => fcActiveSet(nodes, edges), [nodes, edges]);
  const lockInfo = useMemo(() => fcLockInfo(tasks), [tasks]);

  const stageOf = (n) => {
    if (fcNodeDone(n)) return "Done";
    if (status[n.id] === "skipped" && !n.forceInclude) return "Off-branch";
    if (lockInfo[n.id]?.locked) return "Locked";
    return "Ready";
  };
  const weekAhead = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);
  const dueBucket = (n) => {
    if (!n.due) return "No date";
    if (n.due < todayStr() && !fcNodeDone(n)) return "Overdue";
    if (n.due <= weekAhead) return "This week";
    return "Later";
  };
  const thisMonday = useMemo(() => fcWeekStart(todayStr()), []);
  // One task → its calendar-week column. Overdue is pinned first, No date last;
  // real weeks sort by date. `weekStart` (the Monday's ISO date) is carried so a
  // drop into that column can seed the date-picker inside the right week.
  const weekBucket = (n) => {
    if (!n.due) return { key: "No date", sort: 8.64e15, weekStart: null };
    if (n.due < todayStr() && !fcNodeDone(n)) return { key: "Overdue", sort: -1, weekStart: null };
    const mon = fcWeekStart(n.due);
    let diff = Math.round((mon.getTime() - thisMonday.getTime()) / WEEK_MS);
    if (diff < 0) diff = 0; // a done task from a past week folds into This week
    if (diff === 0) return { key: "This week", sort: thisMonday.getTime(), weekStart: thisMonday.toISOString().slice(0, 10) };
    if (diff === 1) { const nm = new Date(thisMonday.getTime() + WEEK_MS); return { key: "Next week", sort: nm.getTime(), weekStart: nm.toISOString().slice(0, 10) }; }
    return { key: fcWeekLabel(mon), sort: mon.getTime(), weekStart: mon.toISOString().slice(0, 10) };
  };

  const assigneeKey = (n) => n.assignee?.name || n.assignee?.email || "Unassigned";

  // Filter (reading aid): hide cards that don't match. Never writes anything.
  const passesFilter = (n) => {
    // Once a flow is chosen, the board shows only its tasks — unless "Show other branches"
    // is on (carried from the Editor banner).
    if (chosenEnd && !showOffBranch && status[n.id] !== "active") return false;
    if (filterBy === "overdue") return dueBucket(n) === "Overdue";
    if (filterBy === "week") return dueBucket(n) === "This week";
    if (filterBy === "open") return stageOf(n) !== "Done";
    if (filterBy === "unassigned") return assigneeKey(n) === "Unassigned";
    return true;
  };
  const visibleTasks = useMemo(
    () => tasks.filter(passesFilter),
    [tasks, filterBy, status, lockInfo, weekAhead, chosenEnd, showOffBranch]
  );

  // Sort (reading aid): order cards inside each column. "Flowchart order" keeps the
  // canvas layout (tasks already come y-then-x sorted); the rest are stable re-sorts.
  const sortTasks = (arr) => {
    const a = arr.slice();
    if (sortBy === "due") a.sort((x, y) => (x.due || "9999-99").localeCompare(y.due || "9999-99"));
    else if (sortBy === "title") a.sort((x, y) => (x.label || "").localeCompare(y.label || ""));
    else if (sortBy === "stage") a.sort((x, y) => FC_STAGE_ORDER.indexOf(stageOf(x)) - FC_STAGE_ORDER.indexOf(stageOf(y)));
    return a;
  };

  const groups = useMemo(() => {
    let g;
    if (groupBy === "stage") g = groupTasksByField(visibleTasks, stageOf, FC_STAGE_ORDER);
    else if (groupBy === "due") g = groupTasksByField(visibleTasks, dueBucket, FC_DUE_ORDER);
    else if (groupBy === "week") {
      // Custom grouping: week columns must sort chronologically (not alphabetically),
      // and empty weeks are hidden — so we don't route this through groupTasksByField.
      const map = new Map();
      visibleTasks.forEach((n) => {
        const b = weekBucket(n);
        if (!map.has(b.key)) map.set(b.key, { tasks: [], sort: b.sort, weekStart: b.weekStart });
        map.get(b.key).tasks.push(n);
      });
      g = [...map.entries()]
        .sort((a, b) => a[1].sort - b[1].sort)
        .map(([key, v]) => ({ key, tasks: v.tasks, weekStart: v.weekStart }));
    }
    else {
      g = groupTasksByField(visibleTasks, assigneeKey);
      // Always offer an "Unassigned" column so a card can be dragged there to clear it,
      // even when everyone currently has a person.
      if (!g.some((col) => col.key === "Unassigned")) g.push({ key: "Unassigned", tasks: [] });
    }
    return g.map((col) => ({ ...col, tasks: sortTasks(col.tasks) }));
  }, [visibleTasks, groupBy, status, lockInfo, sortBy]);

  // All three boards are editable, but drag only ever writes fields the HOD legitimately
  // owns — assignment, routing, and dates. It never fabricates "Done": completion flows one
  // way (the assignee ticks it with proof in My Work), so a drop onto Done is refused, not faked.
  const canDrag = !!onPatch;
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const DUE_DEFAULT = { Overdue: () => addDays(-1), "This week": () => addDays(3), Later: () => addDays(14) };

  const dropAssignee = (node, key) => {
    if (assigneeKey(node) === key) return;
    if (key === "Unassigned") { onPatch(node.id, { assignee: { name: "", email: "" } }); return; }
    // Copy the whole identity (name + Gmail) from a card already in that column.
    const rep = tasks.find((t) => assigneeKey(t) === key);
    onPatch(node.id, { assignee: { name: rep?.assignee?.name || "", email: rep?.assignee?.email || "" } });
  };

  const dropStage = (node, key) => {
    const cur = stageOf(node);
    if (cur === key) return;
    if (key === "Done") { setNotice("Only the assignee marks a task done — with proof, in My Work. You can send one back, not mark it done."); return; }
    if (key === "Locked") { setNotice("Locks come from step rules — set when a step can start in the Editor, not by dragging."); return; }
    if (key === "Ready") {
      if (cur === "Off-branch") { onPatch(node.id, { forceInclude: true }); return; }   // "include this step anyway"
      if (cur === "Done") {                                                              // reopen / send back
        if ((node.subtasks || []).length > 0) { setNotice("This is done because every subtask is ticked — untick one in the Editor to reopen it."); return; }
        if (!window.confirm("Reopen this task? It goes back to the assignee to complete again — their tick and proof are cleared.")) return;
        onPatch(node.id, { done: false, completedAt: null });
        return;
      }
      setNotice("This step is blocked by a step rule — change when it can start in the Editor."); // from Locked
      return;
    }
    if (key === "Off-branch") {
      if (node.forceInclude) { onPatch(node.id, { forceInclude: false }); return; }      // undo a manual include
      setNotice("This step is on the active path — change the branch on its decision in the Editor to drop it.");
      return;
    }
  };

  const dropDue = (node, key) => {
    if (dueBucket(node) === key) return;
    if (key === "No date") { onPatch(node.id, { due: "" }); return; }
    // Don't guess a day — open a picker seeded inside the chosen range.
    setPendingDue({ nodeId: node.id, bucket: key, value: (DUE_DEFAULT[key] || (() => todayStr()))() });
  };

  const dropWeek = (node, key) => {
    if (weekBucket(node).key === key) return;
    if (key === "No date") { onPatch(node.id, { due: "" }); return; }
    // Seed the picker inside the target week — Monday of that week, but today for the
    // current week (its Monday may already be past) and yesterday for Overdue.
    let seed;
    if (key === "Overdue") seed = addDays(-1);
    else if (key === "This week") seed = todayStr();
    else { const grp = groups.find((gp) => gp.key === key); seed = grp?.weekStart || todayStr(); }
    setPendingDue({ nodeId: node.id, bucket: key, value: seed });
  };

  const handleDrop = (key) => {
    setDragOverKey(null);
    const node = tasks.find((t) => t.id === dragId);
    setDragId(null);
    if (!node || !onPatch) return;
    if (groupBy === "assignee") dropAssignee(node, key);
    else if (groupBy === "stage") dropStage(node, key);
    else if (groupBy === "due") dropDue(node, key);
    else if (groupBy === "week") dropWeek(node, key);
  };
  const commitDue = () => { if (pendingDue) onPatch(pendingDue.nodeId, { due: pendingDue.value }); setPendingDue(null); };

  // --- Open-a-card popup: edit HOD-owned fields (label / instructions / subtasks) inline. ---
  // Read the node live from props so edits reflect as you type. `quiet` writes without an undo
  // snapshot (record() fires once on focus, matching the Editor); discrete actions use onPatch.
  const editNode = editId ? nodes.find((n) => n.id === editId) : null;
  const quiet = onPatchQuiet || onPatch;
  const markUndo = onRecord || (() => {});
  const editSubs = editNode?.subtasks || [];
  const addCardSub = () => onPatch(editNode.id, { subtasks: [...editSubs, { id: `sub-${Date.now()}`, title: "", done: false }] });
  const renameCardSub = (subId, title) => quiet(editNode.id, { subtasks: editSubs.map((s) => (s.id === subId ? { ...s, title } : s)) });
  const removeCardSub = (subId) => onPatch(editNode.id, { subtasks: editSubs.filter((s) => s.id !== subId) });
  const popInput = { width: "100%", boxSizing: "border-box", fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.ink, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px" };

  const HINT = {
    assignee: "Drag a card into another column to reassign it.",
    stage: "Drag to route or reopen a step. “Done” is earned by the assignee’s proof — you can send a task back, not mark it done.",
    due: "Drag a card into a column to change its due date.",
    week: "Columns are calendar weeks — drag a card to reschedule it to another week.",
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", background: C.paperDim, borderRadius: 10, padding: 3 }}>
          {FC_KANBAN_GROUPS.map((opt) => (
            <button key={opt.key} onClick={() => setGroupBy(opt.key)} style={toggleBtn(groupBy === opt.key)}>
              {opt.label}
            </button>
          ))}
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate }}>
          <Filter size={13} color={C.slateLight} />
          <select value={filterBy} onChange={(e) => setFilterBy(e.target.value)} style={selectStyle}>
            {FC_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate }}>
          <ArrowUpDown size={13} color={C.slateLight} />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
            {FC_SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slateLight }}>
          {canDrag ? HINT[groupBy] : "Grouped for reading."}
        </span>
      </div>
      {notice && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#FBF3E0", border: "1px solid #EBD9A8", borderRadius: 9, padding: "9px 12px", marginBottom: 14, maxWidth: 640 }}>
          <Lock size={14} color={C.spotlightDeep} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ flex: 1, fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.inkSoft, lineHeight: 1.45 }}>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ flexShrink: 0, background: "transparent", border: "none", cursor: "pointer", color: C.slate, padding: 0, display: "flex" }}><X size={14} /></button>
        </div>
      )}
      {pendingDue && (
        <>
          <div onClick={() => setPendingDue(null)} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,0.28)", zIndex: 60 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 61, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, width: 300, boxShadow: "0 18px 48px rgba(20,18,15,0.22)" }}>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 600, color: C.ink, margin: "0 0 4px" }}>Set the due date</h3>
            <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.slate, margin: "0 0 14px", lineHeight: 1.5 }}>
              You dropped this into <b>{pendingDue.bucket}</b> — pick the exact day.
            </p>
            <input type="date" value={pendingDue.value} onChange={(e) => setPendingDue((p) => ({ ...p, value: e.target.value }))} style={{ width: "100%", boxSizing: "border-box", fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.ink, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setPendingDue(null)} style={secondaryBtn}>Cancel</button>
              <button onClick={commitDue} disabled={!pendingDue.value} style={{ ...primaryBtn, opacity: pendingDue.value ? 1 : 0.5 }}>Set date</button>
            </div>
          </div>
        </>
      )}
      {editNode && (
        <>
          <div onClick={() => setEditId(null)} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,0.28)", zIndex: 60 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 61, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, width: 460, maxWidth: "92vw", maxHeight: "86vh", overflowY: "auto", boxShadow: "0 18px 48px rgba(20,18,15,0.22)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
              <h3 style={{ flex: 1, fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: C.ink, margin: 0 }}>Edit task</h3>
              <button onClick={() => setEditId(null)} title="Close" style={{ flexShrink: 0, background: "transparent", border: "none", cursor: "pointer", color: C.slate, padding: 2, display: "flex" }}><X size={17} /></button>
            </div>
            <label style={{ display: "block", fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, marginBottom: 14 }}>Task title
              <input
                value={editNode.label || ""}
                onFocus={markUndo}
                onChange={(e) => quiet(editNode.id, { label: e.target.value })}
                placeholder="e.g. Confirm the venue"
                style={{ ...popInput, marginTop: 6 }}
              />
            </label>
            <label style={{ display: "block", fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, marginBottom: 16 }}>What to do (goes in the assignment email)
              <textarea
                value={editNode.instructions || ""}
                onFocus={markUndo}
                onChange={(e) => quiet(editNode.id, { instructions: e.target.value })}
                placeholder="Explain the task for the assignee…"
                rows={3}
                style={{ ...popInput, marginTop: 6, resize: "vertical", lineHeight: 1.45 }}
              />
            </label>
            <div style={{ borderTop: `1px dashed ${C.line}`, paddingTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ flex: 1, fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: C.ink }}>Subtasks</span>
                <button onClick={addCardSub} style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, cursor: "pointer", padding: "5px 10px", fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 500, color: C.spotlightDeep }}><Plus size={13} /> Subtask</button>
              </div>
              {editSubs.length === 0 && (
                <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slateLight, fontStyle: "italic", padding: "2px 0 4px" }}>No subtasks yet — the assignee ticks these off in My Work.</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {editSubs.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span title={s.done ? "Ticked by the assignee" : "Not done yet"} style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${s.done ? C.spotlightDeep : C.line}`, background: s.done ? C.spotlightDeep : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {s.done && <Check size={11} color="#fff" strokeWidth={3} />}
                    </span>
                    <input
                      value={s.title || ""}
                      onFocus={markUndo}
                      onChange={(e) => renameCardSub(s.id, e.target.value)}
                      placeholder="Describe the subtask…"
                      style={{ ...popInput, flex: 1, padding: "6px 9px", fontSize: 12.5, textDecoration: s.done ? "line-through" : "none", color: s.done ? C.slateLight : C.ink }}
                    />
                    <button onClick={() => removeCardSub(s.id)} title="Delete subtask" style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: 4, color: C.slateLight, display: "flex", alignItems: "center" }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, color: C.slateLight, marginTop: 10, fontStyle: "italic" }}>Ticking a subtask off is the assignee's job in My Work — you set them up here.</div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setEditId(null)} style={primaryBtn}>Done</button>
            </div>
          </div>
        </>
      )}
      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
        {groups.map((group) => {
          const isCol = !!collapsed[group.key];
          return (
          <div
            key={group.key}
            onDragOver={canDrag ? (e) => { e.preventDefault(); setDragOverKey(group.key); } : undefined}
            onDragLeave={canDrag ? () => setDragOverKey((k) => (k === group.key ? null : k)) : undefined}
            onDrop={canDrag ? () => handleDrop(group.key) : undefined}
            style={{
              flexShrink: 0, width: 260, borderRadius: 12, padding: 12,
              background: dragOverKey === group.key ? "#FBF3E0" : C.paperDim,
              border: `1px solid ${dragOverKey === group.key ? C.spotlight : "transparent"}`,
              transition: "background 0.12s, border-color 0.12s",
            }}
          >
            <div
              onClick={() => setCollapsed((c) => ({ ...c, [group.key]: !c[group.key] }))}
              title={isCol ? "Expand column" : "Collapse column"}
              style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", marginBottom: isCol ? 0 : 10, cursor: "pointer", userSelect: "none" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <ChevronDown size={14} color={C.slate} style={{ flexShrink: 0, transform: isCol ? "rotate(-90deg)" : "none", transition: "transform 0.15s" }} />
                {groupBy === "stage" ? (
                  <span style={{
                    fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600,
                    padding: "3px 10px", borderRadius: 999,
                    background: (FC_STAGE_STYLE[group.key] || {}).bg || C.paper,
                    color: (FC_STAGE_STYLE[group.key] || {}).color || C.ink,
                  }}>{group.key}</span>
                ) : (
                  <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.key}</span>
                )}
              </div>
              <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 600, color: C.slate, background: C.card, borderRadius: 999, padding: "1px 8px", flexShrink: 0, marginLeft: 8 }}>{group.tasks.length}</span>
            </div>
            {!isCol && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {group.tasks.length === 0 && (
                <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slateLight, padding: "8px 0" }}>No tasks</div>
              )}
              {group.tasks.map((n) => {
                const stage = stageOf(n);
                const st = FC_STAGE_STYLE[stage] || {};
                const who = n.assignee?.name || n.assignee?.email;
                // At-a-glance status badges, read-only. Each only shows when relevant so a
                // plain task stays clean: subtasks progress, whether any proof is attached,
                // and whether it's overdue (same rule as the Due board's "Overdue" bucket).
                const subs = n.subtasks || [];
                const subsDone = subs.filter((s) => s.done).length;
                const hasProof = !!n.proof || subs.some((s) => s.proof);
                const overdue = dueBucket(n) === "Overdue";
                // Days late for the overdue popover: due & today are UTC date strings,
                // so ms-diff / one-day gives a clean whole-day count.
                const daysLate = overdue && n.due
                  ? Math.round((Date.parse(todayStr()) - Date.parse(n.due)) / 86400000)
                  : 0;
                // All proofs to preview: the node-level one plus any subtask proofs.
                const proofs = [
                  ...(n.proof ? [{ ...n.proof, from: "Task" }] : []),
                  ...subs.filter((s) => s.proof).map((s) => ({ ...s.proof, from: s.title || "Subtask" })),
                ];
                const popOpen = badgePop && badgePop.nodeId === n.id ? badgePop.kind : null;
                const toggleBadge = (kind) => (e) => {
                  e.stopPropagation();
                  setBadgePop((p) => (p && p.nodeId === n.id && p.kind === kind ? null : { nodeId: n.id, kind }));
                };
                return (
                  <div
                    key={n.id}
                    draggable={canDrag}
                    onDragStart={canDrag ? (e) => { setDragId(n.id); e.dataTransfer.effectAllowed = "move"; } : undefined}
                    onDragEnd={canDrag ? () => { setDragId(null); setDragOverKey(null); } : undefined}
                    onClick={() => setEditId(n.id)}
                    title="Click to edit this task"
                    style={{
                      background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10,
                      cursor: canDrag ? "grab" : "pointer", opacity: dragId === n.id ? 0.4 : 1,
                    }}
                  >
                    <div title={n.label} style={{
                      fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 6,
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}>{n.label || "Untitled task"}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      {groupBy !== "stage" && (
                        <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: st.bg || C.paperDim, color: st.color || C.slate }}>{stage}</span>
                      )}
                      <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: C.slate }}>{n.due ? fmtDate(n.due) : "—"}</span>
                    </div>
                    {(subs.length > 0 || hasProof || overdue) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7 }}>
                        {subs.length > 0 && (
                          <span onClick={toggleBadge("subtasks")} title="Subtasks — click for details" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "'Work Sans', sans-serif", fontSize: 10.5, fontWeight: 600, color: popOpen === "subtasks" ? C.ink : subsDone === subs.length ? C.sageDeep : C.slate }}>
                            <ListTodo size={12} /> {subsDone}/{subs.length}
                          </span>
                        )}
                        {hasProof && (
                          <span onClick={toggleBadge("proof")} title="Proof — click to preview" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", color: popOpen === "proof" ? C.ink : C.sageDeep }}>
                            <Paperclip size={12} />
                          </span>
                        )}
                        {overdue && (
                          <span onClick={toggleBadge("overdue")} title="Overdue — click for details" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "'Work Sans', sans-serif", fontSize: 10.5, fontWeight: 600, color: "#B23A2E" }}>
                            <Clock size={12} /> Overdue
                          </span>
                        )}
                      </div>
                    )}
                    {popOpen && (
                      <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8, padding: "8px 10px", background: C.paperDim, border: `1px solid ${C.line}`, borderRadius: 8, cursor: "default" }}>
                        {popOpen === "overdue" && (
                          <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: "#B23A2E", fontWeight: 600 }}>
                            Late by {daysLate} {daysLate === 1 ? "day" : "days"}
                            <div style={{ fontWeight: 500, color: C.slate, marginTop: 2 }}>Due {fmtDate(n.due)}</div>
                          </div>
                        )}
                        {popOpen === "subtasks" && (
                          <>
                            <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 700, color: C.slate, marginBottom: 6 }}>
                              {subsDone} done · {subs.length - subsDone} pending
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {subs.map((s) => (
                                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Work Sans', sans-serif", fontSize: 11.5 }}>
                                  {s.done ? <CheckSquare size={13} color={C.sageDeep} style={{ flexShrink: 0 }} /> : <Square size={13} color={C.slateLight} style={{ flexShrink: 0 }} />}
                                  <span style={{ color: s.done ? C.slateLight : C.ink, textDecoration: s.done ? "line-through" : "none" }}>{s.title || "Untitled subtask"}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                        {popOpen === "proof" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {proofs.map((p, i) => (
                              <div key={i}>
                                <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 10.5, fontWeight: 700, color: C.slate, marginBottom: 4 }}>{p.from}</div>
                                {p.type?.startsWith("image/") ? (
                                  <a href={p.dataUrl} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                                    <img src={p.dataUrl} alt={p.name} style={{ maxWidth: "100%", maxHeight: 140, borderRadius: 6, border: `1px solid ${C.line}`, display: "block" }} />
                                  </a>
                                ) : (
                                  <a href={p.dataUrl} download={p.name} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.sageDeep, textDecoration: "none", fontWeight: 600 }}>
                                    <Paperclip size={12} /> {p.name || "Download file"}
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {who && (
                      <div style={{ marginTop: 6, fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.slateLight }}>{who}</div>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   NEW RUNSHEET
--------------------------------------------------------------- */
function NewRunsheet({ onCreate, onCancel, template }) {
  const [venue, setVenue] = useState("");
  const [eventDate, setEventDate] = useState(computeDueDate(todayStr(), 6));
  const variables = template?.variables ?? [];
  const [variableValues, setVariableValues] = useState(() => {
    const seed = {};
    variables.forEach((v) => { seed[v.key] = v.defaultValue ?? ""; });
    return seed;
  });

  return (
    <div style={{ maxWidth: 460 }}>
      <button onClick={onCancel} style={{ ...secondaryBtn, marginBottom: 16 }}>&larr; Cancel</button>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: C.ink, margin: "0 0 4px" }}>New showcase runsheet</h1>
      <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, margin: "0 0 22px" }}>
        Pick the venue and event day — every cue and its due date will be generated automatically, counting back six weeks.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }}>
        <label style={fieldLabel}>Venue
          <input
            type="text"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="e.g. Mid Valley Megamall"
            style={{ ...selectStyle, width: "100%", marginTop: 6 }}
          />
        </label>
        <label style={fieldLabel}>Event day
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={{ ...selectStyle, width: "100%", marginTop: 6 }} />
        </label>
        {variables.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4, borderTop: `1px solid ${C.line}` }}>
            <h4 style={{ ...sectionHeading, margin: "10px 0 0", display: "flex", alignItems: "center", gap: 7 }}>
              <Braces size={14} color={C.spotlightDeep} /> Variables
            </h4>
            {variables.map((v) => (
              <label key={v.id} style={fieldLabel}>{v.label}
                <input
                  type="text"
                  value={variableValues[v.key] ?? ""}
                  onChange={(e) => setVariableValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                  style={{ ...selectStyle, width: "100%", marginTop: 6 }}
                />
              </label>
            ))}
          </div>
        )}
        <button onClick={() => onCreate(venue, eventDate, variableValues)} style={{ ...primaryBtn, justifyContent: "center", marginTop: 4 }}>
          <Plus size={15} /> Create runsheet
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   CAST & CREW (directory)
--------------------------------------------------------------- */
/* ---------------------------------------------------------------
   LIBRARY
--------------------------------------------------------------- */
function Library({ templates, modules, onOpenTemplate, onNewTemplate, onReorder, onAddModule, onRenameTemplate, onDeleteTemplate, onDeleteModule, onDuplicateTemplate }) {
  const [libraryDragId, setLibraryDragId] = useState(null);
  const [libraryDragOverId, setLibraryDragOverId] = useState(null);
  const [openModules, setOpenModules] = useState({});
  const [addingModule, setAddingModule] = useState(false);
  const [newModuleName, setNewModuleName] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const startRename = (t) => { setRenamingId(t.id); setRenameValue(t.name); };
  const commitRename = () => {
    if (renamingId) { const v = renameValue.trim(); if (v) onRenameTemplate(renamingId, v); }
    setRenamingId(null);
  };

  // Templates saved before modules existed have no `module` — treat them as Marketing.
  const moduleOf = (t) => t.module || "Marketing";
  const isOpen = (m) => openModules[m] !== false; // default open
  const toggleModule = (m) => setOpenModules((o) => ({ ...o, [m]: o[m] === false ? true : false }));

  const submitModule = () => {
    onAddModule(newModuleName);
    setNewModuleName("");
    setAddingModule(false);
  };

  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: C.ink, margin: "0 0 4px" }}>Library</h1>
      <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, margin: "0 0 22px" }}>Reusable templates your team runs from, grouped by department.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {modules.map((mod) => {
          const open = isOpen(mod);
          const modTemplates = templates.filter((t) => moduleOf(t) === mod);
          return (
            <div key={mod} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                background: C.paperDim, borderBottom: open ? `1px solid ${C.line}` : "none",
              }}>
                <button onClick={() => toggleModule(mod)} style={{
                  display: "flex", alignItems: "center", gap: 9, flex: 1, background: "transparent",
                  border: "none", cursor: "pointer", padding: 0, textAlign: "left",
                }}>
                  <ChevronDown size={16} color={C.slate} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                  <Folder size={17} color={C.spotlightDeep} strokeWidth={2} />
                  <span style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, color: C.ink }}>{mod}</span>
                  <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slateLight }}>{modTemplates.length}</span>
                </button>
                <button onClick={() => onNewTemplate(mod)} style={{
                  display: "flex", alignItems: "center", gap: 6, background: "transparent",
                  border: `1px solid ${C.line}`, borderRadius: 8, cursor: "pointer", padding: "6px 11px",
                  fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 500, color: C.spotlightDeep,
                }}>
                  <Plus size={14} /> New template
                </button>
                <button
                  onClick={() => {
                    const msg = modTemplates.length
                      ? `Delete the folder "${mod}" and its ${modTemplates.length} template${modTemplates.length > 1 ? "s" : ""}? This can't be undone.`
                      : `Delete the empty folder "${mod}"?`;
                    if (window.confirm(msg)) onDeleteModule(mod);
                  }}
                  title={modTemplates.length ? "Delete folder (and its templates)" : "Delete folder"}
                  style={{
                    display: "flex", alignItems: "center", background: "transparent", border: "none",
                    cursor: "pointer", padding: "6px 7px", color: C.curtainDeep, flexShrink: 0,
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {open && modTemplates.length === 0 && (
                <div style={{
                  padding: "18px 16px", fontFamily: "'Work Sans', sans-serif", fontSize: 13,
                  color: C.slateLight, fontStyle: "italic",
                }}>
                  No templates yet — click “New template” to build one.
                </div>
              )}
              {open && modTemplates.map((t, i) => {
                const isDropTarget = libraryDragOverId === t.id && libraryDragId !== null && libraryDragId !== t.id;
                return (
                  <div
                    key={t.id}
                    onDragOver={(e) => { e.preventDefault(); setLibraryDragOverId(t.id); }}
                    onDrop={(e) => { e.preventDefault(); onReorder(libraryDragId, t.id); setLibraryDragId(null); setLibraryDragOverId(null); }}
                    style={{
                      display: "flex", alignItems: "center",
                      borderTop: i === 0 ? "none" : `1px solid ${C.line}`,
                      background: isDropTarget ? "rgba(79,143,107,0.16)" : "transparent",
                      opacity: libraryDragId === t.id ? 0.5 : 1,
                    }}
                  >
                    <span
                      draggable
                      onDragStart={() => setLibraryDragId(t.id)}
                      onDragEnd={() => { setLibraryDragId(null); setLibraryDragOverId(null); }}
                      title="Drag to reorder"
                      style={{
                        display: "flex", alignItems: "center", flexShrink: 0,
                        paddingLeft: 12, color: C.slateLight, cursor: "grab",
                      }}
                    >
                      <GripVertical size={15} />
                    </span>
                    {renamingId === t.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingId(null); }}
                        style={{ flex: 1, margin: "9px 8px 9px 11px", fontFamily: "'Work Sans', sans-serif", fontSize: 13.5, color: C.ink, background: C.paper, border: `1px solid ${C.spotlight}`, borderRadius: 7, padding: "6px 9px", outline: "none" }}
                      />
                    ) : (
                      <button onClick={() => onOpenTemplate(t.id)} style={{
                        display: "flex", alignItems: "center", gap: 11, flex: 1, background: "transparent",
                        border: "none", cursor: "pointer", padding: "13px 4px 13px 11px", textAlign: "left",
                      }}>
                        <BookOpen size={16} color={C.spotlightDeep} strokeWidth={2} />
                        <span style={{ flex: 1, fontFamily: "'Work Sans', sans-serif", fontSize: 13.5, color: C.ink }}>{String(i + 1).padStart(2, "0")} {t.name}</span>
                      </button>
                    )}
                    <button onClick={() => startRename(t)} title="Rename template" style={{
                      display: "flex", alignItems: "center", background: "transparent", border: "none",
                      cursor: "pointer", padding: "8px 7px", color: C.slate,
                    }}>
                      <Pencil size={15} />
                    </button>
                    {onDuplicateTemplate && (
                      <button onClick={() => onDuplicateTemplate(t.id)} title="Duplicate as a new workflow (for other flows/endings)" style={{
                        display: "flex", alignItems: "center", background: "transparent", border: "none",
                        cursor: "pointer", padding: "8px 7px", color: C.slate,
                      }}>
                        <Copy size={15} />
                      </button>
                    )}
                    <button
                      onClick={() => { if (window.confirm(`Delete "${t.name}"? This can't be undone.`)) onDeleteTemplate(t.id); }}
                      title="Delete template"
                      style={{ display: "flex", alignItems: "center", background: "transparent", border: "none", cursor: "pointer", padding: "8px 7px", color: C.curtainDeep }}
                    >
                      <Trash2 size={15} />
                    </button>
                    <button onClick={() => onOpenTemplate(t.id)} title="Open" style={{
                      display: "flex", alignItems: "center", background: "transparent", border: "none",
                      cursor: "pointer", padding: "8px 14px 8px 7px", color: C.slateLight,
                    }}>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   TEMPLATE EDITOR
--------------------------------------------------------------- */
const FIELD_TYPES = [
  { type: "text", label: "Text" },
  { type: "long_text", label: "Long text" },
  { type: "checkbox", label: "Checkbox" },
  { type: "dropdown", label: "Dropdown" },
  { type: "date", label: "Date" },
  { type: "number", label: "Number" },
  { type: "assignee", label: "Assignee" },
  { type: "file", label: "File upload" },
];

const disabledInput = {
  fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, background: C.paperDim,
  border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", width: "100%",
  maxWidth: 360, cursor: "not-allowed", boxSizing: "border-box",
};

function StepFieldPreview({ field }) {
  switch (field.type) {
    case "checkbox":
      return (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate }}>
          <input type="checkbox" disabled style={{ cursor: "not-allowed" }} />
          {field.label}
        </label>
      );
    case "long_text":
      return <textarea disabled placeholder="Long text will be typed here" rows={3} style={{ ...disabledInput, resize: "none" }} />;
    case "dropdown":
      return (
        <select disabled style={disabledInput}>
          <option>Select an option</option>
        </select>
      );
    case "date":
      return <input type="date" disabled style={disabledInput} />;
    case "number":
      return <input type="number" disabled placeholder="0" style={disabledInput} />;
    case "assignee":
      return (
        <select disabled style={disabledInput}>
          {ASSIGNEE_POOL.map((a) => <option key={a}>{a}</option>)}
        </select>
      );
    case "file":
      return (
        <button disabled style={{
          display: "inline-flex", alignItems: "center", gap: 8, cursor: "not-allowed",
          fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 500, color: "#fff",
          background: C.curtain, border: "none", borderRadius: 8, padding: "8px 12px",
        }}>
          <Paperclip size={14} color="#fff" />
          File will be uploaded here
        </button>
      );
    case "text":
    default:
      return <input type="text" disabled placeholder="Short text will be typed here" style={disabledInput} />;
  }
}

// Small dropdown that lists every field label in the template and inserts the
// chosen {{field_label}} token into the target input at the caret position.
function InsertVariableMenu({ labels, onInsert }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div style={{ position: "relative", flexShrink: 0 }} onMouseDown={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Insert a variable"
        style={{ ...secondaryBtn, padding: "5px 9px", fontSize: 12, whiteSpace: "nowrap" }}
      >
        <Braces size={13} /> Insert variable
      </button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 30,
          background: C.card, border: `1px solid ${C.line}`, borderRadius: 10,
          boxShadow: "0 8px 24px rgba(28,27,42,0.14)", padding: 6, minWidth: 190,
          maxHeight: 240, overflowY: "auto",
        }}>
          {labels.length === 0 ? (
            <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, padding: "6px 8px" }}>
              No fields to insert yet
            </div>
          ) : labels.map((label) => (
            <button
              key={label}
              onClick={() => { onInsert(label); setOpen(false); }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.paperDim)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              style={{
                display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
                cursor: "pointer", padding: "6px 8px", borderRadius: 6,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: C.inkSoft,
              }}
            >{`{{${label}}}`}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Assign each step a vertical level: steps with no (resolvable) dependsOn sit at
// level 0; every other step sits one below its deepest parent. A depth guard
// keeps accidental cycles from recursing forever.
function flowLevels(steps) {
  const byId = {};
  steps.forEach((s) => { byId[s.id] = s; });
  const level = {};
  const compute = (id, guard) => {
    if (level[id] !== undefined) return level[id];
    const s = byId[id];
    const deps = (s?.dependsOn || []).filter((d) => byId[d] && d !== id);
    if (!s || deps.length === 0 || guard > steps.length) { level[id] = 0; return 0; }
    let max = 0;
    deps.forEach((d) => { max = Math.max(max, compute(d, guard + 1) + 1); });
    level[id] = max;
    return max;
  };
  steps.forEach((s) => compute(s.id, 0));
  return level;
}

// Top-to-bottom / left-to-right SVG flowchart of a template's steps, wired by dependsOn.
function FlowChart({ steps, onUpdateStep, onUpdateTask, onSaveDrawings }) {
  const [dir, setDir] = useState("tb");
  const [showBadges, setShowBadges] = useState(true);
  const [showConditions, setShowConditions] = useState(true);
  const [showArrowLabels, setShowArrowLabels] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const dragNodeRef = useRef(null);
  const movedRef = useRef(false);
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(null);
  const [connectMode, setConnectMode] = useState(false);
  const [sourceId, setSourceId] = useState(null);
  const [cursorPt, setCursorPt] = useState(null);
  const [hoverNodeId, setHoverNodeId] = useState(null);
  const [hoverEdge, setHoverEdge] = useState(null);
  const [drawingShapes, setDrawingShapes] = useState([]);
  const [activeTool, setActiveTool] = useState("select");
  const [draft, setDraft] = useState(null);
  const [textDraft, setTextDraft] = useState(null);
  // Unified selection across drawn shapes, dependency edges, and flowchart nodes:
  // { type: "shape" | "edge" | "node", id }. Edge ids are `${from}~~${to}`.
  const [selectedItem, setSelectedItem] = useState(null);
  const selShapeId = selectedItem && selectedItem.type === "shape" ? selectedItem.id : null;
  const drawRef = useRef(null);
  const shapeDragRef = useRef(null);
  const resizeRef = useRef(null);
  const nodeResizeRef = useRef(null);
  // Mirrors the latest nodePositions / steps so history pushes can snapshot node
  // and step state alongside shapes without re-subscribing on every change.
  const nodesRef = useRef({});
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  useEffect(() => {
    if (!selectedItem) return;
    const onKey = (e) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
      deleteSelected();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedItem, drawingShapes, steps]);
  // Unified undo history: each entry snapshots BOTH drawn shapes and node
  // positions, so Ctrl+Z/Ctrl+Y step back and forth through shape edits and node
  // drags in the single order they happened.
  const [hist, setHist] = useState({ stack: [{ shapes: [], nodes: {}, steps }], index: 0 });
  const skipRef = useRef(true);
  const canUndo = hist.index > 0;
  const canRedo = hist.index < hist.stack.length - 1;
  const pushHistory = (shapes, nodes, snapSteps) => {
    setHist((h) => {
      const base = h.stack.slice(0, h.index + 1);
      return { stack: [...base, { shapes, nodes, steps: snapSteps }], index: base.length };
    });
  };
  const restore = (ni) => {
    const snap = hist.stack[ni];
    skipRef.current = true;
    setDrawingShapes(snap.shapes);
    setNodePositions(snap.nodes);
    // Steps live in the parent template; push the snapshot back up when it differs
    // so edge/node deletions can be undone/redone.
    if (onUpdateStep && snap.steps && snap.steps !== stepsRef.current) {
      onUpdateStep(null, { _setSteps: snap.steps });
    }
    setHist((h) => ({ ...h, index: ni }));
    setSelectedItem(null);
  };
  const undo = () => { if (hist.index <= 0) return; restore(hist.index - 1); };
  const redo = () => { if (hist.index >= hist.stack.length - 1) return; restore(hist.index + 1); };
  useEffect(() => {
    if (skipRef.current) { skipRef.current = false; return; }
    pushHistory(drawingShapes, nodesRef.current, stepsRef.current);
  }, [drawingShapes]);
  // One window keydown listener handles both undo/redo and the tool shortcuts so
  // they can never remove each other's handler. Undo/redo run even while a text
  // field is focused; the single-letter tool shortcuts are skipped there.
  useEffect(() => {
    const toolMap = { r: "rect", c: "circle", d: "diamond", l: "line", t: "text", s: "select" };
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
        else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
        return;
      }
      if (e.altKey) return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
      const tool = toolMap[k];
      if (tool) { e.preventDefault(); setActiveTool(tool); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hist]);
  const editable = !!onUpdateStep || !!onUpdateTask;
  const canConnect = !!onUpdateStep;
  const drawing = activeTool !== "select" && !connectMode;
  const normShape = (s) => ({ ...s, x: s.w < 0 ? s.x + s.w : s.x, y: s.h < 0 ? s.y + s.h : s.y, w: Math.abs(s.w), h: Math.abs(s.h) });

  const horizontal = dir === "lr";
  const NODE_W = 224, NODE_H = 90, H_GAP = 40, LEVEL_GAP = 58, PAD = 24;
  const numById = {};
  steps.forEach((s, i) => { numById[s.id] = i + 1; });

  const levels = flowLevels(steps);
  const maxLevel = Math.max(0, ...steps.map((s) => levels[s.id]));
  const byLevel = [];
  for (let l = 0; l <= maxLevel; l++) byLevel.push(steps.filter((s) => levels[s.id] === l));
  const maxPerRow = Math.max(1, ...byLevel.map((r) => r.length));

  // Level axis runs down (tb) or across (lr); the cross axis holds each level's siblings.
  const levelStep = (horizontal ? NODE_W : NODE_H) + LEVEL_GAP;
  const crossNode = horizontal ? NODE_H : NODE_W;
  const crossStep = crossNode + H_GAP;
  const crossFull = maxPerRow * crossNode + (maxPerRow - 1) * H_GAP;
  const levelFull = maxLevel * levelStep + (horizontal ? NODE_W : NODE_H);

  const svgW = (horizontal ? levelFull : crossFull) + PAD * 2;
  const svgH = (horizontal ? crossFull : levelFull) + PAD * 2;

  // The auto layout derived from flowLevels; node dragging overrides it in state.
  const layout = {};
  byLevel.forEach((row, l) => {
    const rowExtent = row.length * crossNode + (row.length - 1) * H_GAP;
    const crossStart = PAD + (crossFull - rowExtent) / 2;
    const levelCoord = PAD + l * levelStep;
    row.forEach((s, i) => {
      const crossCoord = crossStart + i * crossStep;
      layout[s.id] = horizontal ? { x: levelCoord, y: crossCoord } : { x: crossCoord, y: levelCoord };
    });
  });

  // Live node positions; reset to the auto layout whenever direction or steps change.
  const [nodePositions, setNodePositions] = useState(layout);
  const layoutSig = dir + "|" + steps.map((s) => s.id).join(",");
  const [lastSig, setLastSig] = useState(layoutSig);
  if (layoutSig !== lastSig) {
    setLastSig(layoutSig);
    setNodePositions(layout);
  }
  nodesRef.current = nodePositions;
  // Merge live positions over the auto layout so every current step always resolves,
  // even on the render where nodePositions is briefly stale after a reset.
  const pos = {};
  steps.forEach((s) => { pos[s.id] = nodePositions[s.id] || layout[s.id]; });

  // Grow the viewBox to contain the furthest-dragged node so nothing gets clipped.
  let vbMinX = 0, vbMinY = 0, vbMaxX = svgW, vbMaxY = svgH;
  steps.forEach((s) => {
    const p = pos[s.id];
    if (!p) return;
    vbMinX = Math.min(vbMinX, p.x - PAD);
    vbMinY = Math.min(vbMinY, p.y - PAD);
    vbMaxX = Math.max(vbMaxX, p.x + (p.w ?? NODE_W) + PAD);
    vbMaxY = Math.max(vbMaxY, p.y + (p.h ?? NODE_H) + PAD);
  });
  const vbW = vbMaxX - vbMinX, vbH = vbMaxY - vbMinY;

  const clampZoom = (z) => Math.min(2, Math.max(0.4, Math.round(z * 10) / 10));
  const zoomIn = () => setZoom((z) => clampZoom(z + 0.1));
  const zoomOut = () => setZoom((z) => clampZoom(z - 0.1));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const resetLayout = () => setNodePositions(layout);
  const toggleConnect = () => { setConnectMode((v) => !v); setSourceId(null); setCursorPt(null); };
  // Convert a screen point to content coordinates (inside the pan/zoom <g>).
  const svgPoint = (e) => {
    const svg = svgRef.current;
    if (!svg || !svg.getScreenCTM) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const v = pt.matrixTransform(ctm.inverse());
    return { x: (v.x - pan.x) / zoom, y: (v.y - pan.y) / zoom };
  };
  const saveDrawings = () => {
    if (window.confirm("Save these drawings to this template? This cannot be undone.")) {
      onSaveDrawings && onSaveDrawings(drawingShapes);
    }
  };
  const onShapeMouseDown = (s, e) => {
    if (activeTool !== "select" || connectMode) return;
    e.stopPropagation();
    setSelectedItem({ type: "shape", id: s.id });
    const pt = svgPoint(e);
    shapeDragRef.current = pt ? { id: s.id, offX: pt.x - s.x, offY: pt.y - s.y } : null;
  };
  // Delete whatever is selected: shapes locally, edges/nodes via onUpdateStep.
  // Edge/node deletions snapshot the resulting steps into unified history so
  // Ctrl+Z restores them and Ctrl+Y re-deletes them.
  const deleteSelected = () => {
    if (!selectedItem) return;
    if (selectedItem.type === "shape") {
      setDrawingShapes((a) => a.filter((s) => s.id !== selectedItem.id));
      setSelectedItem(null);
      return;
    }
    if (!onUpdateStep) return;
    if (selectedItem.type === "edge") {
      const [from, to] = selectedItem.id.split("~~");
      const deps = (steps.find((x) => x.id === to)?.dependsOn || []).filter((d) => d !== from);
      const nextSteps = steps.map((s) => (s.id === to ? { ...s, dependsOn: deps } : s));
      pushHistory(drawingShapes, nodesRef.current, nextSteps);
      onUpdateStep(to, { dependsOn: deps });
      setSelectedItem(null);
    } else if (selectedItem.type === "node") {
      const nextSteps = steps.filter((s) => s.id !== selectedItem.id);
      pushHistory(drawingShapes, nodesRef.current, nextSteps);
      onUpdateStep(selectedItem.id, { _delete: true });
      setSelectedItem(null);
    }
  };
  // Begin a resize drag from one of a selected shape's handles.
  const onResizeMouseDown = (s, handle, e) => {
    e.stopPropagation();
    resizeRef.current = { id: s.id, handle, n: normShape(s) };
  };
  // Begin a resize drag from one of a selected node's handles.
  const onNodeResizeMouseDown = (s, handle, e) => {
    e.stopPropagation();
    const p = nodePositions[s.id] || layout[s.id] || { x: 0, y: 0 };
    nodeResizeRef.current = { id: s.id, handle, x: p.x, y: p.y, w: p.w ?? NODE_W, h: p.h ?? NODE_H };
  };
  const removeEdge = (edge) => {
    if (!onUpdateStep) return;
    const target = steps.find((x) => x.id === edge.to);
    const deps = (target?.dependsOn || []).filter((d) => d !== edge.from);
    onUpdateStep(edge.to, { dependsOn: deps });
  };
  const onWheel = (e) => { e.preventDefault(); setZoom((z) => clampZoom(z + (e.deltaY < 0 ? 0.1 : -0.1))); };
  const onMouseDown = (e) => {
    // Dragging out a rect/circle/diamond consumes the gesture; every other
    // background press arms a pan. Node/shape/handle handlers stopPropagation
    // first, so this only runs when the press lands on the canvas background.
    if (drawing && (activeTool === "rect" || activeTool === "circle" || activeTool === "diamond")) {
      const pt = svgPoint(e); if (!pt) return;
      drawRef.current = { x: pt.x, y: pt.y };
      setDraft({ id: "d-" + Date.now(), type: activeTool, x: pt.x, y: pt.y, w: 0, h: 0, color: C.spotlight });
      return;
    }
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; movedRef.current = false; setDragging(true);
  };
  const onNodeMouseDown = (s, e) => {
    if (drawing) return;
    if (connectMode) { e.stopPropagation(); return; }
    if (!editable) return;
    e.stopPropagation();
    setSelectedItem({ type: "node", id: s.id });
    const cur = nodePositions[s.id] || layout[s.id] || { x: 0, y: 0 };
    // Record where in the node the grab happened, in content coords, so the node
    // tracks the cursor exactly regardless of CSS scaling, zoom, or pan.
    const cpt = svgPoint(e);
    dragNodeRef.current = {
      id: s.id, sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y,
      offX: cpt ? cpt.x - cur.x : undefined, offY: cpt ? cpt.y - cur.y : undefined,
    };
    movedRef.current = false;
  };
  const onMouseMove = (e) => {
    // A resize drag wins over everything else.
    const rz = resizeRef.current;
    if (rz) {
      const pt = svgPoint(e);
      if (pt) setDrawingShapes((a) => a.map((sh) => {
        if (sh.id !== rz.id) return sh;
        if (sh.type === "line") {
          if (rz.handle === "start") return { ...sh, x: pt.x, y: pt.y, w: sh.x + sh.w - pt.x, h: sh.y + sh.h - pt.y };
          return { ...sh, w: pt.x - sh.x, h: pt.y - sh.y };
        }
        // Opposite corner/edge stays fixed; the dragged side follows the pointer (min 20).
        const n = rz.n;
        let left = n.x, top = n.y, right = n.x + n.w, bottom = n.y + n.h;
        if (rz.handle.includes("w")) left = Math.min(pt.x, right - 20);
        if (rz.handle.includes("e")) right = Math.max(pt.x, left + 20);
        if (rz.handle.includes("n")) top = Math.min(pt.y, bottom - 20);
        if (rz.handle.includes("s")) bottom = Math.max(pt.y, top + 20);
        return { ...sh, x: left, y: top, w: right - left, h: bottom - top };
      }));
      return;
    }
    // A node resize also wins over pan/drag; opposite edge stays fixed, min 80x50.
    const nr = nodeResizeRef.current;
    if (nr) {
      const pt = svgPoint(e);
      if (pt) {
        let left = nr.x, top = nr.y, right = nr.x + nr.w, bottom = nr.y + nr.h;
        if (nr.handle.includes("w")) left = Math.min(pt.x, right - 80);
        if (nr.handle.includes("e")) right = Math.max(pt.x, left + 80);
        if (nr.handle.includes("n")) top = Math.min(pt.y, bottom - 50);
        if (nr.handle.includes("s")) bottom = Math.max(pt.y, top + 50);
        setNodePositions((prev) => ({ ...prev, [nr.id]: { x: left, y: top, w: right - left, h: bottom - top } }));
      }
      return;
    }
    const sd = shapeDragRef.current;
    if (sd) {
      const pt = svgPoint(e);
      if (pt) setDrawingShapes((a) => a.map((sh) => sh.id === sd.id ? { ...sh, x: pt.x - sd.offX, y: pt.y - sd.offY } : sh));
      return;
    }
    // A grabbed node always wins over canvas pan.
    const nd = dragNodeRef.current;
    if (nd) {
      if (Math.abs(e.clientX - nd.sx) > 3 || Math.abs(e.clientY - nd.sy) > 3) movedRef.current = true;
      const cpt = nd.offX !== undefined ? svgPoint(e) : null;
      const nx = cpt ? cpt.x - nd.offX : nd.ox + (e.clientX - nd.sx) / zoom;
      const ny = cpt ? cpt.y - nd.offY : nd.oy + (e.clientY - nd.sy) / zoom;
      setNodePositions((prev) => ({ ...prev, [nd.id]: { ...prev[nd.id], x: nx, y: ny } }));
      return;
    }
    // Update an in-progress shape draft (rect/circle/diamond drag, or the
    // click-to-click line preview).
    if (drawRef.current && draft) {
      const pt = svgPoint(e);
      if (pt) setDraft((dr) => dr ? { ...dr, w: pt.x - drawRef.current.x, h: pt.y - drawRef.current.y } : dr);
      return;
    }
    // A background drag pans, regardless of the active tool or connect mode.
    const d = dragRef.current;
    if (d) {
      if (Math.abs(e.clientX - d.x) > 3 || Math.abs(e.clientY - d.y) > 3) movedRef.current = true;
      setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
      return;
    }
    // Connect mode: track the cursor for the live preview arrow.
    if (connectMode && sourceId) setCursorPt(svgPoint(e));
  };
  const endDrag = () => {
    if (resizeRef.current) { resizeRef.current = null; return; }
    if (nodeResizeRef.current) {
      nodeResizeRef.current = null;
      pushHistory(drawingShapes, nodesRef.current, stepsRef.current);
      return;
    }
    if (shapeDragRef.current) { shapeDragRef.current = null; return; }
    // Commit a dragged rect/circle/diamond; line/text finalise in onCanvasClick,
    // so they fall through to the pan cleanup below.
    if (drawRef.current && draft && (draft.type === "rect" || draft.type === "circle" || draft.type === "diamond")) {
      const n = normShape(draft);
      if (n.w > 3 && n.h > 3) setDrawingShapes((a) => [...a, draft]);
      setDraft(null); drawRef.current = null;
      return;
    }
    const nd = dragNodeRef.current;
    if (nd) {
      // Snap the dropped node to a 20px grid, then record the move in history.
      const cur = nodePositions[nd.id];
      const snapped = cur
        ? { ...nodePositions, [nd.id]: { ...cur, x: Math.round(cur.x / 20) * 20, y: Math.round(cur.y / 20) * 20 } }
        : nodePositions;
      setNodePositions(snapped);
      if (movedRef.current && cur) pushHistory(drawingShapes, snapped, stepsRef.current);
      dragNodeRef.current = null;
    }
    dragRef.current = null;
    setDragging(false);
  };
  const onCanvasClick = (e) => {
    if (connectMode) { setSourceId(null); setCursorPt(null); return; }
    if (activeTool === "select") { setSelectedItem(null); return; }
    if (!drawing) return;
    const pt = svgPoint(e); if (!pt) return;
    if (activeTool === "line") {
      if (!drawRef.current) {
        drawRef.current = { x: pt.x, y: pt.y };
        setDraft({ id: "d-" + Date.now(), type: "line", x: pt.x, y: pt.y, w: 0, h: 0, color: C.ink });
      } else {
        setDrawingShapes((a) => [...a, { id: "d-" + Date.now(), type: "line", x: drawRef.current.x, y: drawRef.current.y, w: pt.x - drawRef.current.x, h: pt.y - drawRef.current.y, color: C.ink }]);
        drawRef.current = null; setDraft(null);
      }
    } else if (activeTool === "text") {
      setTextDraft({ x: pt.x, y: pt.y, value: "" });
    }
  };
  const onNodeClick = (s, e) => {
    if (drawing) return;
    if (connectMode) {
      e.stopPropagation();
      if (!onUpdateStep) return;
      if (!sourceId) { setSourceId(s.id); return; }
      if (sourceId === s.id) { setSourceId(null); setCursorPt(null); return; }
      // Toggle: source becomes a parent (dependsOn) of the clicked target.
      const target = steps.find((x) => x.id === s.id);
      const deps = target?.dependsOn || [];
      const nextDeps = deps.includes(sourceId) ? deps.filter((d) => d !== sourceId) : [...deps, sourceId];
      onUpdateStep(s.id, { dependsOn: nextDeps });
      setSourceId(null); setCursorPt(null);
      return;
    }
    // Keep the click from bubbling to the background handler (which would clear
    // the node selection made on mousedown).
    e.stopPropagation();
    if (!editable || movedRef.current) return;
    setEditing({ step: s, x: e.clientX, y: e.clientY });
  };

  if (!steps || steps.length === 0) {
    return (
      <div style={{ ...emptyState }}>
        <GitMerge size={20} color={C.spotlight} />
        <p style={{ margin: "10px 0 0", fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate }}>Add steps to see the flowchart.</p>
      </div>
    );
  }

  // Edges from every resolvable parent to its child.
  const edges = [];
  steps.forEach((s) => {
    (s.dependsOn || []).forEach((depId) => {
      if (pos[depId] && pos[s.id] && depId !== s.id) edges.push({ from: depId, to: s.id });
    });
  });

  const toolBtn = (active) => ({
    ...secondaryBtn, padding: "5px 10px", fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace",
    background: active ? C.paperDim : "transparent", color: active ? C.ink : C.slate,
  });

  return (
    <div>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
        background: C.card, border: `1px solid ${C.line}`, borderRadius: 12,
        padding: "10px 12px", marginBottom: 12,
      }}>
        <button onClick={() => setDir(horizontal ? "tb" : "lr")} style={toolBtn(false)}>
          {horizontal ? "Left → Right" : "Top → Bottom"}
        </button>
        <button onClick={() => setShowBadges((v) => !v)} style={toolBtn(showBadges)}>Dept badges</button>
        <button onClick={() => setShowConditions((v) => !v)} style={toolBtn(showConditions)}>Conditions</button>
        <button onClick={() => setShowArrowLabels((v) => !v)} style={toolBtn(showArrowLabels)}>Arrow labels</button>
        {canConnect && (
          <button onClick={toggleConnect} style={toolBtn(connectMode)}><Link size={13} /> Connect</button>
        )}
        <button onClick={resetLayout} style={toolBtn(false)}>Reset layout</button>
        {[["select", MousePointer], ["rect", Square], ["circle", Circle], ["diamond", Diamond], ["line", Minus], ["text", Type]].map(([t, Ic]) => (
          <button key={t} title={t} onClick={() => setActiveTool(t)}
            style={activeTool === t ? { ...toolBtn(false), background: "#FBF0DC", color: C.ink } : { ...toolBtn(false), padding: "5px 8px" }}>
            <Ic size={13} />
          </button>
        ))}
        <button title="Undo" onClick={undo} disabled={!canUndo} style={{ ...toolBtn(false), padding: "5px 8px", opacity: canUndo ? 1 : 0.4, cursor: canUndo ? "pointer" : "default" }}><Undo2 size={13} /></button>
        <button title="Redo" onClick={redo} disabled={!canRedo} style={{ ...toolBtn(false), padding: "5px 8px", opacity: canRedo ? 1 : 0.4, cursor: canRedo ? "pointer" : "default" }}><Redo2 size={13} /></button>
        {drawingShapes.length > 0 && (
          <button onClick={saveDrawings} style={{ ...toolBtn(false), background: C.sage, color: C.paper }}>Save drawings</button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <button onClick={zoomOut} style={{ ...toolBtn(false), padding: "5px 9px" }}>−</button>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: C.slate, minWidth: 42, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} style={{ ...toolBtn(false), padding: "5px 9px" }}>+</button>
          <button onClick={resetView} style={toolBtn(false)}>Reset</button>
        </div>
      </div>
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "20px 22px", overflowX: "auto" }}>
      <svg
        ref={svgRef}
        width={vbW} height={vbH} viewBox={`${vbMinX} ${vbMinY} ${vbW} ${vbH}`}
        style={{ display: "block", maxWidth: "100%", cursor: (connectMode || drawing) ? "crosshair" : dragging ? "grabbing" : "grab" }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onClick={onCanvasClick}
      >
        <defs>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill={C.slateLight} />
          </marker>
          <marker id="flow-arrow-spot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill={C.spotlight} />
          </marker>
          <filter id="flow-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={C.spotlight} floodOpacity="0.85" />
          </filter>
          <marker id="draw-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill={C.ink} />
          </marker>
        </defs>

        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
        {edges.map((e, i) => {
          const p = pos[e.from], c = pos[e.to];
          const pw = p.w ?? NODE_W, ph = p.h ?? NODE_H;
          const cw = c.w ?? NODE_W, ch = c.h ?? NODE_H;
          let x1, y1, x2, y2, d;
          if (horizontal) {
            x1 = p.x + pw; y1 = p.y + ph / 2;
            x2 = c.x; y2 = c.y + ch / 2;
            d = `M ${x1} ${y1} C ${x1 + 44} ${y1}, ${x2 - 44} ${y2}, ${x2} ${y2}`;
          } else {
            x1 = p.x + pw / 2; y1 = p.y + ph;
            x2 = c.x + cw / 2; y2 = c.y;
            d = `M ${x1} ${y1} C ${x1} ${y1 + 44}, ${x2} ${y2 - 44}, ${x2} ${y2}`;
          }
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          const edgeId = `${e.from}~~${e.to}`;
          const edgeSelected = !connectMode && selectedItem?.type === "edge" && selectedItem.id === edgeId;
          const selectable = activeTool === "select" && !connectMode;
          return (
            <g
              key={i}
              onMouseEnter={connectMode ? () => setHoverEdge(i) : undefined}
              onMouseLeave={connectMode ? () => setHoverEdge(null) : undefined}
            >
              <path
                d={d} fill="none"
                stroke={edgeSelected ? C.spotlight : C.slateLight} strokeWidth={edgeSelected ? 3 : 1.6}
                markerEnd={edgeSelected ? "url(#flow-arrow-spot)" : "url(#flow-arrow)"}
              />
              {(connectMode || selectable) && (
                <path
                  d={d} fill="none" stroke="transparent" strokeWidth={16}
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                  onClick={selectable ? (ev) => { ev.stopPropagation(); setSelectedItem({ type: "edge", id: edgeId }); } : undefined}
                />
              )}
              {showArrowLabels && !(connectMode && hoverEdge === i) && (
                <g>
                  <rect x={mx - 10} y={my - 8} width={20} height={16} rx={4} fill={C.card} stroke={C.line} strokeWidth={1} />
                  <text x={mx} y={my} textAnchor="middle" dominantBaseline="central" fontFamily="'JetBrains Mono', monospace" fontSize={9.5} fill={C.slate}>{numById[e.from]}</text>
                </g>
              )}
              {connectMode && hoverEdge === i && (
                <g onClick={(ev) => { ev.stopPropagation(); removeEdge(e); }} style={{ cursor: "pointer" }}>
                  <circle cx={mx} cy={my} r={9} fill={C.curtain} />
                  <text x={mx} y={my} textAnchor="middle" dominantBaseline="central" fontFamily="'Work Sans', sans-serif" fontSize={12} fontWeight={700} fill={C.paper}>×</text>
                </g>
              )}
            </g>
          );
        })}

        {connectMode && sourceId && cursorPt && pos[sourceId] && (
          <path
            d={`M ${pos[sourceId].x + NODE_W / 2} ${pos[sourceId].y + NODE_H / 2} L ${cursorPt.x} ${cursorPt.y}`}
            fill="none" stroke={C.spotlight} strokeWidth={1.8} strokeDasharray="6 5" markerEnd="url(#flow-arrow-spot)"
          />
        )}

        {steps.map((s) => {
          const p = pos[s.id];
          const nw = p.w ?? NODE_W, nh = p.h ?? NODE_H;
          const isApproval = (s.stepType ?? "task") === "approval";
          const hasCondition = !!s.condition;
          const fill = isApproval ? "#FBF0DC" : C.card;
          const stroke = isApproval ? C.spotlight : C.line;
          const cx = p.x + nw / 2, cy = p.y + nh / 2;
          const dash = hasCondition && showConditions ? "5 4" : undefined;
          // Glow the connect-mode source/hover node, or the select-mode selection.
          const nodeSelected = !connectMode && selectedItem?.type === "node" && selectedItem.id === s.id;
          const highlight = (connectMode && (sourceId === s.id || hoverNodeId === s.id)) || nodeSelected;
          const nodeStroke = highlight ? C.spotlight : stroke;
          const nodeStrokeW = highlight ? 2.6 : 1.6;
          const nodeFilter = highlight ? "url(#flow-glow)" : undefined;
          const nodeCursor = connectMode ? "pointer" : (dragNodeRef.current && dragNodeRef.current.id === s.id ? "grabbing" : "grab");
          // foreignObject bounds match the shape exactly: the full rect for tasks,
          // and the inscribed ~60% centred box for diamonds so nothing bleeds past
          // the sloped edges.
          const foW = isApproval ? nw * 0.6 : nw;
          const foH = isApproval ? nh * 0.6 : nh;
          const foX = isApproval ? cx - foW / 2 : p.x;
          const foY = isApproval ? cy - foH / 2 : p.y;
          return (
            <g
              key={s.id}
              onMouseDown={(e) => onNodeMouseDown(s, e)}
              onClick={(e) => onNodeClick(s, e)}
              onMouseEnter={connectMode ? () => setHoverNodeId(s.id) : undefined}
              onMouseLeave={connectMode ? () => setHoverNodeId(null) : undefined}
              style={(editable || connectMode) ? { cursor: nodeCursor } : undefined}
            >
              <title>{`${numById[s.id]}. ${s.title} — ${s.dept}`}</title>
              {isApproval ? (
                <polygon
                  points={`${cx},${p.y} ${p.x + nw},${cy} ${cx},${p.y + nh} ${p.x},${cy}`}
                  fill={fill} stroke={nodeStroke} strokeWidth={nodeStrokeW} strokeDasharray={dash} strokeLinejoin="round" filter={nodeFilter}
                />
              ) : (
                <rect
                  x={p.x} y={p.y} width={nw} height={nh} rx={12}
                  fill={fill} stroke={nodeStroke} strokeWidth={nodeStrokeW} strokeDasharray={dash} filter={nodeFilter}
                />
              )}
              <foreignObject x={foX} y={foY} width={foW} height={foH}>
                <div xmlns="http://www.w3.org/1999/xhtml" style={{
                  width: "100%", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column",
                  justifyContent: "center", alignItems: "center", gap: isApproval ? 3 : 6,
                  padding: isApproval ? "0 2px" : "8px 12px", overflow: "hidden", textAlign: "center",
                }}>
                  <span style={{
                    fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: C.ink,
                    lineHeight: 1.2, maxWidth: "100%",
                  }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: C.slateLight, fontWeight: 600 }}>{numById[s.id]}. </span>
                    {s.title}
                  </span>
                  {showBadges && (
                    <div style={{ maxWidth: "100%", display: "flex", justifyContent: "center", flexShrink: 0 }}>
                      <DeptBadge dept={s.dept} />
                    </div>
                  )}
                </div>
              </foreignObject>
            </g>
          );
        })}

        {/* Resize handles for the selected flowchart node */}
        {activeTool === "select" && !connectMode && selectedItem?.type === "node" && (() => {
          const s = steps.find((x) => x.id === selectedItem.id);
          const p = s && pos[s.id];
          if (!p) return null;
          const nw = p.w ?? NODE_W, nh = p.h ?? NODE_H;
          const HS = 8;
          const l = p.x, t = p.y, r = p.x + nw, b = p.y + nh, mx = p.x + nw / 2, my = p.y + nh / 2;
          const handle = (hx, hy, cursor, id) => (
            <rect key={id} x={hx - HS / 2} y={hy - HS / 2} width={HS} height={HS}
              fill={C.paper} stroke={C.spotlight} strokeWidth={1.2}
              style={{ cursor }} onMouseDown={(e) => onNodeResizeMouseDown(s, id, e)} onClick={(e) => e.stopPropagation()} />
          );
          return (
            <>
              {handle(l, t, "nw-resize", "nw")}
              {handle(mx, t, "n-resize", "n")}
              {handle(r, t, "ne-resize", "ne")}
              {handle(r, my, "e-resize", "e")}
              {handle(r, b, "se-resize", "se")}
              {handle(mx, b, "s-resize", "s")}
              {handle(l, b, "sw-resize", "sw")}
              {handle(l, my, "w-resize", "w")}
            </>
          );
        })()}

        {/* Free drawing layer, on top of nodes and edges */}
        <g>
          {[...drawingShapes, ...(draft ? [draft] : [])].map((s) => {
            const selectable = activeTool === "select" && !connectMode;
            const ip = { onMouseDown: (e) => onShapeMouseDown(s, e), onClick: (e) => e.stopPropagation(), style: { pointerEvents: selectable ? "all" : "none", cursor: selectable ? "move" : "default" } };
            if (s.type === "rect") { const n = normShape(s); return <rect key={s.id} {...ip} x={n.x} y={n.y} width={n.w} height={n.h} rx={8} fill="transparent" stroke={s.color} strokeWidth={1.8} />; }
            if (s.type === "circle") { const n = normShape(s); return <ellipse key={s.id} {...ip} cx={n.x + n.w / 2} cy={n.y + n.h / 2} rx={n.w / 2} ry={n.h / 2} fill="transparent" stroke={s.color} strokeWidth={1.8} />; }
            if (s.type === "diamond") { const n = normShape(s); const dcx = n.x + n.w / 2, dcy = n.y + n.h / 2; return <polygon key={s.id} {...ip} points={`${dcx},${n.y} ${n.x + n.w},${dcy} ${dcx},${n.y + n.h} ${n.x},${dcy}`} fill="transparent" stroke={s.color} strokeWidth={1.8} />; }
            if (s.type === "line") return <line key={s.id} {...ip} x1={s.x} y1={s.y} x2={s.x + s.w} y2={s.y + s.h} stroke={s.color} strokeWidth={1.8} markerEnd="url(#draw-arrow)" />;
            if (s.type === "text") return <text key={s.id} {...ip} x={s.x} y={s.y} fontFamily="'Work Sans', sans-serif" fontSize={14} fill={s.color}>{s.text}</text>;
            return null;
          })}
          {(() => {
            const s = selShapeId && drawingShapes.find((x) => x.id === selShapeId);
            if (!s) return null;
            let bx, by, bw, bh;
            if (s.type === "line") { bx = Math.min(s.x, s.x + s.w); by = Math.min(s.y, s.y + s.h); bw = Math.abs(s.w); bh = Math.abs(s.h); }
            else if (s.type === "text") { bx = s.x; by = s.y - 14; bw = 120; bh = 20; }
            else { const n = normShape(s); bx = n.x; by = n.y; bw = n.w; bh = n.h; }
            return <rect x={bx - 4} y={by - 4} width={bw + 8} height={bh + 8} fill="none" stroke={C.spotlight} strokeWidth={1.4} strokeDasharray="5 4" pointerEvents="none" />;
          })()}
          {(() => {
            const s = activeTool === "select" && !connectMode && selShapeId && drawingShapes.find((x) => x.id === selShapeId);
            if (!s) return null;
            const HS = 8;
            const handle = (hx, hy, cursor, id) => (
              <rect key={id} x={hx - HS / 2} y={hy - HS / 2} width={HS} height={HS}
                fill={C.paper} stroke={C.spotlight} strokeWidth={1.2}
                style={{ cursor }} onMouseDown={(e) => onResizeMouseDown(s, id, e)} onClick={(e) => e.stopPropagation()} />
            );
            if (s.type === "line") {
              return <>{handle(s.x, s.y, "move", "start")}{handle(s.x + s.w, s.y + s.h, "move", "end")}</>;
            }
            if (s.type === "text") return null;
            const n = normShape(s);
            const l = n.x, t = n.y, r = n.x + n.w, b = n.y + n.h, mx = n.x + n.w / 2, my = n.y + n.h / 2;
            return <>
              {handle(l, t, "nw-resize", "nw")}
              {handle(mx, t, "n-resize", "n")}
              {handle(r, t, "ne-resize", "ne")}
              {handle(r, my, "e-resize", "e")}
              {handle(r, b, "se-resize", "se")}
              {handle(mx, b, "s-resize", "s")}
              {handle(l, b, "sw-resize", "sw")}
              {handle(l, my, "w-resize", "w")}
            </>;
          })()}
          {textDraft && (
            <foreignObject x={textDraft.x} y={textDraft.y - 14} width={170} height={28}>
              <input
                xmlns="http://www.w3.org/1999/xhtml"
                autoFocus
                value={textDraft.value}
                onChange={(ev) => setTextDraft((t) => ({ ...t, value: ev.target.value }))}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" && textDraft.value.trim()) {
                    setDrawingShapes((a) => [...a, { id: "d-" + Date.now(), type: "text", x: textDraft.x, y: textDraft.y, text: textDraft.value.trim(), color: C.ink }]);
                    setTextDraft(null);
                  } else if (ev.key === "Escape") setTextDraft(null);
                }}
                onBlur={() => setTextDraft(null)}
                style={{ width: "100%", boxSizing: "border-box", fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.ink, background: C.paper, border: `1px solid ${C.spotlight}`, borderRadius: 6, padding: "3px 6px" }}
              />
            </foreignObject>
          )}
        </g>
        </g>
      </svg>
    </div>
      {editing && (
        <NodeEditPopover
          key={editing.step.id}
          step={editing.step}
          x={editing.x}
          y={editing.y}
          canEditTask={!!onUpdateTask}
          onSaveStep={onUpdateStep}
          onSaveTask={onUpdateTask}
          onClose={() => setEditing(null)}
        />
      )}
      <div style={{
        position: "fixed", top: 120, right: 16, zIndex: 40, width: 176,
        background: C.card, border: `1px solid ${C.line}`, borderRadius: 12,
        padding: "10px 12px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
      }}>
        <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: C.slate, marginBottom: 8 }}>Shortcuts</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {[["R", "Rectangle"], ["C", "Circle"], ["D", "Diamond"], ["L", "Line"], ["T", "Text"], ["S", "Select"], ["Ctrl+Z", "Undo"], ["Ctrl+Y", "Redo"], ["Delete", "Remove shape"]].map(([k, label]) => (
              <tr key={k}>
                <td style={{ padding: "2px 0", verticalAlign: "top" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.ink, background: C.paperDim, border: `1px solid ${C.line}`, borderRadius: 5, padding: "1px 5px", whiteSpace: "nowrap" }}>{k}</span>
                </td>
                <td style={{ padding: "2px 0 2px 8px", fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, textAlign: "right" }}>{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Small anchored editor for a FlowChart node: template step and/or this-run task.
function NodeEditPopover({ step, x, y, canEditTask, onSaveStep, onSaveTask, onClose }) {
  const [title, setTitle] = useState(step.title || "");
  const [description, setDescription] = useState(step.description || "");
  const [isApproval, setIsApproval] = useState((step.stepType ?? "task") === "approval");
  const [scope, setScope] = useState("template");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    if (canEditTask && scope === "run") {
      onSaveTask && onSaveTask(step.id, { title, description });
    } else if (onSaveStep) {
      onSaveStep(step.id, { title, description, stepType: isApproval ? "approval" : "task" });
    }
    onClose();
  };

  const W = 288;
  const left = Math.max(12, Math.min(x + 12, window.innerWidth - W - 12));
  const top = Math.max(12, Math.min(y + 12, window.innerHeight - 340));
  const inputStyle = {
    width: "100%", boxSizing: "border-box", fontFamily: "'Work Sans', sans-serif", fontSize: 13,
    color: C.ink, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 9px",
  };
  const labelStyle = { ...fieldLabel, marginBottom: 5 };

  return (
    <div style={{
      position: "fixed", left, top, width: W, zIndex: 60,
      background: C.card, border: `1px solid ${C.line}`, borderRadius: 12,
      boxShadow: "0 8px 28px rgba(28,27,42,0.16)", padding: 16,
    }}>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Title</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} autoFocus />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: 68, resize: "vertical" }} />
      </div>
      <label style={{
        display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 12,
        fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 500, color: C.ink,
        opacity: canEditTask && scope === "run" ? 0.45 : 1,
      }}>
        <input
          type="checkbox"
          checked={isApproval}
          disabled={canEditTask && scope === "run"}
          onChange={(e) => setIsApproval(e.target.checked)}
          style={{ accentColor: C.sage, cursor: "pointer" }}
        />
        Approval step
      </label>
      {canEditTask && (
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Edit scope</label>
          <div style={{ display: "flex", background: C.paperDim, borderRadius: 9, padding: 3 }}>
            <button onClick={() => setScope("template")} style={scopeBtn(scope === "template")}>Template</button>
            <button onClick={() => setScope("run")} style={scopeBtn(scope === "run")}>This run only</button>
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onClose} style={{ ...secondaryBtn, padding: "6px 12px", fontSize: 12.5 }}>Cancel</button>
        <button onClick={save} style={{
          display: "inline-flex", alignItems: "center", gap: 6, background: C.ink, color: C.paper,
          border: "none", borderRadius: 9, padding: "7px 14px", fontFamily: "'Work Sans', sans-serif",
          fontSize: 12.5, fontWeight: 500, cursor: "pointer",
        }}>Save</button>
      </div>
    </div>
  );
}

const scopeBtn = (active) => ({
  flex: 1, padding: "5px 8px", borderRadius: 7, border: "none", cursor: "pointer",
  background: active ? C.card : "transparent", color: active ? C.ink : C.slate,
  fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, fontWeight: 500,
  boxShadow: active ? "0 1px 2px rgba(28,27,42,0.08)" : "none",
});

/* ---------------------------------------------------------------
   FLOWCHART CANVAS  (draw.io-style workflow builder for
   non-Marketing department templates)
--------------------------------------------------------------- */
const FC_SHAPES = [
  { type: "start",    name: "Start",        hint: "Where the workflow begins", bg: "#E8F3EC", border: "#4F8F6B" },
  { type: "process",  name: "Process",      hint: "An action or task",         bg: "#E9F0F9", border: "#3B6FB0" },
  { type: "decision", name: "Decision",     hint: "A yes/no branch",           bg: "#FBF3DF", border: "#C99A2E" },
  { type: "io",       name: "Input/Output", hint: "Data in or out",            bg: "#F0EAF7", border: "#7A5AA8" },
  { type: "end",      name: "End",          hint: "Where the workflow ends",   bg: "#FBEAE8", border: "#C0392B" },
];
const FC_META = Object.fromEntries(FC_SHAPES.map((s) => [s.type, s]));

// Every node is auto-numbered "1.0", "2.0", … in FLOW ORDER — walking the arrows from
// the Start shape, depth-first (follow one path to its ending, then the next branch).
// Where a node forks, its branches are taken top-to-bottom / left-to-right by position
// so the order is deterministic. Nodes not reachable from a Start (orphans, or a chart
// with no Start yet) are numbered last by canvas position so nothing is left blank.
// Returns { [nodeId]: "1.0" }. The number is DISPLAY-ONLY — the stored label stays the
// plain name the HOD typed, so editing, {{variables}} and emails are untouched.
function fcNodeNumbers(nodes, edges = []) {
  const map = {};
  const byId = {};
  nodes.forEach((n) => { byId[n.id] = n; });
  const posSort = (a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0);
  // Outgoing targets per node, ordered by the target's position so a fork numbers its
  // branches top-to-bottom.
  const out = {};
  nodes.forEach((n) => { out[n.id] = []; });
  edges.forEach((e) => { if (out[e.from] && byId[e.to]) out[e.from].push(e.to); });
  Object.keys(out).forEach((id) => {
    out[id].sort((x, y) => posSort(byId[x], byId[y]));
  });
  const order = [];
  const seen = new Set();
  const visit = (id) => {
    if (seen.has(id) || !byId[id]) return;
    seen.add(id);
    order.push(id);
    out[id].forEach(visit);
  };
  // Seed from the Start shape(s), top-to-bottom, so the walk begins at Start = 1.0.
  nodes.filter((n) => n.type === "start").slice().sort(posSort).forEach((n) => visit(n.id));
  // Sweep up anything the walk didn't reach, by position, so every node gets a number.
  nodes.slice().sort(posSort).forEach((n) => visit(n.id));
  order.forEach((id, i) => { map[id] = `${i + 1}.0`; });
  return map;
}
// The number a node's subtask carries: node "2.0" → its subtasks are "2.1", "2.2", …
// `nodeNum` comes from fcNodeNumbers; `i` is the subtask's index in the node's list.
function fcSubNumber(nodeNum, i) {
  if (!nodeNum) return "";
  return `${nodeNum.split(".")[0]}.${i + 1}`;
}
// The text drawn on a node: its label (or shape name), with its flow-order number
// prefixed. `nums` comes from fcNodeNumbers(nodes, edges).
function fcNodeText(n, fallback, nums) {
  const base = n.label || fallback;
  const num = nums && nums[n.id];
  return num ? `${num} ${base}` : base;
}

// Default footprint of each shape type.
function fcSize(type) {
  if (type === "decision") return { w: 108, h: 108 };
  if (type === "start" || type === "end") return { w: 132, h: 46 };
  return { w: 156, h: 58 };
}
// Actual footprint of a node — a custom w/h (from resizing) overrides the default.
function fcNodeSize(n) {
  const d = fcSize(n.type);
  return { w: n.w ?? d.w, h: n.h ?? d.h };
}
function fcCenter(n) {
  const { w, h } = fcNodeSize(n);
  return { x: n.x + w / 2, y: n.y + h / 2 };
}
// The rectangle every shape sits inside — what "fit the whole chart" is measured against.
function fcBounds(nodes) {
  if (!nodes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach((n) => {
    const s = fcNodeSize(n);
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + s.w); maxY = Math.max(maxY, n.y + s.h);
  });
  return { minX, minY, w: maxX - minX, h: maxY - minY };
}

// Alignment guides: snap a moving node so its edges/centers line up with any
// other node, and return the guide lines to draw. `mv` = { x, y, w, h }.
function fcSnapGuides(mv, others) {
  const T = 6;
  const vOf = (x, w) => [x, x + w / 2, x + w];   // left, center-x, right
  const hOf = (y, h) => [y, y + h / 2, y + h];   // top, center-y, bottom
  const mvV = vOf(mv.x, mv.w), mvH = hOf(mv.y, mv.h);
  let bV = { d: T + 1, off: 0, line: null };
  let bH = { d: T + 1, off: 0, line: null };
  others.forEach((o) => {
    const oV = vOf(o.x, o.w), oH = hOf(o.y, o.h);
    mvV.forEach((m) => oV.forEach((l) => { const d = Math.abs(m - l); if (d < bV.d) bV = { d, off: l - m, line: l }; }));
    mvH.forEach((m) => oH.forEach((l) => { const d = Math.abs(m - l); if (d < bH.d) bH = { d, off: l - m, line: l }; }));
  });
  const guides = [];
  let x = mv.x, y = mv.y;
  if (bV.line != null) { x += bV.off; guides.push({ type: "v", pos: bV.line }); }
  if (bH.line != null) { y += bH.off; guides.push({ type: "h", pos: bH.line }); }
  return { x, y, guides };
}

// Live rule-checker. Returns a list of human-readable problems ([] = valid).
// Live rule-checker. Each problem is an object:
//   { msg, hint, nodeId?, edgeId? }  — nodeId/edgeId let the UI jump to it.
function validateFlowchart(nodes, edges) {
  const errs = [];
  const add = (msg, hint, ref = {}) => errs.push({ msg, hint, ...ref });
  const label = (n) => (n.label && n.label.trim()) || FC_META[n.type].name;
  const starts = nodes.filter((n) => n.type === "start");
  const ends = nodes.filter((n) => n.type === "end");
  if (nodes.length === 0) return [{ msg: "Add a Start shape to begin.", hint: "Every workflow opens with exactly one Start shape." }];
  if (starts.length === 0) add("Need exactly one Start shape (found 0).", "Drag a Start shape onto the canvas — it marks where the workflow begins.");
  if (starts.length > 1) add(`Need exactly one Start shape (found ${starts.length}).`, "A workflow can only begin in one place. Delete the extra Start shapes.", { nodeId: starts[1].id });
  if (ends.length < 1) add("Add at least one End shape.", "An End shape shows where the workflow finishes.");

  const out = {}, inc = {};
  nodes.forEach((n) => { out[n.id] = []; inc[n.id] = []; });
  edges.forEach((e) => { if (out[e.from]) out[e.from].push(e); if (inc[e.to]) inc[e.to].push(e); });

  nodes.forEach((n) => {
    if (n.type !== "start" && inc[n.id].length === 0) add(`“${label(n)}” has no incoming arrow.`, "Connect an arrow from an earlier step into this shape.", { nodeId: n.id });
    if (n.type !== "end" && out[n.id].length === 0) add(`“${label(n)}” has no outgoing arrow.`, "Draw an arrow from this shape to the next step.", { nodeId: n.id });
    if (n.type === "decision") {
      if (out[n.id].length < 2) add(`Decision “${label(n)}” needs at least 2 branches.`, "A decision must split into two or more paths (e.g. Yes and No).", { nodeId: n.id });
      if (out[n.id].some((e) => !e.label || !e.label.trim())) add(`Every branch of decision “${label(n)}” must be labelled (e.g. Yes / No).`, "Double-click each arrow leaving the decision and name the choice.", { nodeId: n.id });
    }
  });

  // Every node must be able to reach an End (no dead ends / stranded paths).
  if (ends.length) {
    const canReach = new Set(ends.map((n) => n.id));
    let changed = true;
    while (changed) {
      changed = false;
      edges.forEach((e) => { if (canReach.has(e.to) && !canReach.has(e.from)) { canReach.add(e.from); changed = true; } });
    }
    nodes.forEach((n) => { if (!canReach.has(n.id)) add(`“${label(n)}” can’t reach an End.`, "Follow the arrows from here — they must eventually lead to an End shape.", { nodeId: n.id }); });
  }
  // De-duplicate by message.
  const seen = new Set();
  return errs.filter((e) => (seen.has(e.msg) ? false : (seen.add(e.msg), true)));
}

// Each ending gets its own neon so the chip in the bar and the glowing line on
// the canvas are obviously the same thing.
const FC_NEON = ["#00E0FF", "#FF2BD1", "#3DFF6E", "#FFB020", "#9D5CFF"];
const fcNeon = (i) => FC_NEON[i % FC_NEON.length];

// Everything that can still lead to one chosen End: a shape qualifies if it is
// reachable from the Start AND can reach that End; an arrow if its source is
// reachable from the Start and its target can reach that End. This is what lights
// the "No" detours — a No that loops back and eventually reaches the same ending
// belongs to it just as much as the direct Yes. Arrows that exit to a *different*
// ending are excluded, which is the whole point. Linear, and never capped.
function fcReachTo(nodes, edges, endId) {
  const start = nodes.find((n) => n.type === "start");
  if (!start || !nodes.some((n) => n.id === endId)) return null;
  const spread = (seedId, from, to) => {
    const seen = new Set([seedId]);
    let changed = true;
    while (changed) {
      changed = false;
      edges.forEach((e) => { if (seen.has(e[from]) && !seen.has(e[to])) { seen.add(e[to]); changed = true; } });
    }
    return seen;
  };
  const fromStart = spread(start.id, "from", "to");   // follow arrows forwards
  const toEnd = spread(endId, "to", "from");          // follow arrows backwards
  return {
    nodes: new Set(nodes.filter((n) => fromStart.has(n.id) && toEnd.has(n.id)).map((n) => n.id)),
    edges: new Set(edges.filter((e) => fromStart.has(e.from) && toEnd.has(e.to)).map((e) => e.id)),
  };
}

// Every distinct route from the Start to one chosen End, shortest first.
//
// One route per ending isn't enough: the shortest way to "hired" is all-Yes, and
// the shortest way to any rejection is the earliest No, so the retry branches (go
// back, re-post the job, review other candidates) would never be shown at all.
// The reader needs to step through each way of reaching the same outcome.
//
// A route never visits the same shape twice, which is what keeps loops finite —
// "review previous candidates" can send you round, but not round and round. `cap`
// stops a densely-connected chart from producing a silly number of routes.
function fcRoutesTo(nodes, edges, endId, cap = 40) {
  const start = nodes.find((n) => n.type === "start");
  if (!start || !nodes.some((n) => n.id === endId)) return [];

  const out = new Map();
  edges.forEach((e) => { if (!out.has(e.from)) out.set(e.from, []); out.get(e.from).push(e); });

  const found = [];
  const taken = [];                    // edges on the route being explored
  const onPath = new Set([start.id]);  // shapes already used, so we can't loop
  const walk = (id) => {
    if (found.length >= cap) return;
    if (id === endId) { found.push(taken.slice()); return; }
    for (const e of out.get(id) || []) {
      if (onPath.has(e.to)) continue;
      onPath.add(e.to); taken.push(e);
      walk(e.to);
      taken.pop(); onPath.delete(e.to);
    }
  };
  walk(start.id);

  found.sort((a, b) => a.length - b.length);
  return found.map((es) => ({
    nodes: new Set([start.id, ...es.map((e) => e.to)]),
    edges: new Set(es.map((e) => e.id)),
    // The branch names taken along the way, e.g. ["Yes", "No"] — this is what
    // tells the reader which route of several they're looking at.
    choices: es.map((e) => (e.label || "").trim()).filter(Boolean),
  }));
}

// --- Runtime branching (Phase A) --------------------------------------------
// Which nodes are actually "in play" given the decisions answered so far. This
// is the runtime twin of the diagram: routes/reachTo above LIGHT the picture,
// this one GATES what people see in My Work. A decision records the branch its
// assignee picked in `node.decisionChoice` (an outgoing edge label). Each edge is:
//   • "open"    — its source isn't a decision, OR the decision chose this branch
//   • "pending" — its source is a decision that hasn't been answered yet
//   • "closed"  — its source is a decision that chose a DIFFERENT branch
// and each node ends up:
//   • "active"  — reachable from Start over open edges alone (it's happening now)
//   • "pending" — reachable only if you also traverse pending edges (waiting on an
//                 upstream decision that hasn't been answered)
//   • "skipped" — every path to it is cut by a closed edge (branch not taken)
// Set-based fixpoint like reachTo, so retry-loops terminate safely. When a node is
// reachable by several paths (a join), any single open path makes it active — which
// is exactly what you want where two branches merge back together.
function fcEdgeState(edge, nodeById) {
  const src = nodeById[edge.from];
  if (!src || src.type !== "decision") return "open";
  const choice = (src.decisionChoice || "").trim();
  if (!choice) return "pending";
  return (edge.label || "").trim() === choice ? "open" : "closed";
}
function fcActiveSet(nodes, edges) {
  const status = {};
  const start = (nodes || []).find((n) => n.type === "start");
  if (!start) { (nodes || []).forEach((n) => { status[n.id] = "active"; }); return status; }
  const nodeById = {};
  nodes.forEach((n) => { nodeById[n.id] = n; });
  const states = (edges || []).map((e) => ({ e, s: fcEdgeState(e, nodeById) }));
  const spread = (allow) => {
    const seen = new Set([start.id]);
    let changed = true;
    while (changed) {
      changed = false;
      states.forEach(({ e, s }) => {
        if (allow(s) && seen.has(e.from) && !seen.has(e.to)) { seen.add(e.to); changed = true; }
      });
    }
    return seen;
  };
  const openReach = spread((s) => s === "open");
  const potentialReach = spread((s) => s === "open" || s === "pending");
  nodes.forEach((n) => {
    status[n.id] = openReach.has(n.id) ? "active" : potentialReach.has(n.id) ? "pending" : "skipped";
    // The HOD can hand-pick a single task off a branch that wasn't chosen: forceInclude
    // pulls just that node back into play (its own downstream stays skipped unless it too
    // is force-included). Overrides skipped/pending only — never demotes an active node.
    if (n.forceInclude && status[n.id] !== "active") status[n.id] = "active";
  });
  return status;
}
// Distinct, non-empty labels of the arrows leaving a decision — the choices its
// assignee picks between in My Work.
function fcBranchLabels(nodeId, edges) {
  const seen = [];
  (edges || []).forEach((e) => {
    if (e.from !== nodeId) return;
    const l = (e.label || "").trim();
    if (l && !seen.includes(l)) seen.push(l);
  });
  return seen;
}
// "Choosing a flow" is just committing one traced route. A route (from fcRoutesTo)
// passes through some decision nodes; at each it takes one labelled branch. This maps
// every decision the route crosses to the branch it takes: { [decisionId]: label }.
// Writing these onto the decision nodes' `decisionChoice` makes the existing fcActiveSet
// engine gate the Editor / Kanban / My Work to exactly that flow — no parallel system.
function fcRouteDecisionChoices(route, nodes, edges) {
  const choices = {};
  if (!route) return choices;
  const nodeById = {};
  (nodes || []).forEach((n) => { nodeById[n.id] = n; });
  (edges || []).forEach((e) => {
    if (!route.edges.has(e.id)) return;
    const src = nodeById[e.from];
    if (src && src.type === "decision") choices[e.from] = (e.label || "").trim();
  });
  return choices;
}
// A flow can only be committed cleanly if every decision it crosses takes a *labelled*
// branch — an unlabelled branch can't be recorded as a choice. Returns the ids of any
// decisions the route crosses on an unlabelled arrow (empty = safe to commit).
function fcRouteUnlabelled(route, nodes, edges) {
  const choices = fcRouteDecisionChoices(route, nodes, edges);
  return Object.keys(choices).filter((id) => !choices[id]);
}

const FC_SNAP = 11;
const FC_MIN = 44;   // smallest a shape can be resized to

// --- Task assignment helpers (HOD assigns each step; assignee completes it) ---
// Every shape except Start/End is a "task" that can be assigned and ticked off.
// Every non-terminal node is a task the HOD can assign and someone ticks off — including
// a decision (a Yes/No / Approved-Not approved fork). A decision that also has its
// branches labelled Approved / Not approved additionally gets a "Send for approval"
// email button in the editor (see isApprovalDecision), but it's still a task like any
// other: assignee, due date, subtasks, proof, My Work and reminders all apply.
function fcIsTask(n) { return n && n.type !== "start" && n.type !== "end"; }

function fcInitials(name) {
  if (!name || !name.trim()) return "?";
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || name[0].toUpperCase();
}

// Deterministic colour per person so their avatar/chip stays consistent.
const FC_AVATAR_COLORS = ["#3B6FB0", "#8E44AD", "#2E8B57", "#C0392B", "#B7791F", "#16A085", "#D35400"];
function fcAvatarColor(key) {
  let h = 0; const s = key || "";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return FC_AVATAR_COLORS[h % FC_AVATAR_COLORS.length];
}

function fcFmtDate(d) {
  if (!d) return "";
  const dt = new Date(`${d}T00:00:00`);
  if (isNaN(dt)) return "";
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Status of a task's due date relative to today (used for the on-canvas badge).
function fcDueMeta(due, done) {
  if (done) return { label: "Done", color: C.sageDeep, bg: "#E8F3EC" };
  if (!due) return { label: "No due date", color: C.slate, bg: C.paperDim };
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  const days = Math.round((d - now) / 86400000);
  if (days < 0) return { label: `Overdue ${-days}d`, color: "#B23A2E", bg: "#FBEAE8" };
  if (days === 0) return { label: "Due today", color: "#B23A2E", bg: "#FBEAE8" };
  if (days === 1) return { label: "Due tomorrow", color: "#B7791F", bg: "#FBF3E0" };
  return { label: `Due ${fcFmtDate(due)}`, color: C.slate, bg: C.paperDim };
}

// Per-step locks the HOD can set on a task: "wait for the previous step" (sequential)
// and "key step" (crucial — the assignee must read guidance and unlock it first).
// `tasks` must already be in running order (top-to-bottom). Returns info keyed by node
// id, shared by the flowchart editor and each assignee's My Work so they always agree.
// A task counts as "done" either when it was ticked off directly (a task with no
// subtasks), or AUTOMATICALLY once every subtask is done — no matter who each
// subtask belongs to. Shared everywhere so the flowchart, the editor list, the
// locks and each person's My Work always agree on completion.
function fcNodeDone(node) {
  const subs = node?.subtasks || [];
  if (subs.length > 0) return subs.every((s) => s.done);
  return !!node?.done;
}

// Process-Street-style form fields (capture-only): the HOD defines fields on a
// node; the assignee fills them in while doing the task. A field's answer is
// considered "filled" per its type. A node is form-complete only when every
// field flagged `required` has a non-empty answer — used to gate the assignee's
// mark-done action (locally, so it never touches fcNodeDone's global lock logic).
function fcFieldFilled(field, value) {
  if (value == null) return false;
  if (field.type === "multiselect") return Array.isArray(value) && value.length > 0;
  if (field.type === "checkbox") return value === true;
  if (field.type === "file") return !!value?.dataUrl;
  return String(value).trim() !== "";
}
function fcFormComplete(node) {
  return (node?.formFields || []).every((f) => !f.required || fcFieldFilled(f, node?.formValues?.[f.id]));
}
// A single form answer rendered as display text for {{token}} substitution.
function fcFieldDisplay(field, value) {
  if (!fcFieldFilled(field, value)) return undefined;
  if (field.type === "file") return value.name;
  if (field.type === "checkbox") return "Yes";
  if (field.type === "multiselect") return (Array.isArray(value) ? value : []).join(", ");
  if (field.type === "date") return fcFmtDate(String(value).slice(0, 10));
  return String(value);
}
// Builds a {token: value} map from every filled form answer across the given
// nodes, so an answer captured on one task ({{Client Name}}) auto-fills the text
// and emails of later tasks. Keyed by both the field's label ("Client Name") and
// a sanitised key ("client_name"); first non-empty answer wins on a collision.
function fcFormAnswerMap(nodes) {
  const map = {};
  (nodes || []).forEach((n) => {
    (n.formFields || []).forEach((f) => {
      const disp = fcFieldDisplay(f, n.formValues?.[f.id]);
      if (disp === undefined) return;
      const label = (f.label || "").trim();
      if (label && map[label] === undefined) map[label] = disp;
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (key && map[key] === undefined) map[key] = disp;
    });
  });
  return map;
}
// The full field-type catalogue offered in the editor (Phase 1: 10 types;
// Members + Table deferred). `input` types share one text-like <input>.
const FC_FIELD_TYPES = [
  { type: "text", label: "Short text" },
  { type: "longtext", label: "Long text" },
  { type: "date", label: "Date" },
  { type: "number", label: "Number" },
  { type: "dropdown", label: "Dropdown" },
  { type: "multiselect", label: "Multi-select" },
  { type: "checkbox", label: "Checkbox" },
  { type: "file", label: "File upload" },
  { type: "email", label: "Email" },
  { type: "url", label: "Link (URL)" },
];

/* ---------------------------------------------------------------
   PUBLIC (no-login) FORM LINKS
   The HOD attaches form fields to a node, then generates a shareable link to
   hand to someone OUTSIDE the org. That person opens the link, fills the form,
   and submits — the answers flow back into the node so the HOD sees them.

   LOCALHOST DEMO: the form record + submission live in this browser's
   localStorage (key `dt-public-forms`), so the link only works in the SAME
   browser. Making it work across devices needs a public backend endpoint + a
   database + real hosting (the deferred "Part B"). When that lands, only the
   read/write calls below change — the UX stays identical.
--------------------------------------------------------------- */
const PUBLIC_FORMS_KEY = "dt-public-forms";
function fcReadPublicForms() {
  try { return JSON.parse(localStorage.getItem(PUBLIC_FORMS_KEY) || "{}") || {}; } catch { return {}; }
}
function fcWritePublicForms(map) {
  try { localStorage.setItem(PUBLIC_FORMS_KEY, JSON.stringify(map)); } catch {}
}
function fcMakeFormToken() {
  return "pf-" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}
function fcPublicFormUrl(token) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?form=${encodeURIComponent(token)}`;
}

// The standalone page an external person sees. No login, no sidebar — just the
// form the HOD built. Rendered by App() before the login gate when the URL has
// a ?form=<token>.
function PublicFormPage({ token }) {
  const [record] = useState(() => fcReadPublicForms()[token] || null);
  const [values, setValues] = useState(() => fcReadPublicForms()[token]?.values || {});
  const [submitted, setSubmitted] = useState(() => !!fcReadPublicForms()[token]?.submittedAt);
  const [error, setError] = useState("");
  const fields = record?.fields || [];
  const setVal = (id, v) => { setValues((s) => ({ ...s, [id]: v })); setError(""); };

  const readFile = (file, cb) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { alert("That file is larger than 4 MB — please choose a smaller image or PDF."); return; }
    const reader = new FileReader();
    reader.onload = () => cb({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result, at: new Date().toISOString() });
    reader.readAsDataURL(file);
  };

  const submit = () => {
    const missing = fields.filter((f) => f.required && !fcFieldFilled(f, values[f.id]));
    if (missing.length) { setError(`Please fill in the ${missing.length} required field${missing.length > 1 ? "s" : ""} marked *.`); return; }
    const map = fcReadPublicForms();
    const rec = map[token];
    if (!rec) { setError("This form is no longer available."); return; }
    rec.values = values;
    rec.submittedAt = new Date().toISOString();
    map[token] = rec;
    fcWritePublicForms(map);
    setSubmitted(true);
  };

  const inp = { width: "100%", fontFamily: "'Work Sans', sans-serif", fontSize: 14, color: C.ink, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 9, padding: "10px 12px", outline: "none", boxSizing: "border-box" };
  const opts = (f) => (f.options || []).map((o) => o.trim()).filter(Boolean);
  const renderInput = (f) => {
    const val = values[f.id];
    switch (f.type) {
      case "longtext": return <textarea value={val || ""} onChange={(e) => setVal(f.id, e.target.value)} rows={4} placeholder="Type your answer…" style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />;
      case "date": return <input type="date" value={val || ""} onChange={(e) => setVal(f.id, e.target.value)} style={inp} />;
      case "number": return <input type="number" value={val ?? ""} onChange={(e) => setVal(f.id, e.target.value)} placeholder="Enter a number…" style={inp} />;
      case "email": return <input type="email" value={val || ""} onChange={(e) => setVal(f.id, e.target.value)} placeholder="name@email.com" style={inp} />;
      case "url": return <input type="url" value={val || ""} onChange={(e) => setVal(f.id, e.target.value)} placeholder="https://…" style={inp} />;
      case "dropdown": return (
        <select value={val || ""} onChange={(e) => setVal(f.id, e.target.value)} style={{ ...inp, cursor: "pointer" }}>
          <option value="">Choose…</option>
          {opts(f).map((o, i) => <option key={i} value={o}>{o}</option>)}
        </select>
      );
      case "multiselect": {
        const arr = Array.isArray(val) ? val : [];
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {opts(f).map((o, i) => (
              <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'Work Sans', sans-serif", fontSize: 14, color: C.ink, cursor: "pointer" }}>
                <input type="checkbox" checked={arr.includes(o)} onChange={(e) => setVal(f.id, e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} style={{ accentColor: C.spotlight, cursor: "pointer" }} /> {o}
              </label>
            ))}
          </div>
        );
      }
      case "checkbox": return (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'Work Sans', sans-serif", fontSize: 14, color: C.ink, cursor: "pointer" }}>
          <input type="checkbox" checked={val === true} onChange={(e) => setVal(f.id, e.target.checked)} style={{ accentColor: C.spotlight, cursor: "pointer" }} /> Yes
        </label>
      );
      case "file": return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 9, padding: "9px 13px", cursor: "pointer", fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600, color: C.spotlight }}>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => { const file = e.target.files?.[0]; if (file) readFile(file, (p) => setVal(f.id, p)); e.target.value = ""; }} style={{ display: "none" }} />
            {val?.dataUrl ? <Paperclip size={14} /> : <Upload size={14} />} {val?.dataUrl ? "Replace file" : "Upload file"}
          </label>
          {val?.dataUrl && <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, wordBreak: "break-all" }}>{val.name}</span>}
        </div>
      );
      default: return <input value={val || ""} onChange={(e) => setVal(f.id, e.target.value)} placeholder="Type your answer…" style={inp} />;
    }
  };

  const shell = (children) => (
    <div style={{ minHeight: "100vh", background: C.paperDim, display: "flex", justifyContent: "center", padding: "40px 18px", fontFamily: "'Work Sans', sans-serif", boxSizing: "border-box" }}>
      <style>{FONTS}</style>
      <div style={{ width: "100%", maxWidth: 560 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18, paddingLeft: 2 }}>
          <img src="/dr_doom_logo.png" style={{ width: 22, height: 22, objectFit: "contain" }} />
          <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16, color: C.ink }}>Flowghan</span>
        </div>
        {children}
        <div style={{ textAlign: "center", marginTop: 22, fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.slateLight }}>Secure form · powered by Flowghan</div>
      </div>
    </div>
  );

  const card = { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 16, padding: "26px 26px 30px", boxShadow: "0 8px 30px rgba(0,0,0,0.06)" };

  if (!record) return shell(
    <div style={{ ...card, textAlign: "center" }}>
      <AlertTriangle size={30} color={C.spotlightDeep} style={{ margin: "0 auto 12px", display: "block" }} />
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 21, color: C.ink, margin: "0 0 8px" }}>This form link isn't valid</h1>
      <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 14, color: C.slate, lineHeight: 1.55, margin: 0 }}>The link may be broken, or it was created in a different browser. Ask the person who sent it for a fresh link.</p>
    </div>
  );

  if (submitted) return shell(
    <div style={{ ...card, textAlign: "center" }}>
      <CheckCircle2 size={34} color={C.sageDeep} style={{ margin: "0 auto 12px", display: "block" }} />
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: C.ink, margin: "0 0 8px" }}>Thank you — submitted!</h1>
      <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 14, color: C.slate, lineHeight: 1.55, margin: 0 }}>Your details for <b>{record.title}</b> have been sent{record.org ? <> to {record.org}</> : null}. You can close this page.</p>
    </div>
  );

  return shell(
    <div style={card}>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 23, color: C.ink, margin: "0 0 6px", lineHeight: 1.25 }}>{record.title}</h1>
      <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13.5, color: C.slate, lineHeight: 1.55, margin: "0 0 22px" }}>
        {record.intro?.trim() ? record.intro : "Please fill in the details below and submit."}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {fields.map((f) => (
          <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13.5, fontWeight: 600, color: C.inkSoft }}>
              {f.label || "Field"}{f.required && <span style={{ color: "#B23A2E" }}> *</span>}
            </label>
            {renderInput(f)}
          </div>
        ))}
      </div>
      {error && <div style={{ marginTop: 16, fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: "#B23A2E", fontWeight: 600 }}>{error}</div>}
      <button onClick={submit} style={{ marginTop: 24, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: C.spotlight, color: "#fff", border: "none", borderRadius: 10, padding: "12px 16px", cursor: "pointer", fontFamily: "'Work Sans', sans-serif", fontSize: 15, fontWeight: 600 }}>
        <Send size={16} /> Submit
      </button>
    </div>
  );
}

function fcLockInfo(tasks) {
  const info = {};
  tasks.forEach((n, i) => {
    const prevTask = i > 0 ? tasks[i - 1] : null;
    const lockedByPrev = !!n.lockPrev && !!prevTask && !fcNodeDone(prevTask);
    const lockedByKey = !!n.keyStep && !n.keyAck;
    const locked = !fcNodeDone(n) && (lockedByPrev || lockedByKey);
    const lockReason = lockedByPrev
      ? `Locked until step ${i} “${prevTask?.label || "the previous step"}” is ticked off.`
      : lockedByKey ? "Key step — read the guidance, then unlock it to start." : "";
    info[n.id] = { prevTask, lockedByPrev, lockedByKey, locked, lockReason, index: i };
  });
  return info;
}

// Generates the three escalation emails for one assigned task.
function fcTaskEmails(node, org, template, vars = {}) {
  if (!node.assignee?.email || !node.due) return [];
  const name = interpolateVariables(node.label || "task", vars);
  const who = node.assignee.name || node.assignee.email;
  const what = interpolateVariables(
    (node.instructions && node.instructions.trim())
      || `Complete the “${name}” step in the ${template.module} workflow “${template.name}”.`,
    vars);
  const due = fcFmtDate(node.due);
  const hod = org.hod || {}, ceo = org.ceo || {};
  return [
    {
      tier: 1, trigger: "On assignment",
      to: [node.assignee.email].filter(Boolean),
      subject: `New task assigned: ${name}`,
      body: `Hi ${who},\n\nYou've been assigned a task in “${template.name}” (${template.module}).\n\nTask: ${name}\nWhat to do: ${what}\nDue: ${due}\n\nWhen it's finished, tick it off in Flowghan — you'll need to attach proof (a screenshot or file) to mark it done.`,
    },
    {
      tier: 2, trigger: "24 hours before due",
      to: [node.assignee.email].filter(Boolean),
      subject: `Reminder: “${name}” is due in 24 hours`,
      body: `Hi ${who},\n\nA reminder that your task “${name}” (${template.name}) is due on ${due} — less than 24 hours away.\n\nPlease make sure it's completed and ticked off in Flowghan before the deadline.`,
    },
    {
      tier: 3, trigger: "After the due date, if still not done",
      to: [node.assignee.email, hod.email].filter(Boolean),
      subject: `Overdue: “${name}” has passed its due date`,
      body: `Hi ${who},\n\nYour task “${name}” (${template.name}) was due on ${due} and has not been marked done.\n\n${hod.name || "The HOD"} has been notified. Please complete it and attach proof in Flowghan as soon as possible.`,
    },
    {
      tier: 4, trigger: "Escalation to CEO if still overdue",
      to: [ceo.email].filter(Boolean),
      subject: `Escalation: “${name}” is overdue`,
      body: `Hello ${ceo.name || "CEO"},\n\nThe task “${name}” in “${template.name}” (${template.module}), assigned to ${who}, is past its due date of ${due} and remains incomplete despite reminders to the assignee and ${hod.name || "the HOD"}.\n\nEscalating for your awareness and further action.`,
    },
  ];
}

// Ready-made "please approve my work" email the HOD sends straight to a chosen
// approver. Used on any step — especially an Approved / Not-approved decision —
// and on individual subtasks. Returns { to, subject, body } for sendEmailNow.
function fcApprovalEmail({ approverName, approverEmail, itemName, template, workNote, vars = {} }) {
  const to = [approverEmail].filter(Boolean);
  const who = approverName || approverEmail || "there";
  const item = interpolateVariables(itemName, vars);
  const what = interpolateVariables(
    (workNote && workNote.trim())
      || `the “${item}” step in the ${template.module} workflow “${template.name}”`,
    vars);
  return {
    to,
    subject: `Approval needed: “${item}”`,
    body: `Hi ${who},\n\nThe work for ${what} is ready for your review.\n\nPlease reply to this email with your decision:\n  • APPROVED — it can move forward, or\n  • NOT APPROVED — and note what needs to change.\n\nThank you,\n${template.name} (via Flowghan)`,
  };
}

// Where each reminder stands right now, for the Outbox preview.
function fcEmailStatus(tier, node) {
  if (tier === 1) return { text: "Sent on assignment", tone: "sent" };
  if (fcNodeDone(node)) return { text: "Not needed — task completed", tone: "muted" };
  const now = new Date();
  const due = new Date(`${node.due}T00:00:00`);
  if (tier === 2) {
    const t = new Date(due.getTime() - 24 * 3600 * 1000);
    return now >= t ? { text: "Sent", tone: "sent" } : { text: `Scheduled for ${fcFmtDate(node.due)} − 24h`, tone: "scheduled" };
  }
  if (tier === 3) {
    return now > due ? { text: "Sent — overdue notice", tone: "alert" } : { text: `Scheduled if overdue after ${fcFmtDate(node.due)}`, tone: "scheduled" };
  }
  return now > due ? { text: "Sent — escalated to CEO", tone: "alert" } : { text: `Scheduled if still overdue`, tone: "scheduled" };
}

// Right-angle (orthogonal) connector between two shapes, draw.io style.
// Returns the SVG path string plus the midpoint for the branch label.
function fcEdgeGeometry(a, b) {
  const sa = fcNodeSize(a), sb = fcNodeSize(b);
  const ac = { x: a.x + sa.w / 2, y: a.y + sa.h / 2 };
  const bc = { x: b.x + sb.w / 2, y: b.y + sb.h / 2 };
  const dx = bc.x - ac.x, dy = bc.y - ac.y;
  let pts, mid;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const sx = dx >= 0 ? a.x + sa.w : a.x;
    const ex = dx >= 0 ? b.x : b.x + sb.w;
    const start = { x: sx, y: ac.y }, end = { x: ex, y: bc.y };
    const mx = (sx + ex) / 2;
    pts = [start, { x: mx, y: start.y }, { x: mx, y: end.y }, end];
    mid = { x: mx, y: (start.y + end.y) / 2 };
  } else {
    const sy = dy >= 0 ? a.y + sa.h : a.y;
    const ey = dy >= 0 ? b.y : b.y + sb.h;
    const start = { x: ac.x, y: sy }, end = { x: bc.x, y: ey };
    const my = (sy + ey) / 2;
    pts = [start, { x: start.x, y: my }, { x: end.x, y: my }, end];
    mid = { x: (start.x + end.x) / 2, y: my };
  }
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + " " + p.x + " " + p.y).join(" ");
  return { d, mid };
}

// --- Export ---------------------------------------------------------------
// The chart on screen is DOM — divs with CSS borders and transforms, over an SVG
// layer — so it can't be handed to a file as-is. Everything below redraws the same
// chart as one standalone SVG. That SVG *is* the .svg export, and it's also what
// the PNG and the PDF are rasterised from, so all three agree with each other.

const FC_FONT = "'Work Sans', 'Segoe UI', Arial, sans-serif";
const fcEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// SVG has no line-breaking of its own, so a label that the browser wraps inside a
// box has to be split by hand here. Widths come from a real measurement rather than
// a guess at average character width, or long labels would spill out of the shape.
let fcMeasureCtx = null;
function fcTextWidth(s, weight, size) {
  if (!fcMeasureCtx) fcMeasureCtx = document.createElement("canvas").getContext("2d");
  fcMeasureCtx.font = `${weight} ${size}px ${FC_FONT}`;
  return fcMeasureCtx.measureText(s).width;
}
function fcWrap(text, maxW, weight, size) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (cur && fcTextWidth(test, weight, size) > maxW) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

// The whole chart as one self-contained SVG string. `route`/`reach`/`traceColor`
// are optional: when a route is lit on the canvas, the export carries the same
// glow, so you can export "the path to Hire" and not just the raw chart.
function fcToSvg(nodes, edges, { route, reach, traceColor, vars = {} } = {}) {
  const b = fcBounds(nodes);
  if (!b) return null;
  const pad = 40;
  const W = Math.ceil(b.w + pad * 2), H = Math.ceil(b.h + pad * 2);
  // Shift the drawing so the top-left shape sits at `pad` instead of wherever it
  // happened to be on the canvas — an export shouldn't inherit the canvas's origin.
  const ox = pad - b.minX, oy = pad - b.minY;
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  o.push(`<rect width="${W}" height="${H}" fill="#FFFFFF"/>`);
  o.push(`<defs>`);
  o.push(`<marker id="fx-a" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,3 L0,6 Z" fill="${C.slate}"/></marker>`);
  if (traceColor) o.push(`<marker id="fx-an" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,3 L0,6 Z" fill="${traceColor}"/></marker>`);
  o.push(`<filter id="fx-g" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/></feMerge></filter>`);
  o.push(`</defs><g transform="translate(${ox},${oy})">`);

  edges.forEach((e) => {
    const a = nodes.find((n) => n.id === e.from);
    const z = nodes.find((n) => n.id === e.to);
    if (!a || !z) return;
    const { d, mid } = fcEdgeGeometry(a, z);
    const onRoute = !!route && route.edges.has(e.id);
    const canLead = !onRoute && !!reach && reach.edges.has(e.id);
    if (onRoute && traceColor) {
      o.push(`<path d="${d}" fill="none" stroke="${traceColor}" stroke-width="9" opacity="0.5" stroke-linecap="round" filter="url(#fx-g)"/>`);
      o.push(`<path d="${d}" fill="none" stroke="${traceColor}" stroke-width="3.2" stroke-linecap="round" marker-end="url(#fx-an)"/>`);
      // The travelling dashes are an animation on screen; in a still they'd read as
      // a broken line, so the exported route is drawn solid.
    } else if (canLead && traceColor) {
      o.push(`<g opacity="0.5"><path d="${d}" fill="none" stroke="${traceColor}" stroke-width="6" opacity="0.35" stroke-linecap="round" filter="url(#fx-g)"/><path d="${d}" fill="none" stroke="${traceColor}" stroke-width="2.2" stroke-linecap="round" marker-end="url(#fx-an)"/></g>`);
    } else {
      o.push(`<path d="${d}" fill="none" stroke="${C.slate}" stroke-width="1.6" marker-end="url(#fx-a)"/>`);
    }
    if (e.label) {
      const tw = fcTextWidth(e.label, 600, 11);
      o.push(`<rect x="${mid.x - tw / 2 - 6}" y="${mid.y - 10}" width="${tw + 12}" height="19" rx="5" fill="#FFFFFF" stroke="${C.line}"/>`);
      o.push(`<text x="${mid.x}" y="${mid.y + 3.5}" text-anchor="middle" font-family="${FC_FONT}" font-size="11" font-weight="600" fill="${C.inkSoft}">${fcEsc(e.label)}</text>`);
    }
  });

  const nodeNums = fcNodeNumbers(nodes, edges);
  nodes.forEach((n) => {
    const meta = FC_META[n.type];
    const { w, h } = fcNodeSize(n);
    const cx = n.x + w / 2, cy = n.y + h / 2;
    const onRoute = !!route && route.nodes.has(n.id);
    const canLead = !onRoute && !!reach && reach.nodes.has(n.id);
    // Same geometry as the CSS: pills for start/end, a 45° rotated box for a
    // decision, a skewed box for input/output. CSS transforms pivot on the centre,
    // so the SVG equivalents are written about (cx, cy) explicitly.
    const round = n.type === "start" || n.type === "end" ? h / 2 : 8;
    const tf = n.type === "decision" ? ` transform="rotate(45 ${cx} ${cy})"`
      : n.type === "io" ? ` transform="translate(${cx} ${cy}) skewX(-18) translate(${-cx} ${-cy})"` : "";
    const box = (fill, stroke, sw, extra) => `<rect x="${n.x}" y="${n.y}" width="${w}" height="${h}" rx="${round}" ry="${round}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${extra || ""}${tf}/>`;
    // A CSS box-shadow has no SVG equivalent. On the canvas a lit shape keeps its own
    // border and gains a neon ring plus a halo around it, so that's rebuilt in layers:
    // blurred halo, solid ring, then the shape itself — border colour unchanged.
    if (onRoute && traceColor) {
      o.push(box("none", traceColor, 8, ` opacity="0.55" filter="url(#fx-g)"`));
      o.push(box("none", traceColor, 5, ""));
    } else if (canLead && traceColor) {
      o.push(box("none", traceColor, 5, ` opacity="0.3" filter="url(#fx-g)"`));
      o.push(box("none", traceColor, 3.5, ` opacity="0.6"`));
    }
    o.push(box(meta.bg, meta.border, 2));

    const padT = n.type === "decision" ? 18 : 10;
    const lines = fcWrap(interpolateVariables(fcNodeText(n, meta.name, nodeNums), vars), w - padT * 2, 600, 12.5);
    const lh = 15;
    const y0 = cy - ((lines.length - 1) * lh) / 2 + 4.4;   // 4.4 ≈ centring the cap-height
    lines.forEach((ln, i) => {
      o.push(`<text x="${cx}" y="${y0 + i * lh}" text-anchor="middle" font-family="${FC_FONT}" font-size="12.5" font-weight="600" fill="${meta.border}">${fcEsc(ln)}</text>`);
    });
  });

  o.push(`</g></svg>`);
  return o.join("");
}

// Rasterise the export SVG. The SVG goes through an <img>, which is an isolated
// document — it cannot reach the page's webfont, so the raster falls back to the
// system sans in the font stack. `scale` oversamples so text stays sharp.
function fcSvgToCanvas(svg, scale = 2) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(img.width * scale));
        cv.height = Math.max(1, Math.round(img.height * scale));
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv);
      } catch (err) { reject(err); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The browser could not render the chart to an image.")); };
    img.src = url;
  });
}

// zlib-compress, which is exactly what a PDF's /FlateDecode expects.
async function fcDeflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Build a one-page PDF around the rendered chart, by hand.
//
// Hand-written because the alternative was adding a PDF library, and this project's
// package.json doesn't declare its own dependencies — an `npm install` here can
// prune the packages the app actually runs on. The image goes in losslessly
// (/FlateDecode over raw RGB), so the PDF is as sharp as the PNG rather than
// carrying JPEG artefacts across every label.
async function fcPdfFromCanvas(cv) {
  const { data } = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height);
  const w = cv.width, h = cv.height;
  // RGBA -> RGB, flattened onto white. PDF images have no alpha channel of their own.
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const a = data[i + 3] / 255;
    rgb[j] = Math.round(data[i] * a + 255 * (1 - a));
    rgb[j + 1] = Math.round(data[i + 1] * a + 255 * (1 - a));
    rgb[j + 2] = Math.round(data[i + 2] * a + 255 * (1 - a));
  }
  const img = await fcDeflate(rgb);

  // The page is sized to the chart, not the other way round — same as the PNG and
  // SVG exports. Forcing a fixed A4 shrank a tall workflow into a corner with the
  // rest scrolling below the fold; a flowchart isn't an A4 document, it's a diagram,
  // so the page takes the diagram's own shape and all of it shows at once. The raster
  // is 2x, so half a raster pixel = one point maps the chart back to roughly life-size;
  // scale is only ever reduced, to keep the page under the PDF/Acrobat 14400pt limit.
  const margin = 20;
  const pt = Math.min(0.5, (14400 - margin * 2) / Math.max(w, h));
  const dw = +(w * pt).toFixed(2), dh = +(h * pt).toFixed(2);
  const PW = +(dw + margin * 2).toFixed(2), PH = +(dh + margin * 2).toFixed(2);
  const dx = margin, dy = margin;

  const bytes = (str) => { const u = new Uint8Array(str.length); for (let i = 0; i < str.length; i++) u[i] = str.charCodeAt(i) & 0xff; return u; };
  const parts = [];
  let len = 0;
  const push = (u) => { parts.push(u); len += u.length; };
  const offsets = [];
  const obj = (n, dict, stream) => {
    offsets[n] = len;                       // byte offset of "N 0 obj" — the xref entry
    push(bytes(`${n} 0 obj\n${dict}\n`));
    if (stream) { push(bytes("stream\n")); push(stream); push(bytes("\nendstream\n")); }
    push(bytes("endobj\n"));
  };

  const content = bytes(`q ${dw} 0 0 ${dh} ${dx} ${dy} cm /Im0 Do Q`);
  push(bytes("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"));   // binary marker: keeps FTP-style tools from mangling it
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${img.length} >>`, img);
  obj(5, `<< /Length ${content.length} >>`, content);

  const xref = len;
  let table = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) table += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(bytes(table));
  push(bytes(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));

  const out = new Uint8Array(len);
  let at = 0;
  parts.forEach((p) => { out.set(p, at); at += p.length; });
  return new Blob([out], { type: "application/pdf" });
}

function fcDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A read-only, fit-to-screen look at the finished workflow.
//
// The editing canvas shares its row with the shape palette and the inspector, so a
// large chart only ever fits there at a zoom where the labels are unreadable — you
// end up zooming in to read a step and back out to find the next one. This gives the
// chart the whole window and scales it once so all of it lands on screen: nothing to
// pan, nothing to zoom, nothing to accidentally drag out of place.
//
// Trace state is passed in rather than kept here, so the route you lit on the canvas
// is still lit in the preview, and still lit when you close it.
function FcPreview({ nodes, edges, name, endNodes, traceEnd, setTraceEnd, routes, routeIdx, setRouteIdx, route, reach, traceColor, routeSteps, vars = {}, onClose }) {
  const stageRef = useRef(null);
  // Same auto flow-order "1.0 / 2.0 / …" numbering the editor canvas shows on every node.
  const fcNodeNums = useMemo(() => fcNodeNumbers(nodes, edges), [nodes, edges]);
  const [stage, setStage] = useState(null);   // measured stage box; null until first measure
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bounds = useMemo(() => fcBounds(nodes), [nodes]);
  // Scale so the whole chart lands inside the stage. Unlike the canvas's own fit,
  // this has no lower clamp — a chart too big to fit at 40% is exactly the chart
  // this view exists for. The upper clamp stops a three-shape chart from ballooning.
  const fit = useMemo(() => {
    if (!stage || !bounds || !bounds.w || !bounds.h) return null;
    const pad = 56;
    return Math.min(1.5, (stage.w - pad * 2) / bounds.w, (stage.h - pad * 2) / bounds.h);
  }, [stage, bounds]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(24,24,24,0.94)", display: "flex", flexDirection: "column", padding: 18, gap: 12 }}
    >
      {/* Header — name on the left, the same ending chips as the canvas, Close on the right. */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 600, color: "#fff", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</h2>
          <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.55)", margin: "2px 0 0" }}>
            Whole workflow, fit to screen · read-only
          </p>
        </div>
        {endNodes.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, overflowX: "auto", minWidth: 0 }}>
            {endNodes.map((n, i) => {
              const on = traceEnd === n.id;
              const neon = fcNeon(i);
              return (
                <button
                  key={n.id}
                  onClick={() => setTraceEnd(on ? null : n.id)}
                  title={on ? "Click again to turn the route off" : `Light up the route from Start to “${n.label || "End"}”`}
                  style={{
                    display: "flex", alignItems: "center", gap: 7, flexShrink: 0, cursor: "pointer",
                    background: on ? "#fff" : "rgba(255,255,255,0.08)",
                    border: `1.5px solid ${on ? neon : "rgba(255,255,255,0.22)"}`,
                    borderRadius: 999, padding: "5px 12px",
                    fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600,
                    color: on ? C.ink : "rgba(255,255,255,0.8)",
                    boxShadow: on ? `0 0 0 2px ${neon}44, 0 0 12px ${neon}88` : "none",
                  }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: 999, flexShrink: 0, background: neon, boxShadow: `0 0 6px ${neon}` }} />
                  {n.label || "End"}
                </button>
              );
            })}
          </div>
        )}
        {traceEnd && route && routes.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            <button onClick={() => setRouteIdx((i) => (i - 1 + routes.length) % routes.length)} title="Previous route to this ending" style={{ ...fcPrevBtn }}><ChevronLeft size={14} /></button>
            <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#fff", whiteSpace: "nowrap" }}>Route {routeIdx + 1} of {routes.length}</span>
            <button onClick={() => setRouteIdx((i) => (i + 1) % routes.length)} title="Next route to this ending" style={{ ...fcPrevBtn }}><ChevronRight size={14} /></button>
          </div>
        )}
        {traceEnd && route && (
          <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap", flexShrink: 0 }}>
            {routeSteps} step{routeSteps === 1 ? "" : "s"}{route.choices.length ? ` · ${route.choices.join(" › ")}` : ""}
          </span>
        )}
        <button onClick={onClose} title="Close the preview (Esc)" style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: "auto", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, cursor: "pointer", padding: "7px 12px", fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: "#fff" }}>
          <X size={14} /> Close
        </button>
      </div>

      {/* Stage — the chart, scaled once to fit. */}
      <div
        ref={stageRef}
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", flex: 1, minHeight: 0, background: C.card, borderRadius: 12, overflow: "hidden", backgroundImage: "radial-gradient(circle, #E2E2E2 1px, transparent 1px)", backgroundSize: "22px 22px" }}
      >
        {fit && bounds && (
          <div style={{
            position: "absolute", top: 0, left: 0, transformOrigin: "0 0",
            transform: `translate(${(stage.w - bounds.w * fit) / 2 - bounds.minX * fit}px, ${(stage.h - bounds.h * fit) / 2 - bounds.minY * fit}px) scale(${fit})`,
          }}>
            {/* Sized to cover the chart's own coordinates — the shapes sit at their
                canvas x/y, so the canvas origin is still the origin here. */}
            <svg width={bounds.minX + bounds.w + 200} height={bounds.minY + bounds.h + 200}
                 style={{ position: "absolute", top: 0, left: 0, overflow: "visible", pointerEvents: "none" }}>
              <defs>
                <marker id="fcp-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L8,3 L0,6 Z" fill={C.slate} />
                </marker>
                {traceColor && (
                  <marker id="fcp-arrow-neon" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L8,3 L0,6 Z" fill={traceColor} />
                  </marker>
                )}
                <filter id="fcp-glow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /></feMerge>
                </filter>
              </defs>
              {edges.map((e) => {
                const a = nodes.find((n) => n.id === e.from);
                const b = nodes.find((n) => n.id === e.to);
                if (!a || !b) return null;
                const { d, mid } = fcEdgeGeometry(a, b);
                const onRoute = !!route && route.edges.has(e.id);
                const canLead = !onRoute && !!reach && reach.edges.has(e.id);
                return (
                  <g key={e.id}>
                    {onRoute ? (
                      <>
                        <path d={d} fill="none" stroke={traceColor} strokeWidth={9} opacity={0.5} strokeLinecap="round" filter="url(#fcp-glow)" />
                        <path d={d} fill="none" stroke={traceColor} strokeWidth={3.2} strokeLinecap="round" markerEnd="url(#fcp-arrow-neon)" />
                        <path d={d} fill="none" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" opacity={0.85} strokeDasharray="7 12" className="fc-flow" />
                      </>
                    ) : canLead ? (
                      <g opacity={0.5}>
                        <path d={d} fill="none" stroke={traceColor} strokeWidth={6} opacity={0.35} strokeLinecap="round" filter="url(#fcp-glow)" />
                        <path d={d} fill="none" stroke={traceColor} strokeWidth={2.2} strokeLinecap="round" markerEnd="url(#fcp-arrow-neon)" />
                      </g>
                    ) : (
                      <path d={d} fill="none" stroke={C.slate} strokeWidth={1.6} markerEnd="url(#fcp-arrow)" />
                    )}
                    {e.label && (
                      <g>
                        <rect x={mid.x - e.label.length * 3.7 - 6} y={mid.y - 10} width={e.label.length * 7.4 + 12} height={19} rx={5} fill="#fff" stroke={C.line} />
                        <text x={mid.x} y={mid.y + 3.5} textAnchor="middle" fontFamily="'Work Sans', sans-serif" fontSize="11" fontWeight="600" fill={C.inkSoft}>{e.label}</text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
            {nodes.map((n) => {
              const meta = FC_META[n.type];
              const { w, h } = fcNodeSize(n);
              const onRoute = !!route && route.nodes.has(n.id);
              const canLead = !onRoute && !!reach && reach.nodes.has(n.id);
              return (
                <div key={n.id} style={{ position: "absolute", left: n.x, top: n.y, width: w, height: h, userSelect: "none" }}>
                  <div style={{
                    position: "absolute", inset: 0, background: meta.bg,
                    border: `2px solid ${meta.border}`,
                    borderRadius: n.type === "start" || n.type === "end" ? 999 : 8,
                    transform: n.type === "decision" ? "rotate(45deg)" : n.type === "io" ? "skewX(-18deg)" : "none",
                    boxShadow: onRoute ? `0 0 0 3px ${traceColor}, 0 0 18px ${traceColor}AA`
                      : canLead ? `0 0 0 2px ${traceColor}99, 0 0 10px ${traceColor}55`
                      : "0 1px 3px rgba(0,0,0,0.08)",
                  }} />
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: n.type === "decision" ? 18 : 10, textAlign: "center", fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: meta.border, lineHeight: 1.2, overflow: "hidden" }}>
                    {interpolateVariables(fcNodeText(n, meta.name, fcNodeNums), vars)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
const fcPrevBtn = { display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, background: "transparent", border: "none", borderRadius: 6, cursor: "pointer", color: "rgba(255,255,255,0.8)" };

function FlowchartCanvas({ template, onBack, onRename, onSave, onDuplicate }) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(template.name);
  const [nodes, setNodes] = useState(template.flowchart?.nodes ?? []);
  const [edges, setEdges] = useState(template.flowchart?.edges ?? []);
  // Template-level "fill once" variables: the HOD defines {{key}} tokens with a value,
  // and they resolve inside node text, reminder emails and approval emails. Stored on the
  // flowchart blob so the existing onSave carries them.
  const [variables, setVariables] = useState(template.flowchart?.variables ?? []);
  // The one route the HOD has committed as "the" workflow (an End node id), or null
  // while none is chosen. Committing also writes decisionChoice onto the decisions the
  // route crosses, so fcActiveSet narrows Editor / Kanban / My Work to this flow. Stored
  // on the flowchart blob so the existing onSave carries it.
  const [chosenEnd, setChosenEnd] = useState(template.flowchart?.chosenEnd ?? null);
  // While a flow is chosen, the Editor/Kanban show only its tasks; this reveals the
  // off-branch ones again so the HOD can pull one in ("include anyway").
  const [showOffBranch, setShowOffBranch] = useState(false);
  const [confirmFlow, setConfirmFlow] = useState(null);  // route pending double-confirm: { end, route }
  const [selNodes, setSelNodes] = useState([]);   // multi-selection of shape ids
  const setSelNode = (id) => setSelNodes(id == null ? [] : [id]);
  const selNode = selNodes.length === 1 ? selNodes[0] : null;
  const [selEdge, setSelEdge] = useState(null);
  const [boxRect, setBoxRect] = useState(null);   // rubber-band selection rectangle
  const [hoverId, setHoverId] = useState(null);
  const [link, setLink] = useState(null);       // active drag-to-connect: { from, sx, sy, x, y }
  const [editing, setEditing] = useState(null);  // inline label edit: { kind: "node"|"edge", id }
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [guides, setGuides] = useState([]);   // alignment guide lines while dragging
  const [traceEnd, setTraceEnd] = useState(null);   // id of the End shape whose route is highlighted
  const [routeIdx, setRouteIdx] = useState(0);      // which of that ending's routes is lit
  const [preview, setPreview] = useState(false);    // full-window, fit-to-screen read of the whole chart
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(null); // "png" | "pdf" | "svg" while a file is being made
  const canvasRef = useRef(null);
  const drag = useRef(null);
  const resize = useRef(null);     // active resize gesture
  const pan = useRef(null);        // active pan gesture
  const box = useRef(null);        // active rubber-band select gesture
  const clipboard = useRef(null);  // copied shapes { nodes, edges }
  const firstRender = useRef(true);
  const editorRefs = useRef({});           // task/subtask cards, so the index can jump to them
  const [flashItem, setFlashItem] = useState(null);   // briefly highlight the item we jumped to
  const [openTasks, setOpenTasks] = useState({});     // which task rows are expanded in the Task List
  const toggleTaskOpen = (id) => setOpenTasks((o) => ({ ...o, [id]: !o[id] }));
  const jumpToItem = (key) => {
    const el = editorRefs.current[key];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashItem(key);
    setTimeout(() => setFlashItem((k) => (k === key ? null : k)), 1400);
  };
  // --- Task assignment / reminders ---
  const [fcMode, setFcMode] = useState("flowchart");   // "flowchart" (plan) | "editor" (assign)
  const [org, setOrg] = useState({ hod: { name: "", email: "" }, ceo: { name: "", email: "" } });
  const [proofFor, setProofFor] = useState(null);   // node id whose proof modal is open
  const [pendingProof, setPendingProof] = useState(null);  // file chosen in the proof modal
  const [showOutbox, setShowOutbox] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [sendState, setSendState] = useState({});   // `${nodeId}-${tier}` -> "sending" | "sent" | "error"

  // Fire a real reminder email through the backend so you can confirm it arrives.
  const sendEmailNow = async (key, em) => {
    if (!em.to.length || sendState[key] === "sending") return;
    setSendState((s) => ({ ...s, [key]: "sending" }));
    try {
      await sendNotification({ to: em.to, subject: em.subject, text: em.body });
      setSendState((s) => ({ ...s, [key]: "sent" }));
    } catch (e) {
      setSendState((s) => ({ ...s, [key]: `error:${e.message || "failed"}` }));
    }
  };
  const orgLoaded = useRef(false);

  // Persist the drawing to the template (localStorage) whenever it changes.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    onSave({ nodes, edges, variables, chosenEnd });
  }, [nodes, edges, variables, chosenEnd]);

  // Resolve {{key}} tokens against the variables' values, everywhere text is shown or
  // emailed. Unknown tokens are left visible so typos are obvious (see interpolateVariables).
  const varMap = useMemo(() => {
    // Form answers first, then the HOD's fill-once variables override on collision.
    const m = { ...fcFormAnswerMap(nodes) };
    variables.forEach((v) => { if (v.key) m[v.key] = v.value ?? ""; });
    return m;
  }, [variables, nodes]);
  const resolve = (t) => interpolateVariables(t, varMap);
  // Tokens offered by the Insert-variable menu: fill-once variable keys plus every
  // form-field label in the flowchart (so a later task can reference {{Client Name}}).
  const insertTokens = useMemo(() => {
    const keys = variables.map((v) => v.key).filter(Boolean);
    const seen = new Set(keys);
    const labels = [];
    nodes.forEach((n) => (n.formFields || []).forEach((f) => {
      const l = (f.label || "").trim();
      if (l && !seen.has(l)) { seen.add(l); labels.push(l); }
    }));
    return [...keys, ...labels];
  }, [variables, nodes]);

  // Variables panel handlers (mirror the legacy TemplateEditor's, operating on local state).
  const addVariable = () => setVariables((vs) => [...vs, { id: `var-${Date.now()}`, key: "new_variable", label: "New variable", value: "" }]);
  const updateVariableKey = (id, key) => {
    const safe = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    setVariables((vs) => vs.map((v) => (v.id === id ? { ...v, key: safe } : v)));
  };
  const updateVariableLabel = (id, label) => setVariables((vs) => vs.map((v) => (v.id === id ? { ...v, label } : v)));
  const updateVariableValue = (id, value) => setVariables((vs) => vs.map((v) => (v.id === id ? { ...v, value } : v)));
  const removeVariable = (id) => setVariables((vs) => vs.filter((v) => v.id !== id));

  // The last node text field focused in the editor, so the Insert-variable menu knows where to
  // splice a {{token}} across the many task cards rendered at once.
  const lastField = useRef(null);
  const insertVarToken = (key) => {
    const f = lastField.current;
    if (!f) return;
    const token = `{{${key}}}`;
    const el = f.el;
    const current = f.getValue() ?? "";
    if (!el) { f.onChange(current + token); return; }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    f.onChange(current.slice(0, start) + token + current.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  // HOD is per-flowchart (each department has its own Head of Department),
  // but the CEO is company-wide and shared across every flowchart.
  const hodKey = `ebright-org-hod:${template.id}`;
  const ceoKey = "ebright-org-ceo";
  useEffect(() => {
    // Block saves until this load finishes (prevents writing a stale HOD to the
    // new flowchart's key while switching). HOD is department-scoped; the CEO is
    // company-wide (shared=true) so it stays one value for the whole company.
    orgLoaded.current = false;
    (async () => {
      let hod = null, ceo = null;
      try { const r = await storage.get(hodKey); hod = r ? JSON.parse(r.value) : null; } catch { /* not set yet */ }
      try { const r = await storage.get(ceoKey, true); ceo = r ? JSON.parse(r.value) : null; } catch { /* not set yet */ }
      setOrg({
        hod: { name: "", email: "", ...hod },
        ceo: { name: "", email: "", ...ceo },
      });
      orgLoaded.current = true;
    })();
  }, [hodKey]);
  useEffect(() => {
    if (!orgLoaded.current) return;
    storage.set(hodKey, JSON.stringify(org.hod)).catch(() => {});
    storage.set(ceoKey, JSON.stringify(org.ceo), true).catch(() => {});
  }, [org, hodKey]);

  // Ctrl/Cmd + wheel zooms toward the cursor (plain wheel scrolls the page).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      setView((v) => {
        const scale = Math.min(2, Math.max(0.4, +(v.scale * (e.deltaY < 0 ? 1.1 : 0.9)).toFixed(3)));
        const k = scale / v.scale;
        return { scale, tx: mx - k * (mx - v.tx), ty: my - k * (my - v.ty) };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const errors = validateFlowchart(nodes, edges);
  const valid = errors.length === 0;
  // The Editor (assignment) view is locked until the flowchart is built and passes
  // every rule — the HOD must finish & check the workflow before assigning people.
  const hasTasks = nodes.some(fcIsTask);
  const canEnterEditor = valid && hasTasks;
  // Same bar as the Editor: a half-built chart isn't worth previewing, and the
  // arrows a preview would draw are exactly what the rules check are there.
  const canPreview = valid && hasTasks;

  // Export is gated on the same bar as Preview: a file goes out into the world —
  // slides, email, print — so it must be a finished, valid workflow, not a draft
  // that reads as a real chart to whoever receives it.
  const canExport = valid && hasTasks;
  const doExport = async (kind) => {
    setExportOpen(false);
    if (!canExport) return;
    setExporting(kind);
    try {
      const svg = fcToSvg(nodes, edges, { route, reach, traceColor, vars: varMap });
      if (!svg) throw new Error("There are no shapes to export.");
      const base = (template.name || "flowchart").replace(/[\\/:*?"<>|]+/g, "-").trim() || "flowchart";
      if (kind === "svg") {
        fcDownload(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${base}.svg`);
      } else {
        const cv = await fcSvgToCanvas(svg, 2);
        if (kind === "png") {
          const blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("The browser could not produce a PNG."))), "image/png"));
          fcDownload(blob, `${base}.png`);
        } else {
          fcDownload(await fcPdfFromCanvas(cv), `${base}.pdf`);
        }
      }
    } catch (err) {
      alert(`Sorry — the ${kind.toUpperCase()} export didn't work.\n\n${err?.message || err}`);
    } finally {
      setExporting(null);
    }
  };

  // If the flowchart stops being valid (edited via undo, etc.), fall back to the chart.
  useEffect(() => {
    if ((fcMode === "editor" || fcMode === "kanban") && !canEnterEditor) setFcMode("flowchart");
  }, [fcMode, canEnterEditor]);

  // --- Trace one route -----------------------------------------------------
  // A chart with several endings draws every branch at once, so no single outcome
  // can be followed by eye. Picking an ending lights its route in that ending's
  // neon colour and leaves the rest of the chart alone — nothing is hidden, and
  // nothing is edited. This only changes what's drawn.
  const endNodes = useMemo(() => nodes.filter((n) => n.type === "end"), [nodes]);
  // Auto flow-order "1.0 / 2.0 / …" numbers for every node (display-only), shared by the
  // editor canvas and the read-only preview so both show the same numbering.
  const fcNodeNums = useMemo(() => fcNodeNumbers(nodes, edges), [nodes, edges]);
  const traceIdx = endNodes.findIndex((n) => n.id === traceEnd);
  const traceColor = traceIdx >= 0 ? fcNeon(traceIdx) : null;
  // Several routes can reach the same ending (the retry branches); `routeIdx` is
  // which one is lit. Shortest is first, so the default is the direct way there.
  const routes = useMemo(() => (traceEnd ? fcRoutesTo(nodes, edges, traceEnd) : []), [traceEnd, nodes, edges]);
  const route = routes[Math.min(routeIdx, routes.length - 1)] || null;
  // Everything that can lead to this ending glows softly — including the No
  // branches that loop back and get there the long way. The route being stepped
  // through burns brighter on top, so one way through stays readable.
  const reach = useMemo(() => (traceEnd ? fcReachTo(nodes, edges, traceEnd) : null), [traceEnd, nodes, edges]);
  const routeSteps = route ? nodes.filter((n) => route.nodes.has(n.id) && fcIsTask(n)).length : 0;
  // Drop the highlight if that ending is deleted (or undone away).
  useEffect(() => {
    if (traceEnd && !nodes.some((n) => n.id === traceEnd)) setTraceEnd(null);
  }, [nodes, traceEnd]);
  // If the chosen flow's ending is deleted, the choice no longer means anything.
  useEffect(() => {
    if (chosenEnd && !nodes.some((n) => n.id === chosenEnd)) setChosenEnd(null);
  }, [nodes, chosenEnd]);
  // Editing the chart can leave fewer routes than before — don't strand the index.
  useEffect(() => { setRouteIdx(0); }, [traceEnd]);
  useEffect(() => { if (routeIdx >= routes.length) setRouteIdx(0); }, [routes, routeIdx]);

  // Screen (client) coordinates -> canvas content coordinates (undo zoom + pan).
  const toContent = (clientX, clientY) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: (clientX - rect.left - view.tx) / view.scale, y: (clientY - rect.top - view.ty) / view.scale };
  };

  // Pan (keeping current zoom) so a shape sits in the middle of the canvas.
  const centerOnNode = (id) => {
    const n = nodes.find((x) => x.id === id);
    const el = canvasRef.current;
    if (!n || !el) return;
    const rect = el.getBoundingClientRect();
    const s = fcNodeSize(n);
    const cx = n.x + s.w / 2, cy = n.y + s.h / 2;
    setView((v) => ({ scale: v.scale, tx: rect.width / 2 - cx * v.scale, ty: rect.height / 2 - cy * v.scale }));
  };

  // Clicking a rule error selects the shape it refers to and brings it into view.
  const focusError = (err) => {
    setEditing(null);
    if (err.edgeId) { setSelEdge(err.edgeId); setSelNode(null); }
    else if (err.nodeId) { setSelEdge(null); setSelNodes([err.nodeId]); centerOnNode(err.nodeId); }
  };

  // --- Undo / redo ---
  const record = () => { setUndoStack((u) => [...u, { nodes, edges }]); setRedoStack([]); };
  const undo = () => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, { nodes, edges }]);
    setUndoStack((u) => u.slice(0, -1));
    setNodes(prev.nodes); setEdges(prev.edges);
    setSelNode(null); setSelEdge(null); setEditing(null);
  };
  const redo = () => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, { nodes, edges }]);
    setRedoStack((r) => r.slice(0, -1));
    setNodes(next.nodes); setEdges(next.edges);
    setSelNode(null); setSelEdge(null); setEditing(null);
  };

  // --- Copy / paste (works for one shape or a whole multi-selection) ---
  const copySelection = () => {
    if (!selNodes.length) return;
    const ns = nodes.filter((n) => selNodes.includes(n.id));
    const es = edges.filter((e) => selNodes.includes(e.from) && selNodes.includes(e.to));
    clipboard.current = { nodes: ns, edges: es };
  };
  const pasteClipboard = () => {
    const c = clipboard.current;
    if (!c || !c.nodes?.length) return;
    record();
    const now = Date.now();
    const idMap = {};
    const newNodes = c.nodes.map((n, i) => { const id = `n-${now}-${i}`; idMap[n.id] = id; return { ...n, id, x: n.x + 24, y: n.y + 24 }; });
    const newEdges = (c.edges || []).map((e, i) => ({ ...e, id: `e-${now}-${i}`, from: idMap[e.from], to: idMap[e.to] }));
    setNodes((prev) => [...prev, ...newNodes]);
    setEdges((prev) => [...prev, ...newEdges]);
    setSelNodes(newNodes.map((n) => n.id)); setSelEdge(null);
  };

  const addShape = (type, x, y) => {
    record();
    const i = nodes.length;
    const nx = x != null ? Math.max(0, Math.round(x / FC_SNAP) * FC_SNAP) : 60 + (i % 5) * 30;
    const ny = y != null ? Math.max(0, Math.round(y / FC_SNAP) * FC_SNAP) : 50 + (i % 5) * 30;
    const n = { id: "n-" + Date.now() + "-" + i, type, x: nx, y: ny, label: "" };
    setNodes((ns) => [...ns, n]);
    setSelNode(n.id); setSelEdge(null);
  };

  const startDrag = (e, n) => {
    if (e.button !== 0) return;
    const p = toContent(e.clientX, e.clientY);
    // Dragging a shape that's part of a multi-selection moves the whole group.
    const ids = selNodes.includes(n.id) && selNodes.length > 1 ? selNodes : [n.id];
    const origin = {};
    nodes.forEach((nd) => { if (ids.includes(nd.id)) origin[nd.id] = { x: nd.x, y: nd.y }; });
    drag.current = { id: n.id, ids, origin, dx: p.x - n.x, dy: p.y - n.y, moved: false, snapshot: { nodes, edges } };
  };

  const startLink = (e, n) => {
    e.stopPropagation(); e.preventDefault();
    const c = fcCenter(n);
    const p = toContent(e.clientX, e.clientY);
    setLink({ from: n.id, sx: c.x, sy: c.y, x: p.x, y: p.y });
  };

  const startResize = (e, n, corner) => {
    e.stopPropagation(); e.preventDefault();
    const { w, h } = fcNodeSize(n);
    resize.current = { id: n.id, corner, start: { x: n.x, y: n.y, w, h }, moved: false, snapshot: { nodes, edges } };
  };

  const startPan = (e) => { pan.current = { sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty }; };

  const onCanvasMove = (e) => {
    if (pan.current) {
      const p = pan.current;
      setView((v) => ({ ...v, tx: p.tx + (e.clientX - p.sx), ty: p.ty + (e.clientY - p.sy) }));
      return;
    }
    if (box.current) {
      const p = toContent(e.clientX, e.clientY);
      setBoxRect({ x: Math.min(box.current.x0, p.x), y: Math.min(box.current.y0, p.y), w: Math.abs(p.x - box.current.x0), h: Math.abs(p.y - box.current.y0) });
      return;
    }
    if (resize.current) {
      const r = resize.current; r.moved = true;
      const s = r.start;
      const p = toContent(e.clientX, e.clientY);
      const gx = Math.round(p.x / FC_SNAP) * FC_SNAP, gy = Math.round(p.y / FC_SNAP) * FC_SNAP;
      let { x, y, w, h } = s;
      if (r.corner.includes("e")) w = Math.max(FC_MIN, gx - s.x);
      if (r.corner.includes("s")) h = Math.max(FC_MIN, gy - s.y);
      if (r.corner.includes("w")) { w = Math.max(FC_MIN, s.x + s.w - gx); x = s.x + s.w - w; }
      if (r.corner.includes("n")) { h = Math.max(FC_MIN, s.y + s.h - gy); y = s.y + s.h - h; }
      setNodes((ns) => ns.map((n) => (n.id === r.id ? { ...n, x, y, w, h } : n)));
      return;
    }
    if (link) { const p = toContent(e.clientX, e.clientY); setLink((l) => (l ? { ...l, x: p.x, y: p.y } : l)); return; }
    if (!drag.current) return;
    const p = toContent(e.clientX, e.clientY);
    const dc = drag.current;
    const mv = nodes.find((n) => n.id === dc.id);
    const { w, h } = fcNodeSize(mv);
    let x = Math.max(0, Math.round((p.x - dc.dx) / FC_SNAP) * FC_SNAP);
    let y = Math.max(0, Math.round((p.y - dc.dy) / FC_SNAP) * FC_SNAP);
    if (dc.ids.length === 1) {
      const others = nodes.filter((n) => n.id !== dc.id).map((n) => ({ ...n, ...fcNodeSize(n) }));
      const snapped = fcSnapGuides({ x, y, w, h }, others);
      x = snapped.x; y = snapped.y;
      setGuides(snapped.guides);
    } else {
      setGuides([]);
    }
    const ddx = x - dc.origin[dc.id].x, ddy = y - dc.origin[dc.id].y;
    dc.moved = true;
    setNodes((ns) => ns.map((n) => (dc.ids.includes(n.id) ? { ...n, x: dc.origin[n.id].x + ddx, y: dc.origin[n.id].y + ddy } : n)));
  };

  const onCanvasUp = () => {
    if (pan.current) { pan.current = null; return; }
    if (box.current) {
      const r = boxRect;
      if (r && (r.w > 3 || r.h > 3)) {
        const ids = nodes.filter((n) => { const s = fcNodeSize(n); return n.x < r.x + r.w && n.x + s.w > r.x && n.y < r.y + r.h && n.y + s.h > r.y; }).map((n) => n.id);
        setSelNodes(ids); setSelEdge(null);
      }
      box.current = null; setBoxRect(null);
      return;
    }
    if (resize.current) {
      if (resize.current.moved) { const snap = resize.current.snapshot; setUndoStack((u) => [...u, snap]); setRedoStack([]); }
      resize.current = null;
      return;
    }
    if (link) {
      if (hoverId && hoverId !== link.from) {
        const exists = edges.some((e) => e.from === link.from && e.to === hoverId);
        if (!exists) { record(); setEdges((es) => [...es, { id: "e-" + Date.now(), from: link.from, to: hoverId, label: "" }]); }
      }
      setLink(null);
    }
    if (drag.current) {
      if (drag.current.moved) { const snap = drag.current.snapshot; setUndoStack((u) => [...u, snap]); setRedoStack([]); }
      drag.current = null;
    }
    setGuides([]);
  };

  const zoomBy = (factor) => setView((v) => ({ ...v, scale: Math.min(2, Math.max(0.4, +(v.scale * factor).toFixed(2))) }));
  const resetView = () => setView({ scale: 1, tx: 0, ty: 0 });

  // Zoom + center so every shape fits within the canvas.
  const fitView = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const b = fcBounds(nodes);
    if (!b || !b.w || !b.h) { resetView(); return; }
    const pad = 48;
    const scale = Math.min(2, Math.max(0.4, Math.min((rect.width - pad * 2) / b.w, (rect.height - pad * 2) / b.h)));
    setView({ scale, tx: (rect.width - b.w * scale) / 2 - b.minX * scale, ty: (rect.height - b.h * scale) / 2 - b.minY * scale });
  };

  const deleteNode = (id) => {
    record();
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.from !== id && e.to !== id));
    setSelNode(null);
  };
  const deleteNodes = (ids) => {
    if (!ids.length) return;
    record();
    setNodes((ns) => ns.filter((n) => !ids.includes(n.id)));
    setEdges((es) => es.filter((e) => !ids.includes(e.from) && !ids.includes(e.to)));
    setSelNodes([]);
  };
  const deleteEdge = (id) => { record(); setEdges((es) => es.filter((e) => e.id !== id)); setSelEdge(null); };
  const setNodeLabel = (id, label) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, label } : n)));
  const setEdgeLabel = (id, label) => setEdges((es) => es.map((e) => (e.id === id ? { ...e, label } : e)));
  // Assignment edits (HOD): who does it, when it's due, and what to do.
  const patchNode = (id, patch) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n)));

  // Commit a traced route as THE workflow flow. Writes the route's branch pick onto each
  // decision it crosses (so fcActiveSet gates everything to this flow) and remembers the
  // ending in chosenEnd. Decisions get marked done so sequential locks flow, same as the
  // per-decision "Which branch?" picker. Off-branch decisions are left untouched.
  const commitFlow = (endId, route) => {
    if (!endId || !route) return;
    const choices = fcRouteDecisionChoices(route, nodes, edges);
    record();
    const now = new Date().toISOString();
    setNodes((ns) => ns.map((n) => (
      choices[n.id] != null
        ? { ...n, decisionChoice: choices[n.id], done: true, completedAt: n.completedAt || now }
        : n
    )));
    setChosenEnd(endId);
    setShowOffBranch(false);
    setConfirmFlow(null);
    setTraceEnd(null);
    setFcMode("editor");   // drop the HOD straight into the flow's task list
  };
  // Un-choose the flow: clears the marker and the decisionChoices it set, so the whole
  // chart (every branch) is editable again. The HOD re-picks from the trace bar.
  const clearFlow = () => {
    record();
    setNodes((ns) => ns.map((n) => (n.type === "decision" ? { ...n, decisionChoice: "", done: false, completedAt: null } : n)));
    setChosenEnd(null);
    setShowOffBranch(false);
    setFcMode("flowchart");
  };
  const setAssignee = (id, field, value) => patchNode(id, { assignee: { name: "", email: "", ...(nodes.find((n) => n.id === id)?.assignee), [field]: value } });
  const setDue = (id, due) => patchNode(id, { due });
  const setInstructions = (id, instructions) => patchNode(id, { instructions });
  // Approver (HOD picks who signs off this step / decision — emailed on demand).
  const setApprover = (id, field, value) => patchNode(id, { approver: { name: "", email: "", ...(nodes.find((n) => n.id === id)?.approver), [field]: value } });
  // Only a decision whose branches are labelled Approved / Not approved gets the
  // "Send for approval" tools — regular tasks never show them.
  const isApprovalDecision = (n) => n.type === "decision" && edges.some((e) => e.from === n.id && /approv/i.test(e.label || ""));
  // Subtasks (HOD breaks the main task into a checklist for the assignee).
  const addSubtask = (id) => { record(); const n = nodes.find((x) => x.id === id); patchNode(id, { subtasks: [...(n?.subtasks || []), { id: `sub-${Date.now()}`, title: "", done: false }] }); };
  const updateSubtask = (id, subId, patch) => { const n = nodes.find((x) => x.id === id); patchNode(id, { subtasks: (n?.subtasks || []).map((s) => (s.id === subId ? { ...s, ...patch } : s)) }); };
  const removeSubtask = (id, subId) => { record(); const n = nodes.find((x) => x.id === id); patchNode(id, { subtasks: (n?.subtasks || []).filter((s) => s.id !== subId) }); };
  // Form fields (HOD-defined): the assignee fills these in from My Work. Same
  // definition/patch shape as subtasks so the existing onSave path carries them.
  const addFormField = (id) => { record(); const n = nodes.find((x) => x.id === id); patchNode(id, { formFields: [...(n?.formFields || []), { id: `fld-${Date.now()}`, label: "", type: "text", options: [], required: false }] }); };
  const updateFormField = (id, fldId, patch) => { const n = nodes.find((x) => x.id === id); patchNode(id, { formFields: (n?.formFields || []).map((f) => (f.id === fldId ? { ...f, ...patch } : f)) }); };
  const removeFormField = (id, fldId) => { record(); const n = nodes.find((x) => x.id === id); patchNode(id, { formFields: (n?.formFields || []).filter((f) => f.id !== fldId) }); };
  // Public form links: snapshot a node's form fields into a shareable (no-login)
  // link for someone outside the org. See fcReadPublicForms / PublicFormPage.
  const [publicLinkFlash, setPublicLinkFlash] = useState(null); // nodeId whose link was just copied
  const ensurePublicForm = (nodeId) => {
    const node = nodes.find((x) => x.id === nodeId);
    if (!node || !(node.formFields || []).length) return null;
    const token = node.publicFormToken || fcMakeFormToken();
    const map = fcReadPublicForms();
    const existing = map[token] || {};
    map[token] = {
      token, templateId: template.id, nodeId,
      title: resolve(node.label) || FC_META[node.type]?.name || "Form",
      intro: resolve(node.instructions || ""),
      org: template.name || "",
      // Snapshot the fields (resolved labels) so the public page needs no auth.
      fields: (node.formFields || []).map((f) => ({ id: f.id, label: resolve(f.label) || "Field", type: f.type, options: f.options || [], required: !!f.required })),
      createdAt: existing.createdAt || new Date().toISOString(),
      submittedAt: existing.submittedAt || null,
      values: existing.values || {},
    };
    fcWritePublicForms(map);
    if (!node.publicFormToken) { record(); patchNode(nodeId, { publicFormToken: token }); }
    return token;
  };
  const copyPublicLink = (nodeId) => {
    const token = ensurePublicForm(nodeId); // (re)snapshot with the current fields, then copy
    if (!token) return;
    try { navigator.clipboard?.writeText(fcPublicFormUrl(token)); } catch {}
    setPublicLinkFlash(nodeId);
    setTimeout(() => setPublicLinkFlash((k) => (k === nodeId ? null : k)), 1800);
  };
  // Pull external submissions back into the matching node so the HOD sees them.
  // The public page writes to localStorage; a same-browser tab fires `storage`,
  // and the poll/focus covers same-tab and returning to the app.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  useEffect(() => {
    const sync = () => {
      const map = fcReadPublicForms();
      nodesRef.current.forEach((n) => {
        if (!n.publicFormToken) return;
        const rec = map[n.publicFormToken];
        if (rec && rec.submittedAt && rec.submittedAt !== n.publicFormSubmittedAt) {
          patchNode(n.id, { formValues: { ...(n.formValues || {}), ...rec.values }, publicFormSubmittedAt: rec.submittedAt });
        }
      });
    };
    sync();
    const iv = setInterval(sync, 2500);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => { clearInterval(iv); window.removeEventListener("storage", sync); window.removeEventListener("focus", sync); };
  }, []);
  // Completion (assignee): ticking on requires proof; ticking off clears it.
  const markDone = (id, proof) => { record(); patchNode(id, { done: true, proof, completedAt: new Date().toISOString() }); setProofFor(null); setPendingProof(null); };
  const markUndone = (id) => { record(); patchNode(id, { done: false }); };
  const onProofFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { alert("That file is larger than 4 MB — the browser's localStorage can't hold it. Please choose a smaller image or PDF."); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => setPendingProof({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result, at: new Date().toISOString() });
    reader.readAsDataURL(file);
  };
  // Per-subtask proof: assignee must attach a file before a subtask can be ticked off.
  const onSubtaskProofFile = (nodeId, subId, e) => {
    const file = e.target.files?.[0];
    if (!file) { return; }
    if (file.size > 4 * 1024 * 1024) { alert("That file is larger than 4 MB — the browser's localStorage can't hold it. Please choose a smaller image or PDF."); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => { record(); updateSubtask(nodeId, subId, { proof: { name: file.name, type: file.type, size: file.size, dataUrl: reader.result, at: new Date().toISOString() } }); };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Keyboard: Delete removes selection; Ctrl+Z/Y undo/redo; Ctrl+C/V copy/paste.
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      const typing = !!editing || tag === "INPUT" || tag === "TEXTAREA";
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      // The preview is read-only: while it's open, Esc closes it and nothing else
      // (undo, delete, paste) may reach the chart behind it.
      if (preview) { if (e.key === "Escape") { e.preventDefault(); setPreview(false); } return; }
      if (mod && key === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && key === "y") { e.preventDefault(); redo(); return; }
      if (mod && key === "c") { if (!typing) copySelection(); return; }
      if (mod && key === "v") { if (!typing) { e.preventDefault(); pasteClipboard(); } return; }
      if (mod && e.shiftKey && key === "h") { e.preventDefault(); fitView(); return; }
      if (typing) return;
      if (fcMode !== "flowchart") return;   // Delete only affects the canvas, not the editor list
      if (e.key === "Escape" && traceEnd) { setTraceEnd(null); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selNodes.length) { e.preventDefault(); deleteNodes(selNodes); }
        else if (selEdge) { e.preventDefault(); deleteEdge(selEdge); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selNodes, selEdge, editing, undoStack, redoStack, nodes, edges, fcMode, traceEnd, preview]);

  const selectedNode = nodes.find((n) => n.id === selNode);
  const selectedEdge = edges.find((e) => e.id === selEdge);

  const panelCard = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 };
  const labelStyle = { fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, fontWeight: 600, color: C.slate, textTransform: "uppercase", letterSpacing: "0.04em" };
  const inputStyle = { width: "100%", boxSizing: "border-box", fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.ink, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", marginTop: 6 };
  const DOTS = [["top", 0.5, 0], ["right", 1, 0.5], ["bottom", 0.5, 1], ["left", 0, 0.5]];
  const fcZoomBtn = { display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, background: "transparent", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "'Work Sans', sans-serif", fontSize: 15, fontWeight: 600, color: C.slate };
  const fcBarBtn = { display: "flex", alignItems: "center", gap: 6, flexShrink: 0, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, cursor: "pointer", padding: "7px 11px", fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: C.ink };
  const fcOverlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.42)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 };
  const fcModal = { background: C.card, borderRadius: 14, padding: 22, width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 12px 44px rgba(0,0,0,0.28)" };
  const proofNode = nodes.find((n) => n.id === proofFor);
  const currentProof = pendingProof || proofNode?.proof || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Dashes crawling along a lit route, so its direction reads at a glance.
          The dash cycle is 19 (7 + 12), so shifting by 38 loops seamlessly. */}
      <style>{`
        @keyframes fcFlow { to { stroke-dashoffset: -38; } }
        .fc-flow { animation: fcFlow 1s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .fc-flow { animation: none; } }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18, flexShrink: 0 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, cursor: "pointer", padding: "7px 12px", fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate }}>
          <ChevronLeft size={15} /> Library
        </button>
        <div style={{ flex: 1 }}>
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => { const v = nameDraft.trim(); if (v) onRename(v); setEditingName(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { const v = nameDraft.trim(); if (v) onRename(v); setEditingName(false); } if (e.key === "Escape") { setNameDraft(template.name); setEditingName(false); } }}
              style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, color: C.ink, background: C.card, border: `1px solid ${C.spotlight}`, borderRadius: 7, padding: "2px 8px", outline: "none" }}
            />
          ) : (
            <h1 onDoubleClick={() => { setNameDraft(template.name); setEditingName(true); }} title="Double-click to rename" style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, color: C.ink, margin: 0, cursor: "text", display: "inline-block" }}>{template.name}</h1>
          )}
          <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.slate, margin: "2px 0 0" }}>{template.module} · {fcMode === "flowchart" ? "workflow flowchart" : fcMode === "kanban" ? "task board" : "task editor"}</p>
        </div>
        <div style={{ display: "flex", background: C.paperDim, borderRadius: 10, padding: 3, flexShrink: 0 }}>
          <button onClick={() => setFcMode("flowchart")} style={toggleBtn(fcMode === "flowchart")}><GitMerge size={15} /> Flowchart</button>
          <button
            onClick={() => canEnterEditor && setFcMode("editor")}
            disabled={!canEnterEditor}
            title={canEnterEditor ? "" : (!hasTasks ? "Add at least one task to the flowchart first." : "Fix every workflow issue first — the flowchart must be valid before you can assign tasks.")}
            style={{ ...toggleBtn(fcMode === "editor"), opacity: canEnterEditor ? 1 : 0.4, cursor: canEnterEditor ? "pointer" : "not-allowed" }}
          >
            {canEnterEditor ? <ListChecks size={15} /> : <Lock size={14} />} Editor
          </button>
          <button
            onClick={() => canEnterEditor && setFcMode("kanban")}
            disabled={!canEnterEditor}
            title={canEnterEditor ? "" : (!hasTasks ? "Add at least one task to the flowchart first." : "Fix every workflow issue first — the flowchart must be valid before you can view the board.")}
            style={{ ...toggleBtn(fcMode === "kanban"), opacity: canEnterEditor ? 1 : 0.4, cursor: canEnterEditor ? "pointer" : "not-allowed" }}
          >
            {canEnterEditor ? <Kanban size={15} /> : <Lock size={14} />} Kanban
          </button>
        </div>
        {fcMode === "flowchart" && (<>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={undo} disabled={!undoStack.length} title="Undo (Ctrl+Z)" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, cursor: undoStack.length ? "pointer" : "not-allowed", color: undoStack.length ? C.ink : C.slateLight }}>
            <Undo2 size={16} />
          </button>
          <button onClick={redo} disabled={!redoStack.length} title="Redo (Ctrl+Shift+Z)" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, cursor: redoStack.length ? "pointer" : "not-allowed", color: redoStack.length ? C.ink : C.slateLight }}>
            <Redo2 size={16} />
          </button>
        </div>
        <div
          onClick={() => { if (!valid) { const first = errors.find((e) => e.nodeId || e.edgeId); if (first) focusError(first); } }}
          title={valid ? "" : "Click to jump to the first issue"}
          style={{
            display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9,
            fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600,
            background: valid ? "#E8F3EC" : "#FBEAE8", color: valid ? C.sageDeep : "#B23A2E",
            border: `1px solid ${valid ? "#Bfe0Cc" : "#F0C9C4"}`,
            cursor: valid ? "default" : "pointer", userSelect: "none",
          }}>
          {valid ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {valid ? "Valid workflow" : `${errors.length} issue${errors.length === 1 ? "" : "s"} to fix`}
        </div>
        {/* Reading the finished chart is a different job from building it, so it gets
            its own button — but only once there is a finished chart to read. */}
        <button
          onClick={() => canPreview && setPreview(true)}
          disabled={!canPreview}
          title={canPreview ? "See the whole workflow, fit to screen" : (!hasTasks ? "Add at least one task to the flowchart first." : "Fix every workflow issue first — the flowchart must be valid to preview it.")}
          style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, background: canPreview ? C.ink : "transparent", border: `1px solid ${canPreview ? C.ink : C.line}`, borderRadius: 8, padding: "8px 13px", fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600, color: canPreview ? "#fff" : C.slateLight, opacity: canPreview ? 1 : 0.6, cursor: canPreview ? "pointer" : "not-allowed" }}
        >
          {canPreview ? <Eye size={15} /> : <Lock size={14} />} Preview
        </button>
        {/* Export — one button, three containers for the same drawing. */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => canExport && setExportOpen((v) => !v)}
            disabled={!canExport || !!exporting}
            title={canExport ? "Save this flowchart as a file" : (!hasTasks ? "Add at least one task to the flowchart first." : "Fix every workflow issue first — the flowchart must be valid to export it.")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 13px", fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600, color: canExport ? C.ink : C.slateLight, opacity: canExport && !exporting ? 1 : 0.6, cursor: canExport && !exporting ? "pointer" : "not-allowed" }}
          >
            {canExport ? <Download size={15} /> : <Lock size={14} />} {exporting ? `Saving ${exporting.toUpperCase()}…` : "Export"}
            <ChevronDown size={13} />
          </button>
          {exportOpen && (
            <>
              {/* Click anywhere else to dismiss. */}
              <div onClick={() => setExportOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 41, minWidth: 208, background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 5, boxShadow: "0 8px 26px rgba(0,0,0,0.16)" }}>
                {[
                  ["png", "PNG image", "For slides, chat and email"],
                  ["pdf", "PDF document", "For printing and sharing"],
                  ["svg", "SVG vector", "Sharp at any size; editable"],
                ].map(([kind, title, hint]) => (
                  <button key={kind} onClick={() => doExport(kind)}
                    style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 7, cursor: "pointer", padding: "8px 10px", fontFamily: "'Work Sans', sans-serif" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = C.paper; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.ink }}>{title}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: C.slate, marginTop: 1 }}>{hint}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        </>)}
      </div>

      {/* Trace bar — when the workflow has more than one ending, light one route at a time */}
      {fcMode === "flowchart" && endNodes.length > 1 && nodes.some((n) => n.type === "start") && (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", marginBottom: 14, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, flexShrink: 0 }}>
        <span style={{ ...labelStyle, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}><GitBranch size={13} /> Show route to</span>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, overflowX: "auto", minWidth: 0 }}>
          {endNodes.map((n, i) => {
            const on = traceEnd === n.id;
            const isChosen = chosenEnd === n.id;
            const neon = fcNeon(i);
            return (
              <button
                key={n.id}
                onClick={() => setTraceEnd(on ? null : n.id)}
                title={on ? "Click again to turn the route off" : isChosen ? "This is the chosen flow. Click to review its route." : `Light up the route from Start to “${n.label || "End"}”`}
                style={{
                  display: "flex", alignItems: "center", gap: 7, flexShrink: 0, cursor: "pointer",
                  background: on ? C.ink : C.paper,
                  border: `1.5px solid ${on ? neon : isChosen ? C.sageDeep : C.line}`,
                  borderRadius: 999, padding: "5px 12px",
                  fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600,
                  color: on ? "#fff" : C.slate,
                  boxShadow: on ? `0 0 0 2px ${neon}44, 0 0 12px ${neon}88` : "none",
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: 999, flexShrink: 0, background: neon, boxShadow: `0 0 6px ${neon}` }} />
                {n.label || "End"}
                {isChosen && <Check size={13} color={on ? "#fff" : C.sageDeep} />}
              </button>
            );
          })}
        </div>
        {traceEnd ? (
          <>
            {/* The route stepper itself lives on the canvas (top-left), next to the
                lit line it steps through. This bar keeps the summary of it. */}
            {route ? (
              <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, whiteSpace: "nowrap", flexShrink: 0 }}>
                {routeSteps} step{routeSteps === 1 ? "" : "s"}
                {route.choices.length ? ` · ${route.choices.join(" › ")}` : ""}
              </span>
            ) : (
              <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, flexShrink: 0 }}>
                No route from Start reaches this ending.
              </span>
            )}
            {route && (() => {
              const blocked = fcRouteUnlabelled(route, nodes, edges).length > 0;
              const isChosen = chosenEnd === traceEnd;
              return (
                <button
                  onClick={() => { if (!blocked) setConfirmFlow({ end: traceEnd, route }); }}
                  disabled={blocked}
                  title={blocked ? "Label every decision branch on this route first — one arrow has no name." : isChosen ? "This is already the chosen flow — re-confirm to refresh it." : "Set this route as the workflow's flow"}
                  style={{ ...fcBarBtn, flexShrink: 0, background: blocked ? C.paperDim : C.ink, color: blocked ? C.slateLight : "#fff", border: `1px solid ${blocked ? C.line : C.ink}`, cursor: blocked ? "not-allowed" : "pointer" }}
                ><Check size={13} /> {isChosen ? "Chosen flow ✓" : "Use this flow"}</button>
              );
            })()}
            <button onClick={() => setTraceEnd(null)} title="Turn the route off (Esc)" style={fcBarBtn}><X size={13} /> Off</button>
          </>
        ) : (
          <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slateLight, flexShrink: 0 }}>
            Click an ending to light up the path that leads to it.
          </span>
        )}
      </div>
      )}

      {/* Assignee bar — who is responsible for each step, and their progress */}
      {fcMode === "editor" && (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", marginBottom: 14, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, flexShrink: 0 }}>
        <span style={{ ...labelStyle, flexShrink: 0 }}>Assignees</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, overflowX: "auto", minWidth: 0 }}>
          {(() => {
            const map = new Map();
            nodes.filter(fcIsTask).forEach((n) => {
              if (!n.assignee?.email) return;
              const key = n.assignee.email.toLowerCase();
              const e = map.get(key) || { name: n.assignee.name, email: n.assignee.email, total: 0, done: 0 };
              e.total++; if (fcNodeDone(n)) e.done++;
              if (!e.name && n.assignee.name) e.name = n.assignee.name;
              map.set(key, e);
            });
            const people = [...map.values()];
            if (!people.length) return <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.slate }}>No one assigned yet — select a step and add an assignee on the right.</span>;
            return people.map((p) => (
              <div key={p.email} title={`${p.name || p.email} · ${p.done}/${p.total} done`} style={{ display: "flex", alignItems: "center", gap: 7, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 999, padding: "3px 11px 3px 3px", flexShrink: 0 }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: fcAvatarColor(p.email), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 700 }}>{fcInitials(p.name || p.email)}</span>
                <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
                  <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: C.ink }}>{p.name || p.email}</span>
                  <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 10.5, color: p.done === p.total ? C.sageDeep : C.slate }}>{p.done}/{p.total} done</span>
                </span>
              </div>
            ));
          })()}
        </div>
        <button onClick={() => setShowOutbox(true)} title="Preview the reminder emails" style={fcBarBtn}><Mail size={14} /> Outbox</button>
        <button onClick={() => setShowTeam(true)} title="Set the HOD & CEO email addresses" style={fcBarBtn}><Users size={14} /> Team</button>
      </div>
      )}

      {fcMode === "flowchart" && (
      <div style={{ display: "flex", gap: 16, alignItems: "stretch", flex: 1, minHeight: 0 }}>
        {/* Palette */}
        <div style={{ ...panelCard, width: 158, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={labelStyle}>Shapes</span>
          {FC_SHAPES.map((s) => (
            <button
              key={s.type}
              onClick={() => addShape(s.type)}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("fc-shape", s.type)}
              title={s.hint}
              style={{
                display: "flex", alignItems: "center", gap: 9, background: s.bg, border: `1.5px solid ${s.border}`,
                borderRadius: 8, cursor: "grab", padding: "8px 10px", textAlign: "left",
              }}
            >
              <span style={{ width: 16, height: 16, flexShrink: 0, background: s.border, borderRadius: s.type === "start" || s.type === "end" ? 999 : 3, transform: s.type === "decision" ? "rotate(45deg) scale(0.8)" : s.type === "io" ? "skewX(-18deg)" : "none" }} />
              <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: s.border }}>{s.name}</span>
            </button>
          ))}
          <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, color: C.slateLight, margin: "4px 0 0", lineHeight: 1.45 }}>
            Drag a shape onto the canvas (or click to add). Double-click to rename. Drag a blue dot onto another shape to connect. Shift+drag empty space to box-select; Shift+click to add. Drag empty space to pan · Ctrl+scroll to zoom.
          </p>
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          onMouseDown={(e) => {
            if (e.target !== canvasRef.current) return;
            setSelEdge(null); setEditing(null);
            if (e.shiftKey) {
              const p = toContent(e.clientX, e.clientY);
              box.current = { x0: p.x, y0: p.y };
              setBoxRect({ x: p.x, y: p.y, w: 0, h: 0 });
            } else {
              setSelNode(null);
              startPan(e);
            }
          }}
          onMouseMove={onCanvasMove}
          onMouseUp={onCanvasUp}
          onMouseLeave={onCanvasUp}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const type = e.dataTransfer.getData("fc-shape");
            if (!type) return;
            const p = toContent(e.clientX, e.clientY);
            const { w, h } = fcSize(type);
            addShape(type, p.x - w / 2, p.y - h / 2);
          }}
          style={{
            position: "relative", flex: 1, minHeight: 0, background: C.card, border: `1px solid ${C.line}`,
            borderRadius: 12, overflow: "hidden",
            backgroundImage: "radial-gradient(circle, #E2E2E2 1px, transparent 1px)", backgroundSize: "22px 22px",
          }}
        >
          {nodes.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Work Sans', sans-serif", fontSize: 13.5, color: C.slateLight, pointerEvents: "none", textAlign: "center", padding: 20 }}>
              Drag a shape here to start building the workflow.
            </div>
          )}

          {/* Zoom + pan transform wrapper */}
          <div style={{ position: "absolute", top: 0, left: 0, transformOrigin: "0 0", transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}>

          {/* Edges */}
          <svg width={3000} height={2000} style={{ position: "absolute", top: 0, left: 0, overflow: "visible", pointerEvents: "none" }}>
            <defs>
              <marker id="fc-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,3 L0,6 Z" fill={C.slate} />
              </marker>
              {traceColor && (
                <marker id="fc-arrow-neon" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L8,3 L0,6 Z" fill={traceColor} />
                </marker>
              )}
              {/* The halo behind a lit route — blur the stroke, then stack it to intensify. */}
              <filter id="fc-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /></feMerge>
              </filter>
            </defs>
            {edges.map((e) => {
              const a = nodes.find((n) => n.id === e.from);
              const b = nodes.find((n) => n.id === e.to);
              if (!a || !b) return null;
              const { d, mid } = fcEdgeGeometry(a, b);
              const isSel = selEdge === e.id;
              const isEditing = editing?.kind === "edge" && editing.id === e.id;
              const onRoute = !!route && route.edges.has(e.id);
              const canLead = !onRoute && !!reach && reach.edges.has(e.id);
              return (
                <g key={e.id}>
                  {onRoute ? (
                    // Halo, then the neon line, then dashes travelling the way the arrow points.
                    <>
                      <path d={d} fill="none" stroke={traceColor} strokeWidth={9} opacity={0.5} strokeLinecap="round" filter="url(#fc-glow)" />
                      <path d={d} fill="none" stroke={traceColor} strokeWidth={3.2} strokeLinecap="round" markerEnd="url(#fc-arrow-neon)" />
                      <path d={d} fill="none" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" opacity={0.85} strokeDasharray="7 12" className="fc-flow" />
                    </>
                  ) : canLead ? (
                    // Another way to the same ending — same neon, turned down.
                    <g opacity={0.5}>
                      <path d={d} fill="none" stroke={traceColor} strokeWidth={6} opacity={0.35} strokeLinecap="round" filter="url(#fc-glow)" />
                      <path d={d} fill="none" stroke={traceColor} strokeWidth={2.2} strokeLinecap="round" markerEnd="url(#fc-arrow-neon)" />
                    </g>
                  ) : (
                    <path d={d} fill="none"
                      stroke={isSel ? C.spotlight : C.slate}
                      strokeWidth={isSel ? 2.5 : 1.6}
                      markerEnd="url(#fc-arrow)" />
                  )}
                  <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onClick={() => { setSelEdge(e.id); setSelNode(null); }}
                    onDoubleClick={() => { record(); setSelEdge(e.id); setSelNode(null); setEditing({ kind: "edge", id: e.id }); }} />
                  {e.label && !isEditing && (
                    <g style={{ pointerEvents: "none" }}>
                      <rect x={mid.x - e.label.length * 3.7 - 6} y={mid.y - 10} width={e.label.length * 7.4 + 12} height={19} rx={5} fill="#fff" stroke={C.line} />
                      <text x={mid.x} y={mid.y + 3.5} textAnchor="middle" fontFamily="'Work Sans', sans-serif" fontSize="11" fontWeight="600" fill={C.inkSoft}>{e.label}</text>
                    </g>
                  )}
                </g>
              );
            })}
            {link && <line x1={link.sx} y1={link.sy} x2={link.x} y2={link.y} stroke={C.spotlight} strokeWidth={1.8} strokeDasharray="5 4" markerEnd="url(#fc-arrow)" />}
            {guides.map((g, i) => (g.type === "v"
              ? <line key={i} x1={g.pos} y1={-2000} x2={g.pos} y2={4000} stroke={C.spotlight} strokeWidth={1} strokeDasharray="4 3" />
              : <line key={i} x1={-2000} y1={g.pos} x2={4000} y2={g.pos} stroke={C.spotlight} strokeWidth={1} strokeDasharray="4 3" />
            ))}
            {boxRect && <rect x={boxRect.x} y={boxRect.y} width={boxRect.w} height={boxRect.h} fill="rgba(230,36,39,0.08)" stroke={C.spotlight} strokeWidth={1} strokeDasharray="4 3" />}
          </svg>

          {/* Inline edge-label editor */}
          {editing?.kind === "edge" && (() => {
            const e = edges.find((x) => x.id === editing.id);
            if (!e) return null;
            const a = nodes.find((n) => n.id === e.from), b = nodes.find((n) => n.id === e.to);
            if (!a || !b) return null;
            const { mid } = fcEdgeGeometry(a, b);
            return (
              <input autoFocus value={e.label} placeholder="Yes / No"
                onMouseDown={(ev) => ev.stopPropagation()}
                onChange={(ev) => setEdgeLabel(e.id, ev.target.value)}
                onBlur={() => setEditing(null)}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === "Escape") { ev.preventDefault(); setEditing(null); } }}
                style={{ position: "absolute", left: mid.x - 45, top: mid.y - 13, width: 90, zIndex: 10, textAlign: "center", fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: C.ink, background: "#fff", border: `1.5px solid ${C.spotlight}`, borderRadius: 6, padding: "3px 4px", boxSizing: "border-box" }} />
            );
          })()}

          {/* Nodes */}
          {nodes.map((n) => {
            const meta = FC_META[n.type];
            const { w, h } = fcNodeSize(n);
            const isSel = selNodes.includes(n.id);
            const isEditing = editing?.kind === "node" && editing.id === n.id;
            const showDots = hoverId === n.id && !link && !isEditing && !drag.current && !resize.current;
            const onRoute = !!route && route.nodes.has(n.id);
            const canLead = !onRoute && !!reach && reach.nodes.has(n.id);
            return (
              <div
                key={n.id}
                onMouseDown={(e) => startDrag(e, n)}
                onMouseEnter={() => setHoverId(n.id)}
                onMouseLeave={() => setHoverId((hv) => (hv === n.id ? null : hv))}
                onClick={(e) => {
                  e.stopPropagation();
                  if (drag.current?.moved) return;
                  if (e.shiftKey) { setSelNodes((s) => (s.includes(n.id) ? s.filter((x) => x !== n.id) : [...s, n.id])); setSelEdge(null); }
                  else { setSelNode(n.id); setSelEdge(null); }
                }}
                onDoubleClick={(e) => { e.stopPropagation(); record(); setSelNode(n.id); setSelEdge(null); setEditing({ kind: "node", id: n.id }); }}
                style={{ position: "absolute", left: n.x, top: n.y, width: w, height: h, cursor: "grab", userSelect: "none" }}
              >
                <div style={{
                  position: "absolute", inset: 0, background: meta.bg,
                  border: `2px solid ${isSel ? C.spotlight : meta.border}`,
                  borderRadius: n.type === "start" || n.type === "end" ? 999 : 8,
                  transform: n.type === "decision" ? "rotate(45deg)" : n.type === "io" ? "skewX(-18deg)" : "none",
                  boxShadow: isSel ? "0 0 0 3px rgba(230,36,39,0.15)"
                    : onRoute ? `0 0 0 3px ${traceColor}, 0 0 18px ${traceColor}AA`
                    : canLead ? `0 0 0 2px ${traceColor}99, 0 0 10px ${traceColor}55`
                    : "0 1px 3px rgba(0,0,0,0.08)",
                }} />
                {isEditing ? (
                  <input autoFocus value={n.label} placeholder={meta.name}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => setNodeLabel(n.id, e.target.value)}
                    onBlur={() => setEditing(null)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); setEditing(null); } }}
                    style={{ position: "absolute", top: "50%", left: n.type === "decision" ? "18%" : "8%", transform: "translateY(-50%)", width: n.type === "decision" ? "64%" : "84%", textAlign: "center", fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: C.ink, background: "rgba(255,255,255,0.95)", border: `1px solid ${C.spotlight}`, borderRadius: 5, padding: "2px 3px", boxSizing: "border-box", zIndex: 6 }} />
                ) : (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: n.type === "decision" ? 18 : 10, textAlign: "center", fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: meta.border, lineHeight: 1.2, pointerEvents: "none", overflow: "hidden" }}>
                    {resolve(fcNodeText(n, meta.name, fcNodeNums))}
                  </div>
                )}
                {showDots && DOTS.map(([side, fx, fy]) => (
                  <div key={side}
                    onMouseDown={(e) => startLink(e, n)}
                    title="Drag to connect"
                    style={{ position: "absolute", left: w * fx - 6, top: h * fy - 6, width: 12, height: 12, borderRadius: "50%", background: "#fff", border: `2px solid #3B6FB0`, cursor: "crosshair", zIndex: 5 }}
                  />
                ))}
                {selNodes.length === 1 && isSel && !isEditing && [["nw", 0, 0, "nwse"], ["ne", 1, 0, "nesw"], ["sw", 0, 1, "nesw"], ["se", 1, 1, "nwse"]].map(([corner, fx, fy, cur]) => (
                  <div key={corner}
                    onMouseDown={(e) => startResize(e, n, corner)}
                    title="Drag to resize"
                    style={{ position: "absolute", left: w * fx - 5, top: h * fy - 5, width: 10, height: 10, background: "#fff", border: `2px solid ${C.spotlight}`, borderRadius: 2, cursor: cur + "-resize", zIndex: 7 }}
                  />
                ))}
              </div>
            );
          })}
          </div>
          {/* Route stepper — sits on the canvas, top-left, so stepping through the
              ways to an ending happens next to the line that lights up rather than
              up in the bar. Only there when the lit ending has more than one route.
              The neon dot is the same one as that ending's chip. */}
          {route && routes.length > 1 && (
            <div style={{ position: "absolute", left: 12, top: 12, display: "flex", alignItems: "center", gap: 2, background: C.card, border: `1px solid ${traceColor || C.line}`, borderRadius: 9, padding: 3, boxShadow: `0 1px 4px rgba(0,0,0,0.12)${traceColor ? `, 0 0 10px ${traceColor}55` : ""}`, zIndex: 15 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, margin: "0 5px 0 6px", background: traceColor, boxShadow: `0 0 6px ${traceColor}` }} />
              <button onClick={() => setRouteIdx((i) => (i - 1 + routes.length) % routes.length)} title="Previous route to this ending" style={fcZoomBtn}><ChevronLeft size={14} /></button>
              <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: C.ink, whiteSpace: "nowrap" }}>
                Route {routeIdx + 1} of {routes.length}
              </span>
              <button onClick={() => setRouteIdx((i) => (i + 1) % routes.length)} title="Next route to this ending" style={fcZoomBtn}><ChevronRight size={14} /></button>
            </div>
          )}
          {/* Zoom controls */}
          <div style={{ position: "absolute", right: 12, bottom: 12, display: "flex", alignItems: "center", gap: 2, background: C.card, border: `1px solid ${C.line}`, borderRadius: 9, padding: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.12)", zIndex: 15 }}>
            <button onClick={() => zoomBy(0.9)} title="Zoom out" style={fcZoomBtn}>−</button>
            <button onClick={resetView} title="Reset to 100%" style={{ ...fcZoomBtn, width: "auto", minWidth: 44, padding: "0 8px", fontSize: 11.5 }}>{Math.round(view.scale * 100)}%</button>
            <button onClick={() => zoomBy(1.1)} title="Zoom in" style={fcZoomBtn}>+</button>
            <button onClick={fitView} title="Fit to screen (Ctrl+Shift+H)" style={fcZoomBtn}><Maximize size={14} /></button>
          </div>
        </div>

        {/* Inspector + validation */}
        <div style={{ width: 258, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={panelCard}>
            {selNodes.length > 1 ? (
              <>
                <span style={labelStyle}>{selNodes.length} shapes selected</span>
                <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.slate, margin: "10px 0 0", lineHeight: 1.5 }}>
                  Drag any of them to move the group. Ctrl+C / Ctrl+V copies them together.
                </p>
                <button onClick={() => deleteNodes(selNodes)} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, cursor: "pointer", padding: "7px 11px", fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.curtainDeep }}>
                  <Trash2 size={14} /> Delete {selNodes.length} shapes
                </button>
              </>
            ) : selectedNode ? (
              <>
                <span style={labelStyle}>{FC_META[selectedNode.type].name} shape</span>
                <label style={{ display: "block", marginTop: 12, fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate }}>Label
                  <input value={selectedNode.label} onFocus={record} onChange={(e) => setNodeLabel(selectedNode.id, e.target.value)} placeholder={FC_META[selectedNode.type].name} style={inputStyle} />
                </label>
                {fcNodeNums[selectedNode.id] && (
                  <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.slate, margin: "8px 0 0", lineHeight: 1.5 }}>
                    Shown on the chart as <b>{fcNodeNums[selectedNode.id]} {selectedNode.label || FC_META[selectedNode.type].name}</b> — nodes are numbered automatically along the flow (following the arrows). Just type the name.{fcIsTask(selectedNode) && (selectedNode.subtasks?.length > 0) && <> Its subtasks show as <b>{fcSubNumber(fcNodeNums[selectedNode.id], 0)}, {fcSubNumber(fcNodeNums[selectedNode.id], 1)}…</b></>}
                  </p>
                )}

                {fcIsTask(selectedNode) && (
                  <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.slate, margin: "12px 0 0", lineHeight: 1.5 }}>
                    Switch to <b>Editor</b> to add subtasks, an assignee and a due date for this task.{selectedNode.type === "decision" && <> Name its branches <b>Approved / Not approved</b> to also email an approver to sign it off.</>}
                  </p>
                )}

                <button onClick={() => deleteNode(selectedNode.id)} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, cursor: "pointer", padding: "7px 11px", fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.curtainDeep }}>
                  <Trash2 size={14} /> Delete shape
                </button>
              </>
            ) : selectedEdge ? (
              <>
                <span style={labelStyle}>Connection</span>
                <label style={{ display: "block", marginTop: 12, fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate }}>Branch label
                  <input value={selectedEdge.label} onFocus={record} onChange={(e) => setEdgeLabel(selectedEdge.id, e.target.value)} placeholder="e.g. Yes / No" style={inputStyle} />
                </label>
                <button onClick={() => deleteEdge(selectedEdge.id)} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, cursor: "pointer", padding: "7px 11px", fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.curtainDeep }}>
                  <Trash2 size={14} /> Delete connection
                </button>
              </>
            ) : (
              <>
                <span style={labelStyle}>Inspector</span>
                <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.slate, margin: "10px 0 0", lineHeight: 1.5 }}>
                  Select a shape or connection to rename or delete it. Double-click anything to rename it inline.
                </p>
              </>
            )}
          </div>

          <div style={panelCard}>
            <span style={labelStyle}>Workflow rules</span>
            {valid ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.sageDeep }}>
                <CheckCircle2 size={16} /> All rules pass — ready to run.
              </div>
            ) : (
              <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {errors.map((err, i) => {
                  const locatable = !!(err.nodeId || err.edgeId);
                  const active = err.nodeId && selNode === err.nodeId;
                  return (
                    <li key={i}>
                      <button
                        onClick={() => focusError(err)}
                        disabled={!locatable}
                        title={locatable ? "Click to jump to the shape" : ""}
                        style={{
                          width: "100%", textAlign: "left", display: "flex", gap: 8, alignItems: "flex-start",
                          background: active ? "#FBEAE8" : "transparent",
                          border: `1px solid ${active ? "#F0C9C4" : "transparent"}`,
                          borderRadius: 8, padding: "7px 8px", cursor: locatable ? "pointer" : "default",
                        }}>
                        <AlertTriangle size={14} color="#C99A2E" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ display: "flex", flexDirection: "column", gap: 3, fontFamily: "'Work Sans', sans-serif" }}>
                          <span style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.4, fontWeight: 600 }}>{err.msg}</span>
                          {err.hint && <span style={{ fontSize: 11.5, color: C.slate, lineHeight: 1.4 }}>{err.hint}</span>}
                          {locatable && <span style={{ fontSize: 11, color: C.spotlight, fontWeight: 600 }}>Jump to shape →</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div style={panelCard}>
            <span style={labelStyle}>Shortcuts</span>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["Add shape", "Drag / click"],
                ["Rename", "Double-click"],
                ["Connect", "Drag blue dot"],
                ["Move shape", "Drag"],
                ["Resize", "Drag corners"],
                ["Multi-select", "Shift+drag / click"],
                ["Delete", "Del / ⌫"],
                ["Undo", "Ctrl + Z"],
                ["Redo", "Ctrl + Y"],
                ["Copy / Paste", "Ctrl + C / V"],
                ["Zoom", "Ctrl + Scroll"],
                ["Fit to screen", "Ctrl+Shift+H"],
                ["Pan", "Drag canvas"],
              ].map(([action, keys]) => (
                <div key={action} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.slate }}>{action}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 500, color: C.inkSoft, background: C.paperDim, border: `1px solid ${C.line}`, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" }}>{keys}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Chosen-flow banner — shows in Editor & Kanban once a flow is committed. Lets the
          HOD change the flow, reveal off-branch tasks, or spin the other endings off. */}
      {(fcMode === "editor" || fcMode === "kanban") && chosenEnd && (() => {
        const endNode = nodes.find((n) => n.id === chosenEnd);
        const endLabel = `${fcNodeNums[chosenEnd] ? fcNodeNums[chosenEnd] + " " : ""}${endNode?.label || "End"}`;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", marginBottom: 14, background: "#F1F8F3", border: "1px solid #Bfe0Cc", borderRadius: 12, flexShrink: 0, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 700, color: C.sageDeep }}><GitBranch size={14} /> Chosen flow</span>
            <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600, color: C.ink, flexShrink: 0 }}>→ {endLabel}</span>
            <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, flex: 1, minWidth: 120 }}>
              {showOffBranch ? "Showing every branch — off-flow tasks included." : "Showing only this flow's tasks."}
            </span>
            <button onClick={() => setShowOffBranch((v) => !v)} title="Reveal the other branches so you can pull an off-flow task in" style={{ ...fcBarBtn, flexShrink: 0, background: showOffBranch ? C.ink : C.paper, color: showOffBranch ? "#fff" : C.slate, border: `1px solid ${showOffBranch ? C.ink : C.line}` }}>
              {showOffBranch ? <Check size={13} /> : <GitBranch size={13} />} {showOffBranch ? "Showing all branches" : "Show other branches"}
            </button>
            {onDuplicate && (
              <button onClick={onDuplicate} title="Copy this flowchart into a new workflow for the other endings" style={{ ...fcBarBtn, flexShrink: 0, background: C.paper }}><Copy size={13} /> New workflow for other endings</button>
            )}
            <button onClick={clearFlow} title="Un-choose this flow and edit the whole chart again" style={{ ...fcBarBtn, flexShrink: 0, background: C.paper }}><X size={13} /> Change flow</button>
          </div>
        );
      })()}

      {/* Kanban mode — the same tasks as the Editor, laid out as a board */}
      {fcMode === "kanban" && (
        <FcKanban
          chosenEnd={chosenEnd}
          showOffBranch={showOffBranch}
          nodes={nodes}
          edges={edges}
          onPatch={(nodeId, patch) => { record(); patchNode(nodeId, patch); }}
          onPatchQuiet={(nodeId, patch) => patchNode(nodeId, patch)}
          onRecord={() => record()}
        />
      )}

      {/* Editor mode — add subtasks, assignee and due date to each main task */}
      {fcMode === "editor" && (
      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        {(() => {
          // Listed in flow order so the badges (2.0, 3.0, …) read in sequence and match
          // the chart; ties fall back to canvas position.
          const tasks = nodes.filter(fcIsTask).slice().sort(
            (a, b) => (parseInt(fcNodeNums[a.id]) || 0) - (parseInt(fcNodeNums[b.id]) || 0) || (a.y - b.y) || (a.x - b.x)
          );
          // Per-step locks the HOD sets, shared with each assignee's My Work view.
          const lockInfo = fcLockInfo(tasks);
          // Which tasks a decision has cut off, so the editor can offer "include anyway".
          const activeStatus = fcActiveSet(nodes, edges);
          // Once a flow is chosen, show only its tasks — unless the HOD flips "Show other
          // branches" to pull an off-branch step in.
          const shownTasks = (chosenEnd && !showOffBranch) ? tasks.filter((n) => activeStatus[n.id] === "active") : tasks;
          if (!tasks.length) return (
            <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ ...panelCard, textAlign: "center", padding: "44px 24px", maxWidth: 520, margin: "0 auto" }}>
              <ListChecks size={26} color={C.slateLight} />
              <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: C.ink, margin: "12px 0 6px" }}>No tasks yet</h3>
              <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, margin: "0 0 16px", lineHeight: 1.55 }}>
                Build your workflow in the <b>Flowchart</b> first. Each task box becomes a row here where you add subtasks, an assignee and a due date.
              </p>
              <button onClick={() => setFcMode("flowchart")} style={{ ...fcBarBtn, display: "inline-flex", margin: "0 auto" }}><GitMerge size={14} /> Go to flowchart</button>
            </div>
            </div>
          );
          return (
            <>
              {/* Left index — clickable list of every task and its subtasks */}
              <div style={{ flexShrink: 0, width: 250, alignSelf: "stretch", overflowY: "auto", ...panelCard, padding: 0 }}>
                <div style={{ position: "sticky", top: 0, background: C.card, borderBottom: `1px solid ${C.line}`, padding: "11px 14px", zIndex: 1 }}>
                  <span style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}><ListChecks size={14} color={C.spotlightDeep} /> Task list</span>
                </div>
                <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                  {shownTasks.map((n, i) => {
                    const subs = n.subtasks || [];
                    const hasSubs = subs.length > 0;
                    const open = !!openTasks[n.id];
                    const nDone = fcNodeDone(n);
                    return (
                      <div key={n.id} style={{ display: "flex", flexDirection: "column" }}>
                        {/* Click a task with subtasks to open/close it; a task with none just jumps to its card */}
                        <button onClick={() => (hasSubs ? toggleTaskOpen(n.id) : jumpToItem(`task-${n.id}`))}
                          title={hasSubs ? (open ? "Hide subtasks" : "Show subtasks") : "Jump to this task"}
                          onMouseEnter={(e) => (e.currentTarget.style.background = C.paperDim)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          style={{ display: "flex", alignItems: "center", gap: 6, textAlign: "left", width: "100%", background: "transparent", border: "none", cursor: "pointer", borderRadius: 7, padding: "7px 8px", fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: C.ink }}>
                          <span style={{ flexShrink: 0, width: 14, display: "flex", alignItems: "center", justifyContent: "center", color: C.slate }}>
                            {hasSubs ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
                          </span>
                          <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, background: nDone ? C.sageDeep : C.inkSoft, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700 }}>{nDone ? <CheckSquare size={12} /> : i + 1}</span>
                          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: nDone ? C.slateLight : C.ink, textDecoration: nDone ? "line-through" : "none" }}>{resolve(n.label || FC_META[n.type].name)}</span>
                          {lockInfo[n.id]?.locked && <Lock size={12} style={{ flexShrink: 0, color: C.spotlightDeep }} />}
                          {hasSubs && <span style={{ flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: C.slateLight }}>{subs.filter((s) => s.done).length}/{subs.length}</span>}
                        </button>
                        {open && subs.map((s) => (
                          <button key={s.id} onClick={() => jumpToItem(`sub-${n.id}-${s.id}`)} title="Jump to this subtask"
                            onMouseEnter={(e) => (e.currentTarget.style.background = C.paperDim)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            style={{ display: "flex", alignItems: "center", gap: 7, textAlign: "left", width: "100%", background: "transparent", border: "none", cursor: "pointer", borderRadius: 7, padding: "5px 8px 5px 42px", fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: s.done ? C.slateLight : C.slate, textDecoration: s.done ? "line-through" : "none" }}>
                            <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: "50%", background: s.done ? C.sageDeep : C.slateLight }} />
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || "Untitled subtask"}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Right — the editable task cards */}
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 780, margin: "0 auto" }}>

              {/* Variables — filled once by the HOD, then referenced anywhere as {{key}} and
                  resolved in node text, reminder emails and approval emails. */}
              <div style={{ ...panelCard }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
                    <Braces size={14} color={C.spotlightDeep} /> Saved data
                  </span>
                  <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.slateLight }}>· save a value once, drop it in anywhere as <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>{"{key}"}</code> or <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>{"{{key}}"}</code></span>
                  <button onClick={addVariable} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, cursor: "pointer", padding: "5px 10px", fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: C.spotlight }}><Plus size={13} /> Add data</button>
                </div>
                {variables.length === 0 ? (
                  <p style={{ margin: "6px 0 0", fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.slate, lineHeight: 1.5 }}>
                    Nothing saved yet. Add a row — e.g. key <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>name1</code> with value <i>Loghan</i> — then type <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>{"{name1}"}</code> in any task's instructions or email and it becomes <i>Loghan</i>. (Or use <b>Insert variable</b>.)
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {variables.map((v) => (
                      <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                        <label style={{ flex: "1 1 120px", fontFamily: "'Work Sans', sans-serif", fontSize: 11, color: C.slate }}>Key ({"{name1}"})
                          <input value={v.key} onChange={(e) => updateVariableKey(v.id, e.target.value)} placeholder="name1" style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} />
                        </label>
                        <label style={{ flex: "1 1 130px", fontFamily: "'Work Sans', sans-serif", fontSize: 11, color: C.slate }}>Label
                          <input value={v.label} onChange={(e) => updateVariableLabel(v.id, e.target.value)} placeholder="First name" style={inputStyle} />
                        </label>
                        <label style={{ flex: "2 1 180px", fontFamily: "'Work Sans', sans-serif", fontSize: 11, color: C.slate }}>Value
                          <input value={v.value} onChange={(e) => updateVariableValue(v.id, e.target.value)} placeholder="Loghan" style={inputStyle} />
                        </label>
                        <button onClick={() => removeVariable(v.id)} title="Delete variable" style={{ flexShrink: 0, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, cursor: "pointer", padding: 8, color: C.slate, display: "flex", alignItems: "center", height: 34 }}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {shownTasks.map((n, i) => {
                const subs = n.subtasks || [];
                const subsDone = subs.filter((s) => s.done).length;
                const nDone = fcNodeDone(n);
                const dm = fcDueMeta(n.due, nDone);
                const { prevTask, lockedByPrev, lockedByKey, locked, lockReason } = lockInfo[n.id];
                return (
                  <div key={n.id} ref={(el) => { editorRefs.current[`task-${n.id}`] = el; }} style={{ ...panelCard, padding: 0, overflow: "hidden", outline: flashItem === `task-${n.id}` ? `2px solid ${C.spotlight}` : "2px solid transparent", outlineOffset: 2, transition: "outline-color 0.4s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.line}`, background: nDone ? "#F1F8F3" : C.paper }}>
                      <span style={{ flexShrink: 0, minWidth: 30, height: 24, padding: "0 5px", borderRadius: 7, background: nDone ? C.sageDeep : C.inkSoft, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }} title="Auto flow-order number — matches the chart">{nDone ? <CheckSquare size={13} /> : (fcNodeNums[n.id] || i + 1)}</span>
                      <input value={n.label} onFocus={(e) => { record(); lastField.current = { el: e.target, getValue: () => n.label || "", onChange: (val) => setNodeLabel(n.id, val) }; }} onChange={(e) => setNodeLabel(n.id, e.target.value)} placeholder={FC_META[n.type].name}
                        style={{ flex: 1, minWidth: 0, fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600, color: nDone ? C.slateLight : C.ink, textDecoration: nDone ? "line-through" : "none", background: "transparent", border: "1px solid transparent", borderRadius: 7, padding: "4px 7px" }} />
                      <span style={{ flexShrink: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 600, color: dm.color, background: dm.bg, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{dm.label}</span>
                      {nDone ? (
                        <span title={subs.length > 0 ? "All subtasks are done — completed automatically" : "The assignee ticked this off"} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, background: "#F1F8F3", border: "1px solid #Bfe0Cc", borderRadius: 8, padding: "6px 10px", fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: C.sageDeep }}><CheckCircle2 size={14} /> Done</span>
                      ) : locked ? (
                        <span title={lockReason} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, background: C.paperDim, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: C.slateLight }}><Lock size={13} /> Locked</span>
                      ) : subs.length > 0 ? (
                        <span title="Completes automatically once every subtask is ticked off" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, background: C.paperDim, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: C.slate }}><Clock size={13} /> {subsDone}/{subs.length} subtasks</span>
                      ) : (
                        <span title="Waiting for the assignee to complete this in My Work" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, background: C.paperDim, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: C.slate }}><Clock size={13} /> Awaiting assignee</span>
                      )}
                    </div>
                    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
                      {locked && (
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#FBF3E0", border: "1px solid #EBD9A8", borderRadius: 8, padding: "10px 12px" }}>
                          <Lock size={15} color={C.spotlightDeep} style={{ flexShrink: 0, marginTop: 1 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: C.inkSoft, lineHeight: 1.4 }}>{lockReason}</div>
                            {lockedByKey && (n.guidance || "").trim() && (
                              <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, marginTop: 5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{n.guidance}</div>
                            )}
                            <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.slateLight, marginTop: 7, fontStyle: "italic" }}>The assignee unlocks and completes this from My Work.</div>
                          </div>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <label style={{ flex: "1 1 160px", fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate }}>Assignee name
                          <input value={n.assignee?.name || ""} onFocus={record} onChange={(e) => setAssignee(n.id, "name", e.target.value)} placeholder="e.g. Aisha Rahman" style={inputStyle} />
                        </label>
                        <label style={{ flex: "1 1 180px", fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate }}>Assignee Gmail
                          <input type="email" value={n.assignee?.email || ""} onFocus={record} onChange={(e) => setAssignee(n.id, "email", e.target.value)} placeholder="name@gmail.com" style={inputStyle} />
                        </label>
                        <label style={{ flex: "0 1 150px", fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate }}>Due date
                          <input type="date" value={n.due || ""} onFocus={record} onChange={(e) => setDue(n.id, e.target.value)} style={inputStyle} />
                        </label>
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ flex: 1, fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate }}>What to do (goes in the assignment email)</span>
                          {insertTokens.length > 0 && (
                            <InsertVariableMenu labels={insertTokens} onInsert={insertVarToken} />
                          )}
                        </div>
                        <textarea value={n.instructions || ""}
                          onFocus={(e) => { record(); lastField.current = { el: e.target, getValue: () => n.instructions || "", onChange: (val) => setInstructions(n.id, val) }; }}
                          onChange={(e) => setInstructions(n.id, e.target.value)} placeholder="Explain the task for the assignee…" rows={2} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.4 }} />
                      </div>

                      {/* Step rules — the HOD decides who can start this step, and when */}
                      <div style={{ borderTop: `1px dashed ${C.line}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 11 }}>
                        <span style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
                          <Lock size={14} color={C.spotlightDeep} /> Step rules
                          <span style={{ color: C.slateLight, fontWeight: 500 }}>· who can start this, and when</span>
                        </span>
                        <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: i > 0 ? "pointer" : "not-allowed", opacity: i > 0 ? 1 : 0.55 }}>
                          <input type="checkbox" disabled={i === 0} checked={!!n.lockPrev} onChange={(e) => { record(); patchNode(n.id, { lockPrev: e.target.checked }); }} style={{ accentColor: C.spotlight, marginTop: 2, flexShrink: 0, cursor: i > 0 ? "pointer" : "not-allowed" }} />
                          <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.ink, lineHeight: 1.4 }}>
                            Wait for the previous step
                            <span style={{ display: "block", fontSize: 11.5, color: C.slate }}>{i > 0 ? `Stays locked until step ${i} “${prevTask?.label || "the step before"}” is ticked off.` : "This is the first step — nothing comes before it."}</span>
                          </span>
                        </label>
                        <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer" }}>
                          <input type="checkbox" checked={!!n.keyStep} onChange={(e) => { record(); patchNode(n.id, { keyStep: e.target.checked, keyAck: false }); }} style={{ accentColor: C.spotlight, marginTop: 2, flexShrink: 0 }} />
                          <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.ink, lineHeight: 1.4 }}>
                            Key step — lock it and show guidance first
                            <span style={{ display: "block", fontSize: 11.5, color: C.slate }}>For crucial steps. The assignee must read your note and unlock it before they can tick it off.</span>
                          </span>
                        </label>
                        {n.keyStep && (
                          <textarea value={n.guidance || ""} onFocus={record} onChange={(e) => patchNode(n.id, { guidance: e.target.value })} placeholder="Guidance the assignee must read before starting — why it matters, what to watch for, who to check with…" rows={2} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.4 }} />
                        )}
                      </div>

                      {/* Off-branch step — the HOD can hand-pick a task from a branch that wasn't chosen */}
                      {(activeStatus[n.id] === "skipped" || n.forceInclude) && (
                      <div style={{ borderTop: `1px dashed ${C.line}`, paddingTop: 12 }}>
                        <span style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
                          <GitMerge size={14} color={C.spotlightDeep} /> Off-branch step
                        </span>
                        <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", marginTop: 9 }}>
                          <input type="checkbox" checked={!!n.forceInclude} onChange={(e) => { record(); patchNode(n.id, { forceInclude: e.target.checked }); }} style={{ accentColor: C.spotlight, marginTop: 2, flexShrink: 0 }} />
                          <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.ink, lineHeight: 1.4 }}>
                            Include this step anyway
                            <span style={{ display: "block", fontSize: 11.5, color: C.slate }}>{n.forceInclude ? "Pulled in manually — this step is live for its assignee even though its branch wasn’t chosen." : "This step is on a branch you didn’t choose, so it’s skipped. Tick to hand it to its assignee anyway."}</span>
                          </span>
                        </label>
                      </div>
                      )}

                      {/* Branching — the HOD picks which branch this decision takes (any decision) */}
                      {n.type === "decision" && (
                      <div style={{ borderTop: `1px dashed ${C.line}`, paddingTop: 12 }}>
                        <span style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
                          <GitMerge size={14} color={C.spotlightDeep} /> Which branch does this take?
                        </span>
                        <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, lineHeight: 1.5, margin: "8px 0 0" }}>
                          You decide the outcome here. Pick a branch and only <b>that</b> branch's downstream steps activate for the assignees — the others are skipped. Name each arrow leaving this decision (double-click it) so it becomes a choice.
                        </p>
                        {(() => {
                          const labels = fcBranchLabels(n.id, edges);
                          if (!labels.length) return (
                            <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: "#B23A2E", margin: "8px 0 0" }}>No arrows are labelled yet — double-click each arrow leaving this decision to name the choice.</p>
                          );
                          const chosen = (n.decisionChoice || "").trim();
                          return (
                            <>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}>
                                {labels.map((l) => {
                                  const isChosen = chosen === l;
                                  return (
                                    <button key={l} onClick={() => { record(); patchNode(n.id, { decisionChoice: l, done: true, completedAt: new Date().toISOString() }); }} title={isChosen ? "This is the chosen path" : `Send the flow down “${l}”`}
                                      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: isChosen ? C.sageDeep : C.paper, color: isChosen ? "#fff" : C.ink, border: `1px solid ${isChosen ? C.sageDeep : C.line}`, borderRadius: 8, padding: "8px 13px", cursor: "pointer", fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>
                                      {isChosen && <CheckCircle2 size={14} />} {l}
                                    </button>
                                  );
                                })}
                              </div>
                              {chosen ? (
                                <div style={{ marginTop: 9, fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, lineHeight: 1.5 }}>
                                  This decision goes down <b style={{ color: C.sageDeep }}>{chosen}</b> — those steps are now live; the other branches are skipped.{" "}
                                  <button onClick={() => { record(); patchNode(n.id, { decisionChoice: "", done: false }); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.spotlight, fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>Change</button>
                                </div>
                              ) : (
                                <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.slateLight, margin: "8px 0 0" }}>Not chosen yet — steps after this decision stay locked until you pick a branch.</p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      )}

                      {/* Send for approval — ONLY on a decision whose branches are Approved / Not approved */}
                      {isApprovalDecision(n) && (
                      <div style={{ borderTop: `1px dashed ${C.line}`, paddingTop: 12 }}>
                        <span style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
                          <Mail size={14} color={C.spotlightDeep} /> Send for approval
                          <span style={{ color: C.slateLight, fontWeight: 500 }}>· Approved / Not approved</span>
                        </span>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                          <label style={{ flex: "1 1 160px", fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate }}>Approver name
                            <input value={n.approver?.name || ""} onFocus={record} onChange={(e) => setApprover(n.id, "name", e.target.value)} placeholder="e.g. HOD / CEO name" style={inputStyle} />
                          </label>
                          <label style={{ flex: "1 1 180px", fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate }}>Approver Gmail
                            <input type="email" value={n.approver?.email || ""} onFocus={record} onChange={(e) => setApprover(n.id, "email", e.target.value)} placeholder="approver@gmail.com" style={inputStyle} />
                          </label>
                        </div>
                        {(() => {
                          const em = fcApprovalEmail({ approverName: n.approver?.name, approverEmail: n.approver?.email, itemName: n.label || FC_META[n.type].name, template, workNote: n.instructions, vars: varMap });
                          const key = `${n.id}-approval`;
                          const stt = sendState[key] || "";
                          const err = stt.startsWith("error");
                          const disabled = !em.to.length || stt === "sending";
                          return (
                            <div style={{ marginTop: 10 }}>
                              <button disabled={disabled} onClick={() => sendEmailNow(key, em)}
                                style={{ display: "inline-flex", alignItems: "center", gap: 6, background: stt === "sent" ? C.sageDeep : disabled ? C.slateLight : C.spotlight, color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", cursor: disabled ? "not-allowed" : "pointer", fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600 }}>
                                <Send size={13} />
                                {!em.to.length ? "Add approver email first" : stt === "sending" ? "Sending…" : stt === "sent" ? "✓ Approval request sent" : err ? "Failed — retry" : "Send for approval"}
                              </button>
                              {err && <span style={{ marginLeft: 10, fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: "#B23A2E" }}>{stt.slice(6)}</span>}
                            </div>
                          );
                        })()}
                      </div>
                      )}

                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}><ListTodo size={14} color={C.spotlightDeep} /> Subtasks {subs.length > 0 && <span style={{ color: C.slateLight, fontWeight: 500 }}>· {subsDone}/{subs.length}</span>}</span>
                          <button onClick={() => addSubtask(n.id)} style={{ ...fcBarBtn, padding: "5px 9px", fontSize: 12 }}><Plus size={13} /> Subtask</button>
                        </div>
                        {subs.length === 0 ? (
                          <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slateLight, margin: "8px 0 0" }}>No subtasks yet — break the task into steps for the assignee.</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                            {subs.map((s, si) => {
                              const subInherit = !(s.assignee?.email || "").trim();
                              const subWho = subInherit
                                ? (n.assignee?.name || n.assignee?.email || "the task's assignee")
                                : (s.assignee?.name || s.assignee?.email);
                              return (
                              <div key={s.id} ref={(el) => { editorRefs.current[`sub-${n.id}-${s.id}`] = el; }} style={{ display: "flex", flexDirection: "column", gap: 8, background: flashItem === `sub-${n.id}-${s.id}` ? "#FBF3E7" : C.paper, border: `1px solid ${flashItem === `sub-${n.id}-${s.id}` ? C.spotlight : C.line}`, borderRadius: 8, padding: "8px 10px", transition: "background 0.4s, border-color 0.4s" }}>
                               <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {s.done
                                  ? <CheckCircle2 size={15} color={C.sageDeep} style={{ flexShrink: 0 }} title="The assignee ticked this off" />
                                  : <Circle size={15} color={C.slateLight} style={{ flexShrink: 0 }} />}
                                {fcNodeNums[n.id] && <span style={{ flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, fontWeight: 700, color: C.slateLight }}>{fcSubNumber(fcNodeNums[n.id], si)}</span>}
                                <input value={s.title} onChange={(e) => updateSubtask(n.id, s.id, { title: e.target.value })} placeholder="Describe the subtask…"
                                  style={{ flex: 1, minWidth: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: s.done ? C.slateLight : C.ink, textDecoration: s.done ? "line-through" : "none", background: "transparent", border: "none", outline: "none", padding: "4px 2px" }} />
                                <span style={{ flexShrink: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: s.done ? C.sageDeep : C.slateLight, background: s.done ? "#EAF4EC" : C.paperDim, borderRadius: 999, padding: "2px 8px" }}>{s.done ? "Done" : "Pending"}</span>
                                {isApprovalDecision(n) && (() => {
                                  const key = `${n.id}-sub-${s.id}-approval`;
                                  const stt = sendState[key] || "";
                                  const canSend = !!(n.approver?.email && s.title.trim());
                                  const em = fcApprovalEmail({ approverName: n.approver?.name, approverEmail: n.approver?.email, itemName: s.title || "subtask", template, workNote: `the subtask “${s.title}” (part of “${n.label || FC_META[n.type].name}”)`, vars: varMap });
                                  const title = !n.approver?.email ? "Set an approver email above first" : !s.title.trim() ? "Name the subtask first" : stt === "sent" ? "Approval request sent" : "Send this subtask for approval";
                                  return (
                                    <button disabled={!canSend || stt === "sending"} onClick={() => sendEmailNow(key, em)} title={title}
                                      style={{ flexShrink: 0, background: "none", border: "none", cursor: canSend ? "pointer" : "not-allowed", padding: 4, color: stt === "sent" ? C.sageDeep : stt.startsWith("error") ? "#B23A2E" : canSend ? C.spotlight : C.slateLight, display: "flex", alignItems: "center" }}>
                                      {stt === "sent" ? <CheckSquare size={14} /> : <Send size={14} />}
                                    </button>
                                  );
                                })()}
                                <button onClick={() => removeSubtask(n.id, s.id)} title="Delete subtask" style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: 4, color: C.slateLight, display: "flex", alignItems: "center" }}><Trash2 size={14} /></button>
                               </div>
                               <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingLeft: 23 }}>
                                 <input value={s.assignee?.name || ""} onFocus={record} onChange={(e) => updateSubtask(n.id, s.id, { assignee: { ...(s.assignee || {}), name: e.target.value } })} placeholder={`Assignee name — blank = ${n.assignee?.name || "task's assignee"}`}
                                   style={{ flex: "1 1 150px", minWidth: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.ink, background: C.paperDim, border: `1px solid ${C.line}`, borderRadius: 6, padding: "5px 8px" }} />
                                 <input type="email" value={s.assignee?.email || ""} onFocus={record} onChange={(e) => updateSubtask(n.id, s.id, { assignee: { ...(s.assignee || {}), email: e.target.value } })} placeholder="Different Gmail? (blank = same as task)"
                                   style={{ flex: "1 1 170px", minWidth: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.ink, background: C.paperDim, border: `1px solid ${C.line}`, borderRadius: 6, padding: "5px 8px" }} />
                               </div>
                               <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, color: C.slateLight, paddingLeft: 23 }}>
                                 Goes to <b style={{ color: C.slate }}>{subWho}</b>{subInherit ? " (same as the task)" : ""} — they tick it off and attach proof in <b style={{ color: C.slate }}>My Work</b>.
                               </div>
                               {s.proof && (
                                 <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 23 }}>
                                   {s.proof.type?.startsWith("image/")
                                     ? <img src={s.proof.dataUrl} alt="proof" style={{ width: 26, height: 26, objectFit: "cover", borderRadius: 5 }} />
                                     : <Paperclip size={13} color={C.slate} />}
                                   <a href={s.proof.dataUrl} download={s.proof.name} style={{ flex: 1, minWidth: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.spotlight, textDecoration: "none", wordBreak: "break-all" }}>{s.proof.name}</a>
                                   <span style={{ flexShrink: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 10.5, color: C.slateLight, whiteSpace: "nowrap" }}>proof from assignee</span>
                                 </div>
                               )}
                              </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Form fields — HOD defines; the assignee fills them in from My Work */}
                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}><ClipboardList size={14} color={C.spotlightDeep} /> Form fields {(n.formFields?.length ?? 0) > 0 && <span style={{ color: C.slateLight, fontWeight: 500 }}>· {n.formFields.length}</span>}</span>
                          <button onClick={() => addFormField(n.id)} style={{ ...fcBarBtn, padding: "5px 9px", fontSize: 12 }}><Plus size={13} /> Field</button>
                        </div>
                        {(n.formFields?.length ?? 0) === 0 ? (
                          <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slateLight, margin: "8px 0 0" }}>No form fields — add one to collect an answer, date, choice or file from the assignee.</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                            {n.formFields.map((f) => {
                              const needsOptions = f.type === "dropdown" || f.type === "multiselect";
                              return (
                              <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 8, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px" }}>
                               <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <input value={f.label} onFocus={record} onChange={(e) => updateFormField(n.id, f.id, { label: e.target.value })} placeholder="Field label (what to ask for)…"
                                  style={{ flex: 1, minWidth: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.ink, background: "transparent", border: "none", outline: "none", padding: "4px 2px" }} />
                                <button onClick={() => removeFormField(n.id, f.id)} title="Delete field" style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: 4, color: C.slateLight, display: "flex", alignItems: "center" }}><Trash2 size={14} /></button>
                               </div>
                               <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", paddingLeft: 2 }}>
                                 <select value={f.type} onChange={(e) => updateFormField(n.id, f.id, { type: e.target.value })}
                                   style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.ink, background: C.paperDim, border: `1px solid ${C.line}`, borderRadius: 6, padding: "5px 8px", cursor: "pointer" }}>
                                   {FC_FIELD_TYPES.map((ft) => <option key={ft.type} value={ft.type}>{ft.label}</option>)}
                                 </select>
                                 <label style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.slate, cursor: "pointer" }}>
                                   <input type="checkbox" checked={!!f.required} onChange={(e) => updateFormField(n.id, f.id, { required: e.target.checked })} style={{ accentColor: C.spotlight, cursor: "pointer" }} /> Required
                                 </label>
                               </div>
                               {needsOptions && (
                                 <textarea value={(f.options || []).join("\n")} onFocus={record} onChange={(e) => updateFormField(n.id, f.id, { options: e.target.value.split("\n") })} placeholder={"One option per line…"} rows={2}
                                   style={{ ...inputStyle, fontSize: 11.5, resize: "vertical", lineHeight: 1.5 }} />
                               )}
                               <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, color: C.slateLight, paddingLeft: 2 }}>The assignee fills this in from <b style={{ color: C.slate }}>My Work</b>.</div>
                              </div>
                              );
                            })}
                          </div>
                        )}
                        {(n.formFields?.length ?? 0) > 0 && (
                          <div style={{ marginTop: 12, borderTop: `1px dashed ${C.line}`, paddingTop: 12 }}>
                            <span style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}><ExternalLink size={13} color={C.spotlightDeep} /> Collect from someone outside the org</span>
                            <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.slateLight, margin: "6px 0 9px", lineHeight: 1.5 }}>Create a link to send to a person who isn't on Flowghan. They fill the fields above and submit — the answers appear here.</p>
                            {!n.publicFormToken ? (
                              <button onClick={() => copyPublicLink(n.id)} style={{ ...fcBarBtn, padding: "7px 12px", fontSize: 12.5 }}><Link size={13} /> Create shareable link</button>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <input readOnly value={fcPublicFormUrl(n.publicFormToken)} onFocus={(e) => e.target.select()}
                                    style={{ flex: 1, minWidth: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.slate, background: C.paperDim, border: `1px solid ${C.line}`, borderRadius: 7, padding: "7px 9px", outline: "none" }} />
                                  <button onClick={() => copyPublicLink(n.id)} title="Copy link" style={{ ...fcBarBtn, padding: "7px 11px", fontSize: 12, flexShrink: 0, color: publicLinkFlash === n.id ? C.sageDeep : C.spotlight }}>
                                    {publicLinkFlash === n.id ? <><CheckCircle2 size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
                                  </button>
                                </div>
                                {n.publicFormSubmittedAt ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "#F1F8F3", border: "1px solid #Bfe0Cc", borderRadius: 8, padding: "10px 12px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: C.sageDeep }}><CheckCircle2 size={14} /> Response received {fcFmtDate(String(n.publicFormSubmittedAt).slice(0, 10))}</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                      {(n.formFields || []).map((f) => {
                                        const disp = fcFieldDisplay(f, n.formValues?.[f.id]);
                                        return (
                                          <div key={f.id} style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate }}>
                                            <b style={{ color: C.inkSoft }}>{resolve(f.label) || "Field"}:</b>{" "}
                                            {f.type === "file" && n.formValues?.[f.id]?.dataUrl
                                              ? <a href={n.formValues[f.id].dataUrl} download={n.formValues[f.id].name} style={{ color: C.spotlight, textDecoration: "none", wordBreak: "break-all" }}>{n.formValues[f.id].name}</a>
                                              : (disp !== undefined ? disp : <span style={{ color: C.slateLight, fontStyle: "italic" }}>—</span>)}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.slateLight }}><Clock size={13} /> Awaiting a response — send the link above.</div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {n.done && n.proof && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F1F8F3", border: `1px solid #Bfe0Cc`, borderRadius: 8, padding: 10 }}>
                          {n.proof.type?.startsWith("image/")
                            ? <img src={n.proof.dataUrl} alt="proof" style={{ width: 38, height: 38, objectFit: "cover", borderRadius: 6 }} />
                            : <Paperclip size={16} color={C.slate} />}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 600, color: C.sageDeep, textTransform: "uppercase", letterSpacing: "0.04em" }}>Proof attached</div>
                            <a href={n.proof.dataUrl} download={n.proof.name} style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.spotlight, textDecoration: "none", wordBreak: "break-all" }}>{n.proof.name}</a>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
              </div>
            </>
          );
        })()}
      </div>
      )}

      {/* Proof-of-completion modal — required before a task can be ticked off */}
      {proofFor && proofNode && (
        <div style={fcOverlay} onMouseDown={() => { setProofFor(null); setPendingProof(null); }}>
          <div style={{ ...fcModal, maxWidth: 460 }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, color: C.ink, margin: 0 }}>Proof of completion</h3>
                <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.slate, margin: "4px 0 0" }}>Attach proof to tick off “{proofNode.label || FC_META[proofNode.type].name}”.</p>
              </div>
              <button onClick={() => { setProofFor(null); setPendingProof(null); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.slate }}><X size={18} /></button>
            </div>
            <label style={{ display: "block", marginTop: 16, border: `1.5px dashed ${C.line}`, borderRadius: 10, padding: 18, textAlign: "center", cursor: "pointer", background: C.paper }}>
              <input type="file" accept="image/*,application/pdf" onChange={onProofFile} style={{ display: "none" }} />
              <Paperclip size={18} color={C.slate} />
              <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.ink, marginTop: 6, fontWeight: 600 }}>Choose an image or PDF</div>
              <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11.5, color: C.slate, marginTop: 2 }}>Up to 4 MB — stored in this browser</div>
            </label>
            {currentProof && (
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10 }}>
                {currentProof.type?.startsWith("image/")
                  ? <img src={currentProof.dataUrl} alt="proof preview" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }} />
                  : <div style={{ width: 64, height: 64, borderRadius: 8, background: C.paperDim, display: "flex", alignItems: "center", justifyContent: "center" }}><Paperclip size={22} color={C.slate} /></div>}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: C.ink, wordBreak: "break-all" }}>{currentProof.name}</div>
                  <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, color: C.slate }}>{(currentProof.size / 1024).toFixed(0)} KB</div>
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button onClick={() => { setProofFor(null); setPendingProof(null); }} style={{ ...secondaryBtn, flex: 1 }}>Cancel</button>
              <button disabled={!currentProof} onClick={() => markDone(proofFor, currentProof)} style={{ flex: 1, background: currentProof ? C.sageDeep : C.slateLight, color: "#fff", border: "none", borderRadius: 8, padding: "10px", cursor: currentProof ? "pointer" : "not-allowed", fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>Mark as done</button>
            </div>
          </div>
        </div>
      )}

      {/* Team emails — HOD (24h reminder) and CEO (escalation) */}
      {preview && (
        <FcPreview
          nodes={nodes} edges={edges} name={template.name}
          endNodes={endNodes} traceEnd={traceEnd} setTraceEnd={setTraceEnd}
          routes={routes} routeIdx={routeIdx} setRouteIdx={setRouteIdx}
          route={route} reach={reach} traceColor={traceColor} routeSteps={routeSteps}
          vars={varMap}
          onClose={() => setPreview(false)}
        />
      )}

      {confirmFlow && (() => {
        const endNode = nodes.find((n) => n.id === confirmFlow.end);
        const endLabel = `${fcNodeNums[confirmFlow.end] ? fcNodeNums[confirmFlow.end] + " " : ""}${endNode?.label || "End"}`;
        const steps = nodes.filter((n) => confirmFlow.route.nodes.has(n.id) && fcIsTask(n)).length;
        const choices = confirmFlow.route.choices;
        return (
          <div style={fcOverlay} onMouseDown={() => setConfirmFlow(null)}>
            <div style={{ ...fcModal, maxWidth: 460 }} onMouseDown={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, background: "#EAF4EC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><GitBranch size={17} color={C.sageDeep} /></span>
                <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, color: C.ink, margin: 0 }}>Use this flow?</h3>
              </div>
              <div style={{ marginTop: 14, background: C.paperDim, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13.5, fontWeight: 700, color: C.ink }}>→ {endLabel}</div>
                <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.slate, marginTop: 4 }}>
                  {steps} task{steps === 1 ? "" : "s"}{choices.length ? ` · route: ${choices.join(" › ")}` : ""}
                </div>
              </div>
              <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, margin: "14px 0 0", lineHeight: 1.55 }}>
                The tasks on this route go to the <b>Editor</b> and <b>Kanban</b>, and each decision it passes is answered for you. The other branches stay in the flowchart — you can change this anytime.
              </p>
              <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slateLight, margin: "10px 0 0", lineHeight: 1.5 }}>
                Want the other endings as their own workflow? {onDuplicate ? (
                  <button onClick={() => { setConfirmFlow(null); onDuplicate(); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.spotlight, fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 700 }}>Duplicate this flowchart →</button>
                ) : "Duplicate this flowchart from the Library."}
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
                <button onClick={() => setConfirmFlow(null)} style={{ ...fcBarBtn, background: C.paper }}>Cancel</button>
                <button onClick={() => commitFlow(confirmFlow.end, confirmFlow.route)} style={{ ...fcBarBtn, background: C.ink, color: "#fff", border: `1px solid ${C.ink}` }}><Check size={14} /> Use this flow</button>
              </div>
            </div>
          </div>
        );
      })()}

      {showTeam && (
        <div style={fcOverlay} onMouseDown={() => setShowTeam(false)}>
          <div style={{ ...fcModal, maxWidth: 460 }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, color: C.ink, margin: 0 }}>Team emails</h3>
                <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.slate, margin: "4px 0 0" }}>Who's copied on the 24-hour reminder and the overdue escalation.</p>
              </div>
              <button onClick={() => setShowTeam(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.slate }}><X size={18} /></button>
            </div>
            {[["hod", "HOD — this flowchart's Head of Dept · copied on the 24-hour reminder"], ["ceo", "CEO — company-wide · emailed when a task is overdue"]].map(([role, title]) => (
              <div key={role} style={{ marginTop: 16 }}>
                <span style={labelStyle}>{title}</span>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <input value={org[role]?.name || ""} onChange={(e) => setOrg((o) => ({ ...o, [role]: { ...o[role], name: e.target.value } }))} placeholder="Name" style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
                  <input type="email" value={org[role]?.email || ""} onChange={(e) => setOrg((o) => ({ ...o, [role]: { ...o[role], email: e.target.value } }))} placeholder="name@gmail.com" style={{ ...inputStyle, marginTop: 0, flex: 1.4 }} />
                </div>
              </div>
            ))}
            <button onClick={() => setShowTeam(false)} style={{ ...secondaryBtn, marginTop: 18, width: "100%" }}>Done</button>
          </div>
        </div>
      )}

      {/* Outbox — preview of every reminder email per assigned step */}
      {showOutbox && (
        <div style={fcOverlay} onMouseDown={() => setShowOutbox(false)}>
          <div style={fcModal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, color: C.ink, margin: 0 }}>Reminder outbox</h3>
                <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.slate, margin: "4px 0 0" }}>The emails Flowghan sends for each assigned step. <b style={{ color: C.spotlight }}>“Send now” delivers a real email</b> to the recipients below.</p>
              </div>
              <button onClick={() => setShowOutbox(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.slate }}><X size={18} /></button>
            </div>
            {(() => {
              const tasks = nodes.filter((n) => fcIsTask(n) && n.assignee?.email && n.due);
              if (!tasks.length) return <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, marginTop: 16 }}>Assign someone <b>and</b> a due date to a step to generate its reminder emails.</p>;
              return tasks.map((n) => (
                <div key={n.id} style={{ marginTop: 16, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
                  <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13.5, fontWeight: 700, color: C.ink }}>{resolve(n.label || FC_META[n.type].name)} · {n.assignee.name || n.assignee.email}</div>
                  {fcTaskEmails(n, org, template, varMap).map((em) => {
                    const st = fcEmailStatus(em.tier, n);
                    const tone = { sent: { c: C.sageDeep, b: "#E8F3EC" }, scheduled: { c: C.slate, b: C.paperDim }, alert: { c: "#B23A2E", b: "#FBEAE8" }, muted: { c: C.slateLight, b: C.paperDim } }[st.tone];
                    return (
                      <div key={em.tier} style={{ marginTop: 10, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: "0.04em" }}>#{em.tier} · {em.trigger}</span>
                          <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 600, color: tone.c, background: tone.b, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>{st.text}</span>
                        </div>
                        <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, marginTop: 8 }}><b style={{ color: C.ink }}>To:</b> {em.to.join(", ") || "— (set in Team)"}</div>
                        <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.ink, marginTop: 3, fontWeight: 600 }}>{em.subject}</div>
                        <pre style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.inkSoft, margin: "8px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{em.body}</pre>
                        {(() => {
                          const key = `${n.id}-${em.tier}`;
                          const stt = sendState[key];
                          const err = typeof stt === "string" && stt.startsWith("error:");
                          const noTo = em.to.length === 0;
                          const label = noTo ? (em.tier === 4 ? "Set CEO in Team" : "No recipient")
                            : stt === "sending" ? "Sending…"
                            : stt === "sent" ? "✓ Sent — check inbox"
                            : err ? "Failed — retry"
                            : "Send now (test)";
                          return (
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                              <button
                                onClick={() => sendEmailNow(key, em)}
                                disabled={noTo || stt === "sending"}
                                style={{
                                  fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600,
                                  display: "inline-flex", alignItems: "center", gap: 6,
                                  padding: "6px 12px", borderRadius: 8,
                                  border: `1px solid ${stt === "sent" ? C.sageDeep : err ? "#B23A2E" : C.line}`,
                                  background: stt === "sent" ? "#E8F3EC" : err ? "#FBEAE8" : C.card,
                                  color: stt === "sent" ? C.sageDeep : err ? "#B23A2E" : C.ink,
                                  cursor: noTo || stt === "sending" ? "not-allowed" : "pointer",
                                  opacity: noTo ? 0.5 : 1,
                                }}
                              >
                                <Mail size={13} /> {label}
                              </button>
                              {err && <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, color: "#B23A2E" }}>{stt.slice(6)}</span>}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ templateId, templates, setTemplates, onBack, onRunWorkflow }) {
  const template = templates.find((t) => t.id === templateId);
  const [selectedId, setSelectedId] = useState(template?.steps[0]?.id ?? null);
  const selected = template?.steps.find((s) => s.id === selectedId);

  const titleRef = useRef(null);
  const descRef = useRef(null);

  // Every field label across all steps, deduped — the variables that can be inserted.
  const allFieldLabels = [...new Set(
    (template?.steps || []).flatMap((s) => (s.fields || []).map((f) => f.label))
      .filter((l) => l && l.trim() !== "")
  )];

  // Splice {{label}} into an input/textarea at its caret, then restore focus.
  const insertAtCursor = (ref, currentValue, label, onChange) => {
    const token = `{{${label}}}`;
    const current = currentValue ?? "";
    const el = ref.current;
    if (!el) { onChange(current + token); return; }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    onChange(current.slice(0, start) + token + current.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const [editorView, setEditorView] = useState("editor"); // "editor" | "flowchart"
  const [showRunModal, setShowRunModal] = useState(false);
  const [runVenue, setRunVenue] = useState("");
  const [runDate, setRunDate] = useState(computeDueDate(todayStr(), 6));
  const [runVariableValues, setRunVariableValues] = useState({});

  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [fieldDragIndex, setFieldDragIndex] = useState(null);
  const [fieldDragOverIndex, setFieldDragOverIndex] = useState(null);

  // Seed the run modal's variable inputs with each variable's default value,
  // then open it. Keeps defaults fresh if the template's variables changed.
  const openRunModal = () => {
    const seed = {};
    (template?.variables ?? []).forEach((v) => { seed[v.key] = v.defaultValue ?? ""; });
    setRunVariableValues(seed);
    setShowRunModal(true);
  };

  const startRun = () => {
    onRunWorkflow(templateId, runVenue, runDate, runVariableValues);
    setShowRunModal(false);
  };

  // Immutably transform the selected step's fields, then persist the new templates array.
  const updateFields = (transform) => {
    if (!selected) return;
    const next = templates.map((t) => {
      if (t.id !== templateId) return t;
      return {
        ...t,
        steps: t.steps.map((s) =>
          s.id === selectedId ? { ...s, fields: transform(s.fields) } : s
        ),
      };
    });
    setTemplates(next);
  };

  const addField = (type) => {
    const typeLabel = FIELD_TYPES.find((t) => t.type === type)?.label ?? "Field";
    updateFields((fields) => [
      ...fields,
      {
        id: `field-${Date.now()}`,
        label: `New ${typeLabel.toLowerCase()} field`,
        type,
        options: [],
      },
    ]);
  };

  const updateFieldLabel = (fieldId, label) => {
    updateFields((fields) => fields.map((f) => (f.id === fieldId ? { ...f, label } : f)));
  };

  const removeField = (fieldId) => {
    updateFields((fields) => fields.filter((f) => f.id !== fieldId));
  };

  const reorderFields = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex == null || toIndex == null) return;
    updateFields((fields) => {
      const next = [...fields];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const updateSubtasks = (transform) => {
    if (!selected) return;
    const next = templates.map((t) => {
      if (t.id !== templateId) return t;
      return {
        ...t,
        steps: t.steps.map((s) =>
          s.id === selectedId ? { ...s, subtasks: transform(s.subtasks ?? []) } : s
        ),
      };
    });
    setTemplates(next);
  };

  const addSubtask = () => {
    updateSubtasks((subtasks) => [
      ...subtasks,
      { id: `subtask-${Date.now()}`, title: "New subtask" },
    ]);
  };

  const updateSubtaskTitle = (subtaskId, title) => {
    updateSubtasks((subtasks) => subtasks.map((s) => (s.id === subtaskId ? { ...s, title } : s)));
  };

  const removeSubtask = (subtaskId) => {
    updateSubtasks((subtasks) => subtasks.filter((s) => s.id !== subtaskId));
  };

  // Template-level variables live on the template itself (not a step), so these
  // transform t.variables directly rather than going through the selected step.
  const updateVariables = (transform) => {
    const next = templates.map((t) =>
      t.id === templateId ? { ...t, variables: transform(t.variables ?? []) } : t
    );
    setTemplates(next);
  };

  const addVariable = () => {
    updateVariables((variables) => [
      ...variables,
      { id: `var-${Date.now()}`, key: "new_variable", label: "New variable", defaultValue: "" },
    ]);
  };

  const updateVariableKey = (varId, key) => {
    const safeKey = key.replace(/\s+/g, "_");
    updateVariables((variables) => variables.map((v) => (v.id === varId ? { ...v, key: safeKey } : v)));
  };

  const updateVariableLabel = (varId, label) => {
    updateVariables((variables) => variables.map((v) => (v.id === varId ? { ...v, label } : v)));
  };

  const updateVariableDefault = (varId, defaultValue) => {
    updateVariables((variables) => variables.map((v) => (v.id === varId ? { ...v, defaultValue } : v)));
  };

  const removeVariable = (varId) => {
    updateVariables((variables) => variables.filter((v) => v.id !== varId));
  };

  const updateTemplateName = (name) => {
    const next = templates.map((t) => (t.id === templateId ? { ...t, name } : t));
    setTemplates(next);
  };

  const updateStepTitle = (title) => {
    if (!selected) return;
    const next = templates.map((t) => {
      if (t.id !== templateId) return t;
      return {
        ...t,
        steps: t.steps.map((s) => (s.id === selectedId ? { ...s, title } : s)),
      };
    });
    setTemplates(next);
  };

  const updateStepDescription = (description) => {
    if (!selected) return;
    const next = templates.map((t) => {
      if (t.id !== templateId) return t;
      return {
        ...t,
        steps: t.steps.map((s) => (s.id === selectedId ? { ...s, description } : s)),
      };
    });
    setTemplates(next);
  };

  const updateStepType = (stepType) => {
    if (!selected) return;
    const next = templates.map((t) => {
      if (t.id !== templateId) return t;
      return {
        ...t,
        steps: t.steps.map((s) => (s.id === selectedId ? { ...s, stepType } : s)),
      };
    });
    setTemplates(next);
  };

  const addStep = () => {
    const newStep = {
      id: "s-" + Date.now(),
      title: "New step",
      fields: [],
      dueRule: { type: "relative", weeksFromStart: 0 },
      dept: "",
      dependsOn: [],
    };
    const next = templates.map((t) =>
      t.id === templateId ? { ...t, steps: [...t.steps, newStep] } : t
    );
    setTemplates(next);
    setSelectedId(newStep.id);
  };

  const deleteStep = (stepId) => {
    if (!template) return;
    const idx = template.steps.findIndex((s) => s.id === stepId);
    const next = templates.map((t) =>
      t.id === templateId ? { ...t, steps: t.steps.filter((s) => s.id !== stepId) } : t
    );
    setTemplates(next);
    if (stepId === selectedId) {
      const remaining = template.steps.filter((s) => s.id !== stepId);
      const fallback = remaining[idx - 1] ?? remaining[0] ?? null;
      setSelectedId(fallback ? fallback.id : null);
    }
  };

  const reorderSteps = (fromIndex, toIndex) => {
    if (!template) return;
    if (fromIndex === toIndex || fromIndex == null || toIndex == null) return;
    const next = templates.map((t) => {
      if (t.id !== templateId) return t;
      const steps = [...t.steps];
      const [moved] = steps.splice(fromIndex, 1);
      steps.splice(toIndex, 0, moved);
      return { ...t, steps };
    });
    setTemplates(next);
  };

  if (!template) return null;

  return (
    <div>
      <style>{`
        .tpl-field-label { border-color: transparent; }
        .tpl-field-label:hover { border-color: ${C.line}; }
        .tpl-field-label:focus { border-color: ${C.spotlight}; background: ${C.card}; outline: none; }
        .tpl-field-del:hover { color: ${C.curtain}; }
        .tpl-name { border-color: transparent; }
        .tpl-name:hover { border-color: ${C.line}; }
        .tpl-name:focus { border-color: ${C.spotlight}; background: ${C.card}; outline: none; }
        .tpl-step-title { border-color: transparent; }
        .tpl-step-title:hover { border-color: ${C.line}; }
        .tpl-step-title:focus { border-color: ${C.spotlight}; background: ${C.card}; outline: none; }
        .tpl-step-desc { border-color: transparent; }
        .tpl-step-desc:hover { border-color: ${C.line}; }
        .tpl-step-desc:focus { border-color: ${C.spotlight}; background: ${C.card}; outline: none; }
      `}</style>
      <button onClick={onBack} style={{ ...secondaryBtn, marginBottom: 16 }}>&larr; Library</button>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, margin: "0 0 18px" }}>
        <input
          type="text"
          className="tpl-name"
          value={template.name}
          onChange={(e) => updateTemplateName(e.target.value)}
          style={{
            fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: C.ink,
            background: "transparent", border: "1px solid transparent", borderRadius: 8,
            padding: "4px 8px", margin: 0, marginLeft: -8, width: "100%",
            maxWidth: 520, boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ display: "flex", background: C.paperDim, borderRadius: 10, padding: 3 }}>
            <button onClick={() => setEditorView("editor")} style={toggleBtn(editorView === "editor")}><ListChecks size={15} /> Editor</button>
            <button onClick={() => setEditorView("flowchart")} style={toggleBtn(editorView === "flowchart")}><GitMerge size={15} /> Flowchart</button>
          </div>
          <button onClick={openRunModal} style={{
            display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0, background: C.sage,
            color: C.paper, border: "none", borderRadius: 9, padding: "9px 15px",
            fontFamily: "'Work Sans', sans-serif", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
          }}>
            <Play size={15} /> Run workflow
          </button>
        </div>
      </div>

      {editorView === "flowchart" ? (
        <FlowChart
          steps={template.steps}
          onUpdateStep={(stepId, patch) => {
            const next = templates.map((t) => {
              if (t.id !== templateId) return t;
              if (patch._setSteps) return { ...t, steps: patch._setSteps };
              if (patch._delete) return { ...t, steps: t.steps.filter((s) => s.id !== stepId) };
              return { ...t, steps: t.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) };
            });
            setTemplates(next);
          }}
          onSaveDrawings={(shapes) => {
            const next = templates.map((t) => (t.id === templateId ? { ...t, drawings: shapes } : t));
            setTemplates(next);
          }}
        />
      ) : (
      <>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px", margin: "0 0 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h3 style={{ ...sectionHeading, margin: 0, display: "flex", alignItems: "center", gap: 7 }}>
            <Braces size={15} color={C.spotlightDeep} /> Variables
          </h3>
          <button onClick={addVariable} style={secondaryBtn}>+ Variable</button>
        </div>
        {(template.variables ?? []).length === 0 ? (
          <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, margin: "10px 0 0" }}>
            No variables yet. Add one to reference it as{" "}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: C.spotlightDeep }}>{"{{key}}"}</span>{" "}
            in step titles and descriptions.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {(template.variables ?? []).map((v) => (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="text"
                  value={v.key}
                  onChange={(e) => updateVariableKey(v.id, e.target.value)}
                  placeholder="key"
                  style={{
                    width: 150, fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, fontWeight: 600,
                    color: C.spotlightDeep, background: C.paper, border: `1px solid ${C.line}`,
                    borderRadius: 7, padding: "6px 8px", boxSizing: "border-box",
                  }}
                />
                <input
                  type="text"
                  value={v.label}
                  onChange={(e) => updateVariableLabel(v.id, e.target.value)}
                  placeholder="Label"
                  style={{
                    flex: 1, minWidth: 120, fontFamily: "'Work Sans', sans-serif", fontSize: 13,
                    color: C.ink, background: C.paper, border: `1px solid ${C.line}`,
                    borderRadius: 7, padding: "6px 8px", boxSizing: "border-box",
                  }}
                />
                <input
                  type="text"
                  value={v.defaultValue}
                  onChange={(e) => updateVariableDefault(v.id, e.target.value)}
                  placeholder="Default value"
                  style={{
                    flex: 1, minWidth: 120, fontFamily: "'Work Sans', sans-serif", fontSize: 13,
                    color: C.inkSoft, background: C.paper, border: `1px solid ${C.line}`,
                    borderRadius: 7, padding: "6px 8px", boxSizing: "border-box",
                  }}
                />
                <button
                  onClick={() => removeVariable(v.id)}
                  title="Delete variable"
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 4,
                    color: C.slateLight, display: "flex", alignItems: "center", flexShrink: 0,
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
        <div style={{ width: 260, flexShrink: 0, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
          {template.steps.map((step, i) => {
            const active = step.id === selectedId;
            const isDropTarget = dragOverIndex === i && dragIndex !== null && dragIndex !== i;
            return (
              <div
                key={step.id}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                onDrop={(e) => { e.preventDefault(); reorderSteps(dragIndex, i); setDragIndex(null); setDragOverIndex(null); }}
                onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                style={{
                  display: "flex", alignItems: "center",
                  borderBottom: i === template.steps.length - 1 ? "none" : `1px solid ${C.line}`,
                  background: isDropTarget ? "rgba(79,143,107,0.16)" : active ? "rgba(232,166,61,0.14)" : "transparent",
                  opacity: dragIndex === i ? 0.5 : 1,
                }}
              >
                <span style={{
                  display: "flex", alignItems: "center", paddingLeft: 8,
                  color: C.slateLight, cursor: "grab",
                }}>
                  <GripVertical size={14} />
                </span>
                <button onClick={() => setSelectedId(step.id)} style={{
                  display: "flex", alignItems: "center", gap: 10, flex: 1, textAlign: "left",
                  border: "none", cursor: "pointer", padding: "10px 13px 10px 8px",
                  background: "transparent",
                }}>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                    color: active ? C.spotlightDeep : C.slateLight, minWidth: 18,
                  }}>{i + 1}</span>
                  <span style={{
                    fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: active ? 600 : 500,
                    color: active ? C.ink : C.inkSoft,
                  }}>{step.title}</span>
                </button>
              </div>
            );
          })}
          <button
            onClick={addStep}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
              border: "none", borderTop: `1px solid ${C.line}`, cursor: "pointer",
              padding: "11px 13px", background: "transparent",
              fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 500, color: C.slate,
            }}
          >
            <Plus size={14} /> Add step
          </button>
        </div>

        <div style={{ flex: 1, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "20px 22px", minHeight: 300, display: "flex", flexDirection: "column" }}>
          {selected ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 18px", marginLeft: -8 }}>
              <input
                ref={titleRef}
                type="text"
                className="tpl-step-title"
                value={selected.title}
                onChange={(e) => updateStepTitle(e.target.value)}
                style={{
                  flex: 1, minWidth: 0, fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 600,
                  color: C.ink, background: "transparent", border: "1px solid transparent",
                  borderRadius: 8, padding: "4px 8px", boxSizing: "border-box",
                }}
              />
              <InsertVariableMenu labels={allFieldLabels} onInsert={(label) => insertAtCursor(titleRef, selected.title, label, updateStepTitle)} />
            </div>
          ) : (
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 600, color: C.ink, margin: "0 0 18px" }}>
              No step selected
            </h2>
          )}

          {selected && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "0 0 18px", marginLeft: -8 }}>
              <textarea
                ref={descRef}
                className="tpl-step-desc"
                value={selected.description ?? ""}
                onChange={(e) => updateStepDescription(e.target.value)}
                placeholder="Add instructions, context, or links for this step..."
                style={{
                  flex: 1, minWidth: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 13,
                  color: C.inkSoft, background: "transparent", border: "1px solid transparent",
                  borderRadius: 8, padding: "8px", minHeight: 80, resize: "vertical", boxSizing: "border-box",
                }}
              />
              <InsertVariableMenu labels={allFieldLabels} onInsert={(label) => insertAtCursor(descRef, selected.description ?? "", label, updateStepDescription)} />
            </div>
          )}

          {selected && (selected.description ?? "").includes("{{") && (
            <div style={{
              margin: "-6px 0 18px", padding: "10px 12px",
              background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8,
            }}>
              <DescriptionDisplay
                text={selected.description}
                style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate }}
              />
            </div>
          )}

          {selected && (
            <div style={{ margin: "0 0 18px" }}>
              <label style={{
                display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 500, color: C.ink,
              }}>
                <input
                  type="checkbox"
                  checked={selected.stepType === "approval"}
                  onChange={(e) => updateStepType(e.target.checked ? "approval" : "task")}
                  style={{ accentColor: C.sage, cursor: "pointer" }}
                />
                This is an approval step
              </label>
              {selected.stepType === "approval" && (
                <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, margin: "6px 0 0 24px" }}>
                  An approver must sign off before the next step unlocks.
                </p>
              )}
            </div>
          )}

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
            {(() => {
              const emailFields = selected ? getEmailFields(selected.fields) : null;
              if (emailFields) {
                return <EmailCard fields={emailFields} preview />;
              }
              return (
                <>
            {selected && selected.fields.length === 0 && (
              <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, margin: 0 }}>
                No fields on this step yet. Add one below.
              </p>
            )}
            {selected && selected.fields.map((field, fi) => {
              const isFieldDropTarget = fieldDragOverIndex === fi && fieldDragIndex !== null && fieldDragIndex !== fi;
              return (
                <div
                  key={field.id}
                  onDragOver={(e) => { e.preventDefault(); setFieldDragOverIndex(fi); }}
                  onDrop={(e) => { e.preventDefault(); reorderFields(fieldDragIndex, fi); setFieldDragIndex(null); setFieldDragOverIndex(null); }}
                  style={{
                    display: "flex", flexDirection: "column", gap: 6,
                    background: isFieldDropTarget ? "rgba(79,143,107,0.16)" : "transparent",
                    borderRadius: 8, padding: isFieldDropTarget ? "6px 8px" : "0",
                    opacity: fieldDragIndex === fi ? 0.5 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      draggable
                      onDragStart={() => setFieldDragIndex(fi)}
                      onDragEnd={() => { setFieldDragIndex(null); setFieldDragOverIndex(null); }}
                      title="Drag to reorder"
                      style={{
                        display: "flex", alignItems: "center", flexShrink: 0,
                        color: C.slateLight, cursor: "grab",
                      }}
                    >
                      <GripVertical size={15} />
                    </span>
                    <input
                      type="text"
                      className="tpl-field-label"
                      value={field.label}
                      onChange={(e) => updateFieldLabel(field.id, e.target.value)}
                      style={{
                        flex: 1, fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600,
                        color: C.ink, background: "transparent", border: "1px solid transparent",
                        borderRadius: 7, padding: "4px 7px", boxSizing: "border-box",
                      }}
                    />
                    <button
                      className="tpl-field-del"
                      onClick={() => removeField(field.id)}
                      title="Delete field"
                      style={{
                        background: "none", border: "none", cursor: "pointer", padding: 4,
                        color: C.slateLight, display: "flex", alignItems: "center", flexShrink: 0,
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <StepFieldPreview field={field} />
                </div>
              );
            })}
                </>
              );
            })()}
          </div>

          {selected && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.line}` }}>
              <h3 style={{ ...sectionHeading, margin: "0 0 10px" }}>Add a field</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {FIELD_TYPES.map((ft) => (
                  <button key={ft.type} onClick={() => addField(ft.type)} style={secondaryBtn}>+ {ft.label}</button>
                ))}
              </div>
            </div>
          )}

          {selected && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.line}` }}>
              <h3 style={{ ...sectionHeading, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 7 }}>
                <ListTodo size={15} color={C.spotlightDeep} /> Subtasks
              </h3>
              {(selected.subtasks ?? []).length === 0 && (
                <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, margin: "0 0 10px" }}>
                  No subtasks on this step yet. Add a checklist item below.
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(selected.subtasks ?? []).map((st) => (
                  <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <ListTodo size={14} color={C.slateLight} style={{ flexShrink: 0 }} />
                    <input
                      type="text"
                      value={st.title}
                      onChange={(e) => updateSubtaskTitle(st.id, e.target.value)}
                      style={{
                        flex: 1, fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600,
                        color: C.ink, background: "transparent", border: "1px solid transparent",
                        borderRadius: 7, padding: "4px 7px", boxSizing: "border-box",
                      }}
                    />
                    <button
                      onClick={() => removeSubtask(st.id)}
                      title="Delete subtask"
                      style={{
                        background: "none", border: "none", cursor: "pointer", padding: 4,
                        color: C.slateLight, display: "flex", alignItems: "center", flexShrink: 0,
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                <button onClick={addSubtask} style={secondaryBtn}>+ Subtask</button>
              </div>
            </div>
          )}

          {selected && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.line}` }}>
              <button
                onClick={() => {
                  if (window.confirm("Are you sure you want to delete this step? This cannot be undone.")) {
                    deleteStep(selected.id);
                  }
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  background: C.curtain, border: "none", cursor: "pointer",
                  padding: "9px 14px", borderRadius: 8, color: "#fff",
                  fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600,
                }}
              >
                <Trash2 size={14} /> Delete step
              </button>
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {showRunModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(28,27,42,0.5)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20,
        }}>
          <div style={{ background: C.card, borderRadius: 16, maxWidth: 420, width: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 600, color: C.ink, margin: 0 }}>Run workflow</h3>
              <button onClick={() => setShowRunModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><X size={18} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "18px 22px" }}>
              <label style={fieldLabel}>Venue
                <input
                  type="text"
                  value={runVenue}
                  onChange={(e) => setRunVenue(e.target.value)}
                  placeholder="e.g. Mid Valley Megamall"
                  style={{ ...selectStyle, width: "100%", marginTop: 6 }}
                />
              </label>
              <label style={fieldLabel}>Event date
                <input type="date" value={runDate} onChange={(e) => setRunDate(e.target.value)} style={{ ...selectStyle, width: "100%", marginTop: 6 }} />
              </label>
              {(template?.variables ?? []).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4, borderTop: `1px solid ${C.line}` }}>
                  <h4 style={{ ...sectionHeading, margin: "10px 0 0", display: "flex", alignItems: "center", gap: 7 }}>
                    <Braces size={14} color={C.spotlightDeep} /> Variables
                  </h4>
                  {(template.variables ?? []).map((v) => (
                    <label key={v.id} style={fieldLabel}>{v.label}
                      <input
                        type="text"
                        value={runVariableValues[v.key] ?? ""}
                        onChange={(e) => setRunVariableValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                        style={{ ...selectStyle, width: "100%", marginTop: 6 }}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setShowRunModal(false)} style={secondaryBtn}>Cancel</button>
              <button onClick={startRun} style={{
                display: "inline-flex", alignItems: "center", gap: 7, background: C.sage,
                color: C.paper, border: "none", borderRadius: 9, padding: "9px 15px",
                fontFamily: "'Work Sans', sans-serif", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
              }}>
                <Play size={15} /> Start run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CastCrew() {
  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: C.ink, margin: "0 0 4px" }}>Cast & crew</h1>
      <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, margin: "0 0 22px" }}>Who's who across Ebright HQ and every branch.</p>

      <h3 style={sectionHeading}>Departments</h3>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", marginBottom: 28 }}>
        {DEPARTMENTS.map((d, i) => (
          <div key={d.name} style={{
            display: "flex", justifyContent: "space-between", padding: "11px 16px",
            borderBottom: i === DEPARTMENTS.length - 1 ? "none" : `1px solid ${C.line}`,
          }}>
            <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13.5, color: C.ink }}>{d.name}</span>
            <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13.5, color: C.slate }}>{d.head}</span>
          </div>
        ))}
      </div>

      <h3 style={sectionHeading}>Branches</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        {BRANCHES.map((b) => (
          <div key={b.short} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13.5, fontWeight: 500, color: C.ink }}>{b.name}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: C.slateLight }}>{b.short}</span>
            </div>
            <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12, color: C.slate, marginTop: 3 }}>PIC: {b.pic} &middot; Region {b.region}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   EMAIL MODAL
   Preview-then-confirm reminders. Preview shows one email per person
   (only their own open cues) and whether we have an email on file for
   them. On confirm, sends a real reminder to each person that has an
   email, via the backend Gmail sender, and reports the outcome.
--------------------------------------------------------------- */
// Builds the plain-text + HTML body of one person's reminder.
function buildReminderEmail(name, tasks) {
  const lines = tasks.map((t) => `• ${t.title} — due ${fmtDate(t.dueDate)}`);
  const text =
    `Hi ${name || "there"},\n\n` +
    `This is a friendly reminder that you have ${tasks.length} open ${tasks.length === 1 ? "cue" : "cues"} to deliver:\n\n` +
    lines.join("\n") +
    `\n\nPlease action these as soon as you can.\n\n— Flowghan`;
  const htmlLines = tasks.map((t) => `<li><b>${t.title}</b> — due ${fmtDate(t.dueDate)}</li>`).join("");
  const html =
    `<p>Hi ${name || "there"},</p>` +
    `<p>This is a friendly reminder that you have <b>${tasks.length}</b> open ${tasks.length === 1 ? "cue" : "cues"} to deliver:</p>` +
    `<ul>${htmlLines}</ul>` +
    `<p>Please action these as soon as you can.</p><p>— Flowghan</p>`;
  return { text, html };
}

function EmailModal({ byAssignee, onClose }) {
  const names = Object.keys(byAssignee);
  // Directory of the caller's department, so we can turn assignee names into
  // real email addresses. Anyone without a matching account is flagged & skipped.
  const [emailByName, setEmailByName] = useState(null); // null = still loading
  const [dirErr, setDirErr] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { sent, skipped, failed:[{name,error}] }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const people = await listPeople();
        if (!alive) return;
        const map = {};
        people.forEach((p) => { if (p.name) map[p.name.trim().toLowerCase()] = p.email; });
        setEmailByName(map);
      } catch (e) {
        if (alive) { setEmailByName({}); setDirErr("Couldn't load the team directory — email addresses may be missing."); }
      }
    })();
    return () => { alive = false; };
  }, []);

  const emailFor = (name) => (emailByName ? emailByName[(name || "").trim().toLowerCase()] || null : null);
  const sendable = names.filter((n) => emailFor(n));
  const skipped = names.filter((n) => !emailFor(n));

  const handleSend = async () => {
    setSending(true);
    const failed = [];
    let sent = 0;
    for (const name of sendable) {
      const to = emailFor(name);
      const { text, html } = buildReminderEmail(name, byAssignee[name]);
      try {
        await sendNotification({ to, subject: "Reminder: you have open cues", text, html });
        sent += 1;
      } catch (e) {
        failed.push({ name, error: e.message || "send failed" });
      }
    }
    setSending(false);
    setResult({ sent, skipped: skipped.length, failed });
  };

  const loading = emailByName === null;
  const done = result !== null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(28,27,42,0.5)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20,
    }}>
      <div style={{ background: C.card, borderRadius: 16, maxWidth: 480, width: "100%", maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 600, color: C.ink, margin: 0 }}>
            {done ? "Reminders sent" : "Reminder preview"}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><X size={18} /></button>
        </div>
        <div style={{ padding: "16px 22px", overflowY: "auto", flex: 1 }}>
          {done ? (
            <>
              <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13.5, color: C.ink, margin: "0 0 10px" }}>
                Sent to <b>{result.sent}</b> {result.sent === 1 ? "person" : "people"}.
                {result.skipped > 0 && <> {result.skipped} skipped (no email on file).</>}
                {result.failed.length > 0 && <> {result.failed.length} failed.</>}
              </p>
              {result.failed.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {result.failed.map((f) => (
                    <div key={f.name} style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.curtain, padding: "2px 0" }}>
                      &bull; {f.name}: {f.error}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : loading ? (
            <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13.5, color: C.slate }}>Loading team directory…</p>
          ) : (
            <>
              <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.slate, margin: "0 0 14px" }}>
                Here's what would go out — one email per person, listing only their own open cues.
              </p>
              {dirErr && <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.curtain, margin: "0 0 12px" }}>{dirErr}</p>}
              {names.map((name) => {
                const to = emailFor(name);
                return (
                  <div key={name} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 13px", marginBottom: 10, opacity: to ? 1 : 0.6 }}>
                    <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 13.5, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
                      To: {name} {to
                        ? <span style={{ fontWeight: 400, color: C.slate }}>&lt;{to}&gt;</span>
                        : <span style={{ fontWeight: 600, color: C.curtain }}>— no email on file — won't be sent</span>}
                    </div>
                    {byAssignee[name].map((t) => (
                      <div key={t.id} style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.slate, padding: "2px 0" }}>
                        &bull; {t.title} — due {fmtDate(t.dueDate)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
        <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.line}` }}>
          {done ? (
            <button onClick={onClose} style={{ ...primaryBtn, width: "100%", justifyContent: "center" }}>Done</button>
          ) : (
            <button
              onClick={handleSend}
              disabled={loading || sending || sendable.length === 0}
              style={{ ...primaryBtn, width: "100%", justifyContent: "center", opacity: (loading || sending || sendable.length === 0) ? 0.5 : 1, cursor: (loading || sending || sendable.length === 0) ? "default" : "pointer" }}
            >
              <Send size={15} /> {sending ? "Sending…" : sendable.length === 0 ? "No emails on file" : `Send ${sendable.length} reminder${sendable.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   SHARED STYLES
--------------------------------------------------------------- */
const primaryBtn = {
  display: "inline-flex", alignItems: "center", gap: 7, background: C.spotlight, color: C.ink,
  border: "none", borderRadius: 9, padding: "9px 15px", fontFamily: "'Work Sans', sans-serif",
  fontSize: 13.5, fontWeight: 600, cursor: "pointer",
};
const secondaryBtn = {
  display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: C.ink,
  border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 13px", fontFamily: "'Work Sans', sans-serif",
  fontSize: 13, fontWeight: 500, cursor: "pointer",
};
const selectStyle = {
  fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: C.ink, background: C.card,
  border: `1px solid ${C.line}`, borderRadius: 7, padding: "5px 8px",
};
const fieldLabel = { fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: C.slate, display: "block" };
const sectionHeading = { fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: C.slate, textTransform: "uppercase", letterSpacing: 0.6, margin: "0 0 10px" };
const emptyState = { textAlign: "center", padding: "50px 20px", background: C.card, border: `1px dashed ${C.line}`, borderRadius: 14 };
function toggleBtn(active) {
  return {
    display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 8, border: "none",
    background: active ? C.card : "transparent", color: active ? C.ink : C.slate,
    fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer",
    boxShadow: active ? "0 1px 2px rgba(28,27,42,0.08)" : "none",
  };
}

/* ---------------------------------------------------------------
   USERS (admin only) — view the team + create new accounts.
   Departments are the field that gates all data sharing, so an admin
   sets it here; new users can never pick their own.
--------------------------------------------------------------- */
function UsersAdmin() {
  const [users, setUsers] = useState([]);
  const [loadErr, setLoadErr] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", department: "", role: "staff" });
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [ok, setOk] = useState("");
  // Inline row editing: the id of the user being edited, the working values, and
  // per-row busy/error/success so an edit never disturbs the add-user form above.
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ department: "", role: "staff" });
  const [editBusy, setEditBusy] = useState(false);
  const [rowMsg, setRowMsg] = useState("");

  const refresh = useCallback(async () => {
    setLoadErr("");
    try {
      setUsers(await listUsers());
    } catch (e) {
      setLoadErr(e.message || "Couldn't load users");
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Suggestions for the department picker: the company's canonical department
  // names PLUS any already assigned to a user (dedup, drop blanks). Listing the
  // canonical names — e.g. "Human Resources & Legal" — makes it easy to pick the
  // right spelling instead of a near-miss like "Human Resources" that would land
  // an account in a different data bucket.
  const departments = [...new Set([
    ...DEPARTMENTS.map((d) => d.name),
    ...users.map((u) => u.department).filter(Boolean),
  ])].sort();

  const startEdit = (u) => {
    setRowMsg("");
    setEditingId(u.id);
    setEditForm({ department: u.department || "", role: u.role || "staff" });
  };
  const cancelEdit = () => { setEditingId(null); setRowMsg(""); };
  const saveEdit = async (u) => {
    setRowMsg("");
    setEditBusy(true);
    try {
      await updateUser(u.id, {
        department: editForm.department.trim() || null,
        role: editForm.role,
      });
      setEditingId(null);
      setRowMsg(`Updated ${u.email}. They'll see the change next time they log in.`);
      refresh();
    } catch (e) {
      setRowMsg(e.message || "Couldn't update user");
    } finally {
      setEditBusy(false);
    }
  };

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setFormErr(""); setOk("");
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setFormErr("Name, email and a temporary password are required.");
      return;
    }
    if (form.password.length < 8) {
      setFormErr("Temporary password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await createUser({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
        department: form.department.trim() || null,
      });
      setOk(`Created ${form.email.trim().toLowerCase()}.`);
      setForm({ name: "", email: "", password: "", department: "", role: "staff" });
      refresh();
    } catch (e) {
      setFormErr(e.message || "Couldn't create user");
    } finally {
      setBusy(false);
    }
  };

  const input = {
    width: "100%", padding: "10px 12px", borderRadius: 9, border: `1px solid ${C.line}`,
    background: C.card, color: C.ink, fontFamily: "'Work Sans', sans-serif", fontSize: 14, boxSizing: "border-box",
  };
  const label = { fontFamily: "'Work Sans', sans-serif", fontSize: 12, fontWeight: 600, color: C.slate, marginBottom: 5, display: "block" };
  const roleBadge = (r) => ({
    display: "inline-block", padding: "2px 9px", borderRadius: 20, fontSize: 12, fontWeight: 600,
    fontFamily: "'Work Sans', sans-serif",
    background: r === "admin" ? "rgba(230,36,39,0.1)" : r === "hod" ? "rgba(59,111,176,0.1)" : "#F0F0F0",
    color: r === "admin" ? C.spotlight : r === "hod" ? "#3B6FB0" : C.slate,
  });

  return (
    <div style={{ maxWidth: 900, fontFamily: "'Work Sans', sans-serif" }}>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, color: C.ink, margin: "0 0 4px" }}>Users</h1>
      <p style={{ color: C.slate, fontSize: 14, margin: "0 0 24px" }}>
        Add teammates and set their department. A person only ever sees data for the department you assign them.
      </p>

      {/* Add-user form */}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22, marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: C.ink, margin: "0 0 16px" }}>Add a user</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={label}>Full name</label>
            <input style={input} value={form.name} onChange={setField("name")} placeholder="Jane Doe" />
          </div>
          <div>
            <label style={label}>Email</label>
            <input style={input} type="email" value={form.email} onChange={setField("email")} placeholder="jane@ebright.com" />
          </div>
          <div>
            <label style={label}>Temporary password</label>
            <input style={input} value={form.password} onChange={setField("password")} placeholder="At least 8 characters" />
          </div>
          <div>
            <label style={label}>Department</label>
            <input style={input} list="dept-options" value={form.department} onChange={setField("department")} placeholder="e.g. Marketing" />
            <datalist id="dept-options">
              {departments.map((d) => <option key={d} value={d} />)}
            </datalist>
          </div>
          <div>
            <label style={label}>Role</label>
            <select style={input} value={form.role} onChange={setField("role")}>
              <option value="staff">Staff</option>
              <option value="hod">HOD (head of department)</option>
              <option value="admin">Admin (can manage users)</option>
            </select>
          </div>
        </div>
        {formErr && <p style={{ color: C.curtain, fontSize: 13, margin: "14px 0 0" }}>{formErr}</p>}
        {ok && <p style={{ color: "#2E7D32", fontSize: 13, margin: "14px 0 0" }}>{ok}</p>}
        <button
          onClick={submit}
          disabled={busy}
          style={{
            marginTop: 18, padding: "11px 20px", borderRadius: 9, border: "none",
            background: busy ? C.slateLight : C.spotlight, color: "#FFFFFF", fontFamily: "'Work Sans', sans-serif",
            fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "Adding…" : "Add user"}
        </button>
      </div>

      {/* User list */}
      <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: C.ink, margin: "0 0 14px" }}>
        Team ({users.length})
      </h2>
      {loadErr && <p style={{ color: C.curtain, fontSize: 13 }}>{loadErr}</p>}
      {rowMsg && <p style={{ color: rowMsg.startsWith("Updated") ? "#2E7D32" : C.curtain, fontSize: 13, margin: "0 0 12px" }}>{rowMsg}</p>}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: C.paper, textAlign: "left" }}>
              <th style={{ padding: "11px 16px", fontWeight: 600, color: C.slate }}>Name</th>
              <th style={{ padding: "11px 16px", fontWeight: 600, color: C.slate }}>Email</th>
              <th style={{ padding: "11px 16px", fontWeight: 600, color: C.slate }}>Department</th>
              <th style={{ padding: "11px 16px", fontWeight: 600, color: C.slate }}>Role</th>
              <th style={{ padding: "11px 16px", fontWeight: 600, color: C.slate, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isEditing = editingId === u.id;
              return (
              <tr key={u.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: "11px 16px", color: C.ink }}>{u.name}</td>
                <td style={{ padding: "11px 16px", color: C.slate }}>{u.email}</td>
                <td style={{ padding: "11px 16px", color: u.department ? C.ink : C.slateLight }}>
                  {isEditing ? (
                    <input
                      style={{ ...input, padding: "7px 10px" }}
                      list="dept-options"
                      value={editForm.department}
                      onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
                      placeholder="e.g. Human Resources & Legal"
                    />
                  ) : (u.department || "— none —")}
                </td>
                <td style={{ padding: "11px 16px" }}>
                  {isEditing ? (
                    <select
                      style={{ ...input, padding: "7px 10px" }}
                      value={editForm.role}
                      onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                    >
                      <option value="staff">Staff</option>
                      <option value="hod">HOD</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (<span style={roleBadge(u.role)}>{u.role}</span>)}
                </td>
                <td style={{ padding: "11px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => saveEdit(u)}
                        disabled={editBusy}
                        style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: editBusy ? C.slateLight : C.spotlight, color: "#FFFFFF", fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: editBusy ? "default" : "pointer", marginRight: 8 }}
                      >
                        {editBusy ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={editBusy}
                        style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.card, color: C.slate, fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: editBusy ? "default" : "pointer" }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => startEdit(u)}
                      style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.card, color: C.ink, fontFamily: "'Work Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <Pencil size={13} /> Edit
                    </button>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   COMPANY OVERVIEW (admin-only, read-only)
   Shows every department's templates, runsheets and progress in
   one place. Data comes from /api/admin/overview; nothing is edited
   here — it's a monitoring view across all departments.
--------------------------------------------------------------- */
// Delivered cues / total cues across a set of runsheets. A cue counts as done
// when its status is "delivered" — the same rule the Reports screen uses.
function progressOf(runsheets) {
  let done = 0, total = 0;
  (runsheets || []).forEach((rs) => (rs.tasks || []).forEach((t) => {
    total += 1;
    if (t.status === "delivered") done += 1;
  }));
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

function ProgressBar({ pct }) {
  const color = pct >= 100 ? C.sage : pct >= 50 ? C.spotlight : C.slateLight;
  return (
    <div style={{ background: C.paperDim, borderRadius: 20, height: 8, width: "100%", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 20 }} />
    </div>
  );
}

function DeptOverview() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setErr("");
      try {
        const rows = await getDepartmentsOverview();
        if (alive) setData(rows);
      } catch (e) {
        if (alive) setErr(e.message || "Couldn't load the overview");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Per-department rollups: overall progress + how many runsheets are still running.
  const depts = useMemo(() => data.map((d) => {
    const prog = progressOf(d.runsheets);
    const running = (d.runsheets || []).filter((rs) => progressOf([rs]).pct < 100).length;
    const nameOf = (templateId) =>
      (d.templates || []).find((t) => t.id === templateId)?.name || "Unknown template";
    return { ...d, prog, running, nameOf };
  }), [data]);

  const card = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 };

  if (loading) {
    return <div style={{ fontFamily: "'Work Sans', sans-serif", color: C.slate, padding: 8 }}>Loading company overview…</div>;
  }

  return (
    <div style={{ maxWidth: 1000, fontFamily: "'Work Sans', sans-serif" }}>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, color: C.ink, margin: "0 0 4px" }}>Company overview</h1>
      <p style={{ color: C.slate, fontSize: 14, margin: "0 0 24px" }}>
        Every department's templates, runsheets and progress in one place. This view is read-only.
      </p>

      {err && <p style={{ color: C.curtain, fontSize: 13 }}>{err}</p>}
      {!err && depts.length === 0 && (
        <p style={{ color: C.slate, fontSize: 14 }}>No department data yet. Once departments create templates and runsheets, they'll appear here.</p>
      )}

      {/* Summary cards — one per department */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16, marginBottom: 32 }}>
        {depts.map((d) => (
          <div key={d.department} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 600, color: C.ink, margin: 0 }}>{d.department}</h3>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 500, color: C.ink }}>{d.prog.pct}%</span>
            </div>
            <ProgressBar pct={d.prog.pct} />
            <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 13, color: C.slate }}>
              <span>{(d.templates || []).length} templates</span>
              <span>{(d.runsheets || []).length} runsheets</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: C.slate }}>
              {d.prog.done}/{d.prog.total} cues delivered · {d.running} running
            </div>
          </div>
        ))}
      </div>

      {/* Per-department detail: runsheets list */}
      {depts.map((d) => (
        <div key={d.department} style={{ marginBottom: 30 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 600, color: C.ink, margin: "0 0 12px" }}>
            {d.department} <span style={{ color: C.slateLight, fontWeight: 400, fontSize: 15 }}>· {(d.runsheets || []).length} runsheets</span>
          </h2>
          {(d.runsheets || []).length === 0 ? (
            <p style={{ color: C.slateLight, fontSize: 14, margin: "0 0 6px" }}>No runsheets yet.</p>
          ) : (
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: C.paper, textAlign: "left" }}>
                    <th style={{ padding: "11px 16px", fontWeight: 600, color: C.slate }}>Venue / event</th>
                    <th style={{ padding: "11px 16px", fontWeight: 600, color: C.slate }}>Template</th>
                    <th style={{ padding: "11px 16px", fontWeight: 600, color: C.slate }}>Date</th>
                    <th style={{ padding: "11px 16px", fontWeight: 600, color: C.slate, width: 220 }}>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.runsheets || []).map((rs) => {
                    const p = progressOf([rs]);
                    return (
                      <tr key={rs.id} style={{ borderTop: `1px solid ${C.line}` }}>
                        <td style={{ padding: "11px 16px", color: C.ink }}>{rs.branchName || "—"}</td>
                        <td style={{ padding: "11px 16px", color: C.slate }}>{d.nameOf(rs.templateId)}</td>
                        <td style={{ padding: "11px 16px", color: C.slate, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{rs.eventDate || "—"}</td>
                        <td style={{ padding: "11px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ flex: 1 }}><ProgressBar pct={p.pct} /></div>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: C.slate, minWidth: 64, textAlign: "right" }}>{p.done}/{p.total} · {p.pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------
   LOGIN
--------------------------------------------------------------- */
function LoginPage({ onSignIn, notice }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const input = {
    width: "100%", padding: "11px 13px", borderRadius: 10, border: `1px solid ${C.line}`,
    background: C.card, color: C.ink, fontFamily: "'Work Sans', sans-serif", fontSize: 14, boxSizing: "border-box",
  };
  const handleSignIn = async () => {
    setError("");
    const token = await login(email, password);
    if (token) {
      onSignIn();
    } else {
      setError("Invalid email or password");
    }
  };
  return (
    <div style={{ display: "flex", minHeight: 640, borderRadius: 18, overflow: "hidden", fontFamily: "'Work Sans', sans-serif" }}>
      <style>{FONTS}</style>
      <div style={{ flex: 1, background: "#E62427", position: "relative", padding: "48px 44px" }}>
        <div style={{ position: "absolute", top: 24, left: 24, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <img src="/Logo.png" alt="Ebright" style={{ width: 180, height: "auto", marginBottom: 4 }} />
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, color: "#FFFFFF", margin: "0 0 8px", maxWidth: 340, lineHeight: 1.35, textAlign: "left" }}>
            Bring Structure and Clarity to Every Process
          </p>
          <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 15, color: "rgba(255,255,255,0.85)", margin: "0", maxWidth: 320, lineHeight: 1.5, textAlign: "left" }}>
            Plan, assign, and monitor workflows across your organization in one place.
          </p>
        </div>
      </div>
      <div style={{ flex: 1, background: C.card, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 44px" }}>
        <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 14 }}>
          <img src="/dr_doom_logo.png" style={{ width: 140, height: 140, objectFit: "contain", marginBottom: -6, alignSelf: "center", filter: "brightness(0.2)" }} />
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, color: C.ink, margin: "0 0 6px", textAlign: "center" }}>Sign in to Flowghan</h1>
          {notice && (
            <p style={{ margin: 0, padding: "9px 12px", borderRadius: 9, background: "rgba(230,36,39,0.08)", border: `1px solid ${C.line}`, fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.ink, textAlign: "center" }}>
              {notice}
            </p>
          )}
          <input style={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input style={input} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "none", background: C.spotlight, color: "#FFFFFF", fontFamily: "'Work Sans', sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            onClick={handleSignIn}
          >
            Sign in
          </button>
          {error && (
            <p style={{ margin: 0, fontFamily: "'Work Sans', sans-serif", fontSize: 13, color: C.curtain, textAlign: "center" }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DoomTransition() {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999, background: "#000000",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 40,
      animation: "doomFade 1.4s ease-in-out forwards", pointerEvents: "none",
    }}>
      <style>{`
        @keyframes doomFade {
          0% { opacity: 0; }
          28.57% { opacity: 1; }
          71.43% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
      <div style={{
        width: 70, height: 40, borderRadius: "50%", background: "#E62427",
        boxShadow: "0 0 30px 12px rgba(230,36,39,0.85), 0 0 60px 24px rgba(230,36,39,0.5)",
      }} />
      <div style={{
        width: 70, height: 40, borderRadius: "50%", background: "#E62427",
        boxShadow: "0 0 30px 12px rgba(230,36,39,0.85), 0 0 60px 24px rgba(230,36,39,0.5)",
      }} />
    </div>
  );
}

/* ---------------------------------------------------------------
   MAIN APP
--------------------------------------------------------------- */
export default function App() {
  // authUser is the source of truth for who's logged in. Data loads are keyed to
  // it, so switching users actually reloads that user's department data.
  const [authUser, setAuthUser] = useState(() => getCurrentUser());
  // Only admins can see/reach the Users screen (backend also enforces this).
  const isAdmin = authUser?.role === "admin";
  // Showcase runsheets are Marketing-only machinery. Every other department gets
  // a workflow-progress view over its own flowchart templates instead. This must
  // key off the REAL department only: an account with no department is NOT
  // Marketing — treating it as such used to leak Marketing's data into any
  // department-less login.
  const isMarketing = authUser?.department === "Marketing";
  const [showLogin, setShowLogin] = useState(() => !EMBEDDED && !getCurrentUser());
  // Embedded SSO state: while the portal session is being exchanged for a
  // Flowghan token we show a loader (never the password box); if it fails we
  // tell the user to open Flowghan from the portal.
  const [ssoFailed, setSsoFailed] = useState(false);
  // If the URL carries ?form=<token>, this is an external person opening a shared
  // public form link — render that page instead of the app (no login required).
  const [publicFormToken] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("form"); } catch { return null; }
  });
  const [showTransition, setShowTransition] = useState(false);
  const [tab, setTab] = useState("dashboard");
  // Collapse the left nav to hand the whole width to the canvas. Persisted so the
  // choice survives a reload — someone who works in the flowchart all day sets it once.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("dt-sidebar-collapsed") === "1"; } catch { return false; }
  });
  const toggleSidebar = () => setSidebarCollapsed((v) => {
    const next = !v;
    try { localStorage.setItem("dt-sidebar-collapsed", next ? "1" : "0"); } catch {}
    return next;
  });
  const [currentUser, setCurrentUser] = useState(ASSIGNEE_POOL[0]);
  const [runsheets, setRunsheets] = useState([]);
  const [templates, setTemplates] = useState([showcaseTemplate, minusWeek15Template, parentConfirmationTemplate]);
  const [modules, setModules] = useState(["Marketing"]);
  const [openTemplateId, setOpenTemplateId] = useState(showcaseTemplate.id);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  // True when the initial data load hit a REAL error (server down / 500 / expired
  // login) rather than an empty department. Gates a retry screen so we never fall
  // through to defaults-and-overwrite. See the load effect below.
  const [loadError, setLoadError] = useState(false);
  // Set when the login token expires/goes invalid (a 401 on any call) so we can
  // send the user back to sign in with an explanation.
  const [sessionExpired, setSessionExpired] = useState(false);
  // Set when a save to the server fails, so we can warn that recent changes may
  // not have been saved. Cleared automatically on the next successful save.
  const [saveFailed, setSaveFailed] = useState(false);
  const [emailData, setEmailData] = useState(null);

  // Loads the logged-in department's data. Pulled into a callback so the retry
  // screen can re-run it. Keyed to authUser so switching users reloads correctly.
  const loadData = useCallback(async () => {
    // Only load once we know who's logged in.
    if (!authUser) return;
    // A logged-in user with no department (e.g. the bare admin account) has no
    // department bucket to seed into — show defaults in memory but don't persist,
    // so we never pollute an empty-department bucket.
    const canSeed = !!authUser.department;
    // New departments start with a folder named after the department (not a
    // hardcoded "Marketing"), and their starter templates are stamped to it so
    // they group under that folder. An account with NO department must NOT fall
    // back to "Marketing" — that is exactly what leaked Marketing's data into
    // department-less logins. With an empty dept, isMarketing below is false, so
    // no starters are seeded and the workspace stays empty (canSeed is also false,
    // so nothing is written to the database for a department-less account).
    const dept = authUser.department || "";
    setLoadError(false);
    setLoading(true);
    try {
      // No starter templates are seeded for anyone anymore — EVERY department
      // (Marketing included) now starts with an empty library and builds its own
      // flowchart from scratch, then proceeds from there. Their fixed ids let us
      // strip any that an earlier version already seeded, out of any department's
      // saved library — Marketing included, so its old starters get cleaned out.
      const DEFAULT_TEMPLATE_IDS = ["showcase-template", "minus-week-15", "parent-confirmation"];
      // Load templates first, so seeding a runsheet uses the live saved template.
      const defaultTemplates = [];
      let loadedTemplates = defaultTemplates;

      // storage.get returns null for a genuine 404 ("not set yet") and THROWS on
      // a real error (server down / 500 / expired login). We only seed on the
      // null/empty case; a thrown error escapes to the catch below, which flags a
      // retry state WITHOUT writing defaults — so a network blip can never
      // overwrite a department's real data.

      // Templates (= flowcharts) are per-department: each department sees only its
      // own. `false` = department scope (the CEO is the only company-wide value).
      const tRes = await storage.get("ebright-templates", false);
      const tParsed = tRes ? JSON.parse(tRes.value) : null;
      if (tParsed && tParsed.length) {
        // Keep the built-in starters out of every department (Marketing too now).
        // Custom templates (which have their own unique ids) are always preserved.
        const cleaned = tParsed.filter((t) => !DEFAULT_TEMPLATE_IDS.includes(t.id));
        loadedTemplates = cleaned;
        setTemplates(cleaned);
        // Persist the trimmed list only if cleanup actually removed something.
        if (canSeed && cleaned.length !== tParsed.length) {
          await storage.set("ebright-templates", JSON.stringify(cleaned), false);
        }
      } else {
        setTemplates(defaultTemplates);
        if (canSeed) await storage.set("ebright-templates", JSON.stringify(defaultTemplates), false);
      }

      const mRes = await storage.get("ebright-modules");
      const mParsed = mRes ? JSON.parse(mRes.value) : null;
      if (mParsed && mParsed.length) {
        setModules(mParsed);
      } else {
        setModules([dept]);
        if (canSeed) await storage.set("ebright-modules", JSON.stringify([dept]));
      }

      // Runsheets are per-department too.
      const rRes = await storage.get("ebright-runsheets", false);
      const rParsed = rRes ? JSON.parse(rRes.value) : null;
      if (rParsed && rParsed.length) {
        setRunsheets(rParsed);
      } else {
        setRunsheets([]);
        if (canSeed) await storage.set("ebright-runsheets", JSON.stringify([]), false);
      }

      setLoading(false);
    } catch (e) {
      // A REAL failure (not an empty department). Do NOT seed or overwrite —
      // leave the database untouched and show a retry screen instead.
      console.error("Data load failed:", e);
      setLoadError(true);
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    // Re-runs when the user changes, so logging in as a different department
    // reloads that department's data.
    loadData();
  }, [loadData]);

  // Embedded (portal) SSO: on mount, exchange the logged-in portal session for a
  // Flowghan token instead of ever showing a password box. Runs once; standalone
  // builds skip this entirely and use the normal login page.
  useEffect(() => {
    if (!EMBEDDED) return;
    if (getCurrentUser()) return; // already hold a token from this session
    let cancelled = false;
    (async () => {
      const token = await ssoLogin();
      if (cancelled) return;
      if (token) {
        setAuthUser(getCurrentUser());
        setShowLogin(false);
        setSsoFailed(false);
      } else {
        setSsoFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Register cross-cutting API handlers once. storage.js calls these from any
  // request, so we handle an expired session and save failures in one place.
  useEffect(() => {
    setAuthExpiredHandler(() => {
      // Token gone/expired: drop it. Standalone bounces to the sign-in screen;
      // embedded silently re-exchanges the portal session for a fresh token.
      logout();
      setAuthUser(null);
      setSaveFailed(false);
      if (EMBEDDED) {
        ssoLogin().then((token) => {
          if (token) { setAuthUser(getCurrentUser()); setSsoFailed(false); }
          else { setSsoFailed(true); }
        });
        return;
      }
      setSessionExpired(true);
      setShowLogin(true);
    });
    setSaveErrorHandler((err) => {
      // err is an Error on failure, or null after a successful save.
      setSaveFailed(!!err);
    });
    return () => { setAuthExpiredHandler(null); setSaveErrorHandler(null); };
  }, []);

  const persist = useCallback(async (next) => {
    setRunsheets(next);
    try { await storage.set("ebright-runsheets", JSON.stringify(next), false); } catch (e) {}
  }, []);

  const persistTemplates = useCallback(async (next) => {
    setTemplates(next);
    try { await storage.set("ebright-templates", JSON.stringify(next), false); } catch (e) {}
  }, []);

  const persistModules = useCallback(async (next) => {
    setModules(next);
    try { await storage.set("ebright-modules", JSON.stringify(next)); } catch (e) {}
  }, []);

  // Patch a single flowchart node inside a template and persist it — used by My Work
  // so an assignee can tick off / attach proof / unlock without opening the editor.
  const updateFlowchartNode = (templateId, nodeId, patch) => {
    persistTemplates(templates.map((t) => {
      if (t.id !== templateId || !t.flowchart?.nodes) return t;
      return { ...t, flowchart: { ...t.flowchart, nodes: t.flowchart.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)) } };
    }));
  };

  const handleToggle = (taskId) => {
    // Guard: don't allow delivery while a task has unfinished subtasks,
    // unless its step is marked optionalCompletion.
    const owner = runsheets.find((rs) => rs.tasks.some((t) => t.id === taskId));
    const task = owner?.tasks.find((t) => t.id === taskId);
    if (task && task.status !== "delivered" && (task.subtasks?.length ?? 0) > 0 && task.subtasks.some((s) => !s.done)) {
      const template = templates.find((t) => t.id === owner.templateId) || showcaseTemplate;
      const step = template.steps.find((s) => s.id === task.stepId);
      if (!step?.optionalCompletion) return;
    }
    const next = runsheets.map((rs) => ({
      ...rs,
      tasks: rs.tasks.map((t) => t.id === taskId ? { ...t, status: t.status === "delivered" ? "standing-by" : "delivered" } : t),
    }));
    persist(next);
  };

  const handleReassign = (taskId, assignee) => {
    const next = runsheets.map((rs) => ({
      ...rs,
      tasks: rs.tasks.map((t) => t.id === taskId ? { ...t, assignee } : t),
    }));
    persist(next);
  };

  const handleApprove = (taskId) => {
    const next = runsheets.map((rs) => {
      if (!rs.tasks.some((t) => t.id === taskId)) return rs;
      // Round-trip through the model so evaluateConditions re-runs and unblocks
      // any downstream tasks now that this approval has been granted.
      const template = templates.find((t) => t.id === rs.templateId) || showcaseTemplate;
      const run = runsheetToRun(rs);
      const updatedRun = evaluateConditions(
        { ...run, tasks: run.tasks.map((t) => t.id === taskId ? { ...t, status: "approved", rejectionReason: "" } : t) },
        template
      );
      return { ...runToRunsheet(updatedRun), createdAt: rs.createdAt };
    });
    persist(next);
  };

  const handleReject = (taskId) => {
    const next = runsheets.map((rs) => {
      if (!rs.tasks.some((t) => t.id === taskId)) return rs;
      // Round-trip through the model so evaluateConditions re-runs and re-blocks
      // any downstream tasks now that this approval has been rejected.
      const template = templates.find((t) => t.id === rs.templateId) || showcaseTemplate;
      const run = runsheetToRun(rs);
      const updatedRun = evaluateConditions(
        { ...run, tasks: run.tasks.map((t) => t.id === taskId ? { ...t, status: "rejected" } : t) },
        template
      );
      return { ...runToRunsheet(updatedRun), createdAt: rs.createdAt };
    });
    persist(next);
  };

  const handleRejectionReason = (taskId, reason) => {
    const next = runsheets.map((rs) => ({
      ...rs,
      tasks: rs.tasks.map((t) => t.id === taskId ? { ...t, rejectionReason: reason } : t),
    }));
    persist(next);
  };

  const handleAddComment = (taskId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const comment = { id: `c-${Date.now()}`, author: currentUser, text: trimmed, timestamp: new Date().toISOString() };
    const next = runsheets.map((rs) => {
      if (!rs.tasks.some((t) => t.id === taskId)) return rs;
      // Round-trip through the model like other task updates so the comment
      // lands back on the runsheet without disturbing anything else.
      const template = templates.find((t) => t.id === rs.templateId) || showcaseTemplate;
      const run = runsheetToRun(rs);
      const updatedRun = evaluateConditions(
        { ...run, tasks: run.tasks.map((t) => t.id === taskId ? { ...t, comments: [...(t.comments || []), comment] } : t) },
        template
      );
      return { ...runToRunsheet(updatedRun), createdAt: rs.createdAt };
    });
    persist(next);
  };

  const handleFieldChange = (taskId, fieldId, value) => {
    const next = runsheets.map((rs) => {
      if (!rs.tasks.some((t) => t.id === taskId)) return rs;
      // Round-trip through the model so setFieldValue re-runs evaluateConditions
      // and the refreshed active flags land back on the runsheet.
      const template = templates.find((t) => t.id === rs.templateId) || showcaseTemplate;
      const run = runsheetToRun(rs);
      const updatedRun = setFieldValue(run, template, taskId, fieldId, value);
      return { ...runToRunsheet(updatedRun), createdAt: rs.createdAt };
    });
    persist(next);
  };

  const handleToggleSubtask = (taskId, subtaskId) => {
    const next = runsheets.map((rs) => {
      if (!rs.tasks.some((t) => t.id === taskId)) return rs;
      // Round-trip through the model so the toggled subtask lands back on the
      // runsheet the same way other task updates do.
      const run = runsheetToRun(rs);
      const updatedRun = toggleSubtask(run, taskId, subtaskId);
      return { ...runToRunsheet(updatedRun), createdAt: rs.createdAt };
    });
    persist(next);
  };

  const handleUpdateStep = (stepId, patch) => {
    if (!selected) return;
    const next = templates.map((t) => {
      if (t.id !== selected.templateId) return t;
      if (patch._setSteps) return { ...t, steps: patch._setSteps };
      if (patch._delete) return { ...t, steps: t.steps.filter((s) => s.id !== stepId) };
      return { ...t, steps: t.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) };
    });
    persistTemplates(next);
  };

  const handleUpdateTask = (taskId, patch) => {
    const next = runsheets.map((rs) => ({
      ...rs,
      tasks: rs.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
    }));
    persist(next);
  };

  const handleSaveDrawings = (shapes) => {
    const next = runsheets.map((rs) => (rs.id === selected?.id ? { ...rs, drawings: shapes } : rs));
    persist(next);
  };

  const handleToggleWeekComplete = (week) => {
    const next = runsheets.map((rs) => {
      if (rs.id !== selected?.id) return rs;
      const done = rs.completedWeeks ?? [];
      const completedWeeks = done.includes(week) ? done.filter((w) => w !== week) : [...done, week];
      return { ...rs, completedWeeks };
    });
    persist(next);
  };

  const handleCreate = (venue, eventDate, variableValues = {}) => {
    const branch = { name: venue, short: venue, pic: "", region: "" };
    const template = templates.find((t) => t.id === "showcase-template") || showcaseTemplate;
    const run = createRunFromTemplate(template, eventDate, branch, variableValues);
    const rs = runToRunsheet(run);
    persist([rs, ...runsheets]);
    setSelectedId(rs.id);
    setTab("detail");
  };

  const handleRunWorkflow = (templateId, venue, eventDate, variableValues = {}) => {
    const branch = { name: venue, short: venue, pic: "", region: "" };
    const template = templates.find((t) => t.id === templateId) || showcaseTemplate;
    const run = createRunFromTemplate(template, eventDate, branch, variableValues);
    const rs = runToRunsheet(run);
    persist([rs, ...runsheets]);
    setSelectedId(rs.id);
    setTab("detail");
  };

  const handleDelete = (id) => {
    persist(runsheets.filter((rs) => rs.id !== id));
  };

  const reorderRunsheets = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex == null || toIndex == null) return;
    const next = [...runsheets];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    persist(next);
  };

  const reorderTasks = (week, fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex == null || toIndex == null) return;
    const next = runsheets.map((rs) => {
      if (rs.id !== selectedId) return rs;
      const weekTasks = rs.tasks.filter((t) => t.week === week);
      if (fromIndex < 0 || fromIndex >= weekTasks.length || toIndex < 0 || toIndex >= weekTasks.length) return rs;
      const [moved] = weekTasks.splice(fromIndex, 1);
      weekTasks.splice(toIndex, 0, moved);
      let wi = 0;
      const tasks = rs.tasks.map((t) => (t.week === week ? weekTasks[wi++] : t));
      return { ...rs, tasks };
    });
    persist(next);
  };

  const handleNewTemplate = (module = "Marketing") => {
    const t = { id: "t-" + Date.now(), name: "New template", description: "", steps: [], module };
    persistTemplates([...templates, t]);
    setOpenTemplateId(t.id);
    setTab("template");
  };

  // Copy a whole flowchart into a brand-new workflow — used to build a separate workflow
  // for the OTHER endings/flows of a chart. The copy is a clean slate: the flow choice and
  // every runtime trace (decision picks, done/proof/answers) are cleared so the HOD can
  // pick a different ending in the copy without inheriting the original's progress.
  const handleDuplicateTemplate = (id) => {
    const src = templates.find((t) => t.id === id);
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = "t-" + Date.now();
    copy.name = `${src.name || "Untitled workflow"} (copy)`;
    if (copy.flowchart) {
      copy.flowchart.chosenEnd = null;
      (copy.flowchart.nodes || []).forEach((n) => {
        delete n.decisionChoice; delete n.forceInclude; delete n.keyAck;
        delete n.done; delete n.completedAt; delete n.proof; delete n.formValues;
        (n.subtasks || []).forEach((s) => { delete s.done; delete s.proof; delete s.completedAt; });
      });
    }
    persistTemplates([...templates, copy]);
    setOpenTemplateId(copy.id);
    setTab("template");
  };

  const handleAddModule = (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    if (modules.some((m) => m.toLowerCase() === trimmed.toLowerCase())) return;
    persistModules([...modules, trimmed]);
  };

  // Remove a module (folder). Any templates that lived in it are deleted too —
  // otherwise they'd be orphaned (no folder to show them). The Library confirms
  // first and warns when the folder isn't empty.
  const deleteModule = (mod) => {
    persistModules(modules.filter((m) => m !== mod));
    const survivors = templates.filter((t) => (t.module || "Marketing") !== mod);
    if (survivors.length !== templates.length) {
      persistTemplates(survivors);
      if (!survivors.some((t) => t.id === openTemplateId)) setTab("library");
    }
  };

  const reorderTemplates = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    const next = [...templates];
    const fromIndex = next.findIndex((t) => t.id === fromId);
    const toIndex = next.findIndex((t) => t.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    persistTemplates(next);
  };

  const renameTemplate = (id, name) => {
    persistTemplates(templates.map((t) => (t.id === id ? { ...t, name } : t)));
  };

  const deleteTemplate = (id) => {
    persistTemplates(templates.filter((t) => t.id !== id));
    if (openTemplateId === id) setTab("library");
  };

  const openTemplate = (id) => { setOpenTemplateId(id); setTab("template"); };

  const openRunsheet = (id) => { setSelectedId(id); setTab("detail"); };
  const selected = runsheets.find((rs) => rs.id === selectedId);

  useEffect(() => {
    if (!showTransition) return;
    const t = setTimeout(() => setShowTransition(false), 1400);
    return () => clearTimeout(t);
  }, [showTransition]);

  const handleTabChange = (newTab) => {
    setShowTransition(true);
    setTimeout(() => setTab(newTab), 700);
  };

  // External person following a shared form link — no login, no app chrome.
  if (publicFormToken) {
    return <PublicFormPage token={publicFormToken} />;
  }

  // Embedded (portal) build: never render the password login. Show a loader while
  // the portal session is exchanged for a Flowghan token; if that fails, tell the
  // user to open Flowghan from the portal instead of offering a password box.
  if (EMBEDDED && !authUser) {
    return (
      <div style={{ minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24, fontFamily: "'Work Sans', sans-serif", color: C.slate }}>
        {ssoFailed
          ? "Your portal session isn’t available. Please sign in to the Ebright portal and open Flowghan from the sidebar."
          : "Signing you in…"}
      </div>
    );
  }

  if (showLogin) {
    return <LoginPage notice={sessionExpired ? "Your session expired. Please sign in again." : ""} onSignIn={() => { setSessionExpired(false); setSaveFailed(false); setAuthUser(getCurrentUser()); setShowLogin(false); }} />;
  }

  if (loading) {
    return (
      <div style={{ minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Work Sans', sans-serif", color: C.slate }}>
        Raising the curtain…
      </div>
    );
  }

  // A real load error (server down / connection dropped / expired login). We show
  // this instead of the app so we never fall through to defaults-and-overwrite.
  if (loadError) {
    return (
      <div style={{ minHeight: 300, display: "flex", flexDirection: "column", gap: 14, alignItems: "center", justifyContent: "center", fontFamily: "'Work Sans', sans-serif", color: C.slate, textAlign: "center", padding: 24 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: C.ink }}>Couldn't reach the server</div>
        <div style={{ maxWidth: 420, lineHeight: 1.5 }}>
          Your data is safe — we just couldn't load it right now. Check that the
          server is running and try again.
        </div>
        <button
          onClick={() => loadData()}
          style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: C.ink, color: C.paper, fontFamily: "'Work Sans', sans-serif", fontWeight: 600, cursor: "pointer" }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", display: "flex", height: "100%", background: C.paper, borderRadius: 18, overflow: "hidden", fontFamily: "'Work Sans', sans-serif" }}>
      <style>{FONTS}</style>
      {showTransition && <DoomTransition />}
      {saveFailed && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 10000, display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderRadius: 10, background: C.ink, color: C.paper, fontFamily: "'Work Sans', sans-serif", fontSize: 13, boxShadow: "0 6px 24px rgba(0,0,0,0.25)" }}>
          <span>Couldn't reach the server — recent changes may not be saved.</span>
          <button
            onClick={() => setSaveFailed(false)}
            style={{ border: "none", background: "transparent", color: C.paper, fontWeight: 700, cursor: "pointer", fontSize: 15, lineHeight: 1 }}
            aria-label="Dismiss"
          >×</button>
        </div>
      )}
      {sidebarCollapsed && (
        <button
          onClick={toggleSidebar}
          title="Show sidebar"
          aria-label="Show sidebar"
          style={{
            position: "absolute", top: 20, left: 16, zIndex: 50,
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 34, borderRadius: 9, border: `1px solid ${C.line}`,
            background: C.paper, color: C.ink, cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
          }}
        >
          <ChevronRight size={17} />
        </button>
      )}
      {!sidebarCollapsed && (
      <div style={{ width: 220, background: C.ink, padding: "22px 14px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 4px 0 10px", marginBottom: 26 }}>
          <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 17, color: C.paper }}>Flowghan</span>
          <button
            onClick={toggleSidebar}
            title="Hide sidebar for a bigger canvas"
            aria-label="Hide sidebar"
            style={{
              marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(250,247,240,0.15)",
              background: "transparent", color: "rgba(250,247,240,0.7)", cursor: "pointer", flexShrink: 0,
            }}
          >
            <ChevronLeft size={16} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <NavItem icon={CheckSquare} label="My Work" active={tab === "mywork"} onClick={() => handleTabChange("mywork")} />
          <NavItem icon={LayoutDashboard} label="Dashboard" active={tab === "dashboard"} onClick={() => handleTabChange("dashboard")} />
          <NavItem icon={CalendarDays} label="Calendar" active={tab === "calendar"} onClick={() => handleTabChange("calendar")} />
          <NavItem icon={BarChart2} label="Reports" active={tab === "reports"} onClick={() => handleTabChange("reports")} />
          <NavItem icon={BookOpen} label="Library" active={tab === "library" || tab === "template"} onClick={() => handleTabChange("library")} />
          <NavItem icon={ListChecks} label={isMarketing ? "Runsheets" : "Workflows"} active={tab === "runsheets" || tab === "detail" || tab === "new"} onClick={() => handleTabChange("runsheets")} />
          {/* Cast & crew hidden from the nav per request. CastCrew/the route are
              left intact in case this needs to come back. */}
          {isAdmin && <NavItem icon={Grid} label="Overview" active={tab === "overview"} onClick={() => handleTabChange("overview")} />}
          {/* Users screen hidden from the nav: SSO auto-syncs the users table now
              (see ssoLogin() in storage.js), so manual account management is no
              longer the primary path. UsersAdmin/the route are left intact in case
              this needs to come back. */}
        </div>
        <div style={{ marginTop: "auto", padding: "0 10px" }}>
          {/* Embedded in the portal, sign-out is controlled by the portal itself
              (the portal session drives Flowghan's SSO), so we hide this button
              there to avoid a dead-end logout the user can't recover from. */}
          {!EMBEDDED && <button
            onClick={() => {
              logout();
              setAuthUser(null);
              // Drop the previous user's data so nothing leaks into the next login.
              setTemplates([showcaseTemplate, minusWeek15Template, parentConfirmationTemplate]);
              setModules(["Marketing"]);
              setRunsheets([]);
              setLoading(true);
              setShowLogin(true);
            }}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 10px",
              borderRadius: 8, border: "1px solid rgba(250,247,240,0.15)", background: "transparent",
              color: "rgba(250,247,240,0.7)", fontFamily: "'Work Sans', sans-serif", fontSize: 13,
              fontWeight: 500, cursor: "pointer", marginBottom: 14,
            }}
          >
            <LogOut size={15} /> Log out
          </button>}
          <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, color: "rgba(250,247,240,0.4)", lineHeight: 1.5 }}>
            Connected to Ebright database. Data is shared across the team.
          </p>
        </div>
      </div>
      )}

      <div style={{ flex: 1, padding: sidebarCollapsed ? "28px 32px 28px 60px" : "28px 32px", overflowY: "auto" }}>
        {tab === "mywork" && <MyFlowchartWork templates={templates} authUser={authUser} onUpdateNode={updateFlowchartNode} onViewFlowchart={openTemplate} />}
        {tab === "dashboard" && <Dashboard runsheets={runsheets} isAdmin={isAdmin} onOpen={openRunsheet} onNotify={(m) => { setEmailData(m); }} />}
        {tab === "calendar" && <CalendarView runsheets={runsheets} onOpenRunsheet={openRunsheet} />}
        {tab === "reports" && <Reports runsheets={runsheets} templates={templates} />}
        {tab === "runsheets" && (isMarketing
          ? <RunsheetsList runsheets={runsheets} onOpen={openRunsheet} onNew={() => setTab("new")} onDelete={handleDelete} onReorder={reorderRunsheets} />
          : <DeptWorkflows templates={templates} onOpenTemplate={openTemplate} />)}
        {tab === "detail" && selected && <RunsheetDetail runsheet={selected} template={templates.find((t) => t.id === selected.templateId) || showcaseTemplate} currentUser={currentUser} onBack={() => setTab("runsheets")} onToggle={handleToggle} onReassign={handleReassign} onFieldChange={handleFieldChange} onApprove={handleApprove} onReject={handleReject} onRejectionReason={handleRejectionReason} onAddComment={handleAddComment} onReorderTasks={reorderTasks} onToggleSubtask={handleToggleSubtask} onUpdateStep={handleUpdateStep} onUpdateTask={handleUpdateTask} onSaveDrawings={handleSaveDrawings} onToggleWeekComplete={handleToggleWeekComplete} />}
        {tab === "new" && <NewRunsheet onCreate={handleCreate} onCancel={() => setTab("runsheets")} template={templates.find((t) => t.id === "showcase-template") || showcaseTemplate} />}
        {tab === "library" && <Library templates={templates} modules={modules} onOpenTemplate={openTemplate} onNewTemplate={handleNewTemplate} onReorder={reorderTemplates} onAddModule={handleAddModule} onRenameTemplate={renameTemplate} onDeleteTemplate={deleteTemplate} onDeleteModule={deleteModule} onDuplicateTemplate={handleDuplicateTemplate} />}
        {tab === "template" && (() => {
          const t = templates.find((x) => x.id === openTemplateId);
          // The three original Marketing templates keep the old step editor.
          // Every other template — non-Marketing AND newly-created Marketing ones —
          // uses the flowchart editor (with approval sending + per-subtask proof).
          const LEGACY_TEMPLATE_IDS = ["showcase-template", "minus-week-15", "parent-confirmation"];
          if (t && !LEGACY_TEMPLATE_IDS.includes(t.id)) {
            return <FlowchartCanvas key={t.id} template={t} onBack={() => setTab("library")} onRename={(name) => renameTemplate(t.id, name)} onSave={(flowchart) => persistTemplates(templates.map((x) => (x.id === t.id ? { ...x, flowchart } : x)))} onDuplicate={() => handleDuplicateTemplate(t.id)} />;
          }
          return <TemplateEditor templateId={openTemplateId} templates={templates} setTemplates={persistTemplates} onBack={() => setTab("library")} onRunWorkflow={handleRunWorkflow} />;
        })()}
        {tab === "directory" && isAdmin && <CastCrew />}
        {tab === "overview" && isAdmin && <DeptOverview />}
        {tab === "users" && isAdmin && <UsersAdmin />}
      </div>

      {emailData && (
        <EmailModal
          byAssignee={emailData}
          onClose={() => setEmailData(null)}
        />
      )}
    </div>
  );
}
