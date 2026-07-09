# ClickUp Department Ongoing-Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show ongoing (open) ClickUp tasks on the dashboard, scoped by viewer role and grouped by department → individual, via a role-aware widget on `/home` and a full `/tasks` page.

**Architecture:** One server-side ClickUp workspace API token. The API route resolves the viewer's scope (own vs. department) from their session + DB department, maps app users ↔ ClickUp members by email, fetches open tasks for the relevant assignees, and returns grouped JSON. The token never reaches the browser.

**Tech Stack:** Next.js 16 (App Router, route handlers), NextAuth (JWT sessions), Prisma 7 + `@prisma/adapter-pg` (Postgres), Tailwind CSS v4, Vitest (new, for pure helpers). No DB schema changes.

---

## Reference: ClickUp API facts used throughout

- **Auth header on every call:** `Authorization: <CLICKUP_API_TOKEN>` (raw token, NOT `Bearer`).
- **Teams + members:** `GET https://api.clickup.com/api/v2/team` → `{ "teams": [ { "id": "333", "name": "...", "members": [ { "user": { "id": 123, "email": "a@b.com", "username": "..." } } ] } ] }`.
- **Open tasks by assignee:** `GET https://api.clickup.com/api/v2/team/{team_id}/task?assignees[]={id}&assignees[]={id2}&include_closed=false&subtasks=true&order_by=due_date` → `{ "tasks": [ ... ] }`.
- **Task shape (fields we use):** `id` (string), `name` (string), `status` (`{ status, color }`), `due_date` (string of epoch-ms, or null), `priority` (`{ priority }` or null), `list` (`{ name }`), `url` (string), `assignees` (`[ { email } ]`).
- A non-200 response → surface as an error (widget/page show retry).

## App facts used throughout

- Roles: `"superadmin"`, `"admin"`, `"staff"`, `"department"`. HOD is `position === "FT HOD"` (`HOD_POSITION` in `src/app/attendance/leave/approval-logic.ts`).
- `getActiveDepartmentId(userId: number): Promise<number | null>` already exists in `src/app/attendance/leave/approval-queries.ts` — reuse it.
- Session shape (`src/lib/nextauth.ts`): `session.user.id` (stringified `user_id`), `.email`, `.name`, `.role`, `.position`.
- Active department members pattern: `where: { employment: { some: { status: "active", department_id } } }`, name via `user_profile.full_name`.

## File Structure

- `vitest.config.ts` — minimal Vitest config (Create).
- `src/lib/clickup-access.ts` — `resolveTaskScope` + `TaskScope` type (Create).
- `src/lib/clickup-access.test.ts` — unit tests (Create).
- `src/lib/clickup.ts` — types, pure helpers (`mapTask`, `sortByDueDate`, `buildIndividuals`), fetch helpers (Create).
- `src/lib/clickup.test.ts` — unit tests for pure helpers (Create).
- `src/lib/clickup-queries.ts` — `getDepartmentMembers` DB helper (Create).
- `src/app/api/clickup/tasks/route.ts` — scoped, grouped task data (Create).
- `src/app/components/OngoingTasksWidget.tsx` — home widget (Create).
- `src/app/tasks/page.tsx` — full breakdown page (Create).
- `src/app/home/page.tsx` — mount the widget (Modify).
- `.env` / `.env.example` — `CLICKUP_API_TOKEN`, `CLICKUP_TEAM_ID` (Modify; user-owned values).

---

## Task 1: Vitest setup + access resolver

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/clickup-access.ts`
- Test: `src/lib/clickup-access.test.ts`
- Modify: `package.json` (add `vitest` devDep + `test` script)

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

Expected: `vitest` added to devDependencies.

- [ ] **Step 2: Add the test script**

In `package.json` `"scripts"`, add:

```json
    "test": "vitest run"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write the failing test**

Create `src/lib/clickup-access.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveTaskScope } from "./clickup-access";

describe("resolveTaskScope", () => {
  it("gives an HOD with a department the department scope", () => {
    expect(resolveTaskScope({ role: "staff", position: "FT HOD", departmentId: 7 }))
      .toEqual({ kind: "department", departmentId: 7 });
  });

  it("gives a 'department' role with a department the department scope", () => {
    expect(resolveTaskScope({ role: "department", position: null, departmentId: 3 }))
      .toEqual({ kind: "department", departmentId: 3 });
  });

  it("falls back to own scope for an HOD with no department", () => {
    expect(resolveTaskScope({ role: "staff", position: "FT HOD", departmentId: null }))
      .toEqual({ kind: "own" });
  });

  it("gives regular staff own scope", () => {
    expect(resolveTaskScope({ role: "staff", position: "Server", departmentId: 7 }))
      .toEqual({ kind: "own" });
  });

  it("gives oversight roles own scope (no company-wide view)", () => {
    expect(resolveTaskScope({ role: "superadmin", position: null, departmentId: 1 }))
      .toEqual({ kind: "own" });
    expect(resolveTaskScope({ role: "admin", position: null, departmentId: 1 }))
      .toEqual({ kind: "own" });
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `Failed to resolve import "./clickup-access"`.

- [ ] **Step 6: Implement `src/lib/clickup-access.ts`**

```ts
import { HOD_POSITION } from "@/app/attendance/leave/approval-logic";

export type TaskScope = { kind: "own" } | { kind: "department"; departmentId: number };

export function resolveTaskScope(input: {
  role: string | null | undefined;
  position: string | null | undefined;
  departmentId: number | null;
}): TaskScope {
  const isDepartmentViewer = input.position === HOD_POSITION || input.role === "department";
  if (isDepartmentViewer && input.departmentId != null) {
    return { kind: "department", departmentId: input.departmentId };
  }
  return { kind: "own" };
}
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS — 5 tests in `src/lib/clickup-access.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts src/lib/clickup-access.ts src/lib/clickup-access.test.ts package.json package-lock.json
git commit -m "feat(clickup): add Vitest and task-scope resolver"
```

---

## Task 2: ClickUp client — types, pure helpers, fetch helpers

**Files:**
- Create: `src/lib/clickup.ts`
- Test: `src/lib/clickup.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/clickup.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapTask, sortByDueDate, buildIndividuals, type ClickUpTaskView } from "./clickup";

function task(partial: Partial<ClickUpTaskView> & { id: string }): ClickUpTaskView {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    status: partial.status ?? "",
    statusColor: partial.statusColor ?? "",
    dueDate: partial.dueDate ?? null,
    priority: partial.priority ?? null,
    listName: partial.listName ?? "",
    url: partial.url ?? "",
    assigneeEmails: partial.assigneeEmails ?? [],
  };
}

describe("mapTask", () => {
  it("maps a raw ClickUp task, lowercasing assignee emails", () => {
    const raw = {
      id: "t1",
      name: "Do the thing",
      status: { status: "in progress", color: "#abc" },
      due_date: "1700000000000",
      priority: { priority: "high" },
      list: { name: "Sprint 1" },
      url: "https://app.clickup.com/t/t1",
      assignees: [{ email: "Alice@Ebright.MY" }, { email: "bob@ebright.my" }],
    };
    expect(mapTask(raw)).toEqual<ClickUpTaskView>({
      id: "t1",
      name: "Do the thing",
      status: "in progress",
      statusColor: "#abc",
      dueDate: 1700000000000,
      priority: "high",
      listName: "Sprint 1",
      url: "https://app.clickup.com/t/t1",
      assigneeEmails: ["alice@ebright.my", "bob@ebright.my"],
    });
  });

  it("handles null due_date, null priority, missing list and assignees", () => {
    const view = mapTask({
      id: "t2",
      name: "No due date",
      status: { status: "to do", color: "#000" },
      due_date: null,
      priority: null,
      list: null,
      url: "https://app.clickup.com/t/t2",
      assignees: null,
    });
    expect(view.dueDate).toBeNull();
    expect(view.priority).toBeNull();
    expect(view.listName).toBe("");
    expect(view.assigneeEmails).toEqual([]);
  });
});

describe("sortByDueDate", () => {
  it("sorts ascending by dueDate, nulls last", () => {
    const sorted = sortByDueDate([
      task({ id: "a", dueDate: null }),
      task({ id: "b", dueDate: 200 }),
      task({ id: "c", dueDate: 100 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["c", "b", "a"]);
  });
});

describe("buildIndividuals", () => {
  const tasks = [
    task({ id: "t1", dueDate: 200, assigneeEmails: ["alice@ebright.my"] }),
    task({ id: "t2", dueDate: 100, assigneeEmails: ["alice@ebright.my"] }),
    task({ id: "t3", dueDate: 50, assigneeEmails: ["bob@ebright.my"] }),
  ];

  it("assigns each individual their tasks (due-date sorted) and puts the viewer first", () => {
    const result = buildIndividuals(
      [
        { name: "Bob", email: "bob@ebright.my", linked: true },
        { name: "Alice", email: "alice@ebright.my", linked: true },
      ],
      tasks,
      "alice@ebright.my",
    );
    expect(result.map((i) => i.email)).toEqual(["alice@ebright.my", "bob@ebright.my"]);
    expect(result[0].tasks.map((t) => t.id)).toEqual(["t2", "t1"]);
    expect(result[1].tasks.map((t) => t.id)).toEqual(["t3"]);
  });

  it("matches assignee emails case-insensitively and gives unlinked people no tasks", () => {
    const result = buildIndividuals(
      [{ name: "Carol", email: "Carol@Ebright.MY", linked: false }],
      [task({ id: "t9", assigneeEmails: ["carol@ebright.my"] })],
      "someone@else.my",
    );
    expect(result[0].linked).toBe(false);
    expect(result[0].tasks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `Failed to resolve import "./clickup"`.

- [ ] **Step 3: Implement `src/lib/clickup.ts`**

```ts
const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

export interface ClickUpTaskView {
  id: string;
  name: string;
  status: string;
  statusColor: string;
  dueDate: number | null;
  priority: string | null;
  listName: string;
  url: string;
  assigneeEmails: string[];
}

export interface IndividualTasks {
  name: string;
  email: string;
  linked: boolean;
  tasks: ClickUpTaskView[];
}

export interface TargetUser {
  name: string;
  email: string;
  linked: boolean;
}

// ---- Pure helpers (unit-tested) ----

interface RawTask {
  id: string;
  name: string;
  status?: { status?: string; color?: string } | null;
  due_date?: string | null;
  priority?: { priority?: string } | null;
  list?: { name?: string } | null;
  url?: string;
  assignees?: { email?: string }[] | null;
}

export function mapTask(raw: RawTask): ClickUpTaskView {
  return {
    id: raw.id,
    name: raw.name,
    status: raw.status?.status ?? "",
    statusColor: raw.status?.color ?? "",
    dueDate: raw.due_date ? Number(raw.due_date) : null,
    priority: raw.priority?.priority ?? null,
    listName: raw.list?.name ?? "",
    url: raw.url ?? "",
    assigneeEmails: (raw.assignees ?? [])
      .map((a) => (a.email ?? "").toLowerCase())
      .filter(Boolean),
  };
}

export function sortByDueDate(tasks: ClickUpTaskView[]): ClickUpTaskView[] {
  return [...tasks].sort((a, b) => {
    if (a.dueDate === null && b.dueDate === null) return 0;
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate - b.dueDate;
  });
}

export function buildIndividuals(
  targets: TargetUser[],
  tasks: ClickUpTaskView[],
  viewerEmail: string,
): IndividualTasks[] {
  const viewer = viewerEmail.toLowerCase();
  const individuals = targets.map((t) => {
    const email = t.email.toLowerCase();
    const own = tasks.filter((task) => task.assigneeEmails.includes(email));
    return { name: t.name, email, linked: t.linked, tasks: sortByDueDate(own) };
  });
  return individuals.sort((a, b) => {
    if (a.email === viewer) return -1;
    if (b.email === viewer) return 1;
    return a.name.localeCompare(b.name);
  });
}

// ---- Fetch helpers (manually verified) ----

async function clickupGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${CLICKUP_API_BASE}${path}`, {
    headers: { Authorization: token },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ClickUp GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function getWorkspaceMembers(
  teamId: string,
  token: string,
): Promise<{ id: string; email: string }[]> {
  const data = await clickupGet<{
    teams: { id: string; members: { user: { id: number; email: string } }[] }[];
  }>("/team", token);
  const team = data.teams.find((t) => t.id === teamId);
  if (!team) return [];
  return team.members.map((m) => ({
    id: String(m.user.id),
    email: (m.user.email ?? "").toLowerCase(),
  }));
}

export async function getOpenTasksByAssignees(
  teamId: string,
  clickupUserIds: string[],
  token: string,
): Promise<ClickUpTaskView[]> {
  if (clickupUserIds.length === 0) return [];
  const params = new URLSearchParams({
    include_closed: "false",
    subtasks: "true",
    order_by: "due_date",
  });
  for (const id of clickupUserIds) params.append("assignees[]", id);
  const data = await clickupGet<{ tasks: RawTask[] }>(
    `/team/${teamId}/task?${params.toString()}`,
    token,
  );
  return data.tasks.map(mapTask);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS — all tests in `src/lib/clickup.test.ts` (and Task 1's tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clickup.ts src/lib/clickup.test.ts
git commit -m "feat(clickup): add ClickUp client and pure task helpers with tests"
```

---

## Task 3: Department members DB helper

**Files:**
- Create: `src/lib/clickup-queries.ts`

- [ ] **Step 1: Implement the query helper**

```ts
import { prisma } from "@/lib/prisma";

export interface DepartmentMember {
  name: string;
  email: string;
}

/** Active employees in a department, with display name (falls back to email). */
export async function getDepartmentMembers(departmentId: number): Promise<DepartmentMember[]> {
  const rows = await prisma.users.findMany({
    where: {
      status: "active",
      employment: { some: { status: "active", department_id: departmentId } },
    },
    select: {
      email: true,
      user_profile: { select: { full_name: true } },
    },
  });
  return rows.map((r) => ({
    name: r.user_profile?.full_name ?? r.email,
    email: r.email,
  }));
}

/** Department name for display. */
export async function getDepartmentName(departmentId: number): Promise<string> {
  const dept = await prisma.department.findUnique({
    where: { department_id: departmentId },
    select: { department_name: true },
  });
  return dept?.department_name ?? "Department";
}
```

- [ ] **Step 2: Type-check**

```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: no errors. (This relies on the existing Prisma client; no schema change.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/clickup-queries.ts
git commit -m "feat(clickup): add department members query helper"
```

---

## Task 4: API route — scoped, grouped task data

**Files:**
- Create: `src/app/api/clickup/tasks/route.ts`

Response shape (referenced by the widget and page):

```ts
// { configured: false }
// | { configured: true, scope: "own" | "department", viewerEmail: string,
//     departments: [{ departmentName: string, individuals: IndividualTasks[] }] }
```

- [ ] **Step 1: Implement the route**

```ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { getActiveDepartmentId } from "@/app/attendance/leave/approval-queries";
import { resolveTaskScope } from "@/lib/clickup-access";
import {
  getWorkspaceMembers,
  getOpenTasksByAssignees,
  buildIndividuals,
  type TargetUser,
} from "@/lib/clickup";
import { getDepartmentMembers, getDepartmentName } from "@/lib/clickup-queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as
    | { id?: string; email?: string; name?: string; role?: string; position?: string }
    | undefined;
  if (!user?.id || !user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.CLICKUP_API_TOKEN;
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!token || !teamId) {
    return NextResponse.json({ configured: false });
  }

  const departmentId = await getActiveDepartmentId(Number(user.id));
  const scope = resolveTaskScope({
    role: user.role,
    position: user.position,
    departmentId,
  });

  // Who do we show?
  let rawTargets: { name: string; email: string }[];
  let departmentName: string;
  if (scope.kind === "department") {
    rawTargets = await getDepartmentMembers(scope.departmentId);
    departmentName = await getDepartmentName(scope.departmentId);
  } else {
    rawTargets = [{ name: user.name ?? user.email, email: user.email }];
    departmentName = "My Tasks";
  }

  try {
    const members = await getWorkspaceMembers(teamId, token);
    const emailToId = new Map(members.map((m) => [m.email, m.id]));

    const targets: TargetUser[] = rawTargets.map((t) => ({
      name: t.name,
      email: t.email,
      linked: emailToId.has(t.email.toLowerCase()),
    }));

    const clickupIds = targets
      .map((t) => emailToId.get(t.email.toLowerCase()))
      .filter((id): id is string => Boolean(id));

    const tasks = await getOpenTasksByAssignees(teamId, clickupIds, token);
    const individuals = buildIndividuals(targets, tasks, user.email);

    return NextResponse.json({
      configured: true,
      scope: scope.kind,
      viewerEmail: user.email.toLowerCase(),
      departments: [{ departmentName, individuals }],
    });
  } catch {
    return NextResponse.json({ error: "Failed to load ClickUp tasks" }, { status: 502 });
  }
}
```

- [ ] **Step 2: Manually verify**

With `CLICKUP_API_TOKEN` + `CLICKUP_TEAM_ID` set, run `npm run dev`, log in, and visit `http://localhost:3000/api/clickup/tasks`.
Expected: `{ "configured": true, "scope": "own"|"department", ... }`. As an `FT HOD` or `department` role, `scope` is `"department"` and `individuals` lists teammates. With env unset: `{ "configured": false }`.

- [ ] **Step 3: Type-check**

```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/clickup/tasks/route.ts
git commit -m "feat(clickup): add scoped grouped tasks API route"
```

---

## Task 5: Home widget

**Files:**
- Create: `src/app/components/OngoingTasksWidget.tsx`

- [ ] **Step 1: Implement the widget**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface TaskView {
  id: string;
  name: string;
  status: string;
  statusColor: string;
  dueDate: number | null;
  priority: string | null;
  listName: string;
  url: string;
  assigneeEmails: string[];
}
interface IndividualTasks { name: string; email: string; linked: boolean; tasks: TaskView[] }
interface DepartmentGroup { departmentName: string; individuals: IndividualTasks[] }

type Payload =
  | { configured: false }
  | { configured: true; scope: "own" | "department"; viewerEmail: string; departments: DepartmentGroup[] };

type State =
  | { kind: "loading" }
  | { kind: "notConfigured" }
  | { kind: "error" }
  | { kind: "ready"; data: Extract<Payload, { configured: true }> };

function formatDue(due: number | null): { label: string; overdue: boolean } {
  if (due === null) return { label: "No due date", overdue: false };
  const d = new Date(due);
  return {
    label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    overdue: due < Date.now(),
  };
}

function TaskRow({ task }: { task: TaskView }) {
  const due = formatDue(task.dueDate);
  return (
    <li className="py-2">
      <a href={task.url} target="_blank" rel="noopener noreferrer" className="group block">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-800 group-hover:text-indigo-600 truncate">{task.name}</span>
          <span className={`text-xs whitespace-nowrap ${due.overdue ? "text-red-600 font-medium" : "text-slate-400"}`}>
            {due.label}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
          <span className="inline-block px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: task.statusColor || "#94a3b8" }}>
            {task.status || "—"}
          </span>
          {task.priority && <span>· {task.priority}</span>}
          {task.listName && <span className="truncate">· {task.listName}</span>}
        </div>
      </a>
    </li>
  );
}

export default function OngoingTasksWidget() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/clickup/tasks", { cache: "no-store" });
      if (!res.ok) return setState({ kind: "error" });
      const data: Payload = await res.json();
      if (!data.configured) return setState({ kind: "notConfigured" });
      setState({ kind: "ready", data });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-900">My ClickUp Tasks</h2>
        {state.kind === "ready" && state.data.scope === "department" && (
          <Link href="/tasks" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
            View department →
          </Link>
        )}
      </div>

      {state.kind === "loading" && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
        </div>
      )}

      {state.kind === "notConfigured" && (
        <p className="text-sm text-slate-500 py-4 text-center">ClickUp is not configured yet.</p>
      )}

      {state.kind === "error" && (
        <div className="text-center py-6">
          <p className="text-sm text-red-600 mb-3">Couldn&apos;t load your tasks.</p>
          <button onClick={load} className="px-4 py-2 rounded-md bg-slate-100 text-slate-700 text-sm hover:bg-slate-200">
            Retry
          </button>
        </div>
      )}

      {state.kind === "ready" && (() => {
        const me = state.data.departments[0]?.individuals.find((i) => i.email === state.data.viewerEmail);
        const others = state.data.departments[0]?.individuals.filter((i) => i.email !== state.data.viewerEmail) ?? [];
        const otherTaskCount = others.reduce((n, i) => n + i.tasks.length, 0);
        return (
          <>
            {!me || me.tasks.length === 0 ? (
              <p className="text-sm text-slate-500 py-2">No open tasks assigned to you. 🎉</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {me.tasks.map((t) => <TaskRow key={t.id} task={t} />)}
              </ul>
            )}
            {state.data.scope === "department" && others.length > 0 && (
              <p className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                {otherTaskCount} open task{otherTaskCount !== 1 ? "s" : ""} across {others.length} teammate
                {others.length !== 1 ? "s" : ""} in {state.data.departments[0].departmentName}.{" "}
                <Link href="/tasks" className="text-indigo-600 hover:text-indigo-700">See all</Link>
              </p>
            )}
          </>
        );
      })()}
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: no errors from `OngoingTasksWidget.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/components/OngoingTasksWidget.tsx
git commit -m "feat(clickup): add role-aware ongoing-tasks home widget"
```

---

## Task 6: Dedicated `/tasks` page

**Files:**
- Create: `src/app/tasks/page.tsx`

- [ ] **Step 1: Implement the page**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";

interface TaskView {
  id: string;
  name: string;
  status: string;
  statusColor: string;
  dueDate: number | null;
  priority: string | null;
  listName: string;
  url: string;
  assigneeEmails: string[];
}
interface IndividualTasks { name: string; email: string; linked: boolean; tasks: TaskView[] }
interface DepartmentGroup { departmentName: string; individuals: IndividualTasks[] }

type Payload =
  | { configured: false }
  | { configured: true; scope: "own" | "department"; viewerEmail: string; departments: DepartmentGroup[] };

type State =
  | { kind: "loading" }
  | { kind: "notConfigured" }
  | { kind: "error" }
  | { kind: "ready"; data: Extract<Payload, { configured: true }> };

function formatDue(due: number | null): { label: string; overdue: boolean } {
  if (due === null) return { label: "No due date", overdue: false };
  const d = new Date(due);
  return {
    label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    overdue: due < Date.now(),
  };
}

export default function TasksPage() {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() { redirect("/login"); },
  });
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/clickup/tasks", { cache: "no-store" });
      if (!res.ok) return setState({ kind: "error" });
      const data: Payload = await res.json();
      if (!data.configured) return setState({ kind: "notConfigured" });
      setState({ kind: "ready", data });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-blue-600 font-semibold text-lg">
        Loading…
      </div>
    );
  }

  const userEmail = session?.user?.email || "";
  const userRole = (session?.user as { role?: string } | undefined)?.role || "USER";
  const userName = session?.user?.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold text-slate-900 mb-8">Ongoing Tasks</h1>

        {state.kind === "loading" && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded animate-pulse" />)}
          </div>
        )}

        {state.kind === "notConfigured" && (
          <p className="text-slate-500">ClickUp is not configured yet.</p>
        )}

        {state.kind === "error" && (
          <div>
            <p className="text-red-600 mb-3">Couldn&apos;t load tasks.</p>
            <button onClick={load} className="px-4 py-2 rounded-md bg-slate-100 text-slate-700 text-sm hover:bg-slate-200">
              Retry
            </button>
          </div>
        )}

        {state.kind === "ready" && state.data.departments.map((dept) => (
          <section key={dept.departmentName} className="mb-10">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">{dept.departmentName}</h2>
            <div className="space-y-6">
              {dept.individuals.map((person) => (
                <div key={person.email} className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {person.name}
                      {person.email === state.data.viewerEmail && (
                        <span className="ml-2 text-xs font-normal text-indigo-500">(you)</span>
                      )}
                    </h3>
                    {!person.linked && <span className="text-xs text-slate-400">not linked to ClickUp</span>}
                  </div>
                  {person.tasks.length === 0 ? (
                    <p className="text-sm text-slate-400">No open tasks.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {person.tasks.map((task) => {
                        const due = formatDue(task.dueDate);
                        return (
                          <li key={task.id} className="py-2">
                            <a href={task.url} target="_blank" rel="noopener noreferrer" className="group block">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-slate-800 group-hover:text-indigo-600 truncate">{task.name}</span>
                                <span className={`text-xs whitespace-nowrap ${due.overdue ? "text-red-600 font-medium" : "text-slate-400"}`}>
                                  {due.label}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                                <span className="inline-block px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: task.statusColor || "#94a3b8" }}>
                                  {task.status || "—"}
                                </span>
                                {task.priority && <span>· {task.priority}</span>}
                                {task.listName && <span className="truncate">· {task.listName}</span>}
                              </div>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Manually verify**

Run `npm run dev`, log in as an `FT HOD` / `department` account, visit `http://localhost:3000/tasks`.
Expected: department section with each teammate and their ongoing tasks; "you" tag on the viewer; unlinked teammates flagged. As staff: just your own card.

- [ ] **Step 3: Type-check**

```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/tasks/page.tsx
git commit -m "feat(clickup): add dedicated ongoing-tasks page"
```

---

## Task 7: Mount the widget on `/home`

**Files:**
- Modify: `src/app/home/page.tsx`

- [ ] **Step 1: Import and render the widget**

In `src/app/home/page.tsx`, add the import after the `HodPendingAlert` import (line 8):

```tsx
import OngoingTasksWidget from "@/app/components/OngoingTasksWidget";
```

Then render it directly under `<HodPendingAlert position={userPosition} />` (line 36). Replace:

```tsx
      <HodPendingAlert position={userPosition} />
```

with:

```tsx
      <HodPendingAlert position={userPosition} />
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <OngoingTasksWidget />
      </div>
```

- [ ] **Step 2: Manually verify**

Run `npm run dev`, log in, open `/home`.
Expected: the "My ClickUp Tasks" widget appears for all roles. Staff see their own tasks; HOD/department see their tasks plus the teammate summary line + "View department →" link to `/tasks`.

- [ ] **Step 3: Type-check**

```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/home/page.tsx
git commit -m "feat(clickup): mount ongoing-tasks widget on home page"
```

---

## Post-implementation checklist

- [ ] `.env` / `.env.example` document `CLICKUP_API_TOKEN` and `CLICKUP_TEAM_ID` (values user-owned).
- [ ] `npm test` passes (access resolver + pure helpers).
- [ ] `node node_modules/typescript/bin/tsc --noEmit` clean.
- [ ] Manual: staff view (own tasks), HOD/department view (grouped by individual), not-configured state.

## Notes for the implementer

- **Email matching** is the linchpin: app user email must equal the ClickUp member email (compared lowercased). People with no ClickUp match show as "not linked" with no tasks — this is expected, not a bug.
- **"Ongoing" = open tasks** (`include_closed=false`). No extra status filtering.
- **Pagination:** the team-tasks endpoint returns 100 tasks/page. For a department dashboard the first page is sufficient (YAGNI); if a department routinely exceeds 100 open tasks, add `page` looping to `getOpenTasksByAssignees` later.
- **No DB schema changes** — single workspace token, no per-user storage.
- **Prisma:** if `tsc` complains about `prisma.department`/`prisma.users` selects, run `node node_modules/prisma/build/index.js generate` (NOT `npx`, which silently no-ops here).
