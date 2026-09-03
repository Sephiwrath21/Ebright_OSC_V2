// Server-only: fetches real task data from the ClickUp API and normalises it
// into the same DeptDataset shape the mock produces. Falls back to mock when
// the workspace token or a department's list id isn't configured, so the UI
// keeps working until the env is filled in.
//
// Env:
//   CLICKUP_API_TOKEN           personal token (pk_...)
//   CLICKUP_SPACE_<DEPT_SLUG>   space id per department, e.g. CLICKUP_SPACE_FINANCE
//                               (tasks from every list in that space are summed)
//
// Rules (per the agreed config):
//   - A "member" = a folder / folderless list in the space (e.g.
//     "3.6.2 Intern - Sofia"); their tasks are the tasks in that list. NOT by assignee.
//   - Complete = task status of type "done" or "closed"; otherwise Pending.
//   - member.week = ALL tasks (mirrors ClickUp's list Done/Not-done summary).
//   - member.days[i] = tasks DUE on weekday CLICKUP_DAYS[i] (Malaysia time).
import {
  CLICKUP_DAYS,
  mockDepartmentDataset,
  sumStats,
  type DeptDataset,
  type MemberWeek,
  type Stats,
  type TaskList,
} from "./clickup";
import { DEPARTMENTS } from "./departments";

const TOKEN = process.env.CLICKUP_API_TOKEN;

function spaceIdFor(slug: string): string | undefined {
  return process.env[`CLICKUP_SPACE_${slug.toUpperCase()}`];
}

export function isClickUpConfigured(slug: string): boolean {
  return !!TOKEN && !!spaceIdFor(slug);
}

// A "member" = a Folder in the space. Each folder holds one List per weekday
// (named "Tuesday", "Wednesday", …), so a task's day = the NAME of its list.
type MemberSource = { id: string; name: string; lists: { id: string; name: string }[] };

async function fetchSpaceMembers(spaceId: string): Promise<MemberSource[]> {
  const get = async (url: string) => {
    const r = await fetch(url, { headers: { Authorization: TOKEN as string }, cache: "no-store" });
    if (!r.ok) throw new Error(`ClickUp API ${r.status}: ${await r.text()}`);
    return r.json();
  };
  const members: MemberSource[] = [];
  const folders = (await get(
    `https://api.clickup.com/api/v2/space/${spaceId}/folder?archived=false`,
  )) as { folders?: { id: string; name: string }[] };
  for (const f of folders.folders ?? []) {
    const lists = (await get(
      `https://api.clickup.com/api/v2/folder/${f.id}/list?archived=false`,
    )) as { lists?: { id: string; name: string }[] };
    members.push({
      id: `folder:${f.id}`,
      name: f.name,
      lists: (lists.lists ?? []).map((l) => ({ id: l.id, name: l.name })),
    });
  }
  // Folderless (space-level) lists, e.g. "HOD Tasks (inter department)" — each
  // is its own member so its tasks are included in the department totals.
  const folderless = (await get(
    `https://api.clickup.com/api/v2/space/${spaceId}/list?archived=false`,
  )) as { lists?: { id: string; name: string }[] };
  for (const l of folderless.lists ?? []) {
    members.push({ id: `list:${l.id}`, name: l.name, lists: [{ id: l.id, name: l.name }] });
  }
  return members;
}

type ClickUpTask = {
  id: string;
  name: string;
  status?: { status?: string; type?: string };
};

/** CLICKUP_DAYS index whose weekday name appears in a list name (e.g. "Tuesday"); -1 if none. */
function dayIndexFromListName(name: string): number {
  const lower = name.toLowerCase();
  return CLICKUP_DAYS.findIndex((d) => lower.includes(d.toLowerCase()));
}

async function getJson(url: string): Promise<{ tasks?: ClickUpTask[]; last_page?: boolean }> {
  const res = await fetch(url, { headers: { Authorization: TOKEN as string }, cache: "no-store" });
  if (!res.ok) throw new Error(`ClickUp API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ tasks?: ClickUpTask[]; last_page?: boolean }>;
}

/** Raw tasks whose HOME list is this list, including closed ones. */
async function fetchListEndpoint(listId: string): Promise<ClickUpTask[]> {
  const tasks: ClickUpTask[] = [];
  for (let page = 0; page < 50; page++) {
    const data = await getJson(
      `https://api.clickup.com/api/v2/list/${listId}/task?page=${page}&include_closed=true`,
    );
    const batch = data.tasks ?? [];
    tasks.push(...batch);
    if (data.last_page || batch.length === 0) break;
  }
  return tasks;
}

/**
 * Tasks for a list, matching what ClickUp shows — plus completed tasks.
 *
 * The /list/{id}/task endpoint only returns tasks whose HOME is this list, so
 * it MISSES tasks added to the day from another list and INCLUDES hidden nested
 * subtasks — its counts don't match ClickUp's. The List View (id "6-{listId}-1")
 * returns exactly the visible set (Pending + Not Applicable, multi-list included),
 * but hides completed/closed tasks. So we take the view as the source of truth and
 * fold in completed tasks from the list endpoint to populate the green slice.
 */
async function fetchAllTasks(listId: string): Promise<ClickUpTask[]> {
  const byId = new Map<string, ClickUpTask>();

  // 1. List view = authoritative visible set (Pending + Not Applicable).
  let viewOk = false;
  try {
    const viewId = `6-${listId}-1`;
    for (let page = 0; page < 50; page++) {
      const data = await getJson(`https://api.clickup.com/api/v2/view/${viewId}/task?page=${page}`);
      const batch = data.tasks ?? [];
      for (const t of batch) byId.set(t.id, t);
      if (data.last_page || batch.length === 0) break;
    }
    viewOk = true;
  } catch {
    // View not reachable — fall back to the list endpoint entirely.
  }

  const listTasks = await fetchListEndpoint(listId);
  if (!viewOk) {
    for (const t of listTasks) byId.set(t.id, t);
  } else {
    // 2. Fold in completed tasks the view hides (without overriding view rows).
    for (const t of listTasks) {
      const s = t.status?.status?.toLowerCase();
      if ((s === "complete" || s === "completed") && !byId.has(t.id)) byId.set(t.id, t);
    }
  }

  return [...byId.values()];
}

/** Real ClickUp dataset for a department, or null if not configured / on error. */
export async function fetchDepartmentDataset(slug: string): Promise<DeptDataset | null> {
  const spaceId = spaceIdFor(slug);
  if (!TOKEN || !spaceId) return null;

  let sources: MemberSource[];
  try {
    sources = await fetchSpaceMembers(spaceId);
  } catch (e) {
    console.error("[clickup] member fetch failed for", slug, e instanceof Error ? e.message : e);
    return null;
  }

  const members: MemberWeek[] = [];

  try {
    for (const src of sources) {
      let done = 0;
      let pending = 0;
      let na = 0;
      const days: Stats[] = CLICKUP_DAYS.map(() => ({
        done: 0,
        pending: 0,
        notApplicable: 0,
        total: 0,
      }));
      const dayTasks: TaskList[] = CLICKUP_DAYS.map(() => ({
        complete: [],
        pending: [],
        notApplicable: [],
      }));
      const weekTasks: TaskList = { complete: [], pending: [], notApplicable: [] };
      for (const list of src.lists) {
        const dayIndex = dayIndexFromListName(list.name); // the list IS the day
        for (const t of await fetchAllTasks(list.id)) {
          // Count by status NAME, matching ClickUp's pie:
          //   Complete       = "complete"/"completed"
          //   Not Applicable = "not applicable"/"n/a"/"na"
          //   Pending        = "pending"
          //   anything else (e.g. "in progress") is ignored.
          const status = t.status?.status?.toLowerCase();
          const isComplete = status === "complete" || status === "completed";
          const isNA = status === "not applicable" || status === "n/a" || status === "na";
          const isPending = status === "pending";
          if (!isComplete && !isPending && !isNA) continue;
          const title = t.name ?? "(untitled)";
          // Weekly: every counted task in the member's folder.
          if (isComplete) {
            done += 1;
            weekTasks.complete.push(title);
          } else if (isNA) {
            na += 1;
            weekTasks.notApplicable.push(title);
          } else {
            pending += 1;
            weekTasks.pending.push(title);
          }
          // Per day: tasks in that weekday's list.
          if (dayIndex >= 0) {
            const cell = days[dayIndex];
            const dt = dayTasks[dayIndex];
            cell.total += 1;
            if (isComplete) {
              cell.done += 1;
              dt.complete.push(title);
            } else if (isNA) {
              cell.notApplicable += 1;
              dt.notApplicable.push(title);
            } else {
              cell.pending += 1;
              dt.pending.push(title);
            }
          }
        }
      }
      const week: Stats = { done, pending, notApplicable: na, total: done + pending + na };
      members.push({ id: src.id, name: src.name, role: "", week, days, weekTasks, dayTasks });
    }
  } catch (e) {
    console.error("[clickup] task fetch failed for", slug, e instanceof Error ? e.message : e);
    return null;
  }

  members.sort((a, b) => a.name.localeCompare(b.name));
  return { slug, members, week: sumStats(members.map((m) => m.week)) };
}

// Fetching a space is slow (many ClickUp calls) and rate-limited, so cache the
// result per department. This also keeps every page (dashboard, members,
// member-filtered) on the SAME data, so member ids match across navigations.
//
// Strategy: stale-while-revalidate. A request ALWAYS gets the cached data
// instantly (fast open); if that data is older than FRESH_MS we kick off a
// background refresh so the next open is up to date. A naive short TTL would do
// the opposite — every open past the TTL would block on the full fetch.
type CacheEntry = {
  data: DeptDataset;
  refreshedAt: number;
  refreshing?: Promise<void>; // in-flight background refresh (dedupes)
};
const datasetCache = new Map<string, CacheEntry>();
const FRESH_MS = 15 * 1000; // serve instantly; refresh in background once older than this

async function loadDataset(slug: string): Promise<DeptDataset> {
  const real = await fetchDepartmentDataset(slug);
  return real ?? mockDepartmentDataset(slug);
}

function refreshInBackground(slug: string, entry: CacheEntry): void {
  if (entry.refreshing) return; // already refreshing — don't stack fetches
  entry.refreshing = loadDataset(slug)
    .then((data) => {
      datasetCache.set(slug, { data, refreshedAt: Date.now() });
    })
    .catch((e) => {
      console.error("[clickup] background refresh failed for", slug, e instanceof Error ? e.message : e);
      entry.refreshing = undefined; // allow a retry on the next request
    });
}

/** Real ClickUp data if configured, otherwise the mock. Cached per department. */
export async function getDepartmentDataset(slug: string): Promise<DeptDataset> {
  const cached = datasetCache.get(slug);
  if (cached) {
    if (Date.now() - cached.refreshedAt > FRESH_MS) refreshInBackground(slug, cached);
    return cached.data; // instant
  }
  // Cold start: nothing cached yet, so this first open must wait for the fetch.
  const data = await loadDataset(slug);
  datasetCache.set(slug, { data, refreshedAt: Date.now() });
  return data;
}

/** Branch week = sum of every department's week (real where configured). */
export async function getBranchWeek(): Promise<Stats> {
  const datasets = await Promise.all(DEPARTMENTS.map((d) => getDepartmentDataset(d.slug)));
  return sumStats(datasets.map((d) => d.week));
}
