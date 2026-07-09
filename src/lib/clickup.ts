const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

export interface ClickUpTaskView {
  id: string;
  name: string;
  status: string;
  statusColor: string;
  dueDate: number | null;
  doneDate: number | null;
  priority: string | null;
  listName: string;
  folderName: string;
  ownerName: string | null;
  url: string;
}

export interface IndividualTasks {
  userId: number;
  name: string;
  tasks: ClickUpTaskView[];
}

export interface OtherBucket {
  ownerName: string;
  tasks: ClickUpTaskView[];
}

/** A candidate app employee an extracted ClickUp owner name can be matched against. */
export interface RosterEntry {
  userId: number;
  fullName: string;
  nickName: string | null;
  departmentId: number | null;
}

// ---- Pure helpers (unit-tested) ----

interface RawTask {
  id: string;
  name: string;
  status?: { status?: string; color?: string } | null;
  due_date?: string | null;
  date_done?: string | null;
  date_closed?: string | null;
  priority?: { priority?: string } | null;
  list?: { name?: string } | null;
  folder?: { name?: string } | null;
  url?: string;
}

/**
 * The task owner is written into the folder name in this workspace: as a
 * trailing parenthetical — "Database and HRMS (Rahman)" — or after an
 * "Intern - " prefix — "3.6.9 Intern - Yee Qian". Returns null when neither
 * pattern is present.
 */
export function extractOwner(folderName: string | null | undefined): string | null {
  const n = (folderName ?? "").trim();
  if (!n) return null;
  const paren = n.match(/\(([^()]+)\)\s*$/);
  if (paren) return paren[1].trim() || null;
  const intern = n.match(/Intern\s*-\s*(.+)$/i);
  if (intern) return intern[1].trim() || null;
  return null;
}

const DAY_FULL: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  thur: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};
const WEEKDAY_ORDER: Record<string, number> = {
  Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7,
};
const PERIOD_ORDER = ["weekly", "daily", "month", "quarter", "year"];

/**
 * Collapse a ClickUp folder name into a schedule section, so day folders
 * ("Wed | Executive", "Wed | Manager") aggregate into one weekday ("Wednesday").
 * Numbered period folders ("03 | Monthly") become their label ("Monthly").
 */
export function scheduleSection(folderName: string): string {
  const lower = (folderName || "").trim().toLowerCase();
  const day = lower.match(/^(mon|tue|wed|thur|thu|fri|sat|sun)\b/);
  if (day) return DAY_FULL[day[1]];
  const num = (folderName || "").match(/^\d+\s*\|\s*(.+)$/);
  if (num) return num[1].trim();
  return folderName || "Other";
}

/** Sort key so sections read in schedule order: weekdays, then weekly→yearly periods. */
export function sectionSortKey(label: string): [number, number, string] {
  if (WEEKDAY_ORDER[label]) return [1, WEEKDAY_ORDER[label], label];
  const lower = label.toLowerCase();
  const p = PERIOD_ORDER.findIndex((k) => lower.includes(k));
  if (p !== -1) return [2, p, label];
  return [3, 0, label];
}

export function normalizeName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Match an extracted ClickUp owner nickname to an app employee: exact match on
 * nick_name or full_name first, then a whole-word match within either. Returns
 * the matched user_id, or null. First match wins on first-name collisions (v1).
 */
export function matchOwnerToRoster(
  owner: string | null,
  roster: RosterEntry[],
): number | null {
  const o = normalizeName(owner);
  if (o.length < 2) return null;

  const exact = roster.find(
    (r) => normalizeName(r.nickName) === o || normalizeName(r.fullName) === o,
  );
  if (exact) return exact.userId;

  const word = roster.find(
    (r) =>
      normalizeName(r.fullName).split(" ").includes(o) ||
      normalizeName(r.nickName).split(" ").includes(o),
  );
  return word ? word.userId : null;
}

export interface StatusSlice {
  status: string;
  color: string;
  count: number;
}

/** Count tasks by status (for a pie chart), using each status's ClickUp color. */
/** Completed statuses are forced to light green for an at-a-glance read. */
const COMPLETED_STATUS = /complete|done/i;
const COMPLETED_COLOR = "#86efac"; // tailwind green-300

export function statusColor(status: string, rawColor: string): string {
  if (COMPLETED_STATUS.test(status)) return COMPLETED_COLOR;
  return rawColor || "#94a3b8";
}

/** Epoch ms for Monday 00:00 of the current week (server local time). */
export function currentWeekStart(now: Date = new Date()): number {
  const d = new Date(now);
  const mondayOffset = (d.getDay() + 6) % 7; // 0 = Monday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - mondayOffset);
  return d.getTime();
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * ClickUp's operations boards reflect the current recurrence cycle. A task
 * completed in the IMMEDIATELY-PRIOR week is a recurring task that's due again
 * this week, so ClickUp drops last week's completion (the current occurrence is
 * pending). We drop only those. Completes done THIS week (done this cycle) and
 * long-stale completes (older than last week — not part of the active weekly
 * rotation, e.g. a one-off finished months ago) are kept as complete.
 */
export function filterToCurrentCycle(
  tasks: ClickUpTaskView[],
  weekStartMs: number,
): ClickUpTaskView[] {
  const prevWeekStart = weekStartMs - ONE_WEEK_MS;
  return tasks.filter((t) => {
    const isComplete = COMPLETED_STATUS.test(t.status);
    if (isComplete && t.doneDate !== null && t.doneDate >= prevWeekStart && t.doneDate < weekStartMs) {
      return false; // completed last week → recurring, due again this week
    }
    return true;
  });
}

export function aggregateByStatus(tasks: ClickUpTaskView[]): StatusSlice[] {
  const map = new Map<string, StatusSlice>();
  for (const t of tasks) {
    const status = t.status || "no status";
    const existing = map.get(status);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(status, { status, color: statusColor(status, t.statusColor), count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function sortByDueDate(tasks: ClickUpTaskView[]): ClickUpTaskView[] {
  return [...tasks].sort((a, b) => {
    if (a.dueDate === null && b.dueDate === null) return 0;
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate - b.dueDate;
  });
}

export function mapTask(raw: RawTask): ClickUpTaskView {
  const folderName = raw.folder?.name ?? "";
  return {
    id: raw.id,
    name: raw.name,
    status: raw.status?.status ?? "",
    statusColor: raw.status?.color ?? "",
    dueDate: raw.due_date ? Number(raw.due_date) : null,
    doneDate: raw.date_done ? Number(raw.date_done) : raw.date_closed ? Number(raw.date_closed) : null,
    priority: raw.priority?.priority ?? null,
    listName: raw.list?.name ?? "",
    folderName,
    ownerName: extractOwner(folderName),
    url: raw.url ?? "",
  };
}

// ---- Branch spaces ----

export interface BranchSpace {
  id: string;
  code: string;
  name: string;
}

/**
 * Branch spaces are named "B20 | Kajang TTDI Grove (Huda)". Parse the code and
 * branch name; returns null for non-branch spaces (HQ, events, templates).
 */
export function parseBranchSpace(id: string, spaceName: string): BranchSpace | null {
  const m = (spaceName || "").match(/^(B\d{2})\s*\|\s*([^(]+?)(?:\s*\(.*\))?\s*$/);
  if (!m) return null;
  const code = m[1];
  if (code === "B00") return null; // templates / ARM, not a real branch
  return { id, code, name: m[2].trim() };
}

// ---- Fetch helpers (manually verified) ----

interface RawSpace { id: string; name: string }

/** All branch spaces in the workspace (B01..Bnn), sorted by code. */
export async function getBranchSpaces(teamId: string, token: string): Promise<BranchSpace[]> {
  const res = await fetch(`${CLICKUP_API_BASE}/team/${teamId}/space?archived=false`, {
    headers: { Authorization: token },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ClickUp spaces fetch failed: ${res.status}`);
  const data = (await res.json()) as { spaces: RawSpace[] };
  return data.spaces
    .map((s) => parseBranchSpace(s.id, s.name))
    .filter((b): b is BranchSpace => b !== null)
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Fetch every task across all pages, optionally scoped to a single space and
 * optionally including closed/completed tasks. ClickUp paginates at 100/page and
 * reports `last_page`; we loop until it's true (or a page is empty). A MAX_PAGES
 * guard bounds runaway loops.
 */
async function fetchAllTasks(
  teamId: string,
  token: string,
  opts: { spaceId?: string; includeClosed?: boolean; subtasks?: boolean } = {},
): Promise<ClickUpTaskView[]> {
  const MAX_PAGES = 50; // 5000 tasks — a safety bound, not an expected limit
  const all: ClickUpTaskView[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      include_closed: opts.includeClosed ? "true" : "false",
      subtasks: opts.subtasks === false ? "false" : "true",
      order_by: "due_date",
      page: String(page),
    });
    if (opts.spaceId) params.append("space_ids[]", opts.spaceId);
    const res = await fetch(`${CLICKUP_API_BASE}/team/${teamId}/task?${params.toString()}`, {
      headers: { Authorization: token },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`ClickUp tasks fetch failed: ${res.status}`);
    const data = (await res.json()) as { tasks: RawTask[]; last_page?: boolean };
    all.push(...data.tasks.map(mapTask));
    if (data.last_page || data.tasks.length === 0) break;
  }

  return all;
}

// In-memory cache shared across requests in the long-lived Node server. Fetching
// dozens of pages on every dashboard load would be far too slow, so we fetch once
// and serve cached results for CACHE_TTL_MS. The first request after a cold start
// (or expiry) pays the full fetch; subsequent loads are instant. Keyed per scope
// (whole workspace, or a single space).
const CACHE_TTL_MS = 10 * 60 * 1000;
type TaskCache = { at: number; tasks: ClickUpTaskView[]; inFlight: Promise<ClickUpTaskView[]> | null };
const taskCache = new Map<string, TaskCache>();

async function getCachedTasks(
  cacheKey: string,
  fetcher: () => Promise<ClickUpTaskView[]>,
): Promise<ClickUpTaskView[]> {
  const now = Date.now();
  let entry = taskCache.get(cacheKey);
  if (!entry) {
    entry = { at: 0, tasks: [], inFlight: null };
    taskCache.set(cacheKey, entry);
  }

  if (entry.at > 0 && now - entry.at < CACHE_TTL_MS) return entry.tasks;

  // Coalesce concurrent refreshes into a single fetch.
  let refresh = entry.inFlight;
  if (!refresh) {
    const current = entry;
    refresh = fetcher()
      .then((tasks) => {
        current.tasks = tasks;
        current.at = Date.now();
        return tasks;
      })
      .finally(() => {
        current.inFlight = null;
      });
    current.inFlight = refresh;
  }

  try {
    return await refresh;
  } catch (err) {
    if (entry.at > 0) return entry.tasks; // serve stale on refresh failure
    throw err;
  }
}

/** All OPEN tasks in the workspace (10-min cache). Used by the My Tasks page. */
export async function getOpenTasks(teamId: string, token: string): Promise<ClickUpTaskView[]> {
  return getCachedTasks(`team:${teamId}`, () => fetchAllTasks(teamId, token));
}

/**
 * Tasks in one branch space (10-min cache, keyed per space + scope).
 * `includeClosed` (default true) controls whether completed/closed tasks are
 * included — branch detail wants them (complete vs pending); the operations view
 * uses open-only to mirror ClickUp's pending-focused Branch Operations boards.
 */
export async function getSpaceTasks(
  teamId: string,
  spaceId: string,
  token: string,
  opts: { includeClosed?: boolean; subtasks?: boolean } = {},
): Promise<ClickUpTaskView[]> {
  const includeClosed = opts.includeClosed ?? true;
  const subtasks = opts.subtasks ?? true;
  const key = `space:${spaceId}:${includeClosed ? "all" : "open"}:${subtasks ? "sub" : "top"}`;
  return getCachedTasks(key, () => fetchAllTasks(teamId, token, { spaceId, includeClosed, subtasks }));
}

const WEEKDAY_CANONICAL: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday",
  friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};

/** Canonical weekday for a list named after a day ("Thursday"), else null. */
export function weekdayFromList(listName: string | null | undefined): string | null {
  return WEEKDAY_CANONICAL[(listName || "").trim().toLowerCase()] ?? null;
}

// The operational daily checklist lives in the "Weekly & Daily" folder (e.g.
// "01 | Weekly & Daily") as weekday lists. Other folders also have weekday-named
// lists (e.g. coach folders), so we must match BOTH the folder and the list.
const WEEKLY_DAILY_FOLDER = /weekly\s*&\s*daily/i;

/**
 * The weekday a task belongs to in a branch's operational dashboard: the weekday
 * LIST inside the "Weekly & Daily" FOLDER. Returns null for anything else.
 */
export function operationalDay(
  folderName: string | null | undefined,
  listName: string | null | undefined,
): string | null {
  if (!WEEKLY_DAILY_FOLDER.test(folderName || "")) return null;
  return weekdayFromList(listName);
}
