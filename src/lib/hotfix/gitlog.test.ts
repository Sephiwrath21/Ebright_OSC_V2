import { describe, expect, it } from "vitest";
import { FIELD_SEP, RECORD_SEP, parseGitLog } from "./gitlog";

/** Build a record exactly as `git log` emits it, so the tests exercise the real shape. */
function record(
  sha: string,
  date: string,
  author: string,
  subject: string,
  body: string,
  files: string[],
): string {
  const head = [sha, date, author, subject, body].join(FIELD_SEP);
  return `${RECORD_SEP}${head}${FIELD_SEP}\n${files.join("\n")}\n`;
}

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

describe("parseGitLog", () => {
  it("parses a single commit with its file list", () => {
    const raw = record(SHA_A, "2026-09-15", "Someone", "fix(claim): x", "", [
      "src/app/claim/page.tsx",
      "src/lib/claim.ts",
    ]);
    expect(parseGitLog(raw)).toEqual([
      {
        sha: SHA_A,
        date: "2026-09-15",
        author: "Someone",
        subject: "fix(claim): x",
        body: "",
        files: ["src/app/claim/page.tsx", "src/lib/claim.ts"],
      },
    ]);
  });

  it("parses several commits in order", () => {
    const raw =
      record(SHA_A, "2026-09-15", "A", "first", "", ["a.ts"]) +
      record(SHA_B, "2026-09-14", "B", "second", "", ["b.ts"]);
    const out = parseGitLog(raw);
    expect(out.map((c) => c.sha)).toEqual([SHA_A, SHA_B]);
    expect(out.map((c) => c.subject)).toEqual(["first", "second"]);
  });

  it("keeps a multi-line body intact", () => {
    const body = "Why this happened.\n\nAnd what changed as a result.";
    const out = parseGitLog(record(SHA_A, "2026-09-15", "A", "subject", body, ["a.ts"]));
    expect(out[0].body).toBe(body);
    expect(out[0].files).toEqual(["a.ts"]);
  });

  it("handles a commit that changed no files", () => {
    const out = parseGitLog(record(SHA_A, "2026-09-15", "A", "empty commit", "", []));
    expect(out).toHaveLength(1);
    expect(out[0].files).toEqual([]);
  });

  it("survives a subject containing a colon, quotes and slashes", () => {
    const subject = 'fix: don\'t break "a/b" paths: really';
    const out = parseGitLog(record(SHA_A, "2026-09-15", "A", subject, "", ["a.ts"]));
    expect(out[0].subject).toBe(subject);
  });

  it("returns nothing for empty input", () => {
    expect(parseGitLog("")).toEqual([]);
    expect(parseGitLog("\n  \n")).toEqual([]);
  });

  it("skips a truncated trailing record rather than guessing", () => {
    const good = record(SHA_A, "2026-09-15", "A", "fine", "", ["a.ts"]);
    const truncated = `${RECORD_SEP}${SHA_B}${FIELD_SEP}2026-09-14`;
    const out = parseGitLog(good + truncated);
    expect(out).toHaveLength(1);
    expect(out[0].sha).toBe(SHA_A);
  });

  it("skips a record whose first field is not a sha", () => {
    const bogus = `${RECORD_SEP}not-a-sha${FIELD_SEP}d${FIELD_SEP}a${FIELD_SEP}s${FIELD_SEP}b${FIELD_SEP}\n`;
    expect(parseGitLog(bogus)).toEqual([]);
  });
});
