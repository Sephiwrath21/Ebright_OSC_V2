// The ONE Task Manager overview section for the Home page — every account
// type gets it (2026-07-28 "no exceptions" requirement), scoped by the data
// layer's role routing and always carrying the date filter(s):
//
//   ADMIN / OPS / elevated DEPT_SITE ... All Departments = a TaskOverviewStack
//                              (Daily/Monthly) LOCKED to the account's own
//                              department, no switcher — unlike
//                              /task-manager's own Department view, which
//                              keeps its dropdown (2026-08-15 rebuild #3);
//                              no Branch Status by Region for any of these
//                              three roles on Home (2026-08-15 — originally
//                              elevated-DEPT_SITE-only, then confirmed to
//                              also cover ADMIN/OPS) — all via
//                              HomeTaskOverview
//   CEO ...................... draggable department dashboards; Branch
//                              Status by Region (same collapsible sections,
//                              via HomeRegionOverview — code path added
//                              2026-08-15, pending a role-config update to
//                              actually surface it) is wired but not yet
//                              reachable
//   other DEPT_SITE .......... own department Daily + Monthly donuts
//   HOD ...................... FOUR sections (2026-07-29): personal Daily +
//                              Monthly, CEO Assigned Tasks (?cdate=), and
//                              own department status pair
//   BRANCH / BRANCH_SITE ..... own branch Daily + Monthly donuts
//   MEMBER (any staff) ....... personal Daily + Monthly + HOD Assigned
//
// Daily rides ?date=, Monthly ?mdate= (whole-month), Ad hoc ?adate= (org
// view only) — independent, each picker carries the others along. Fail-safe
// like its predecessors: any Task Manager problem (database not connected,
// no account, bridge failure) renders nothing — Home must never break
// because of Task Manager state.
import type { ReactNode } from "react";
import { revalidatePath } from "next/cache";
import { requireLiveSession } from "@/task-manager/action-session";
import {
  getBranchDetail,
  getCeoDashboardConfig,
  getDepartmentDetail,
  getFlowDetail,
  getFlowOverview,
  listActiveTaskCategories,
  saveCeoDashboardConfig,
  FlowBridgeError,
} from "@/task-manager/data";
import { formatLocalDate, resolveWindow } from "@/task-manager/analytics/_lib";
import { resolveViewRole, shows, thisWeekDatesForRange, weekdayRangeOf } from "@/task-manager/role-views";
import {
  DailyDatePicker,
  MonthDropdown,
  MonthRangeDropdown,
} from "@/task-manager/ui/entity-picker";
import { CeoDashboardSection } from "@/task-manager/ui/ceo-dashboard";
import { StatusOverviewCard, PageSectionHeading } from "@/task-manager/ui/bits";
import { parseExpandParam } from "@/task-manager/ui/expand-param";
import { HomeRegionOverview, HomeTaskOverview } from "@/task-manager/ui/home-overview";
import { TaskOverviewStack } from "@/task-manager/ui/task-overview-stack";
import { EntityCardOverview, type MyMonthConfig, type MyWeekConfig } from "@/task-manager/ui/entity-card-overview";
import {
  chunkLabel,
  flowBucketize,
  flowStreamLabel,
  monthDayChunks,
  toSelfEntityDetail,
  visibleAssignerStreams,
  FLOW_DEPARTMENTS,
  type FlowCategoryOption,
  type FlowEntityDetail,
} from "@/task-manager/ui/types";
import type { ActionResult } from "@/task-manager/ui/types";

export async function HomeScopedOverviewSection({
  email,
  dailyDate,
  monthlyDate,
  monthlyRange,
  adhocDate,
  hodDate,
  ceoDate,
  expand,
  padate,
  actions,
}: {
  email: string;
  /** Raw YYYY-MM-DD values from ?date= / ?mdate= / ?adate= (already
   *  format-validated by the page). Omitted = today / current month. */
  dailyDate?: string;
  monthlyDate?: string;
  /** Monthly 7-day chunk within the anchor month (?mrange=, 2026-07-29).
   *  Undefined = Full month. */
  monthlyRange?: { from: number; to: number };
  adhocDate?: string;
  hodDate?: string;
  /** HOD view's "CEO Assigned Tasks" day anchor (?cdate=). */
  ceoDate?: string;
  /** Raw ?expand= value (2026-08-15) — which Branch Status by Region
   *  sections show their full per-person list instead of a rollup card.
   *  See expand-param.ts. */
  expand?: string;
  /** Branch Manager's Ad hoc day anchor (?padate=, 2026-08-15) — mirrors
   *  ?hdate=/?cdate= exactly (YYYY-MM-DD, defaults to today, independent
   *  of every other filter). Ad hoc had no date filter before this. */
  padate?: string;
  /** Personal-task server actions (complete / N-A / reopen) — wired ONLY
   *  into the PERSONAL cards' drill modals (with the viewer's own userId,
   *  so the status circle is clickable exactly on the viewer's own tasks —
   *  the "assignee only" rule). Aggregate views (org/departments/branch)
   *  stay read-only, same principle as the Task Manager page. */
  actions?: {
    complete: (runBlockId: string) => Promise<ActionResult>;
    skip: (runBlockId: string) => Promise<ActionResult>;
    reopen: (runBlockId: string) => Promise<ActionResult>;
    /** The Proof column's upload (2026-07-30) — same personal-only wiring
     *  as the status actions. */
    uploadProof?: import("@/task-manager/ui/types").ProofUploadHandler;
    /** The Proof gallery's per-photo remove (2026-08-08) — same
     *  personal-only wiring as the status actions. */
    removeProof?: import("@/task-manager/ui/types").ProofRemoveHandler;
  };
}) {
  try {
    const adhocAnchor = adhocDate ?? formatLocalDate(new Date());
    const monthlyRangeParam = monthlyRange ? `${monthlyRange.from}-${monthlyRange.to}` : undefined;
    const [daily, monthly] = await Promise.all([
      getFlowDetail(email, "daily", dailyDate, { adhocDate: adhocAnchor }),
      getFlowDetail(email, "monthly", monthlyDate, monthlyRange ? { monthDays: monthlyRange } : undefined),
    ]);

    const raw = {
      date: dailyDate,
      mdate: monthlyDate,
      mrange: monthlyRangeParam,
      adate: adhocDate,
      hdate: hodDate,
      cdate: ceoDate,
      padate,
    };
    const carry = (...except: string[]) =>
      Object.fromEntries(
        Object.entries(raw).filter(([k, v]) => v && !except.includes(k)),
      ) as Record<string, string>;
    // Date pickers must carry the CURRENT ?expand= unchanged (so changing the
    // date doesn't collapse whatever's already expanded in the CEO's
    // branchRegionOverview below) — but the expand-toggle-link extraParams
    // passed INTO HomeTaskOverview/HomeRegionOverview (the orgGrids/
    // branchRegionOverview blocks' own `carry()` calls further down) must
    // NOT carry a stale expand value, since EntityRollupCard computes its
    // own new one. These top-level pickers are shared by many OTHER
    // sections (the personal TaskOverviewStack/EntityCardOverview cards,
    // ceoDashboards, dept/branch pairs) that don't read ?expand= at all —
    // harmless for them to carry it too.
    const dateExtraParams = (...except: string[]) => ({
      ...carry(...except),
      ...(expand ? { expand } : {}),
    });
    const dailyPicker = (
      <DailyDatePicker
        key="home-daily-picker"
        value={daily.date}
        basePath="/home"
        extraParams={dateExtraParams("date")}
      />
    );
    // Monthly selector (2026-07-29 redesign): compact [Month ▾][Range ▾]
    // pair — the calendar picker is gone from every Monthly surface. Month
    // and range controls both exclude mdate/mrange from the carried params
    // (they own them; changing month resets to Full month).
    const monthlyPicker = (
      <div key="home-monthly-controls" className="flex items-center gap-1.5">
        <MonthDropdown value={monthly.date} basePath="/home" extraParams={dateExtraParams("mdate", "mrange")} />
        <MonthRangeDropdown
          value={monthly.date}
          range={monthlyRangeParam}
          basePath="/home"
          extraParams={dateExtraParams("mdate", "mrange")}
        />
      </div>
    );
    // Personal Monthly sections use My Month's tab strip for range
    // selection instead of a dropdown — MonthRangeDropdown's "Full month"
    // option has no equivalent in the tabbed view (My Month always shows
    // one specific chunk, same "no combined view" rule myWeek follows for
    // weekdays), so offering it here would silently contradict what the
    // card body actually shows. Personal Monthly's dateControl is Year/
    // Month only; every OTHER Monthly usage (department/branch pairs,
    // ceoDashboards, HomeRegionOverview) keeps the full monthlyPicker,
    // unchanged.
    const personalMonthlyPicker = (
      <MonthDropdown
        key="home-personal-monthly-picker"
        value={monthly.date}
        basePath="/home"
        extraParams={dateExtraParams("mdate", "mrange")}
      />
    );
    // Consumed directly by the branchRegionOverview block below (passed to
    // HomeRegionOverview); the orgGrids branch's HomeTaskOverview builds its
    // own adhoc picker internally from adhocDate instead of using this one.
    const adhocPicker = (
      <DailyDatePicker
        key="home-adhoc-picker"
        value={adhocAnchor}
        basePath="/home"
        param="adate"
        extraParams={dateExtraParams("adate")}
      />
    );

    // ALL role gates below read role-views.ts (the single source of truth,
    // 2026-07-29 centralization) — this section renders purely from the
    // config via shows(view, "home", key).
    const view = resolveViewRole(daily.me.me);

    // Org roles (ADMIN/OPS/elevated DEPT_SITE): 2026-08-15 rebuild #2 — "All
    // Departments" is a single-department dropdown + TaskOverviewStack, the
    // same pattern /task-manager's own Department view uses (page.tsx's
    // buildEntityOverview), defaulting to the account's own department.
    // None of these three roles get "Branch Status by Region" on Home
    // (2026-08-15 — see role-views.ts) — its ?expand= fetch is skipped
    // entirely rather than fetched and hidden. showRegionOverview stays
    // config-driven (shows(...)) rather than hardcoded false, so a future
    // role added to orgGrids can opt back in without touching this file.
    if (daily.org && shows(view, "home", "orgGrids")) {
      const showRegionOverview = shows(view, "home", "branchRegionOverview");
      const { branches: expandedBranches } = showRegionOverview ? parseExpandParam(expand) : { branches: [] };
      // Dedupe + cap defensively — the real UI (EntityRollupCard's toggle)
      // never produces more than a handful of entries, but ?expand= is a
      // public URL param and each name triggers a real DB-backed detail
      // fetch. 20 comfortably covers any real "expand everything reasonable"
      // scenario (~20-30 branches org-wide) without allowing an unbounded
      // fan-out from a hand-crafted URL.
      const MAX_EXPANDED = 20;
      const dedupedBranches = [...new Set(expandedBranches)].slice(0, MAX_EXPANDED);
      // Categories are needed unconditionally now (the department picker
      // always renders a Sort: Type-capable TaskOverviewStack), unlike the
      // branch-only fetch below which stays conditional on something being
      // expanded.
      const categories = await listActiveTaskCategories(email).catch(() => []);
      // Locked to the account's own department (2026-08-15) — no ?department=
      // override; Home never lets an org-wide account switch which
      // department it sees here, unlike /task-manager's own Department
      // view. Same own-department-first resolution as before, just with
      // the URL-override branch removed: the account's own department
      // when it has one and it's a real department, else the first
      // department as a last resort (accounts with no department at all,
      // e.g. true superadmin logins).
      const ownDepartment = daily.me.me.department;
      const selectedDepartment =
        ownDepartment && (FLOW_DEPARTMENTS as readonly string[]).includes(ownDepartment)
          ? ownDepartment
          : FLOW_DEPARTMENTS[0];
      const [departmentDailyDetail, departmentMonthlyDetail, expandedBranchDetails] = await Promise.all([
        getDepartmentDetail(email, selectedDepartment, "daily", dailyDate),
        getDepartmentDetail(email, selectedDepartment, "monthly", monthlyDate),
        Promise.all(
          dedupedBranches.map(async (name) => {
            const [d, m] = await Promise.all([
              getBranchDetail(email, name, "daily", dailyDate).catch(() => null),
              getBranchDetail(email, name, "monthly", monthlyDate).catch(() => null),
            ]);
            return [name, { daily: d?.branch, monthly: m?.branch }] as const;
          }),
        ).then((entries) => Object.fromEntries(entries)),
      ]);
      return (
        <HomeTaskOverview
          dailyOrg={daily.org}
          monthlyOrg={monthly.org}
          adhocByRegion={daily.adhocByRegion}
          dailyDate={daily.date}
          monthlyDate={monthly.date}
          adhocDate={adhocAnchor}
          dateFilterParams={raw}
          department={selectedDepartment}
          departmentDailyDetail={departmentDailyDetail.department}
          departmentMonthlyDetail={departmentMonthlyDetail.department}
          expandedBranchDetails={expandedBranchDetails}
          expandParam={expand}
          categories={categories}
          myUserId={daily.me.me.userId}
          showRegionOverview={showRegionOverview}
          actions={
            actions && {
              complete: actions.complete,
              skip: actions.skip,
              reopen: actions.reopen,
              uploadProof: actions.uploadProof,
              removeProof: actions.removeProof,
            }
          }
        />
      );
    }

    // "Assignee only" rule: the viewer's own userId + the complete/N-A/
    // reopen actions make their own tasks' status circles live in the drill
    // modal, same as /task-manager. Aggregate dept/branch cards never get
    // these.
    const completeProps = actions && {
      myUserId: daily.me.me.userId,
      onComplete: actions.complete,
      onSkip: actions.skip,
      onReopen: actions.reopen,
      onUploadProof: actions.uploadProof,
      onRemoveProof: actions.removeProof,
    };

    // Personal task-list data (2026-08-15 — My Week/My Month, ported from
    // /task-manager's myOverview): the 5 roles with personalDaily
    // (HOD/BRANCH_MANAGER/DEPT_MEMBER/BRANCH_MEMBER/COACH) all need this;
    // every other role skips it entirely (one cheap boolean check). Daily
    // and Monthly are self-only here (2026-08-15 confirmed decision) —
    // unlike /task-manager's own DEPT_MEMBER Daily, which shows the whole
    // department roster; Home stays "only my task" for every role.
    const isPersonalRole = shows(view, "home", "personalDaily");
    const hasPersonalMonthly = shows(view, "home", "personalMonthly");
    let categories: FlowCategoryOption[] = [];
    let personalDailyEntity: FlowEntityDetail | undefined;
    let personalMonthlyEntity: FlowEntityDetail | undefined;
    let personalMyWeek: MyWeekConfig | undefined;
    let personalMyMonth: MyMonthConfig | undefined;
    if (isPersonalRole) {
      categories = await listActiveTaskCategories(email).catch(() => []);
      personalDailyEntity = toSelfEntityDetail(daily.me.me, daily.me);

      const [dY, dM, dD] = daily.date.split("-").map(Number);
      const myWeekDates = thisWeekDatesForRange(weekdayRangeOf(view), new Date(dY, dM - 1, dD));
      const myWeekResults = await Promise.all(
        myWeekDates.map((d) => getFlowOverview(email, "daily", d.date, { strictWindow: true })),
      );
      const myWeekResultByDate = new Map(myWeekResults.map((r) => [r.date, r]));
      personalMyWeek = {
        days: myWeekDates.map((d) => ({
          weekday: d.weekday,
          date: d.date,
          tasks: myWeekResultByDate.get(d.date)?.tasks ?? [],
        })),
        selectedDate: daily.date,
        nav: { basePath: "/home", extraParams: dateExtraParams("date") },
      };

      if (hasPersonalMonthly) {
        personalMonthlyEntity = toSelfEntityDetail(monthly.me.me, monthly.me);
        const [mY, mM] = monthly.date.split("-").map(Number);
        const monthChunks = monthDayChunks(mY, mM);
        const myMonthResults = await Promise.all(
          monthChunks.map((c) =>
            getFlowOverview(email, "monthly", monthly.date, { monthDays: c, strictWindow: true }),
          ),
        );
        personalMyMonth = {
          chunks: monthChunks.map((c, i) => ({
            label: chunkLabel(c),
            range: `${c.from}-${c.to}`,
            tasks: myMonthResults[i].tasks,
          })),
          selectedRange: monthlyRangeParam || `${monthChunks[0].from}-${monthChunks[0].to}`,
          anchorMonth: monthly.date,
          nav: { basePath: "/home", extraParams: dateExtraParams("mdate", "mrange") },
        };
      }
    }

    // Day-windowed third-card entity (HOD/CEO Assigned Task) — the SAME
    // dueAt-window filter Home has always used for these (previously fed a
    // StatusOverviewCard's bucket counts directly; now wraps the filtered
    // list via toSelfEntityDetail for a real EntityCardOverview list
    // instead). Day-windowed by its OWN date param (default today) on each
    // task's due date — cadence-agnostic, so daily- AND monthly-cadence
    // assignments due that day both count; tasks with no due date at all
    // match no specific day.
    const personalStreamEntity = (streamKey: "HOD" | "CEO", rawAnchor: string | undefined, param: string) => {
      const anchor = rawAnchor ?? formatLocalDate(new Date());
      const win = resolveWindow("daily", anchor);
      const stream = daily.me.streamsAll.find((s) => s.key === streamKey);
      const filtered = (stream?.tasks ?? []).filter((t) => {
        if (!t.dueAt) return false;
        const due = new Date(t.dueAt);
        return due >= win.start && due < win.end;
      });
      const buckets = flowBucketize(filtered);
      return {
        entity: toSelfEntityDetail(daily.me.me, {
          totals: { completed: buckets.completed.length, pending: buckets.pending.length, na: buckets.na.length },
          tasks: filtered,
        }),
        dateControl: (
          <DailyDatePicker
            key={`home-${param}-picker`}
            value={anchor}
            basePath="/home"
            param={param}
            extraParams={carry(param)}
          />
        ),
      };
    };

    // Branch Manager's Ad hoc (2026-08-15) — the SAME treatment as
    // personalStreamEntity above, applied to daily.me.adhocAll instead of
    // a streamsAll entry, day-windowed by a NEW ?padate= param (Ad hoc
    // never had a date filter before this).
    const personalAdhocEntity = (rawAnchor: string | undefined) => {
      const anchor = rawAnchor ?? formatLocalDate(new Date());
      const win = resolveWindow("daily", anchor);
      const filtered = (daily.me.adhocAll?.tasks ?? []).filter((t) => {
        if (!t.dueAt) return false;
        const due = new Date(t.dueAt);
        return due >= win.start && due < win.end;
      });
      const buckets = flowBucketize(filtered);
      return {
        entity: toSelfEntityDetail(daily.me.me, {
          totals: { completed: buckets.completed.length, pending: buckets.pending.length, na: buckets.na.length },
          tasks: filtered,
        }),
        dateControl: (
          <DailyDatePicker
            key="home-padate-picker"
            value={anchor}
            basePath="/home"
            param="padate"
            extraParams={carry("padate")}
          />
        ),
      };
    };

    const grid = (children: ReactNode) => (
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {children}
      </div>
    );

    if (daily.department && monthly.department) {
      const deptPair = (
        <>
          <StatusOverviewCard
            key="dept-daily"
            title="Daily"
            subtitle={daily.department.name}
            totals={daily.department.totals}
            tasks={daily.department.tasks}
            action={dailyPicker}
            actionPlacement="row"
          />
          <StatusOverviewCard
            key="dept-monthly"
            title="Monthly"
            subtitle={monthly.department.name}
            totals={monthly.department.totals}
            tasks={monthly.department.tasks}
            action={monthlyPicker}
            actionPlacement="row"
          />
        </>
      );
      // HOD layout (2026-08-18): personal cards (per config) + CEO
      // Assigned only — the "Department Overview" donut pair below it was
      // dropped per explicit request. View-only DEPT_SITE logins (no
      // personal sections in their config) still fall through to the
      // department pair alone, below — `deptPair` stays defined for that
      // case.
      if (shows(view, "home", "personalDaily")) {
        const ceoAssigned = shows(view, "home", "ceoAssigned")
          ? personalStreamEntity("CEO", ceoDate, "cdate")
          : undefined;
        return (
          <TaskOverviewStack
            entityName=""
            categories={categories}
            myUserId={daily.me.me.userId}
            daily={
              personalDailyEntity && {
                entity: personalDailyEntity,
                dateControl: dailyPicker,
                showViewToggle: false,
                myWeek: personalMyWeek,
              }
            }
            monthly={
              personalMonthlyEntity && {
                entity: personalMonthlyEntity,
                dateControl: personalMonthlyPicker,
                showViewToggle: false,
                myMonth: personalMyMonth,
              }
            }
            ceoAssigned={
              ceoAssigned && {
                entity: ceoAssigned.entity,
                dateControl: ceoAssigned.dateControl,
                showViewToggle: false,
              }
            }
            onComplete={actions?.complete}
            onSkip={actions?.skip}
            onReopen={actions?.reopen}
            onUploadProof={actions?.uploadProof}
            onRemoveProof={actions?.removeProof}
          />
        );
      }
      return grid(deptPair);
    }

    if (daily.branch && monthly.branch) {
      const branchPair = (
        <>
          <StatusOverviewCard
            key="branch-daily"
            title="Daily"
            subtitle={daily.branch.name}
            totals={daily.branch.totals}
            tasks={daily.branch.tasks}
            action={dailyPicker}
            actionPlacement="row"
          />
          <StatusOverviewCard
            key="branch-monthly"
            title="Monthly"
            subtitle={monthly.branch.name}
            totals={monthly.branch.totals}
            tasks={monthly.branch.tasks}
            action={monthlyPicker}
            actionPlacement="row"
          />
        </>
      );
      // Branch-site Ad hoc card (2026-07-29 final spec): the branch-wide
      // ALL-TIME ad hoc set, read-only — rendered with the pair for the
      // view-only site login.
      const siteAdhocCard = shows(view, "home", "adhocOversight") && daily.adhoc && (
        <StatusOverviewCard
          key="site-adhoc"
          title="Ad hoc"
          subtitle={daily.branch.name}
          totals={daily.adhoc.totals}
          tasks={flowBucketize(daily.adhoc.tasks)}
        />
      );

      // Branch Manager layout: personal-first — top row = personal cards
      // (per config) + Ad hoc (day-windowed by ?padate=, defaults to today —
      // same dueAt-window + toSelfEntityDetail approach as
      // personalStreamEntity/personalAdhocEntity above), then the own-branch
      // status pair below its own heading. View-only BRANCH_SITE logins
      // (no personal sections in their config) keep the pair alone.
      if (shows(view, "home", "personalDaily")) {
        const personalAdhoc = shows(view, "home", "personalAdhoc")
          ? personalAdhocEntity(padate)
          : undefined;
        return (
          <div className="flex flex-col gap-5">
            <TaskOverviewStack
              entityName=""
              categories={categories}
              myUserId={daily.me.me.userId}
              daily={
                personalDailyEntity && {
                  entity: personalDailyEntity,
                  dateControl: dailyPicker,
                  showViewToggle: false,
                  myWeek: personalMyWeek,
                }
              }
              monthly={
                personalMonthlyEntity && {
                  entity: personalMonthlyEntity,
                  dateControl: personalMonthlyPicker,
                  showViewToggle: false,
                  myMonth: personalMyMonth,
                }
              }
              onComplete={actions?.complete}
              onSkip={actions?.skip}
              onReopen={actions?.reopen}
              onUploadProof={actions?.uploadProof}
              onRemoveProof={actions?.removeProof}
            />
            {personalAdhoc && (
              <EntityCardOverview
                sectionLabel="Ad hoc"
                entityName=""
                entity={personalAdhoc.entity}
                categories={categories}
                myUserId={daily.me.me.userId}
                dateControl={personalAdhoc.dateControl}
                showViewToggle={false}
                onComplete={actions?.complete}
                onSkip={actions?.skip}
                onReopen={actions?.reopen}
                onUploadProof={actions?.uploadProof}
                onRemoveProof={actions?.removeProof}
              />
            )}
            <PageSectionHeading>Branch Overview</PageSectionHeading>
            {grid(branchPair)}
          </div>
        );
      }
      return grid(
        <>
          {branchPair}
          {siteAdhocCard}
        </>,
      );
    }

    // CEO (2026-08-01 redesign): below the personal pair, the DRAGGABLE
    // pinned-department dashboards — the SAME CeoDashboardSection the Task
    // Manager page uses (add / drag-reorder / ✕-remove, per-CEO persisted
    // in CeoDashboardConfig; removing a card only hides it from this
    // dashboard, never touches the department). Actions revalidate /home.
    let ceoDashboards: ReactNode = null;
    if (shows(view, "home", "ceoKanban")) {
      const FALLBACK = "Something went wrong — please try again";
      const makeCeoActions = (cadence: "daily" | "monthly") => {
        async function add(department: string): Promise<ActionResult> {
          "use server";
          const stale = await requireLiveSession(email);
          if (stale) return stale;
          try {
            const { departments } = await getCeoDashboardConfig(email, cadence);
            if (!departments.includes(department)) {
              await saveCeoDashboardConfig(email, cadence, [...departments, department]);
            }
            revalidatePath("/home");
            return { ok: true };
          } catch (err) {
            return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK };
          }
        }
        async function remove(department: string): Promise<ActionResult> {
          "use server";
          const stale = await requireLiveSession(email);
          if (stale) return stale;
          try {
            const { departments } = await getCeoDashboardConfig(email, cadence);
            await saveCeoDashboardConfig(email, cadence, departments.filter((d) => d !== department));
            revalidatePath("/home");
            return { ok: true };
          } catch (err) {
            return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK };
          }
        }
        async function reorder(orderedNames: string[]): Promise<ActionResult> {
          "use server";
          const stale = await requireLiveSession(email);
          if (stale) return stale;
          try {
            await saveCeoDashboardConfig(email, cadence, orderedNames);
            revalidatePath("/home");
            return { ok: true };
          } catch (err) {
            return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK };
          }
        }
        return { add, remove, reorder };
      };

      const [dailyConfig, monthlyConfig] = await Promise.all([
        getCeoDashboardConfig(email, "daily"),
        getCeoDashboardConfig(email, "monthly"),
      ]);
      const [dailyDetails, monthlyDetails] = await Promise.all([
        Promise.all(dailyConfig.departments.map((n) => getDepartmentDetail(email, n, "daily", dailyDate))),
        Promise.all(monthlyConfig.departments.map((n) => getDepartmentDetail(email, n, "monthly", monthlyDate))),
      ]);
      ceoDashboards = (
        <>
          <PageSectionHeading action={dailyPicker}>Department Daily Overview</PageSectionHeading>
          <CeoDashboardSection
            periodLabel="Daily"
            departments={dailyDetails.map((r) => r.department)}
            availableToAdd={FLOW_DEPARTMENTS.filter((d) => !dailyConfig.departments.includes(d))}
            actions={makeCeoActions("daily")}
          />
          <PageSectionHeading action={monthlyPicker}>Department Monthly Overview</PageSectionHeading>
          <CeoDashboardSection
            periodLabel="Monthly"
            departments={monthlyDetails.map((r) => r.department)}
            availableToAdd={FLOW_DEPARTMENTS.filter((d) => !monthlyConfig.departments.includes(d))}
            actions={makeCeoActions("monthly")}
          />
        </>
      );
    }

    // branchRegionOverview (2026-08-01, rebuilt 2026-08-15): Branch Status
    // by Region — Daily/Monthly/Ad hoc, the SAME collapsible sections
    // ADMIN/OPS/elevated sites see via orgGrids, appended below the CEO's
    // draggable department dashboards.
    let branchRegionOverview: ReactNode = null;
    if (shows(view, "home", "branchRegionOverview") && daily.org) {
      const { branches: expandedBranches } = parseExpandParam(expand);
      // Dedupe + cap defensively, same reasoning as the orgGrids branch
      // above: ?expand= is a public URL param and each name triggers a
      // real DB-backed detail fetch.
      const MAX_EXPANDED = 20;
      const dedupedBranches = [...new Set(expandedBranches)].slice(0, MAX_EXPANDED);
      const categories = dedupedBranches.length
        ? await listActiveTaskCategories(email).catch(() => [])
        : [];
      const expandedBranchDetails = Object.fromEntries(
        await Promise.all(
          dedupedBranches.map(async (name) => {
            const [d, m] = await Promise.all([
              getBranchDetail(email, name, "daily", dailyDate).catch(() => null),
              getBranchDetail(email, name, "monthly", monthlyDate).catch(() => null),
            ]);
            return [name, { daily: d?.branch, monthly: m?.branch }] as const;
          }),
        ),
      );
      branchRegionOverview = (
        <HomeRegionOverview
          dailyOrg={daily.org}
          monthlyOrg={monthly.org}
          adhocByRegion={daily.adhocByRegion}
          expandedBranchDetails={expandedBranchDetails}
          expandParam={expand}
          categories={categories}
          myUserId={daily.me.me.userId}
          dailyPicker={dailyPicker}
          monthlyPicker={monthlyPicker}
          adhocPicker={adhocPicker}
          extraParams={carry()}
          actions={
            actions && {
              complete: actions.complete,
              skip: actions.skip,
              reopen: actions.reopen,
              uploadProof: actions.uploadProof,
              removeProof: actions.removeProof,
            }
          }
        />
      );
    }

    // MEMBER — which cards render is decided ENTIRELY by role-views.ts:
    // DEPT_MEMBER gets Daily + Monthly + HOD Assigned; BRANCH_MEMBER/COACH
    // (Branch Exec / Coaches) get ONLY the Daily card. Admin/Ops streams
    // stay hidden per the "no special Admin Assigned Task category" spec
    // (visibleAssignerStreams) — assignerStreams is never actually in any
    // role's Home config today, so otherStreamCards never renders; kept
    // as-is, unrelated to this change.
    const otherStreamCards = visibleAssignerStreams(daily.me.streamsAll)
      .filter((s) => s.key !== "HOD")
      .map((s) => (
        <StatusOverviewCard
          key={s.key}
          title={flowStreamLabel(s.key)}
          totals={s.totals}
          tasks={flowBucketize(s.tasks)}
          hideChart
          {...completeProps}
        />
      ));
    const hodAssigned = shows(view, "home", "hodAssigned")
      ? personalStreamEntity("HOD", hodDate, "hdate")
      : undefined;
    return (
      <div className="flex flex-col gap-5">
        {grid(
          <>
            {/* CEO (2026-08-01): ONE combined "My Tasks" card — no
                Daily/Monthly split — with the shared ?date= filter
                windowing it by DUE date (undated tasks always show). */}
            {shows(view, "home", "ceoCombinedList") &&
              (() => {
                const win = resolveWindow("daily", dailyDate ?? formatLocalDate(new Date()));
                const windowed = daily.me.tasks.filter((t) => {
                  if (!t.dueAt) return true;
                  const due = new Date(t.dueAt);
                  return due >= win.start && due < win.end;
                });
                const buckets = flowBucketize(windowed);
                return (
                  <StatusOverviewCard
                    key="ceo-own-tasks"
                    title="My Tasks"
                    totals={{
                      completed: buckets.completed.length,
                      pending: buckets.pending.length,
                      na: buckets.na.length,
                    }}
                    tasks={buckets}
                    action={dailyPicker}
                    actionPlacement="row"
                    hideChart
                    {...completeProps}
                  />
                );
              })()}
            {shows(view, "home", "assignerStreams") && otherStreamCards}
          </>,
        )}
        {isPersonalRole && (
          <TaskOverviewStack
            entityName=""
            categories={categories}
            myUserId={daily.me.me.userId}
            daily={
              personalDailyEntity && {
                entity: personalDailyEntity,
                dateControl: dailyPicker,
                showViewToggle: false,
                myWeek: personalMyWeek,
              }
            }
            monthly={
              personalMonthlyEntity && {
                entity: personalMonthlyEntity,
                dateControl: personalMonthlyPicker,
                showViewToggle: false,
                myMonth: personalMyMonth,
              }
            }
            hodAssigned={
              hodAssigned && {
                entity: hodAssigned.entity,
                dateControl: hodAssigned.dateControl,
                showViewToggle: false,
              }
            }
            onComplete={actions?.complete}
            onSkip={actions?.skip}
            onReopen={actions?.reopen}
            onUploadProof={actions?.uploadProof}
            onRemoveProof={actions?.removeProof}
          />
        )}
        {ceoDashboards}
        {branchRegionOverview}
      </div>
    );
  } catch {
    return null;
  }
}
