// ─────────────────────────────────────────────────────────────
// Hotfix log — parsing `git log` output into commits.
//
// The sync script pipes git's output in rather than calling the GitHub API:
// the production server already has the full history on disk after the deploy
// script's `git reset --hard origin/main`, so there is no token to store, no
// rate limit to respect, and nothing to fail when GitHub is unreachable.
//
// Pure string handling, so the awkward parts (multi-line bodies, commit
// subjects containing the delimiter, empty file lists) are testable — see
// gitlog.test.ts.
// ─────────────────────────────────────────────────────────────

import type { Commit } from "./derive";

/**
 * ASCII record/unit separators. Chosen over the usual `|` or `---` because a
 * commit subject can legitimately contain any printable character, and these
 * two cannot appear in one.
 */
export const RECORD_SEP = "\x1e";
export const FIELD_SEP = "\x1f";

/**
 * The exact format string the sync passes to git, for the local/backfill path
 * where this script runs git itself.
 *
 *   git log --no-merges --name-only <GIT_LOG_FORMAT> -n 500 <ref>
 *
 * The deploy path cannot share this constant — git runs on the HOST there and
 * the parser runs inside the container — so .github/workflows/deploy.yml
 * spells the same format as "%x1e%H%x1f%ad%x1f%an%x1f%s%x1f%b%x1f", which is
 * byte-identical. Change one and you must change the other.
 */
export const GIT_LOG_FORMAT =
  `--format=${RECORD_SEP}%H${FIELD_SEP}%ad${FIELD_SEP}%an${FIELD_SEP}%s${FIELD_SEP}%b${FIELD_SEP}`;

export const GIT_LOG_ARGS = [
  "log",
  "--no-merges",
  "--date=short",
  "--name-only",
  GIT_LOG_FORMAT,
];

/**
 * Parse the output of the command above.
 *
 * Layout per record:
 *   <RS>sha<US>date<US>author<US>subject<US>body<US>\n
 *   path/one\n
 *   path/two\n
 *
 * Splitting on the field separator is safe because git emits exactly five of
 * them per record, so anything after the fifth is the file list — a subject or
 * body containing the separator is impossible rather than merely unlikely.
 */
export function parseGitLog(raw: string): Commit[] {
  const commits: Commit[] = [];

  for (const record of raw.split(RECORD_SEP)) {
    if (!record.trim()) continue;

    const parts = record.split(FIELD_SEP);
    if (parts.length < 6) continue; // truncated output — skip rather than guess

    const [sha, date, author, subject, body] = parts;
    const files = parts
      .slice(5)
      .join(FIELD_SEP)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (!/^[0-9a-f]{7,40}$/i.test(sha.trim())) continue;

    commits.push({
      sha: sha.trim(),
      date: date.trim(),
      author: author.trim(),
      subject: subject.trim(),
      body: body.trim(),
      files,
    });
  }

  return commits;
}
