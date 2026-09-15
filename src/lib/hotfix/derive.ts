// ─────────────────────────────────────────────────────────────
// Hotfix log — turning a git commit into a changelog entry.
//
// Everything here is a pure function over strings (see derive.test.ts). The
// sync script supplies commits; this decides what the entry says.
//
// Two things have to be *derived* rather than read, because the history does
// not carry them reliably:
//
//   Tag       — only about half of commits use conventional-commit types, so
//               there is a leading-verb fallback for the rest.
//   Category  — commit scopes are missing even more often, and when present
//               they only cover a couple of areas (task-manager, theme). The
//               changed file paths are on every commit, so paths win.
//
// Both will misfile the occasional commit. That is what the curation layer
// (title_override / hidden) is for — it is not meant to be perfect.
// ─────────────────────────────────────────────────────────────

export const TAGS = ["ADDED", "FIXED", "UPDATED"] as const;
export type Tag = (typeof TAGS)[number];

export const TAG_LABEL: Record<Tag, string> = {
  ADDED: "Added",
  FIXED: "Fixed",
  UPDATED: "Updated",
};

export const TAG_BADGE: Record<Tag, string> = {
  ADDED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
  FIXED: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
  UPDATED: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300",
};

export const GENERAL = "General";
/** Build/CI/infrastructure work — imported hidden, since it is not a product change. */
export const DEPLOYMENT = "Deployment";

// ─── Conventional commits ─────────────────────────────────────────────────────

// [\s\S] rather than `.` with the /s flag: tsconfig targets below ES2018,
// where that flag is a compile error. Same meaning.
const CONVENTIONAL = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*([\s\S]+)$/;

const TYPE_TAG: Record<string, Tag> = {
  feat: "ADDED",
  feature: "ADDED",
  fix: "FIXED",
  hotfix: "FIXED",
  bugfix: "FIXED",
  perf: "UPDATED",
  refactor: "UPDATED",
  style: "UPDATED",
  chore: "UPDATED",
  docs: "UPDATED",
  build: "UPDATED",
  ci: "UPDATED",
  test: "UPDATED",
  revert: "UPDATED",
};

/** Conventional types that are housekeeping rather than product change. */
const NOISY_TYPES = new Set(["ci", "chore", "build", "test", "style"]);

type Conventional = { type: string; scope: string | null; subject: string };

export function parseConventional(subject: string): Conventional | null {
  const m = CONVENTIONAL.exec(subject.trim());
  if (!m) return null;
  const [, type, scope, , rest] = m;
  // "Revert: something" or "Note: x" are English, not conventional types.
  if (!(type.toLowerCase() in TYPE_TAG)) return null;
  return { type: type.toLowerCase(), scope: scope?.trim() || null, subject: rest.trim() };
}

// ─── Tag ──────────────────────────────────────────────────────────────────────

/**
 * Leading verbs, for the ~half of commits with no conventional type.
 * Deliberately explicit: a verb not listed falls through to UPDATED, which is
 * the honest answer for "something about this changed".
 */
const VERB_TAG: Record<string, Tag> = {
  add: "ADDED",
  added: "ADDED",
  create: "ADDED",
  introduce: "ADDED",
  implement: "ADDED",
  enable: "ADDED",
  support: "ADDED",
  wire: "ADDED",

  fix: "FIXED",
  fixed: "FIXED",
  correct: "FIXED",
  repair: "FIXED",
  resolve: "FIXED",
  patch: "FIXED",
  prevent: "FIXED",
  stop: "FIXED",
  unbreak: "FIXED",
  restore: "FIXED",
  guard: "FIXED",
  handle: "FIXED",
  avoid: "FIXED",
};

export function deriveTag(subject: string): Tag {
  const conventional = parseConventional(subject);
  if (conventional) return TYPE_TAG[conventional.type];

  const firstWord = subject.trim().split(/[\s,:;]+/)[0]?.toLowerCase() ?? "";
  return VERB_TAG[firstWord] ?? "UPDATED";
}

// ─── Category ─────────────────────────────────────────────────────────────────

/**
 * Path → portal area, in priority order: the FIRST rule matching ANY changed
 * file wins. Order matters — a commit touching both src/app/claim and
 * prisma/schema.prisma is a Claims change, not a Database change, so the
 * feature areas are listed before the infrastructure ones.
 */
const CATEGORY_RULES: { category: string; pattern: RegExp }[] = [
  { category: "Task Manager", pattern: /^(src\/task-manager\/|src\/app\/task-manager\/|prisma\/task-manager\/)/ },
  { category: "CNS", pattern: /^(src\/app\/crm\/|src\/lib\/crm\/|src\/app\/api\/crm\/|prisma\/crm\/)/ },
  { category: "Claims", pattern: /^(src\/app\/claim\/|src\/app\/api\/claim|src\/lib\/access\/claimScope)/ },
  { category: "Attendance", pattern: /^(src\/app\/attendance\/|src\/app\/api\/attendance|src\/lib\/(self-)?attendance|src\/lib\/sync-attendance|src\/lib\/scan(ner)?-)/ },
  { category: "Manpower", pattern: /^(src\/app\/manpower-|src\/app\/api\/manpower|src\/lib\/manpower)/ },
  { category: "Employee Folder", pattern: /^(src\/app\/employee-folder\/|src\/app\/employee-record\/|src\/lib\/employee)/ },
  { category: "Offboarding", pattern: /^(src\/app\/dashboards\/offboarding\/|src\/lib\/offboarding\/)/ },
  { category: "HR", pattern: /^(src\/app\/induction\/|src\/app\/hr-dashboard\/|src\/lib\/(induction|hr-dashboard|probation))/ },
  { category: "Access Management", pattern: /^(src\/app\/access-management\/|src\/lib\/access\/)/ },
  { category: "Audit Log", pattern: /^(src\/app\/audit-log\/|src\/lib\/audit\/|src\/app\/api\/audit-log\/)/ },
  { category: "Hotfix Log", pattern: /^(src\/app\/hotfix-log\/|src\/lib\/hotfix\/|src\/app\/api\/hotfix-log\/|scripts\/sync-changelog)/ },
  { category: "FA System", pattern: /^(src\/app\/fa-system\/|src\/app\/dashboards\/fa\/|src\/lib\/fa\/|src\/app\/api\/fa\/)/ },
  { category: "PCM System", pattern: /^(src\/app\/dashboards\/pcm\/|src\/lib\/pcm\/|src\/app\/api\/pcm\/)/ },
  { category: "SMS", pattern: /^(src\/app\/dashboards\/sms\/|src\/lib\/sms|src\/app\/api\/sms)/ },
  { category: "Flowghan", pattern: /^(src\/app\/flowghan\/|apps\/doomtracker\/)/ },
  { category: "ClickUp Task", pattern: /^(src\/app\/clickup-task\/|src\/lib\/clickup|src\/app\/api\/clickup)/ },
  { category: "Sign-in", pattern: /^(src\/app\/(login|login-v2|register|forgot-password|reset-password)\/|src\/auth\.ts|src\/lib\/password-policy)/ },
  { category: "Account", pattern: /^(src\/app\/profile\/|src\/app\/account-management\/)/ },
  { category: "Leave", pattern: /^(src\/app\/api\/leave|src\/lib\/leave)/ },
  { category: "Home", pattern: /^(src\/app\/home\/|src\/app\/dashboards\/hrms\/)/ },
  { category: DEPLOYMENT, pattern: /^(\.github\/|Dockerfile|docker-compose|\.dockerignore|scripts\/.*deploy)/ },
  { category: "Database", pattern: /^(prisma\/)/ },
];

/**
 * Conventional scopes seen in this history, mapped onto the same category
 * names the path rules produce. Without this the two routes disagree — a
 * `fix(profile):` commit that touched no matching path files under "Profile"
 * while a path-matched one files under "Account", and the changelog shows the
 * same area twice under different headings.
 */
const SCOPE_CATEGORY: Record<string, string> = {
  profile: "Account",
  account: "Account",
  auth: "Sign-in",
  deploy: DEPLOYMENT,
  ci: DEPLOYMENT,
  docker: DEPLOYMENT,
  mailer: "Email",
  mail: "Email",
  "task-manager": "Task Manager",
  crm: "CNS",
  claim: "Claims",
  attendance: "Attendance",
  audit: "Audit Log",
  hotfix: "Hotfix Log",
  "sms-staff-sync": "SMS",
  sms: "SMS",
  theme: "Appearance",
  flowghan: "Flowghan",
  debug: DEPLOYMENT,
};

export function deriveCategory(files: string[], subject: string): string {
  for (const rule of CATEGORY_RULES) {
    if (files.some((f) => rule.pattern.test(f))) return rule.category;
  }

  // No path matched (or no file list) — fall back to the conventional scope,
  // which at least names the area the author had in mind.
  const scope = parseConventional(subject)?.scope;
  if (!scope) return GENERAL;

  const canonical = SCOPE_CATEGORY[scope.toLowerCase()];
  if (canonical) return canonical;

  return scope
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Title ────────────────────────────────────────────────────────────────────

export function deriveTitle(subject: string): string {
  const conventional = parseConventional(subject);
  const raw = (conventional?.subject ?? subject).trim();
  if (!raw) return subject.trim();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ─── Whole-commit decisions ───────────────────────────────────────────────────

export type Commit = {
  sha: string;
  /** YYYY-MM-DD */
  date: string;
  author: string;
  subject: string;
  body: string;
  files: string[];
};

export type DerivedEntry = {
  commitSha: string;
  shippedOn: string;
  category: string;
  tag: Tag;
  title: string;
  details: string;
  authorName: string;
  /** Imported hidden — housekeeping, not a product change. */
  hidden: boolean;
};

/** A revert is noise in a changelog: the thing it undid should not be listed either. */
export function isRevert(subject: string): boolean {
  return /^revert[\s:"']/i.test(subject.trim());
}

export function shouldSkip(commit: Commit): boolean {
  const subject = commit.subject.trim();
  if (!subject) return true;
  if (isRevert(subject)) return true;
  // Merge commits are excluded by `git log --no-merges`; this is belt and braces
  // for a hand-run backfill that forgets the flag.
  if (/^Merge (pull request|branch|remote-tracking)/i.test(subject)) return true;
  return false;
}

/** Housekeeping that should not clutter the default view. */
function isNoise(commit: Commit, category: string): boolean {
  if (category === DEPLOYMENT) return true;
  const type = parseConventional(commit.subject)?.type;
  return type ? NOISY_TYPES.has(type) : false;
}

const TITLE_MAX = 300;

export function deriveEntry(commit: Commit): DerivedEntry {
  const category = deriveCategory(commit.files, commit.subject);
  return {
    commitSha: commit.sha,
    shippedOn: commit.date,
    category,
    tag: deriveTag(commit.subject),
    title: deriveTitle(commit.subject).slice(0, TITLE_MAX),
    details: commit.body.trim(),
    authorName: commit.author,
    hidden: isNoise(commit, category),
  };
}

export function deriveEntries(commits: Commit[]): DerivedEntry[] {
  return commits.filter((c) => !shouldSkip(c)).map(deriveEntry);
}
