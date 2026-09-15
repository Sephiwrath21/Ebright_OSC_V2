import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT,
  GENERAL,
  TAGS,
  TAG_BADGE,
  TAG_LABEL,
  type Commit,
  deriveCategory,
  deriveEntries,
  deriveEntry,
  deriveTag,
  deriveTitle,
  isRevert,
  parseConventional,
  shouldSkip,
} from "./derive";

function commit(over: Partial<Commit> = {}): Commit {
  return {
    sha: "a".repeat(40),
    date: "2026-09-15",
    author: "Someone",
    subject: "Do a thing",
    body: "",
    files: [],
    ...over,
  };
}

describe("parseConventional", () => {
  it("splits type, scope and subject", () => {
    expect(parseConventional("fix(task-manager): wire completion controls")).toEqual({
      type: "fix",
      scope: "task-manager",
      subject: "wire completion controls",
    });
  });

  it("handles a missing scope", () => {
    expect(parseConventional("feat: add a thing")?.scope).toBeNull();
  });

  it("handles a breaking-change marker", () => {
    expect(parseConventional("feat(api)!: drop v1")?.subject).toBe("drop v1");
  });

  it("is not fooled by ordinary prose containing a colon", () => {
    // "Emp_Folder- fix probation" and "Note: something" are not conventional.
    expect(parseConventional("Note: remember to redeploy")).toBeNull();
    expect(parseConventional("Emp_Folder- fix probation")).toBeNull();
  });
});

describe("deriveTag", () => {
  it("maps conventional types", () => {
    expect(deriveTag("feat(audit): site-wide audit log")).toBe("ADDED");
    expect(deriveTag("fix(task-manager): donut drill-down")).toBe("FIXED");
    expect(deriveTag("refactor(theme): tidy tokens")).toBe("UPDATED");
    expect(deriveTag("ci: allowlist health check")).toBe("UPDATED");
  });

  // Real subjects from this repo's history, which is ~half non-conventional.
  it("falls back to the leading verb", () => {
    expect(deriveTag("Add role-based access control for Employee Record")).toBe("ADDED");
    expect(deriveTag("Fix HR write-guard gap, add HOD/BM view-only")).toBe("FIXED");
    expect(deriveTag("Stop Daily tasks from moving to Overdue")).toBe("FIXED");
    expect(deriveTag("Prevent a double submit")).toBe("FIXED");
  });

  it("uses UPDATED for a verb it does not recognise", () => {
    expect(deriveTag("Migrate Drive folder resolution to single-root layout")).toBe("UPDATED");
    expect(deriveTag("Hand CNS leads to the ebrightsms enrollment queue")).toBe("UPDATED");
  });

  it("only ever returns a declared tag", () => {
    for (const subject of [
      "feat: x",
      "Whatever happened here",
      "",
      "...",
      "fix: y",
    ]) {
      expect(TAGS).toContain(deriveTag(subject));
    }
  });
});

describe("deriveCategory", () => {
  it("reads the area from changed paths", () => {
    expect(deriveCategory(["src/app/claim/page.tsx"], "x")).toBe("Claims");
    expect(deriveCategory(["src/task-manager/engine/run.ts"], "x")).toBe("Task Manager");
    expect(deriveCategory(["src/lib/crm/audit.ts"], "x")).toBe("CNS");
    expect(deriveCategory(["src/lib/audit/extension.ts"], "x")).toBe("Audit Log");
  });

  it("prefers the feature area over infrastructure when both changed", () => {
    // The ordering of CATEGORY_RULES is what this is really asserting.
    expect(deriveCategory(["prisma/schema.prisma", "src/app/claim/page.tsx"], "x")).toBe("Claims");
    expect(deriveCategory([".github/workflows/deploy.yml", "src/app/claim/page.tsx"], "x")).toBe(
      "Claims",
    );
  });

  it("files build and CI work under Deployment", () => {
    expect(deriveCategory([".github/workflows/deploy.yml"], "x")).toBe(DEPLOYMENT);
    expect(deriveCategory(["Dockerfile"], "x")).toBe(DEPLOYMENT);
  });

  it("falls back to the conventional scope when no path matches", () => {
    expect(deriveCategory([], "feat(task-manager): x")).toBe("Task Manager");
    expect(deriveCategory(["README.md"], "feat(reporting): x")).toBe("Reporting");
  });

  it("canonicalises a scope onto the name the path rules use", () => {
    // Otherwise the same area shows up twice under different headings,
    // depending on which files a given commit happened to touch.
    expect(deriveCategory([], "fix(profile): x")).toBe(
      deriveCategory(["src/app/profile/page.tsx"], "x"),
    );
    expect(deriveCategory([], "fix(crm): x")).toBe(deriveCategory(["src/lib/crm/db.ts"], "x"));
    expect(deriveCategory([], "fix(deploy): x")).toBe(DEPLOYMENT);
    expect(deriveCategory([], "fix(mailer): x")).toBe("Email");
  });

  it("marks scope-derived deploy work as noise too", () => {
    expect(deriveEntry(commit({ subject: "feat(deploy): deliver the Resend key" })).hidden).toBe(
      true,
    );
  });

  it("falls back to General with neither path nor scope", () => {
    expect(deriveCategory([], "Something happened")).toBe(GENERAL);
    expect(deriveCategory(["README.md"], "Something happened")).toBe(GENERAL);
  });
});

describe("deriveTitle", () => {
  it("strips the conventional prefix and capitalises", () => {
    expect(deriveTitle("fix(task-manager): wire completion controls")).toBe(
      "Wire completion controls",
    );
  });

  it("leaves a plain subject alone", () => {
    expect(deriveTitle("Stop Daily tasks from moving to Overdue")).toBe(
      "Stop Daily tasks from moving to Overdue",
    );
  });

  it("does not lowercase an already-capitalised word", () => {
    expect(deriveTitle("feat: CNS leads now sync nightly")).toBe("CNS leads now sync nightly");
  });
});

describe("shouldSkip", () => {
  it("skips reverts", () => {
    expect(isRevert('Revert "feat(deploy): deliver Resend credentials"')).toBe(true);
    expect(shouldSkip(commit({ subject: 'Revert "feat: x"' }))).toBe(true);
  });

  it("skips merge commits", () => {
    expect(shouldSkip(commit({ subject: "Merge pull request #133 from EbrightOD/ci" }))).toBe(true);
    expect(shouldSkip(commit({ subject: "Merge remote-tracking branch 'upstream/staging'" }))).toBe(
      true,
    );
  });

  it("skips an empty subject", () => {
    expect(shouldSkip(commit({ subject: "   " }))).toBe(true);
  });

  it("keeps ordinary commits", () => {
    expect(shouldSkip(commit({ subject: "Fix the thing" }))).toBe(false);
    // "Reverted the cache" is prose, not a revert commit.
    expect(shouldSkip(commit({ subject: "Reverted cache behaviour is now documented" }))).toBe(
      false,
    );
  });
});

describe("deriveEntry", () => {
  it("builds a complete entry", () => {
    const entry = deriveEntry(
      commit({
        sha: "b".repeat(40),
        date: "2026-09-12",
        author: "Sephiwrath21",
        subject: "fix(claim): department heads could not see team claims",
        body: "team scope resolved to no rows for department actors.",
        files: ["src/app/claim/page.tsx"],
      }),
    );
    expect(entry).toMatchObject({
      commitSha: "b".repeat(40),
      shippedOn: "2026-09-12",
      category: "Claims",
      tag: "FIXED",
      title: "Department heads could not see team claims",
      authorName: "Sephiwrath21",
      hidden: false,
    });
  });

  it("imports CI and deploy work hidden", () => {
    expect(deriveEntry(commit({ files: [".github/workflows/deploy.yml"] })).hidden).toBe(true);
    expect(deriveEntry(commit({ subject: "chore: bump deps" })).hidden).toBe(true);
    expect(deriveEntry(commit({ subject: "ci: fix health check" })).hidden).toBe(true);
  });

  it("does not hide ordinary product work", () => {
    expect(
      deriveEntry(commit({ subject: "feat(claim): x", files: ["src/app/claim/page.tsx"] })).hidden,
    ).toBe(false);
  });

  it("truncates an overlong subject to the column width", () => {
    const entry = deriveEntry(commit({ subject: "A".repeat(400) }));
    expect(entry.title.length).toBe(300);
  });
});

describe("deriveEntries", () => {
  it("drops skipped commits and keeps the rest", () => {
    const entries = deriveEntries([
      commit({ sha: "1".repeat(40), subject: "Merge pull request #1 from x/y" }),
      commit({ sha: "2".repeat(40), subject: 'Revert "feat: x"' }),
      commit({ sha: "3".repeat(40), subject: "feat(claim): real change" }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].commitSha).toBe("3".repeat(40));
  });
});

describe("tag presentation", () => {
  it("has a label and a two-theme badge for every tag", () => {
    for (const tag of TAGS) {
      expect(TAG_LABEL[tag]).toBeTruthy();
      expect(TAG_BADGE[tag]).toContain("dark:");
    }
  });
});
