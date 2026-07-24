// Ebright Flow — demo seed.
// Rich, deterministic demo data so every view (sidebar, canvas, doc, run, dashboard)
// demos meaningfully on first run. Runs are seeded directly through Prisma — NO
// BullMQ/Redis/S3/email — so seeding works without any infra beyond Postgres.
//
// Run with: npm run db:seed  (tsx prisma/seed.ts)

import {
  Prisma,
  type BlockStatus,
  type ItemType,
} from "../../src/generated/task-manager-client";
import { randomUUID } from "node:crypto";
import { buildTemplateSnapshot } from "../../src/task-manager/engine/snapshot";
import { BRANCH_STAFF_ROLES, DEPARTMENT_EMPLOYMENT_TYPES } from "../../src/task-manager/analytics/_lib";
import type { ConditionalEdge, RunItemValue } from "../../src/task-manager/lib/types";
import { prisma } from "../../src/task-manager/prisma";

// ---------- time helpers (relative to seed time) ----------

const now = new Date();
const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3_600_000);
const daysFromNow = (d: number) => hoursFromNow(d * 24);
// Local-calendar "today at HH:00" — analytics anchors a few dueAts to the seed
// day itself so the /analytics daily (today) AND monthly (this month) views show
// data for 2+ branches and 2+ departments no matter what time the seed runs.
const todayAt = (h: number) => {
  const t = new Date(now);
  t.setHours(h, 0, 0, 0);
  return t;
};

// ---------- small builders ----------

interface SeedItem {
  id: string;
  order: number;
  type: ItemType;
  label: string;
  required: boolean;
  config: Prisma.InputJsonObject;
}

function item(
  id: string,
  order: number,
  type: ItemType,
  label: string,
  required = true,
  config: Record<string, unknown> = {}
): SeedItem {
  return { id, order, type, label, required, config: config as Prisma.InputJsonObject };
}

/** BlockNote block (paragraph / heading / bulletListItem) with a single text run. */
function bn(
  type: "paragraph" | "heading" | "bulletListItem",
  text: string,
  props: Record<string, unknown> = {}
) {
  return {
    id: randomUUID(),
    type,
    props,
    content: [{ type: "text", text, styles: {} }],
    children: [],
  };
}

interface ItemFill {
  value: RunItemValue;
  completedAt?: Date;
  completedBy?: string;
}

async function createRunBlock(opts: {
  id: string;
  runId: string;
  block: { id: string; nodeId: string; title: string };
  assigneeId: string;
  status: BlockStatus;
  startedAt?: Date | null;
  dueAt?: Date | null;
  completedAt?: Date | null;
  strikeCount?: number;
  items: SeedItem[];
  /** template item id -> submitted value */
  fills?: Record<string, ItemFill>;
  /** Overrides the block template's own title — mirrors how the real
   *  assign route decouples each task's title from its utility flow. */
  title?: string;
}) {
  await prisma.runBlock.create({
    data: {
      id: opts.id,
      runId: opts.runId,
      blockId: opts.block.id,
      nodeId: opts.block.nodeId,
      title: opts.title ?? opts.block.title,
      assigneeId: opts.assigneeId,
      status: opts.status,
      startedAt: opts.startedAt ?? null,
      dueAt: opts.dueAt ?? null,
      completedAt: opts.completedAt ?? null,
      strikeCount: opts.strikeCount ?? 0,
      runItems: {
        create: opts.items.map((it) => {
          const fill = opts.fills?.[it.id];
          return {
            itemId: it.id,
            order: it.order,
            type: it.type,
            label: it.label,
            required: it.required,
            config: it.config as Prisma.InputJsonValue,
            value: fill
              ? (fill.value as unknown as Prisma.InputJsonValue)
              : undefined,
            completedAt: fill?.completedAt ?? null,
            completedBy: fill?.completedBy ?? null,
          };
        }),
      },
    },
  });
}

// ---------- main ----------

async function main() {
  // ----- wipe (FK-safe order: leaves first) -----
  await prisma.auditLog.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.runItem.deleteMany();
  await prisma.runBlock.deleteMany();
  await prisma.flowRun.deleteMany();
  await prisma.savedView.deleteMany();
  await prisma.flowDoc.deleteMany();
  await prisma.blockItem.deleteMany();
  await prisma.block.deleteMany();
  await prisma.decisionNode.deleteMany();
  await prisma.flowTrigger.deleteMany();
  await prisma.flow.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  // ----- 1. users -----
  const USERS = {
    superadmin: "user-superadmin",
    admin: "user-admin",
    ceo: "user-ceo",
    ops: "user-ops",
    farid: "user-farid",
    daniel: "user-daniel",
    priya: "user-priya",
    marcus: "user-marcus",
    sofia: "user-sofia",
    hafiz: "user-hafiz",
    sarah: "user-sarah",
    rmRegionA: "user-rm-region-a",
    rmRegionB: "user-rm-region-b",
    rmRegionC: "user-rm-region-c",
    zainal: "user-zainal",
    amirul: "user-amirul",
    nabila: "user-nabila",
  } as const;

  await prisma.user.createMany({
    data: [
      // branch + employmentType (analytics dimensions): branches spread across
      // Subang Taipan / Setia Alam / Cyberjaya per ANALYTICS_BRIEF §Schema additions.
      // The superadmin account — no personal identity, org-wide scope.
      {
        id: USERS.superadmin,
        email: "superadmin@ebright.my",
        name: "Superadmin",
        role: "ADMIN",
        department: null,
        branch: null,
        employmentType: null,
      },
      {
        id: USERS.admin,
        email: "amelia@ebright.my",
        name: "Amelia Ong",
        role: "ADMIN",
        department: "Operation",
        branch: null,
        employmentType: "HOD",
      },
      // Role-scoped analytics (brief §Role-scoped views): CEO + OPS sit above
      // the HODs — their runs feed the "CEO Assigned" streams and org views.
      {
        id: USERS.ceo,
        email: "elaine@ebright.my",
        name: "Elaine Ebright",
        role: "CEO",
        department: "CEO",
        branch: "Subang Taipan",
        employmentType: "CEO",
      },
      {
        id: USERS.ops,
        email: "nurul@ebright.my",
        name: "Nurul Huda",
        role: "OPS",
        department: null,
        branch: "Subang Taipan",
        employmentType: "Manager",
      },
      // Branch manager (role BRANCH): scoped to their own branch's analytics.
      // department is null — branch and department staff pools are mutually
      // exclusive (a Manager is branch-only, never a department "member").
      {
        id: USERS.farid,
        email: "farid@ebright.my",
        name: "Farid Osman",
        role: "BRANCH",
        department: null,
        branch: "Subang Taipan",
        employmentType: "Manager",
      },
      {
        id: USERS.daniel,
        email: "daniel@ebright.my",
        name: "Daniel Lim",
        role: "HOD",
        department: "Operation",
        branch: null,
        employmentType: "HOD",
      },
      {
        id: USERS.priya,
        email: "priya@ebright.my",
        name: "Priya Nair",
        role: "HOD",
        department: "Human Resource",
        branch: null,
        employmentType: "HOD",
      },
      // Branch staff vocabulary from the mockups: Manager / Branch Exec / Coach
      // — branch-only, department always null (see note on Farid above).
      {
        id: USERS.marcus,
        email: "marcus@ebright.my",
        name: "Marcus Tan",
        role: "MEMBER",
        department: null,
        branch: "Cyberjaya",
        employmentType: "Coach",
        coachSchedule: "Full Time",
      },
      // Marketing department's HQ Exec (was mistakenly ALSO tagged as a
      // Subang Taipan Branch Exec alongside Nabila — a branch can only
      // have one Branch Exec, so she's department-only now).
      {
        id: USERS.sofia,
        email: "sofia@ebright.my",
        name: "Sofia Chen",
        role: "MEMBER",
        department: "Marketing",
        branch: null,
        employmentType: "HQ Exec",
      },
      {
        id: USERS.hafiz,
        email: "hafiz@ebright.my",
        name: "Hafiz Rahman",
        role: "MEMBER",
        department: "Human Resource",
        branch: null,
        employmentType: "Intern",
      },
      {
        id: USERS.sarah,
        email: "sarah@ebright.my",
        name: "Sarah Lim",
        role: "MEMBER",
        department: "Operation",
        branch: null,
        employmentType: "Intern",
      },
      // Regional Managers: oversee a region rather than one branch, so branch
      // is null — they exist for the assign-task recipient picker's "By
      // Group → Regional Manager" filter, not for the branch-level grids.
      {
        id: USERS.rmRegionA,
        email: "regina.kaur@ebright.my",
        name: "Regina Kaur",
        role: "MEMBER",
        department: null,
        branch: null,
        employmentType: "Regional Manager",
      },
      {
        id: USERS.rmRegionB,
        email: "yusof.adnan@ebright.my",
        name: "Yusof Adnan",
        role: "MEMBER",
        department: null,
        branch: null,
        employmentType: "Regional Manager",
      },
      {
        id: USERS.rmRegionC,
        email: "michelle.ong@ebright.my",
        name: "Michelle Ong",
        role: "MEMBER",
        department: null,
        branch: null,
        employmentType: "Regional Manager",
      },
      // Coaches + the branch's one Branch Exec at Farid's own branch (Subang
      // Taipan) so the Manpower Schedule grid has enough seats/people to be
      // a real multi-column demo (1 Manager + 2 Coach + 1 Exec seats).
      {
        id: USERS.zainal,
        email: "zainal@ebright.my",
        name: "Zainal Abidin",
        role: "MEMBER",
        department: null,
        branch: "Subang Taipan",
        employmentType: "Coach",
        coachSchedule: "Full Time",
      },
      {
        id: USERS.amirul,
        email: "amirul@ebright.my",
        name: "Amirul Hakim",
        role: "MEMBER",
        department: null,
        branch: "Subang Taipan",
        employmentType: "Coach",
        coachSchedule: "Part Time",
      },
      {
        id: USERS.nabila,
        email: "nabila@ebright.my",
        name: "Nabila Rashid",
        role: "MEMBER",
        department: null,
        branch: "Subang Taipan",
        employmentType: "Branch Exec",
      },
    ],
  });

  // Demo spread: staff across the otherwise-idle branches so the superadmin
  // donut grids have drillable data in every region. Each gets one
  // OPS-started ad hoc task below (mixed statuses → red/yellow/green donuts).
  // Branch staff (Manager/Branch Exec/Coach) — `department` is always null,
  // branch and department staff pools are mutually exclusive.
  const SPREAD = [
    { key: "aina",   name: "Aina Zafirah",   branch: "Klang",                et: "Branch Exec", status: "ACTIVE"    as BlockStatus, hour: 14 },
    { key: "kevin",  name: "Kevin Wong",     branch: "Ampang",               et: "Branch Exec", status: "DONE"      as BlockStatus, hour: 10 },
    { key: "mei",    name: "Mei Ling",       branch: "Putrajaya",            et: "Coach",     status: "OVERDUE"   as BlockStatus, hour: 9, cs: "Part Time" },
    { key: "ravi",   name: "Ravi Kumar",     branch: "Online",               et: "Manager",   status: "SKIPPED"   as BlockStatus, hour: 12 },
    { key: "jiawen", name: "Jia Wen Teh",    branch: "Seremban",             et: "Coach",     status: "DONE"      as BlockStatus, hour: 11, cs: "Full Time" },
    { key: "zul",    name: "Zulkifli Anuar", branch: "Kota Damansara",       et: "Manager",   status: "ACTIVE"    as BlockStatus, hour: 16 },
    // Region A — the remaining branches
    { key: "izzati", name: "Izzati Rahman",  branch: "Anggun City Rawang",   et: "Manager",   status: "ACTIVE"    as BlockStatus, hour: 13 },
    { key: "hakim",  name: "Hakim Yusof",    branch: "Bandar Rimbayu",       et: "Branch Exec", status: "DONE"      as BlockStatus, hour: 9 },
    { key: "nadia",  name: "Nadia Shah",     branch: "Denai Alam",           et: "Coach",     status: "PENDING"   as BlockStatus, hour: 15, cs: "Full Time" },
    { key: "farah",  name: "Farah Adnan",    branch: "Eco Grandeur",         et: "Branch Exec", status: "OVERDUE"   as BlockStatus, hour: 8 },
    { key: "syafiq", name: "Syafiq Hamid",   branch: "Shah Alam",            et: "Coach",     status: "DONE"      as BlockStatus, hour: 10, cs: "Part Time" },
    { key: "wanida", name: "Wan Ida",        branch: "Tropicana Sungai Buloh", et: "Manager", status: "ACTIVE"    as BlockStatus, hour: 17 },
    // Region B — the remaining branches
    { key: "chong",  name: "Chong Wei Ming", branch: "Bandar Tun Hussein Onn", et: "Branch Exec", status: "ACTIVE"  as BlockStatus, hour: 14 },
    { key: "puvana",  name: "Puvaneswary R", branch: "Danau Kota",           et: "Coach",     status: "SKIPPED"   as BlockStatus, hour: 12, cs: "Full Time" },
    { key: "azman",  name: "Azman Ismail",   branch: "Desa Sri Hartamas",    et: "Manager",   status: "DONE"      as BlockStatus, hour: 9 },
    { key: "lim",    name: "Lim Hui Ting",   branch: "Kajang TTDI Groove",   et: "Branch Exec", status: "OVERDUE"   as BlockStatus, hour: 11 },
    { key: "faizal", name: "Faizal Roslan",  branch: "Puncak Jalil",         et: "Coach",     status: "ACTIVE"    as BlockStatus, hour: 16, cs: "Part Time" },
    { key: "gopal",  name: "Gopal Krishnan", branch: "Selayang",             et: "Manager",   status: "DONE"      as BlockStatus, hour: 10 },
    { key: "aisyah", name: "Aisyah Idris",   branch: "Taman Sri Gombak",     et: "Branch Exec", status: "PENDING"   as BlockStatus, hour: 15 },
    // Region C — the remaining branches
    { key: "danish", name: "Danish Iqbal",   branch: "Bandar Baru Bangi",    et: "Manager",   status: "DONE"      as BlockStatus, hour: 9 },
    { key: "siti",   name: "Siti Khadijah",  branch: "Bandar Seri Putra",    et: "Coach",     status: "ACTIVE"    as BlockStatus, hour: 13, cs: "Part Time" },
    { key: "brendan", name: "Brendan Lee",   branch: "Kota Warisan",         et: "Branch Exec", status: "OVERDUE"   as BlockStatus, hour: 8 },
    { key: "yusra",  name: "Yusra Amani",    branch: "Puchong Utama",        et: "Manager",   status: "ACTIVE"    as BlockStatus, hour: 14 },
    { key: "haziq",  name: "Haziq Firdaus",  branch: "Senawang Taipan",      et: "Coach",     status: "SKIPPED"   as BlockStatus, hour: 12, cs: "Full Time" },
  ];
  await prisma.user.createMany({
    data: SPREAD.map((s) => ({
      id: `user-${s.key}`,
      email: `${s.key}@ebright.my`,
      name: s.name,
      role: "MEMBER" as const,
      department: null,
      branch: s.branch,
      employmentType: s.et,
      coachSchedule: "cs" in s ? s.cs : null,
    })),
  });

  // Department-only staff (mutually exclusive with branch — HOD/Executive/
  // Full Time/Intern only, per the corrected org structure). Gives all 6
  // departments a full roster: 1 HOD (role HOD, matching Daniel/Priya's
  // existing pairing of role+employmentType), at most 1 Executive, several
  // Full Time, some Intern.
  const DEPT_STAFF = [
    // Operation (HOD: Daniel Lim, Intern: Sarah Lim — both existing)
    { key: "amran", name: "Amran Yusof", dept: "Operation", et: "Full Time", status: "DONE" as BlockStatus, hour: 10 },
    { key: "christine", name: "Christine Lau", dept: "Operation", et: "Full Time", status: "PENDING" as BlockStatus, hour: 14 },
    { key: "firdaus", name: "Firdaus Aziz", dept: "Operation", et: "Full Time", status: "ACTIVE" as BlockStatus, hour: 9 },
    // Academy
    { key: "rosnah", name: "Rosnah Kamal", dept: "Academy", et: "HOD", hodRole: true, status: "DONE" as BlockStatus, hour: 11 },
    { key: "melissa", name: "Melissa Tan", dept: "Academy", et: "HQ Exec", status: "PENDING" as BlockStatus, hour: 15 },
    { key: "rashidk", name: "Rashid Karim", dept: "Academy", et: "Full Time", status: "OVERDUE" as BlockStatus, hour: 8 },
    { key: "wongsu", name: "Wong Su Ann", dept: "Academy", et: "Full Time", status: "DONE" as BlockStatus, hour: 13 },
    { key: "iman", name: "Iman Haziq", dept: "Academy", et: "Intern", status: "PENDING" as BlockStatus, hour: 16 },
    // Marketing (HQ Exec: Sofia Chen, existing)
    { key: "vincent", name: "Vincent Tay", dept: "Marketing", et: "HOD", hodRole: true, status: "ACTIVE" as BlockStatus, hour: 10 },
    { key: "devi", name: "Devi Shankar", dept: "Marketing", et: "Full Time", status: "DONE" as BlockStatus, hour: 12 },
    { key: "iskandar", name: "Iskandar Rahim", dept: "Marketing", et: "Full Time", status: "PENDING" as BlockStatus, hour: 9 },
    { key: "cheryl", name: "Cheryl Ho", dept: "Marketing", et: "Intern", status: "OVERDUE" as BlockStatus, hour: 8 },
    // Optimisation (no HQ Exec)
    { key: "suresh", name: "Suresh Pillai", dept: "Optimisation", et: "HOD", hodRole: true, status: "DONE" as BlockStatus, hour: 11 },
    { key: "nazrin", name: "Nazrin Halim", dept: "Optimisation", et: "Full Time", status: "ACTIVE" as BlockStatus, hour: 14 },
    { key: "patricia", name: "Patricia Lim", dept: "Optimisation", et: "Full Time", status: "PENDING" as BlockStatus, hour: 15 },
    { key: "aiman", name: "Aiman Fikri", dept: "Optimisation", et: "Full Time", status: "DONE" as BlockStatus, hour: 10 },
    // Human Resource (HOD: Priya Nair, Intern: Hafiz Rahman — both existing)
    { key: "kavitha", name: "Kavitha Raj", dept: "Human Resource", et: "HQ Exec", status: "PENDING" as BlockStatus, hour: 9 },
    { key: "fauzan", name: "Fauzan Idris", dept: "Human Resource", et: "Full Time", status: "DONE" as BlockStatus, hour: 13 },
    { key: "graceng", name: "Grace Ng", dept: "Human Resource", et: "Full Time", status: "OVERDUE" as BlockStatus, hour: 8 },
    // Finance (no Intern)
    { key: "norlida", name: "Norlida Hassan", dept: "Finance", et: "HOD", hodRole: true, status: "ACTIVE" as BlockStatus, hour: 11 },
    { key: "bala", name: "Bala Subramaniam", dept: "Finance", et: "HQ Exec", status: "DONE" as BlockStatus, hour: 14 },
    { key: "yasmin", name: "Yasmin Zulkifli", dept: "Finance", et: "Full Time", status: "PENDING" as BlockStatus, hour: 15 },
    { key: "terrence", name: "Terrence Goh", dept: "Finance", et: "Full Time", status: "DONE" as BlockStatus, hour: 10 },
  ];
  await prisma.user.createMany({
    data: DEPT_STAFF.map((s) => ({
      id: `user-${s.key}`,
      email: `${s.key}@ebright.my`,
      name: s.name,
      role: "hodRole" in s && s.hodRole ? ("HOD" as const) : ("MEMBER" as const),
      department: s.dept,
      branch: null,
      employmentType: s.et,
      coachSchedule: null,
    })),
  });

  // Branch-only staff (mutually exclusive with department — Manager/
  // Executive/Coach only). Gives 5 branches (spanning all 3 regions) a full
  // roster: 1 Manager, at most 1 Executive, several Full/Part Time Coach.
  const BRANCH_STAFF = [
    // Subang Taipan (Manager: Farid, Branch Exec: Nabila, Coach FT: Zainal,
    // Coach PT: Amirul — all existing; topping up with one more Coach)
    { key: "diyana", name: "Diyana Roslan", branch: "Subang Taipan", et: "Coach", cs: "Full Time", status: "DONE" as BlockStatus, hour: 10 },
    // Klang (Branch Exec: Aina Zafirah, existing)
    { key: "hafizuddin", name: "Hafizuddin Omar", branch: "Klang", et: "Manager", status: "ACTIVE" as BlockStatus, hour: 9 },
    { key: "anandk", name: "Anand Krishnan", branch: "Klang", et: "Coach", cs: "Full Time", status: "PENDING" as BlockStatus, hour: 14 },
    { key: "izzahn", name: "Nurul Izzah", branch: "Klang", et: "Coach", cs: "Part Time", status: "DONE" as BlockStatus, hour: 11 },
    // Sri Petaling (from scratch)
    { key: "johanr", name: "Johan Rasid", branch: "Sri Petaling", et: "Manager", status: "DONE" as BlockStatus, hour: 10 },
    { key: "michellet", name: "Michelle Tan", branch: "Sri Petaling", et: "Branch Exec", status: "OVERDUE" as BlockStatus, hour: 8 },
    { key: "farhana", name: "Farhana Zainal", branch: "Sri Petaling", et: "Coach", cs: "Full Time", status: "ACTIVE" as BlockStatus, hour: 15 },
    { key: "kelvino", name: "Kelvin Ong", branch: "Sri Petaling", et: "Coach", cs: "Part Time", status: "PENDING" as BlockStatus, hour: 13 },
    // Cyberjaya (Coach Full Time: Marcus Tan, existing)
    { key: "adrianf", name: "Adrian Fernandez", branch: "Cyberjaya", et: "Manager", status: "DONE" as BlockStatus, hour: 9 },
    { key: "nurhaliza", name: "Nurhaliza Samad", branch: "Cyberjaya", et: "Branch Exec", status: "ACTIVE" as BlockStatus, hour: 14 },
    { key: "jeremyl", name: "Jeremy Lee", branch: "Cyberjaya", et: "Coach", cs: "Part Time", status: "OVERDUE" as BlockStatus, hour: 8 },
    // Putrajaya (Coach Part Time: Mei Ling, existing)
    { key: "zaidh", name: "Zaid Hamzah", branch: "Putrajaya", et: "Manager", status: "ACTIVE" as BlockStatus, hour: 11 },
    { key: "christinaw", name: "Christina Wong", branch: "Putrajaya", et: "Branch Exec", status: "DONE" as BlockStatus, hour: 10 },
    { key: "amiruld", name: "Amirul Danial", branch: "Putrajaya", et: "Coach", cs: "Full Time", status: "PENDING" as BlockStatus, hour: 15 },
  ];
  await prisma.user.createMany({
    data: BRANCH_STAFF.map((s) => ({
      id: `user-${s.key}`,
      email: `${s.key}@ebright.my`,
      name: s.name,
      // Managers get role BRANCH (same as Farid) — that's what unlocks a
      // branch's own dashboard/roster view; without it, Klang/Sri
      // Petaling/Cyberjaya/Putrajaya's rosters would be built but
      // unreachable through any page in the app.
      role: s.et === "Manager" ? ("BRANCH" as const) : ("MEMBER" as const),
      department: null,
      branch: s.branch,
      employmentType: s.et,
      coachSchedule: "cs" in s ? s.cs : null,
    })),
  });

  // Self-check: department/branch staff pools must never overlap and must
  // never carry the other pool's employmentType — catches exactly the bug
  // this seed was corrected for (Coach leaking into a department roster) if
  // it's ever reintroduced by a future edit.
  {
    const allStaff = [...DEPT_STAFF, ...BRANCH_STAFF];
    for (const s of allStaff) {
      const isDept = "dept" in s;
      if (isDept && !(DEPARTMENT_EMPLOYMENT_TYPES as readonly string[]).includes(s.et)) {
        throw new Error(`Seed data error: ${s.name} has department employmentType "${s.et}", not one of ${DEPARTMENT_EMPLOYMENT_TYPES.join(", ")}`);
      }
      if (!isDept && !(BRANCH_STAFF_ROLES as readonly string[]).includes(s.et)) {
        throw new Error(`Seed data error: ${s.name} has branch employmentType "${s.et}", not one of ${BRANCH_STAFF_ROLES.join(", ")}`);
      }
    }
  }

  // Department-site and Branch-site accounts (role DEPT_SITE / BRANCH_SITE):
  // view-only logins for "Department accounts"/"Branch site accounts" — see
  // that Department's/Branch's own Status Daily+Monthly + member roster, no
  // personal tasks, no assign form (except Operation's, which additionally
  // gets unrestricted Assign Task — see /api/internal/assign's
  // isOperationDeptSite check). One per official department (6); branch-site
  // accounts only for the 5 branches with a full built-out roster (matching
  // BRANCH_STAFF above), not all 28 official branches.
  const DEPT_SITE_ACCOUNTS = [
    { key: "dept-operation", email: "dept-operation@ebright.my", name: "Operation Department", dept: "Operation" },
    { key: "dept-academy", email: "dept-academy@ebright.my", name: "Academy Department", dept: "Academy" },
    { key: "dept-marketing", email: "dept-marketing@ebright.my", name: "Marketing Department", dept: "Marketing" },
    { key: "dept-optimisation", email: "dept-optimisation@ebright.my", name: "Optimisation Department", dept: "Optimisation" },
    { key: "dept-hr", email: "dept-hr@ebright.my", name: "Human Resource Department", dept: "Human Resource" },
    { key: "dept-finance", email: "dept-finance@ebright.my", name: "Finance Department", dept: "Finance" },
  ];
  const BRANCH_SITE_ACCOUNTS = [
    { key: "site-subangtaipan", email: "site-subangtaipan@ebright.my", name: "Subang Taipan Site", branch: "Subang Taipan" },
    { key: "site-klang", email: "site-klang@ebright.my", name: "Klang Site", branch: "Klang" },
    { key: "site-sripetaling", email: "site-sripetaling@ebright.my", name: "Sri Petaling Site", branch: "Sri Petaling" },
    { key: "site-cyberjaya", email: "site-cyberjaya@ebright.my", name: "Cyberjaya Site", branch: "Cyberjaya" },
    { key: "site-putrajaya", email: "site-putrajaya@ebright.my", name: "Putrajaya Site", branch: "Putrajaya" },
  ];
  await prisma.user.createMany({
    data: [
      ...DEPT_SITE_ACCOUNTS.map((s) => ({
        id: `user-${s.key}`,
        email: s.email,
        name: s.name,
        role: "DEPT_SITE" as const,
        department: s.dept,
        branch: null,
        employmentType: null,
      })),
      ...BRANCH_SITE_ACCOUNTS.map((s) => ({
        id: `user-${s.key}`,
        email: s.email,
        name: s.name,
        role: "BRANCH_SITE" as const,
        department: null,
        branch: s.branch,
        employmentType: null,
      })),
    ],
  });

  // ----- 2. workspaces -----
  await prisma.workspace.createMany({
    data: [
      {
        id: "ws-operations",
        name: "Operation",
        icon: "🏢",
        ownerId: USERS.admin,
        department: "Operation",
        order: 0,
      },
      {
        id: "ws-people",
        name: "Human Resource",
        icon: "🌱",
        ownerId: USERS.priya,
        department: "Human Resource",
        order: 1,
      },
    ],
  });

  // =====================================================================
  // 3a. Flow: "New Client Onboarding" (Operations, PUBLISHED, owner Daniel)
  // =====================================================================

  const coBlockCollect = {
    id: "block-co-collect",
    nodeId: "node-co-collect",
    title: "Collect client details",
  };
  const coBlockContract = {
    id: "block-co-contract",
    nodeId: "node-co-contract",
    title: "Contract & compliance",
  };
  const coBlockSetup = {
    id: "block-co-setup",
    nodeId: "node-co-setup",
    title: "Standard setup",
  };
  const coBlockEscalated = {
    id: "block-co-escalated",
    nodeId: "node-co-escalated",
    title: "Escalated review",
  };
  const coDecisionNodeId = "node-co-signed";

  const coCollectItems: SeedItem[] = [
    item("item-co-company", 0, "TEXT", "Company name", true, {
      placeholder: "Registered company name",
      maxLength: 200,
    }),
    item("item-co-email", 1, "TEXT", "Contact email", true, {
      placeholder: "primary.contact@client.com",
    }),
    item("item-co-deal", 2, "NUMBER", "Deal value", true, {
      min: 0,
      unit: "RM",
    }),
    item("item-co-proposal", 3, "FILE_UPLOAD", "Signed proposal", true, {
      accept: ".pdf",
      maxSizeMb: 20,
    }),
    item("item-co-kickoff", 4, "DUE_DATE", "Kickoff date", true, {
      setsBlockDue: true,
    }),
  ];

  const coContractItems: SeedItem[] = [
    item("item-co-send", 0, "CHECKBOX", "Send contract to client"),
    item("item-co-signed", 1, "YES_NO", "Contract signed?"),
    item("item-co-hod", 2, "APPROVAL", "HOD sign-off", true, {
      requireNote: true,
    }),
  ];

  const coSetupItems: SeedItem[] = [
    item("item-co-crm", 0, "CHECKBOX", "Create CRM account"),
    item("item-co-billing", 1, "CHECKBOX", "Set up billing & invoicing"),
    item("item-co-access", 2, "CHECKBOX", "Provision client portal access"),
    item("item-co-kit", 3, "SUB_ASSIGNEE_TASK", "Prepare welcome kit", true, {
      description:
        "Assemble the branded welcome pack (letter, swag, key contacts sheet) and courier it to the client's office.",
    }),
    item(
      "item-co-ref",
      4,
      "IMAGE_EMBED",
      "Onboarding checklist reference",
      false,
      {
        url: "https://placehold.co/800x450/png?text=Client+Onboarding+Checklist",
        caption: "Reference: standard client onboarding checklist",
      }
    ),
  ];

  const coEscalatedItems: SeedItem[] = [
    item("item-co-reason", 0, "TEXT", "Reason contract was not signed", true, {
      multiline: true,
      placeholder: "Summarise the blocker and client feedback",
    }),
    item("item-co-director", 1, "APPROVAL", "Director approval to proceed"),
  ];

  // conditional routing (typed against lib/types)
  const coCollectOut: ConditionalEdge[] = [
    { condition: { kind: "always" }, targetNodeId: coBlockContract.nodeId },
  ];
  const coContractOut: ConditionalEdge[] = [
    { condition: { kind: "always" }, targetNodeId: coDecisionNodeId },
  ];
  const coDecisionConditions: ConditionalEdge[] = [
    {
      condition: { kind: "item", itemId: "item-co-signed", op: "is_yes" },
      targetNodeId: coBlockSetup.nodeId,
    },
    { condition: { kind: "else" }, targetNodeId: coBlockEscalated.nodeId },
  ];

  const coNodes = [
    {
      id: coBlockCollect.nodeId,
      type: "block",
      position: { x: 260, y: 0 },
      data: {
        kind: "block",
        blockId: coBlockCollect.id,
        title: coBlockCollect.title,
      },
    },
    {
      id: coBlockContract.nodeId,
      type: "block",
      position: { x: 260, y: 200 },
      data: {
        kind: "block",
        blockId: coBlockContract.id,
        title: coBlockContract.title,
      },
    },
    {
      id: coDecisionNodeId,
      type: "decision",
      position: { x: 300, y: 400 },
      data: { kind: "decision", decisionId: "dec-co-signed", title: "Signed?" },
    },
    {
      id: coBlockSetup.nodeId,
      type: "block",
      position: { x: 60, y: 580 },
      data: {
        kind: "block",
        blockId: coBlockSetup.id,
        title: coBlockSetup.title,
      },
    },
    {
      id: coBlockEscalated.nodeId,
      type: "block",
      position: { x: 480, y: 580 },
      data: {
        kind: "block",
        blockId: coBlockEscalated.id,
        title: coBlockEscalated.title,
      },
    },
  ];

  const coEdges = [
    {
      id: "edge-co-1",
      source: coBlockCollect.nodeId,
      target: coBlockContract.nodeId,
      data: { condition: coCollectOut[0].condition },
    },
    {
      id: "edge-co-2",
      source: coBlockContract.nodeId,
      target: coDecisionNodeId,
      data: { condition: coContractOut[0].condition },
    },
    {
      id: "edge-co-3",
      source: coDecisionNodeId,
      target: coBlockSetup.nodeId,
      data: { condition: coDecisionConditions[0].condition, label: "Yes" },
    },
    {
      id: "edge-co-4",
      source: coDecisionNodeId,
      target: coBlockEscalated.nodeId,
      data: { condition: coDecisionConditions[1].condition, label: "Otherwise" },
    },
  ];

  const clientFlow = await prisma.flow.create({
    data: {
      id: "flow-client-onboarding",
      workspaceId: "ws-operations",
      name: "New Client Onboarding",
      icon: "🤝",
      description:
        "From signed proposal to fully provisioned client — sales handoff, contract, and setup.",
      ownerId: USERS.daniel,
      department: "Operation",
      order: 0,
      version: 2,
      isPublished: true,
      nodes: coNodes as unknown as Prisma.InputJsonValue,
      edges: coEdges as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.block.create({
    data: {
      id: coBlockCollect.id,
      flowId: clientFlow.id,
      nodeId: coBlockCollect.nodeId,
      title: coBlockCollect.title,
      fixedAssigneeId: USERS.sofia,
      dueInHours: 48,
      reminderInterval: 24,
      strikeLimit: 3,
      escalateToUserId: USERS.daniel,
      outgoingEdges: coCollectOut as unknown as Prisma.InputJsonValue,
      items: { create: coCollectItems },
    },
  });

  await prisma.block.create({
    data: {
      id: coBlockContract.id,
      flowId: clientFlow.id,
      nodeId: coBlockContract.nodeId,
      title: coBlockContract.title,
      fixedAssigneeId: USERS.marcus,
      dueInHours: 96,
      reminderInterval: 24,
      strikeLimit: 3,
      escalateToUserId: USERS.daniel,
      outgoingEdges: coContractOut as unknown as Prisma.InputJsonValue,
      items: { create: coContractItems },
    },
  });

  await prisma.block.create({
    data: {
      id: coBlockSetup.id,
      flowId: clientFlow.id,
      nodeId: coBlockSetup.nodeId,
      title: coBlockSetup.title,
      fixedAssigneeId: USERS.marcus,
      dueInHours: 72,
      reminderInterval: 24,
      strikeLimit: 3,
      escalateToUserId: USERS.daniel,
      outgoingEdges: [] as unknown as Prisma.InputJsonValue,
      items: { create: coSetupItems },
    },
  });

  await prisma.block.create({
    data: {
      id: coBlockEscalated.id,
      flowId: clientFlow.id,
      nodeId: coBlockEscalated.nodeId,
      title: coBlockEscalated.title,
      fixedAssigneeId: USERS.daniel,
      dueInHours: 48,
      reminderInterval: 24,
      strikeLimit: 3,
      escalateToUserId: USERS.admin, // Daniel's own block escalates to the admin
      outgoingEdges: [] as unknown as Prisma.InputJsonValue,
      items: { create: coEscalatedItems },
    },
  });

  await prisma.decisionNode.create({
    data: {
      id: "dec-co-signed",
      flowId: clientFlow.id,
      nodeId: coDecisionNodeId,
      conditions: coDecisionConditions as unknown as Prisma.InputJsonValue,
    },
  });

  // =====================================================================
  // 3b. Flow: "Employee Onboarding" (People Ops, PUBLISHED, owner Priya)
  // =====================================================================

  const eoBlockPrep = {
    id: "block-eo-prep",
    nodeId: "node-eo-prep",
    title: "Prepare workstation & accounts",
  };
  const eoBlockDayOne = {
    id: "block-eo-dayone",
    nodeId: "node-eo-dayone",
    title: "Day-one orientation",
  };
  const eoBlockCheckin = {
    id: "block-eo-checkin",
    nodeId: "node-eo-checkin",
    title: "30-day check-in",
  };

  const eoPrepItems: SeedItem[] = [
    item("item-eo-account", 0, "CHECKBOX", "Create email & SSO accounts"),
    item("item-eo-laptop", 1, "CHECKBOX", "Issue laptop and peripherals"),
    item("item-eo-dept", 2, "DROPDOWN", "Assign to department", true, {
      options: ["Operation", "Marketing", "Human Resource", "Finance"],
    }),
    item("item-eo-firstday", 3, "DUE_DATE", "Confirmed first day", true, {
      setsBlockDue: true,
    }),
  ];

  const eoDayOneItems: SeedItem[] = [
    item("item-eo-tour", 0, "CHECKBOX", "Office tour & security badge"),
    item("item-eo-buddy", 1, "TEXT", "Onboarding buddy assigned", true, {
      placeholder: "Name of the assigned buddy",
    }),
    item("item-eo-handbook", 2, "CHECKBOX", "Employee handbook acknowledged"),
  ];

  const eoCheckinItems: SeedItem[] = [
    item("item-eo-feedback", 0, "TEXT", "30-day feedback summary", true, {
      multiline: true,
    }),
    item("item-eo-probation", 1, "APPROVAL", "Probation on track?", true, {
      requireNote: true,
    }),
  ];

  const eoPrepOut: ConditionalEdge[] = [
    { condition: { kind: "always" }, targetNodeId: eoBlockDayOne.nodeId },
  ];
  const eoDayOneOut: ConditionalEdge[] = [
    { condition: { kind: "always" }, targetNodeId: eoBlockCheckin.nodeId },
  ];

  const eoNodes = [
    {
      id: eoBlockPrep.nodeId,
      type: "block",
      position: { x: 260, y: 0 },
      data: { kind: "block", blockId: eoBlockPrep.id, title: eoBlockPrep.title },
    },
    {
      id: eoBlockDayOne.nodeId,
      type: "block",
      position: { x: 260, y: 200 },
      data: {
        kind: "block",
        blockId: eoBlockDayOne.id,
        title: eoBlockDayOne.title,
      },
    },
    {
      id: eoBlockCheckin.nodeId,
      type: "block",
      position: { x: 260, y: 400 },
      data: {
        kind: "block",
        blockId: eoBlockCheckin.id,
        title: eoBlockCheckin.title,
      },
    },
  ];
  const eoEdges = [
    {
      id: "edge-eo-1",
      source: eoBlockPrep.nodeId,
      target: eoBlockDayOne.nodeId,
      data: { condition: eoPrepOut[0].condition },
    },
    {
      id: "edge-eo-2",
      source: eoBlockDayOne.nodeId,
      target: eoBlockCheckin.nodeId,
      data: { condition: eoDayOneOut[0].condition },
    },
  ];

  const employeeFlow = await prisma.flow.create({
    data: {
      id: "flow-employee-onboarding",
      workspaceId: "ws-people",
      name: "Employee Onboarding",
      icon: "🌱",
      description:
        "New joiner setup: workstation, day-one orientation, and 30-day check-in.",
      ownerId: USERS.priya,
      department: "Human Resource",
      order: 0,
      version: 2,
      isPublished: true,
      nodes: eoNodes as unknown as Prisma.InputJsonValue,
      edges: eoEdges as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.block.create({
    data: {
      id: eoBlockPrep.id,
      flowId: employeeFlow.id,
      nodeId: eoBlockPrep.nodeId,
      title: eoBlockPrep.title,
      fixedAssigneeId: USERS.hafiz,
      dueInHours: 72,
      reminderInterval: 24,
      strikeLimit: 3,
      escalateToUserId: USERS.priya,
      outgoingEdges: eoPrepOut as unknown as Prisma.InputJsonValue,
      items: { create: eoPrepItems },
    },
  });
  await prisma.block.create({
    data: {
      id: eoBlockDayOne.id,
      flowId: employeeFlow.id,
      nodeId: eoBlockDayOne.nodeId,
      title: eoBlockDayOne.title,
      fixedAssigneeId: USERS.hafiz,
      dueInHours: 48,
      reminderInterval: 24,
      strikeLimit: 3,
      escalateToUserId: USERS.priya,
      outgoingEdges: eoDayOneOut as unknown as Prisma.InputJsonValue,
      items: { create: eoDayOneItems },
    },
  });
  await prisma.block.create({
    data: {
      id: eoBlockCheckin.id,
      flowId: employeeFlow.id,
      nodeId: eoBlockCheckin.nodeId,
      title: eoBlockCheckin.title,
      fixedAssigneeId: USERS.priya,
      dueInHours: 96,
      reminderInterval: 24,
      strikeLimit: 3,
      escalateToUserId: USERS.admin, // Priya's own block escalates to the admin
      outgoingEdges: [] as unknown as Prisma.InputJsonValue,
      items: { create: eoCheckinItems },
    },
  });

  // =====================================================================
  // 3c. Flow: "Monthly Compliance Audit" (Operations, DRAFT, partially configured)
  // =====================================================================

  const caBlockGather = {
    id: "block-ca-gather",
    nodeId: "node-ca-gather",
    title: "Gather audit evidence",
  };
  const caBlockReview = {
    id: "block-ca-review",
    nodeId: "node-ca-review",
    title: "Review findings",
  };

  const caGatherItems: SeedItem[] = [
    item("item-ca-exports", 0, "CHECKBOX", "Export access logs for the month"),
    item("item-ca-receipts", 1, "CHECKBOX", "Collect expense receipts"),
  ];
  const caReviewItems: SeedItem[] = [
    item("item-ca-summary", 0, "TEXT", "Findings summary", true, {
      multiline: true,
    }),
  ];

  const caGatherOut: ConditionalEdge[] = [
    { condition: { kind: "always" }, targetNodeId: caBlockReview.nodeId },
  ];

  const auditFlow = await prisma.flow.create({
    data: {
      id: "flow-compliance-audit",
      workspaceId: "ws-operations",
      name: "Monthly Compliance Audit",
      icon: "📋",
      description: "Recurring internal audit — draft, not yet published.",
      ownerId: USERS.daniel,
      department: "Operation",
      order: 1,
      version: 1,
      isPublished: false,
      nodes: [
        {
          id: caBlockGather.nodeId,
          type: "block",
          position: { x: 260, y: 0 },
          data: {
            kind: "block",
            blockId: caBlockGather.id,
            title: caBlockGather.title,
          },
        },
        {
          id: caBlockReview.nodeId,
          type: "block",
          position: { x: 260, y: 200 },
          data: {
            kind: "block",
            blockId: caBlockReview.id,
            title: caBlockReview.title,
          },
        },
      ] as unknown as Prisma.InputJsonValue,
      edges: [
        {
          id: "edge-ca-1",
          source: caBlockGather.nodeId,
          target: caBlockReview.nodeId,
          data: { condition: caGatherOut[0].condition },
        },
      ] as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.block.create({
    data: {
      id: caBlockGather.id,
      flowId: auditFlow.id,
      nodeId: caBlockGather.nodeId,
      title: caBlockGather.title,
      fixedAssigneeId: USERS.marcus,
      dueInHours: 72,
      reminderInterval: 24,
      strikeLimit: 3,
      escalateToUserId: USERS.daniel,
      outgoingEdges: caGatherOut as unknown as Prisma.InputJsonValue,
      items: { create: caGatherItems },
    },
  });
  await prisma.block.create({
    data: {
      id: caBlockReview.id,
      flowId: auditFlow.id,
      nodeId: caBlockReview.nodeId,
      title: caBlockReview.title,
      fixedAssigneeId: USERS.daniel,
      dueInHours: 48,
      reminderInterval: 24,
      strikeLimit: 3,
      escalateToUserId: null, // intentionally missing — demonstrates publish validation
      outgoingEdges: [] as unknown as Prisma.InputJsonValue,
      items: { create: caReviewItems },
    },
  });

  // =====================================================================
  // 3d. Flow: "Ad hoc Tasks" — utility flow behind the superadmin/OPS
  //     "+ Assigned task" quick form (POST /api/internal/assign creates a
  //     run of this flow per targeted staff member).
  // =====================================================================

  const adhocBlock = {
    id: "block-adhoc",
    nodeId: "node-adhoc",
    title: "Ad hoc task",
  };
  const adhocItems: SeedItem[] = [item("item-adhoc-done", 0, "CHECKBOX", "Done")];

  const adhocFlow = await prisma.flow.create({
    data: {
      id: "flow-adhoc",
      workspaceId: "ws-operations",
      name: "Ad hoc Tasks",
      icon: "⚡",
      description: "One-off tasks assigned from the '+ Assigned task' quick form.",
      ownerId: USERS.superadmin,
      department: "Operation",
      order: 2,
      version: 1,
      isPublished: true,
      nodes: [
        {
          id: adhocBlock.nodeId,
          type: "block",
          position: { x: 260, y: 0 },
          data: { kind: "block", blockId: adhocBlock.id, title: adhocBlock.title },
        },
      ] as unknown as Prisma.InputJsonValue,
      edges: [] as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.block.create({
    data: {
      id: adhocBlock.id,
      flowId: adhocFlow.id,
      nodeId: adhocBlock.nodeId,
      title: adhocBlock.title,
      reminderInterval: 24,
      strikeLimit: 3,
      escalateToUserId: USERS.superadmin,
      outgoingEdges: [] as unknown as Prisma.InputJsonValue,
      items: { create: adhocItems },
    },
  });

  // =====================================================================
  // 3e. Flow: "CEO Assigned Task" — utility flow behind the CEO's own
  //     "+ Add Task" quick form (same POST /api/internal/assign route as
  //     the ad hoc form, but a DISTINCT flow — CEO-assigned tasks must
  //     never carry the "Ad hoc Tasks" name/label, since "Ad hoc" is
  //     reserved for OPS/ADMIN-started runs elsewhere in the app).
  // =====================================================================

  const ceoAssignBlock = {
    id: "block-ceo-assign",
    nodeId: "node-ceo-assign",
    title: "CEO assigned task",
  };
  const ceoAssignItems: SeedItem[] = [item("item-ceo-assign-done", 0, "CHECKBOX", "Done")];

  const ceoAssignFlow = await prisma.flow.create({
    data: {
      id: "flow-ceo-assign",
      workspaceId: "ws-operations",
      name: "CEO Assigned Task",
      icon: "📌",
      description: "Tasks assigned from the CEO's '+ Add Task' quick form.",
      ownerId: USERS.superadmin,
      department: "Operation",
      order: 3,
      version: 1,
      isPublished: true,
      nodes: [
        {
          id: ceoAssignBlock.nodeId,
          type: "block",
          position: { x: 260, y: 0 },
          data: { kind: "block", blockId: ceoAssignBlock.id, title: ceoAssignBlock.title },
        },
      ] as unknown as Prisma.InputJsonValue,
      edges: [] as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.block.create({
    data: {
      id: ceoAssignBlock.id,
      flowId: ceoAssignFlow.id,
      nodeId: ceoAssignBlock.nodeId,
      title: ceoAssignBlock.title,
      reminderInterval: 24,
      strikeLimit: 3,
      escalateToUserId: USERS.superadmin,
      outgoingEdges: [] as unknown as Prisma.InputJsonValue,
      items: { create: ceoAssignItems },
    },
  });

  // =====================================================================
  // 3f. Flow: "HOD Assigned Task" — utility flow behind an HOD's own
  //     "Assign Task" Details-section form (same POST /api/internal/assign
  //     route as the ad hoc/CEO forms, but a DISTINCT flow — same reasoning
  //     as flow-ceo-assign above: these must never carry the "Ad hoc Tasks"
  //     name/label). Recipient's "HOD assigned tasks" stream bucketing is
  //     already automatic (keyed off the run starter's role, not the flow),
  //     so this flow only exists for the cosmetic subtitle label.
  // =====================================================================

  const hodAssignBlock = {
    id: "block-hod-assign",
    nodeId: "node-hod-assign",
    title: "HOD assigned task",
  };
  const hodAssignItems: SeedItem[] = [item("item-hod-assign-done", 0, "CHECKBOX", "Done")];

  const hodAssignFlow = await prisma.flow.create({
    data: {
      id: "flow-hod-assign",
      workspaceId: "ws-operations",
      name: "HOD Assigned Task",
      icon: "📋",
      description: "Tasks assigned from an HOD's own 'Assign Task' form.",
      ownerId: USERS.superadmin,
      department: "Operation",
      order: 4,
      version: 1,
      isPublished: true,
      nodes: [
        {
          id: hodAssignBlock.nodeId,
          type: "block",
          position: { x: 260, y: 0 },
          data: { kind: "block", blockId: hodAssignBlock.id, title: hodAssignBlock.title },
        },
      ] as unknown as Prisma.InputJsonValue,
      edges: [] as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.block.create({
    data: {
      id: hodAssignBlock.id,
      flowId: hodAssignFlow.id,
      nodeId: hodAssignBlock.nodeId,
      title: hodAssignBlock.title,
      reminderInterval: 24,
      strikeLimit: 3,
      escalateToUserId: USERS.superadmin,
      outgoingEdges: [] as unknown as Prisma.InputJsonValue,
      items: { create: hodAssignItems },
    },
  });

  // =====================================================================
  // 3g/3h. Flows: "Admin Assigned Task" / "Ops Assigned Task" — utility
  //     flows behind Superadmin's and OPS's own "+ Assigned task" forms.
  //     "Ad hoc" was redefined to mean EXCLUSIVELY Manager/branch-context
  //     tasks (flow-adhoc is now only ever used by the Manpower Schedule's
  //     slot-sync, see _manpower.ts's createSlotRun) — Superadmin and OPS
  //     each need their OWN distinct flow, same reasoning as flow-ceo-assign/
  //     flow-hod-assign above, so their tasks stop being definitionally
  //     "Ad hoc". Two separate flows (not one shared one) so each role's
  //     tasks carry the correct subtitle label (flowName comes from the
  //     Flow's own `name` column, not computed per-role elsewhere).
  // =====================================================================

  const adminAssignBlock = {
    id: "block-admin-assign",
    nodeId: "node-admin-assign",
    title: "Admin assigned task",
  };
  const adminAssignItems: SeedItem[] = [item("item-admin-assign-done", 0, "CHECKBOX", "Done")];

  const adminAssignFlow = await prisma.flow.create({
    data: {
      id: "flow-admin-assign",
      workspaceId: "ws-operations",
      name: "Admin Assigned Task",
      icon: "🛡️",
      description: "Tasks assigned from Superadmin's own '+ Assigned task' form.",
      ownerId: USERS.superadmin,
      department: "Operation",
      order: 5,
      version: 1,
      isPublished: true,
      nodes: [
        {
          id: adminAssignBlock.nodeId,
          type: "block",
          position: { x: 260, y: 0 },
          data: { kind: "block", blockId: adminAssignBlock.id, title: adminAssignBlock.title },
        },
      ] as unknown as Prisma.InputJsonValue,
      edges: [] as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.block.create({
    data: {
      id: adminAssignBlock.id,
      flowId: adminAssignFlow.id,
      nodeId: adminAssignBlock.nodeId,
      title: adminAssignBlock.title,
      reminderInterval: 24,
      strikeLimit: 3,
      escalateToUserId: USERS.superadmin,
      outgoingEdges: [] as unknown as Prisma.InputJsonValue,
      items: { create: adminAssignItems },
    },
  });

  const opsAssignBlock = {
    id: "block-ops-assign",
    nodeId: "node-ops-assign",
    title: "Ops assigned task",
  };
  const opsAssignItems: SeedItem[] = [item("item-ops-assign-done", 0, "CHECKBOX", "Done")];

  const opsAssignFlow = await prisma.flow.create({
    data: {
      id: "flow-ops-assign",
      workspaceId: "ws-operations",
      name: "Ops Assigned Task",
      icon: "🗂️",
      description: "Tasks assigned from OPS's own '+ Assigned task' form.",
      ownerId: USERS.superadmin,
      department: "Operation",
      order: 6,
      version: 1,
      isPublished: true,
      nodes: [
        {
          id: opsAssignBlock.nodeId,
          type: "block",
          position: { x: 260, y: 0 },
          data: { kind: "block", blockId: opsAssignBlock.id, title: opsAssignBlock.title },
        },
      ] as unknown as Prisma.InputJsonValue,
      edges: [] as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.block.create({
    data: {
      id: opsAssignBlock.id,
      flowId: opsAssignFlow.id,
      nodeId: opsAssignBlock.nodeId,
      title: opsAssignBlock.title,
      reminderInterval: 24,
      strikeLimit: 3,
      escalateToUserId: USERS.superadmin,
      outgoingEdges: [] as unknown as Prisma.InputJsonValue,
      items: { create: opsAssignItems },
    },
  });

  // ----- 4. triggers -----
  await prisma.flowTrigger.createMany({
    data: [
      {
        id: "trigger-co-manual",
        flowId: clientFlow.id,
        type: "MANUAL",
        config: {},
      },
      {
        id: "trigger-eo-manual",
        flowId: employeeFlow.id,
        type: "MANUAL",
        config: {},
      },
      {
        id: "trigger-ca-manual",
        flowId: auditFlow.id,
        type: "MANUAL",
        config: {},
      },
    ],
  });

  // ----- 5. flow docs (BlockNote JSON) -----
  await prisma.flowDoc.create({
    data: {
      id: "doc-client-onboarding",
      flowId: clientFlow.id,
      updatedBy: USERS.daniel,
      content: [
        bn("heading", "New Client Onboarding — SOP", { level: 1 }),
        bn(
          "paragraph",
          "This flow takes a client from signed proposal to fully provisioned account. Sales owns the intake, Operations owns contract and setup. Target end-to-end time: 7 working days."
        ),
        bn("heading", "Process overview", { level: 2 }),
        bn(
          "bulletListItem",
          "Collect client details — Sofia gathers company info, deal value, and the signed proposal, and sets the kickoff date."
        ),
        bn(
          "bulletListItem",
          "Contract & compliance — Marcus sends the contract, records whether it was signed, and obtains HOD sign-off."
        ),
        bn(
          "bulletListItem",
          "Signed? — if the contract is signed we proceed to Standard setup; otherwise the case goes to Escalated review with Daniel."
        ),
        bn(
          "bulletListItem",
          "Standard setup — CRM, billing, portal access, and the welcome kit (delegated as a sub-task)."
        ),
        bn("heading", "Escalation policy", { level: 2 }),
        bn(
          "paragraph",
          "Every block reminds its PIC daily after the due date. After three strikes the block escalates to the supervisor — Daniel for Operations blocks, Amelia for Daniel's own reviews. Escalations are also logged for the monthly ops review."
        ),
      ] as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.flowDoc.create({
    data: {
      id: "doc-employee-onboarding",
      flowId: employeeFlow.id,
      updatedBy: USERS.priya,
      content: [
        bn("heading", "Employee Onboarding — SOP", { level: 1 }),
        bn(
          "paragraph",
          "Runs for every new joiner, triggered manually by People Ops or from the public intake form. Hafiz handles setup and day one; Priya closes the loop at 30 days."
        ),
        bn("heading", "Checklist notes", { level: 2 }),
        bn(
          "bulletListItem",
          "Workstation & accounts must be ready BEFORE the confirmed first day — the due date item sets the block deadline."
        ),
        bn(
          "bulletListItem",
          "Day-one orientation includes the office tour, security badge, and assigning an onboarding buddy."
        ),
        bn(
          "bulletListItem",
          "The 30-day check-in requires a written feedback summary and a probation decision with a note."
        ),
        bn("heading", "Reminders", { level: 2 }),
        bn(
          "paragraph",
          "Blocks remind daily and escalate to Priya after three missed reminders. Keep the intake form fields (name, role, start date) in sync with HR's offer letter template."
        ),
      ] as unknown as Prisma.InputJsonValue,
    },
  });

  // ----- 6. runs (snapshots via the real engine snapshot builder) -----
  const clientSnapshot = (await buildTemplateSnapshot(
    clientFlow.id
  )) as unknown as Prisma.InputJsonValue;
  const employeeSnapshot = (await buildTemplateSnapshot(
    employeeFlow.id
  )) as unknown as Prisma.InputJsonValue;

  // --- Run 1: Acme Sdn Bhd (ACTIVE — block 1 done, block 2 in progress) ---
  await prisma.flowRun.create({
    data: {
      id: "run-acme",
      flowId: clientFlow.id,
      flowVersion: clientFlow.version,
      templateSnapshot: clientSnapshot,
      name: "Acme Sdn Bhd",
      startedById: USERS.daniel,
      triggerType: "MANUAL",
      status: "ACTIVE",
      startedAt: daysFromNow(-4),
    },
  });

  await createRunBlock({
    id: "rb-acme-collect",
    runId: "run-acme",
    block: coBlockCollect,
    assigneeId: USERS.sofia,
    status: "DONE",
    startedAt: daysFromNow(-4),
    dueAt: daysFromNow(10), // kickoff date item setsBlockDue
    completedAt: daysFromNow(-3),
    items: coCollectItems,
    fills: {
      "item-co-company": {
        value: { type: "TEXT", text: "Acme Sdn Bhd" },
        completedAt: daysFromNow(-3),
        completedBy: USERS.sofia,
      },
      "item-co-email": {
        value: { type: "TEXT", text: "faridah.hassan@acme.com.my" },
        completedAt: daysFromNow(-3),
        completedBy: USERS.sofia,
      },
      "item-co-deal": {
        value: { type: "NUMBER", number: 48_000 },
        completedAt: daysFromNow(-3),
        completedBy: USERS.sofia,
      },
      "item-co-proposal": {
        value: {
          type: "FILE_UPLOAD",
          fileKey: "seed/acme/signed-proposal.pdf",
          fileName: "Acme-Signed-Proposal.pdf",
          size: 482_133,
          contentType: "application/pdf",
        },
        completedAt: daysFromNow(-3),
        completedBy: USERS.sofia,
      },
      "item-co-kickoff": {
        value: { type: "DUE_DATE", date: daysFromNow(10).toISOString() },
        completedAt: daysFromNow(-3),
        completedBy: USERS.sofia,
      },
    },
  });

  await createRunBlock({
    id: "rb-acme-contract",
    runId: "run-acme",
    block: coBlockContract,
    assigneeId: USERS.marcus,
    status: "ACTIVE",
    startedAt: daysFromNow(-3),
    // analytics: was daysFromNow(1) ("due tomorrow") — anchored to TODAY so the
    // daily view has Pending data for Cyberjaya / Operations (Marcus).
    dueAt: todayAt(17),
    strikeCount: 0,
    items: coContractItems,
    fills: {
      "item-co-send": {
        value: { type: "CHECKBOX", checked: true },
        completedAt: daysFromNow(-1),
        completedBy: USERS.marcus,
      },
      // YES_NO + APPROVAL deliberately unset
    },
  });

  // --- Run 2: TechVantage (ACTIVE — block 2 OVERDUE, 2 strikes) ---
  await prisma.flowRun.create({
    data: {
      id: "run-techvantage",
      flowId: clientFlow.id,
      flowVersion: clientFlow.version,
      templateSnapshot: clientSnapshot,
      name: "TechVantage",
      startedById: USERS.sofia,
      triggerType: "MANUAL",
      status: "ACTIVE",
      startedAt: daysFromNow(-7),
    },
  });

  await createRunBlock({
    id: "rb-tv-collect",
    runId: "run-techvantage",
    block: coBlockCollect,
    assigneeId: USERS.sofia,
    status: "DONE",
    startedAt: daysFromNow(-7),
    dueAt: daysFromNow(5),
    completedAt: daysFromNow(-6),
    items: coCollectItems,
    fills: {
      "item-co-company": {
        value: { type: "TEXT", text: "TechVantage Solutions Sdn Bhd" },
        completedAt: daysFromNow(-6),
        completedBy: USERS.sofia,
      },
      "item-co-email": {
        value: { type: "TEXT", text: "j.lee@techvantage.io" },
        completedAt: daysFromNow(-6),
        completedBy: USERS.sofia,
      },
      "item-co-deal": {
        value: { type: "NUMBER", number: 126_500 },
        completedAt: daysFromNow(-6),
        completedBy: USERS.sofia,
      },
      "item-co-proposal": {
        value: {
          type: "FILE_UPLOAD",
          fileKey: "seed/techvantage/signed-proposal.pdf",
          fileName: "TechVantage-Proposal-v3.pdf",
          size: 1_204_886,
          contentType: "application/pdf",
        },
        completedAt: daysFromNow(-6),
        completedBy: USERS.sofia,
      },
      "item-co-kickoff": {
        value: { type: "DUE_DATE", date: daysFromNow(5).toISOString() },
        completedAt: daysFromNow(-6),
        completedBy: USERS.sofia,
      },
    },
  });

  await createRunBlock({
    id: "rb-tv-contract",
    runId: "run-techvantage",
    block: coBlockContract,
    assigneeId: USERS.marcus,
    status: "OVERDUE",
    startedAt: daysFromNow(-6),
    dueAt: daysFromNow(-2), // 96h after activation, already passed
    strikeCount: 2,
    items: coContractItems,
    fills: {
      "item-co-send": {
        value: { type: "CHECKBOX", checked: true },
        completedAt: daysFromNow(-4),
        completedBy: USERS.marcus,
      },
    },
  });

  await prisma.notificationLog.createMany({
    data: [
      {
        id: "nlog-tv-r1",
        runBlockId: "rb-tv-contract",
        type: "REMINDER",
        sentTo: USERS.marcus,
        sentAt: daysFromNow(-1),
        jobId: "seed-r1",
      },
      {
        id: "nlog-tv-r2",
        runBlockId: "rb-tv-contract",
        type: "REMINDER",
        sentTo: USERS.marcus,
        sentAt: hoursFromNow(-4),
        jobId: "seed-r2",
      },
    ],
  });

  // --- Run 3: Northstar Logistics (ACTIVE — block 2 ESCALATED) ---
  await prisma.flowRun.create({
    data: {
      id: "run-northstar",
      flowId: clientFlow.id,
      flowVersion: clientFlow.version,
      templateSnapshot: clientSnapshot,
      name: "Northstar Logistics",
      startedById: USERS.daniel,
      triggerType: "MANUAL",
      status: "ACTIVE",
      startedAt: daysFromNow(-10),
    },
  });

  await createRunBlock({
    id: "rb-ns-collect",
    runId: "run-northstar",
    block: coBlockCollect,
    assigneeId: USERS.sofia,
    status: "DONE",
    startedAt: daysFromNow(-10),
    // analytics: was daysFromNow(-1) — kickoff (setsBlockDue) anchored to TODAY so
    // the daily view has Completed data for Subang Taipan / Sales (Sofia).
    dueAt: todayAt(9),
    completedAt: daysFromNow(-9),
    items: coCollectItems,
    fills: {
      "item-co-company": {
        value: { type: "TEXT", text: "Northstar Logistics Bhd" },
        completedAt: daysFromNow(-9),
        completedBy: USERS.sofia,
      },
      "item-co-email": {
        value: { type: "TEXT", text: "ops@northstar-logistics.com" },
        completedAt: daysFromNow(-9),
        completedBy: USERS.sofia,
      },
      "item-co-deal": {
        value: { type: "NUMBER", number: 88_000 },
        completedAt: daysFromNow(-9),
        completedBy: USERS.sofia,
      },
      "item-co-proposal": {
        value: {
          type: "FILE_UPLOAD",
          fileKey: "seed/northstar/signed-proposal.pdf",
          fileName: "Northstar-Signed-Proposal.pdf",
          size: 736_402,
          contentType: "application/pdf",
        },
        completedAt: daysFromNow(-9),
        completedBy: USERS.sofia,
      },
      "item-co-kickoff": {
        // analytics: kept in sync with the block dueAt above (todayAt(9))
        value: { type: "DUE_DATE", date: todayAt(9).toISOString() },
        completedAt: daysFromNow(-9),
        completedBy: USERS.sofia,
      },
    },
  });

  await createRunBlock({
    id: "rb-ns-contract",
    runId: "run-northstar",
    block: coBlockContract,
    assigneeId: USERS.marcus,
    status: "ESCALATED",
    startedAt: daysFromNow(-9),
    dueAt: daysFromNow(-5),
    strikeCount: 3,
    items: coContractItems,
  });

  await prisma.notificationLog.createMany({
    data: [
      {
        id: "nlog-ns-r1",
        runBlockId: "rb-ns-contract",
        type: "REMINDER",
        sentTo: USERS.marcus,
        sentAt: daysFromNow(-4),
        jobId: "seed-ns-r1",
      },
      {
        id: "nlog-ns-r2",
        runBlockId: "rb-ns-contract",
        type: "REMINDER",
        sentTo: USERS.marcus,
        sentAt: daysFromNow(-3),
        jobId: "seed-ns-r2",
      },
      {
        id: "nlog-ns-esc",
        runBlockId: "rb-ns-contract",
        type: "ESCALATION",
        sentTo: USERS.daniel,
        sentAt: daysFromNow(-2),
        jobId: "seed-esc-1",
      },
    ],
  });

  // --- Run 4: Delta Marine (COMPLETED — decision routed to Standard setup) ---
  await prisma.flowRun.create({
    data: {
      id: "run-deltamarine",
      flowId: clientFlow.id,
      flowVersion: clientFlow.version,
      templateSnapshot: clientSnapshot,
      name: "Delta Marine",
      startedById: USERS.daniel,
      triggerType: "MANUAL",
      status: "COMPLETED",
      startedAt: daysFromNow(-8),
      completedAt: daysFromNow(-1),
    },
  });

  await createRunBlock({
    id: "rb-dm-collect",
    runId: "run-deltamarine",
    block: coBlockCollect,
    assigneeId: USERS.sofia,
    status: "DONE",
    startedAt: daysFromNow(-8),
    dueAt: daysFromNow(-2),
    completedAt: daysFromNow(-7),
    items: coCollectItems,
    fills: {
      "item-co-company": {
        value: { type: "TEXT", text: "Delta Marine Services Sdn Bhd" },
        completedAt: daysFromNow(-7),
        completedBy: USERS.sofia,
      },
      "item-co-email": {
        value: { type: "TEXT", text: "harbour@deltamarine.my" },
        completedAt: daysFromNow(-7),
        completedBy: USERS.sofia,
      },
      "item-co-deal": {
        value: { type: "NUMBER", number: 64_250 },
        completedAt: daysFromNow(-7),
        completedBy: USERS.sofia,
      },
      "item-co-proposal": {
        value: {
          type: "FILE_UPLOAD",
          fileKey: "seed/deltamarine/signed-proposal.pdf",
          fileName: "DeltaMarine-Signed-Proposal.pdf",
          size: 590_311,
          contentType: "application/pdf",
        },
        completedAt: daysFromNow(-7),
        completedBy: USERS.sofia,
      },
      "item-co-kickoff": {
        value: { type: "DUE_DATE", date: daysFromNow(-2).toISOString() },
        completedAt: daysFromNow(-7),
        completedBy: USERS.sofia,
      },
    },
  });

  await createRunBlock({
    id: "rb-dm-contract",
    runId: "run-deltamarine",
    block: coBlockContract,
    assigneeId: USERS.marcus,
    status: "DONE",
    startedAt: daysFromNow(-7),
    dueAt: daysFromNow(-3),
    completedAt: daysFromNow(-4),
    items: coContractItems,
    fills: {
      "item-co-send": {
        value: { type: "CHECKBOX", checked: true },
        completedAt: daysFromNow(-6),
        completedBy: USERS.marcus,
      },
      "item-co-signed": {
        value: { type: "YES_NO", answer: "yes" },
        completedAt: daysFromNow(-5),
        completedBy: USERS.marcus,
      },
      "item-co-hod": {
        value: {
          type: "APPROVAL",
          decision: "approved",
          note: "Contract terms match the approved rate card. Cleared to proceed.",
        },
        completedAt: daysFromNow(-4),
        completedBy: USERS.daniel,
      },
    },
  });

  // Decision "Signed?" routed is_yes → Standard setup (no RunBlock for the decision
  // itself, and none for the escalated branch).
  await createRunBlock({
    id: "rb-dm-setup",
    runId: "run-deltamarine",
    block: coBlockSetup,
    assigneeId: USERS.marcus,
    status: "DONE",
    startedAt: daysFromNow(-4),
    dueAt: daysFromNow(-1),
    completedAt: daysFromNow(-1),
    items: coSetupItems,
    fills: {
      "item-co-crm": {
        value: { type: "CHECKBOX", checked: true },
        completedAt: daysFromNow(-3),
        completedBy: USERS.marcus,
      },
      "item-co-billing": {
        value: { type: "CHECKBOX", checked: true },
        completedAt: daysFromNow(-2),
        completedBy: USERS.marcus,
      },
      "item-co-access": {
        value: { type: "CHECKBOX", checked: true },
        completedAt: daysFromNow(-2),
        completedBy: USERS.marcus,
      },
      "item-co-kit": {
        value: {
          type: "SUB_ASSIGNEE_TASK",
          assigneeId: USERS.hafiz,
          done: true,
          note: "Welcome kit couriered to Delta Marine's Port Klang office.",
        },
        completedAt: daysFromNow(-1),
        completedBy: USERS.hafiz,
      },
      "item-co-ref": {
        value: {
          type: "IMAGE_EMBED",
          url: "https://placehold.co/800x450/png?text=Client+Onboarding+Checklist",
          caption: "Standard client onboarding checklist",
        },
        completedAt: daysFromNow(-1),
        completedBy: USERS.marcus,
      },
    },
  });

  // --- Run 5: Onboard: Grace Foo (ACTIVE — block 1 just started) ---
  await prisma.flowRun.create({
    data: {
      id: "run-grace",
      flowId: employeeFlow.id,
      flowVersion: employeeFlow.version,
      templateSnapshot: employeeSnapshot,
      name: "Onboard: Grace Foo",
      startedById: USERS.priya,
      triggerType: "FORM_SUBMIT",
      status: "ACTIVE",
      startedAt: daysFromNow(-1),
    },
  });

  await createRunBlock({
    id: "rb-grace-prep",
    runId: "run-grace",
    block: eoBlockPrep,
    assigneeId: USERS.hafiz,
    status: "ACTIVE",
    startedAt: daysFromNow(-1),
    // analytics: was daysFromNow(2) — anchored to TODAY so the daily view has
    // Pending data for Setia Alam / People (Hafiz): 2nd branch + 2nd department.
    dueAt: todayAt(19),
    items: eoPrepItems,
  });

  // --- Run 6: Onboard: Ken Wong (CANCELLED) ---
  await prisma.flowRun.create({
    data: {
      id: "run-ken",
      flowId: employeeFlow.id,
      flowVersion: employeeFlow.version,
      templateSnapshot: employeeSnapshot,
      name: "Onboard: Ken Wong",
      startedById: USERS.priya,
      triggerType: "MANUAL",
      status: "CANCELLED",
      startedAt: daysFromNow(-5),
    },
  });

  await createRunBlock({
    id: "rb-ken-prep",
    runId: "run-ken",
    block: eoBlockPrep,
    assigneeId: USERS.hafiz,
    status: "SKIPPED",
    startedAt: daysFromNow(-5),
    dueAt: daysFromNow(-2),
    items: eoPrepItems,
  });

  // --- Run 7: VIP Client: Petronas Retail (ACTIVE, STARTED BY THE CEO) ---
  // Role-scoped analytics (brief §Task streams): a CEO-started run whose blocks
  // are assigned to the two HODs — Daniel's shows DONE, Priya's is ACTIVE and
  // anchored to TODAY, so "CEO Assigned tasks" streams and the CEO's delegated
  // view always have daily data.
  await prisma.flowRun.create({
    data: {
      id: "run-vip",
      flowId: clientFlow.id,
      flowVersion: clientFlow.version,
      templateSnapshot: clientSnapshot,
      name: "VIP Client: Petronas Retail",
      startedById: USERS.ceo,
      triggerType: "MANUAL",
      status: "ACTIVE",
      startedAt: daysFromNow(-1),
    },
  });

  await createRunBlock({
    id: "rb-vip-collect",
    runId: "run-vip",
    block: coBlockCollect,
    assigneeId: USERS.daniel,
    status: "DONE",
    startedAt: daysFromNow(-1),
    dueAt: todayAt(12),
    completedAt: hoursFromNow(-4),
    items: coCollectItems,
    fills: {
      "item-co-company": {
        value: { type: "TEXT", text: "Petronas Retail Sdn Bhd" },
        completedAt: hoursFromNow(-4),
        completedBy: USERS.daniel,
      },
      "item-co-email": {
        value: { type: "TEXT", text: "procurement@petronasretail.com.my" },
        completedAt: hoursFromNow(-4),
        completedBy: USERS.daniel,
      },
      "item-co-deal": {
        value: { type: "NUMBER", number: 250_000 },
        completedAt: hoursFromNow(-4),
        completedBy: USERS.daniel,
      },
      "item-co-proposal": {
        value: {
          type: "FILE_UPLOAD",
          fileKey: "seed/petronas/signed-proposal.pdf",
          fileName: "Petronas-Signed-Proposal.pdf",
          size: 734_502,
          contentType: "application/pdf",
        },
        completedAt: hoursFromNow(-4),
        completedBy: USERS.daniel,
      },
      "item-co-kickoff": {
        value: { type: "DUE_DATE", date: daysFromNow(7).toISOString() },
        completedAt: hoursFromNow(-4),
        completedBy: USERS.daniel,
      },
    },
  });

  await createRunBlock({
    id: "rb-vip-contract",
    runId: "run-vip",
    block: coBlockContract,
    assigneeId: USERS.priya,
    status: "ACTIVE",
    startedAt: hoursFromNow(-4),
    dueAt: todayAt(18),
    items: coContractItems,
  });

  // Standard setup SKIPPED for the VIP run (HODs handle VIP setup directly) —
  // gives the analytics N/A bucket data today (Operations dept, Daniel).
  await createRunBlock({
    id: "rb-vip-setup",
    runId: "run-vip",
    block: coBlockSetup,
    assigneeId: USERS.daniel,
    status: "SKIPPED",
    startedAt: hoursFromNow(-4),
    dueAt: todayAt(16),
    items: coSetupItems,
  });

  // Sarah's task in the HOD-started Northstar run — an intern's live
  // "HOD assigned task" for the Staff-site overview (due today).
  await createRunBlock({
    id: "rb-northstar-setup",
    runId: "run-northstar",
    block: coBlockSetup,
    assigneeId: USERS.sarah,
    status: "ACTIVE",
    startedAt: daysFromNow(-1),
    dueAt: todayAt(15),
    items: coSetupItems,
  });

  // --- Run 8: Ad hoc branch check (started by OPS — the "+ Assigned task"
  // quick-form stream). Blocks land on Subang Taipan members, so the Branch
  // site's "Ad hoc tasks" overview has live daily data.
  await prisma.flowRun.create({
    data: {
      id: "run-adhoc-sbt",
      flowId: clientFlow.id,
      flowVersion: clientFlow.version,
      templateSnapshot: clientSnapshot,
      name: "Ad hoc: Subang Taipan Safety Check",
      startedById: USERS.ops,
      triggerType: "MANUAL",
      status: "ACTIVE",
      startedAt: hoursFromNow(-6),
    },
  });

  await createRunBlock({
    id: "rb-adhoc-collect",
    runId: "run-adhoc-sbt",
    block: coBlockCollect,
    assigneeId: USERS.sofia,
    status: "DONE",
    startedAt: hoursFromNow(-6),
    dueAt: todayAt(11),
    completedAt: hoursFromNow(-3),
    items: coCollectItems,
    fills: {
      "item-co-company": {
        value: { type: "TEXT", text: "Subang Taipan branch premises" },
        completedAt: hoursFromNow(-3),
        completedBy: USERS.sofia,
      },
      "item-co-email": {
        value: { type: "TEXT", text: "facilities@ebright.my" },
        completedAt: hoursFromNow(-3),
        completedBy: USERS.sofia,
      },
      "item-co-deal": {
        value: { type: "NUMBER", number: 0 },
        completedAt: hoursFromNow(-3),
        completedBy: USERS.sofia,
      },
      "item-co-proposal": {
        value: {
          type: "FILE_UPLOAD",
          fileKey: "seed/adhoc/safety-checklist.pdf",
          fileName: "Safety-Checklist.pdf",
          size: 120_331,
          contentType: "application/pdf",
        },
        completedAt: hoursFromNow(-3),
        completedBy: USERS.sofia,
      },
      "item-co-kickoff": {
        value: { type: "DUE_DATE", date: todayAt(17).toISOString() },
        completedAt: hoursFromNow(-3),
        completedBy: USERS.sofia,
      },
    },
  });

  await createRunBlock({
    id: "rb-adhoc-contract",
    runId: "run-adhoc-sbt",
    block: coBlockContract,
    assigneeId: USERS.farid,
    status: "ACTIVE",
    startedAt: hoursFromNow(-3),
    dueAt: todayAt(17),
    items: coContractItems,
  });

  // --- Spread runs: one OPS-started ad hoc task per SPREAD staff member,
  //     anchored today (mixed statuses feed every region's drill-downs).
  const adhocSnapshot = (await buildTemplateSnapshot(
    adhocFlow.id
  )) as unknown as Prisma.InputJsonValue;
  for (const s of SPREAD) {
    await prisma.flowRun.create({
      data: {
        id: `run-spread-${s.key}`,
        flowId: adhocFlow.id,
        flowVersion: adhocFlow.version,
        templateSnapshot: adhocSnapshot,
        name: `Ad hoc: Branch Spot Check — ${s.name}`,
        startedById: USERS.ops,
        triggerType: "MANUAL",
        status: "ACTIVE",
        startedAt: daysFromNow(-1),
      },
    });
    await createRunBlock({
      id: `rb-spread-${s.key}`,
      runId: `run-spread-${s.key}`,
      block: adhocBlock,
      assigneeId: `user-${s.key}`,
      status: s.status,
      startedAt: daysFromNow(-1),
      dueAt: todayAt(s.hour),
      completedAt: s.status === "DONE" ? hoursFromNow(-2) : null,
      items: adhocItems,
      fills:
        s.status === "DONE"
          ? {
              "item-adhoc-done": {
                value: { type: "CHECKBOX", checked: true },
                completedAt: hoursFromNow(-2),
                completedBy: `user-${s.key}`,
              },
            }
          : undefined,
    });
  }

  // --- New department/branch staff: one OPS-started task each, using a
  //     varied realistic title pool (not the generic "Ad hoc task" block
  //     title every SPREAD task uses) and a spread of due-date offsets
  //     (not just "today") so overdue/upcoming grouping has real entries.
  const TASK_TITLE_POOL = [
    "Review branch renewal rate dashboard",
    "Twilio WhatsApp confirmation setup",
    "Coordinate FT coach planning with ACD",
    "Restrict MIA claim access",
    "Payroll reconciliation",
    "Branch P&L review",
    "Social media content calendar",
    "Curriculum update review",
    "SOP documentation update",
    "Branch inventory check",
    "Vendor payment approval",
    "Class schedule confirmation",
    "Weekly branch report submission",
    "Parent engagement follow-up",
    "A4 pamphlet design approval",
    "Staff appraisal submission",
    "Petty cash audit",
    "Facility maintenance request",
  ];
  const DUE_OFFSET_DAYS = [-5, -2, 0, 0, 1, 3, 10, -8, 2, 15, -3, 5];
  const NEW_STAFF = [...DEPT_STAFF, ...BRANCH_STAFF];
  for (const [i, s] of NEW_STAFF.entries()) {
    const title = TASK_TITLE_POOL[i % TASK_TITLE_POOL.length];
    const due = daysFromNow(DUE_OFFSET_DAYS[i % DUE_OFFSET_DAYS.length]);
    due.setHours(s.hour, 0, 0, 0);
    await prisma.flowRun.create({
      data: {
        id: `run-staff-${s.key}`,
        flowId: adhocFlow.id,
        flowVersion: adhocFlow.version,
        templateSnapshot: adhocSnapshot,
        name: `${title} — ${s.name}`,
        startedById: USERS.ops,
        triggerType: "MANUAL",
        status: "ACTIVE",
        startedAt: daysFromNow(-1),
      },
    });
    await createRunBlock({
      id: `rb-staff-${s.key}`,
      runId: `run-staff-${s.key}`,
      block: adhocBlock,
      title,
      assigneeId: `user-${s.key}`,
      status: s.status,
      startedAt: daysFromNow(-1),
      dueAt: due,
      completedAt: s.status === "DONE" ? hoursFromNow(-2) : null,
      items: adhocItems,
      fills:
        s.status === "DONE"
          ? {
              "item-adhoc-done": {
                value: { type: "CHECKBOX", checked: true },
                completedAt: hoursFromNow(-2),
                completedBy: `user-${s.key}`,
              },
            }
          : undefined,
    });
  }

  // --- Daniel (HOD) assigns Nurul (OPS) a task, so her "HOD assigned tasks"
  //     stream card (groupByAssignerRole — same mechanism as every other
  //     role's assigner streams) has real content instead of rendering
  //     empty. Which utility flow this uses doesn't matter for that
  //     categorization — it's driven entirely by the run's startedById role.
  await prisma.flowRun.create({
    data: {
      id: "run-hod-to-ops",
      flowId: adhocFlow.id,
      flowVersion: adhocFlow.version,
      templateSnapshot: adhocSnapshot,
      name: "Coordinate FT coach planning with ACD — Nurul Huda",
      startedById: USERS.daniel,
      triggerType: "MANUAL",
      status: "ACTIVE",
      startedAt: daysFromNow(-2),
    },
  });
  await createRunBlock({
    id: "rb-hod-to-ops",
    runId: "run-hod-to-ops",
    block: adhocBlock,
    title: "Coordinate FT coach planning with ACD",
    assigneeId: USERS.ops,
    status: "PENDING",
    startedAt: daysFromNow(-2),
    dueAt: daysFromNow(2),
    items: adhocItems,
  });

  // ----- audit trail -----
  await prisma.auditLog.createMany({
    data: [
      // RUN_STARTED for every run
      {
        runId: "run-acme",
        actorId: USERS.daniel,
        action: "RUN_STARTED",
        detail: { runName: "Acme Sdn Bhd", trigger: "MANUAL" },
        createdAt: daysFromNow(-4),
      },
      {
        runId: "run-techvantage",
        actorId: USERS.sofia,
        action: "RUN_STARTED",
        detail: { runName: "TechVantage", trigger: "MANUAL" },
        createdAt: daysFromNow(-7),
      },
      {
        runId: "run-northstar",
        actorId: USERS.daniel,
        action: "RUN_STARTED",
        detail: { runName: "Northstar Logistics", trigger: "MANUAL" },
        createdAt: daysFromNow(-10),
      },
      {
        runId: "run-deltamarine",
        actorId: USERS.daniel,
        action: "RUN_STARTED",
        detail: { runName: "Delta Marine", trigger: "MANUAL" },
        createdAt: daysFromNow(-8),
      },
      {
        runId: "run-vip",
        actorId: USERS.ceo,
        action: "RUN_STARTED",
        detail: { runName: "VIP Client: Petronas Retail", trigger: "MANUAL" },
        createdAt: daysFromNow(-1),
      },
      {
        runId: "run-grace",
        actorId: USERS.priya,
        action: "RUN_STARTED",
        detail: { runName: "Onboard: Grace Foo", trigger: "FORM_SUBMIT" },
        createdAt: daysFromNow(-1),
      },
      {
        runId: "run-ken",
        actorId: USERS.priya,
        action: "RUN_STARTED",
        detail: { runName: "Onboard: Ken Wong", trigger: "MANUAL" },
        createdAt: daysFromNow(-5),
      },
      // ITEM_COMPLETED samples
      {
        runId: "run-acme",
        runBlockId: "rb-acme-collect",
        actorId: USERS.sofia,
        action: "ITEM_COMPLETED",
        detail: { itemId: "item-co-company", label: "Company name" },
        createdAt: daysFromNow(-3),
      },
      {
        runId: "run-acme",
        runBlockId: "rb-acme-contract",
        actorId: USERS.marcus,
        action: "ITEM_COMPLETED",
        detail: { itemId: "item-co-send", label: "Send contract to client" },
        createdAt: daysFromNow(-1),
      },
      {
        runId: "run-deltamarine",
        runBlockId: "rb-dm-contract",
        actorId: USERS.daniel,
        action: "ITEM_COMPLETED",
        detail: {
          itemId: "item-co-hod",
          label: "HOD sign-off",
          decision: "approved",
        },
        createdAt: daysFromNow(-4),
      },
      {
        runId: "run-deltamarine",
        runBlockId: "rb-dm-setup",
        actorId: USERS.hafiz,
        action: "ITEM_COMPLETED",
        detail: { itemId: "item-co-kit", label: "Prepare welcome kit" },
        createdAt: daysFromNow(-1),
      },
      // reminder / escalation trail (mirrors the NotificationLog rows)
      {
        runId: "run-techvantage",
        runBlockId: "rb-tv-contract",
        actorId: "system",
        action: "REMINDER_SENT",
        detail: { strike: 1, sentTo: USERS.marcus, jobId: "seed-r1" },
        createdAt: daysFromNow(-1),
      },
      {
        runId: "run-techvantage",
        runBlockId: "rb-tv-contract",
        actorId: "system",
        action: "REMINDER_SENT",
        detail: { strike: 2, sentTo: USERS.marcus, jobId: "seed-r2" },
        createdAt: hoursFromNow(-4),
      },
      {
        runId: "run-northstar",
        runBlockId: "rb-ns-contract",
        actorId: "system",
        action: "BLOCK_ESCALATED",
        detail: {
          strike: 3,
          escalatedTo: USERS.daniel,
          jobId: "seed-esc-1",
        },
        createdAt: daysFromNow(-2),
      },
      // run terminal events
      {
        runId: "run-deltamarine",
        actorId: USERS.marcus,
        action: "RUN_COMPLETED",
        detail: { runName: "Delta Marine" },
        createdAt: daysFromNow(-1),
      },
      {
        runId: "run-ken",
        actorId: USERS.priya,
        action: "RUN_CANCELLED",
        detail: { runName: "Onboard: Ken Wong", reason: "Candidate withdrew" },
        createdAt: daysFromNow(-4),
      },
    ],
  });

  // ----- 7. saved views (for the admin) -----
  await prisma.savedView.createMany({
    data: [
      {
        id: "view-my-overdue",
        userId: USERS.admin,
        name: "My overdue",
        viewType: "TABLE",
        filters: {
          blockStatus: ["OVERDUE", "ESCALATED"],
          overdueOnly: true,
        },
        sortBy: "dueAt",
        isDefault: false,
      },
      {
        id: "view-team-board",
        userId: USERS.admin,
        name: "Team board",
        viewType: "BOARD",
        filters: {},
        isDefault: true,
      },
    ],
  });

  // ----- summary -----
  const [
    users,
    workspaces,
    flows,
    blocks,
    blockItems,
    decisions,
    triggers,
    docs,
    runs,
    runBlocks,
    runItems,
    notifications,
    audits,
    views,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.workspace.count(),
    prisma.flow.count(),
    prisma.block.count(),
    prisma.blockItem.count(),
    prisma.decisionNode.count(),
    prisma.flowTrigger.count(),
    prisma.flowDoc.count(),
    prisma.flowRun.count(),
    prisma.runBlock.count(),
    prisma.runItem.count(),
    prisma.notificationLog.count(),
    prisma.auditLog.count(),
    prisma.savedView.count(),
  ]);

  console.log("Seed complete:");
  console.log(`  users:            ${users}`);
  console.log(`  workspaces:       ${workspaces}`);
  console.log(`  flows:            ${flows}`);
  console.log(`  blocks:           ${blocks}`);
  console.log(`  block items:      ${blockItems}`);
  console.log(`  decision nodes:   ${decisions}`);
  console.log(`  triggers:         ${triggers}`);
  console.log(`  flow docs:        ${docs}`);
  console.log(`  runs:             ${runs}`);
  console.log(`  run blocks:       ${runBlocks}`);
  console.log(`  run items:        ${runItems}`);
  console.log(`  notifications:    ${notifications}`);
  console.log(`  audit log rows:   ${audits}`);
  console.log(`  saved views:      ${views}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
