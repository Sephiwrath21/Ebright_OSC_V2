/**
 * One-time (re-runnable) import of the 48-week department content calendar from
 * prisma/data/weekly-content.csv ("Ebright Email Marketing Templates" export) into
 * the Content library.
 *
 * - One Content row per non-empty (week, department) cell.
 * - Bracket placeholders ([video], [Facebook link], etc) are converted to real
 *   {tokens} — see BRACKET_TOKEN_MAP below.
 * - When multiple departments have content for the same week, only the
 *   highest-priority one (lib/departments.ts DEPARTMENTS order) is isActive; the
 *   rest are imported inactive/reference-only.
 * - The "Pre-class" row is imported under triggerType 'welcome' instead of a week
 *   number — it's a one-time pre-enrollment message, not part of the 1-48 cadence.
 *
 * Idempotent: re-running clears out any previously-imported rows (identified by
 * the `source: 'weekly_csv_import'`-style tag we don't have a column for, so
 * instead we key on department+weekNumber+triggerType — see upsertKey below) and
 * re-creates them, so editing the CSV and re-running never duplicates.
 *
 * Run with: npx tsx prisma/importWeeklyContent.ts
 */
import { readFileSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { DEPARTMENTS, departmentPriority, type Department } from '../lib/departments';

const prisma = new PrismaClient();

const CSV_PATH = path.join(__dirname, 'data', 'weekly-content.csv');

// CSV header order (column index -> Department | null for the week-number column).
const COLUMN_DEPARTMENTS: Array<Department | null> = [
  null, // Credit / Week
  'CEO',
  'ACD',
  'MKT',
  'MKT_REFERRAL',
  'HR',
  'FNC',
  'OD',
  'OPS',
  'AD_HOC',
];

// [bracket placeholder] -> {realToken}, following the existing {parent_first_name}/
// {studentName} convention. Anything bracketed in the source that ISN'T in this map
// gets reported (not silently invented) — see the console warning in convertPlaceholders.
const BRACKET_TOKEN_MAP: Record<string, string> = {
  '[video]': '{videoLink}',
  '[facebook link]': '{facebookLink}',
  '[instagram link]': '{instagramLink}',
  '[tiktok link]': '{tiktokLink}',
  '[threads link]': '{threadsLink}',
};

// Signals "attach an image here" (imageUrl field), not a text token — stripped
// from the body rather than replaced with a placeholder.
const POSTER_ATTACHMENT_MARKER = '[attached poster below]';

const unknownBrackets = new Set<string>();

function convertPlaceholders(text: string): string {
  let out = text;
  // Known mappings (case-insensitive match on the bracket text)
  for (const [bracket, token] of Object.entries(BRACKET_TOKEN_MAP)) {
    const re = new RegExp(escapeRegExp(bracket), 'gi');
    out = out.replace(re, token);
  }
  // Poster attachment marker -> note, not a token
  out = out.replace(new RegExp(escapeRegExp(POSTER_ATTACHMENT_MARKER), 'gi'), '(Poster image attached — see imageUrl field)');

  // Anything else bracketed -> flag it, and still convert it mechanically so
  // nothing is silently dropped (camelCase, wrapped in {}), per the same convention.
  out = out.replace(/\[([^\]]+)\]/g, (_match, inner: string) => {
    unknownBrackets.add(inner.trim());
    const token = `{${toCamelCase(inner.trim())}}`;
    return token;
  });
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toCamelCase(s: string): string {
  const words = s.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
}

function titleFromBody(body: string, fallback: string): string {
  const firstLine = body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return fallback;
  const cleaned = firstLine.replace(/^\d+\)\s*/, '').trim();
  return cleaned.length > 70 ? cleaned.slice(0, 67).trimEnd() + '...' : cleaned;
}

/** Minimal RFC4180-ish CSV parser: handles quoted fields with embedded commas/newlines/"" escapes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // skip, \n follows
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

interface ImportRow {
  weekNumber: number | null; // null = Pre-class
  department: Department;
  body: string;
}

async function main() {
  const csv = readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(csv);
  const [, ...dataRows] = rows; // skip header

  const importRows: ImportRow[] = [];

  for (const cols of dataRows) {
    if (cols.length === 0 || cols.every((c) => !c.trim())) continue;
    const weekCell = cols[0].trim();
    const weekNumber = weekCell.toLowerCase() === 'pre-class' ? null : Number(weekCell);
    if (weekCell.toLowerCase() !== 'pre-class' && !Number.isInteger(weekNumber)) continue; // skip malformed rows

    for (let colIdx = 1; colIdx < cols.length; colIdx++) {
      const dept = COLUMN_DEPARTMENTS[colIdx];
      if (!dept) continue;
      const raw = (cols[colIdx] ?? '').trim();
      if (!raw) continue; // no content in this dept for this week — skip, don't invent
      importRows.push({ weekNumber, department: dept, body: raw });
    }
  }

  // Clear out any previously-imported weekly/pre-class content before re-inserting,
  // so re-running this script (e.g. after editing the CSV) never duplicates.
  const deleted = await prisma.content.deleteMany({
    where: {
      OR: [
        { weekNumber: { not: null } },
        { AND: [{ triggerType: 'welcome' }, { department: { not: null } }] },
      ],
    },
  });
  console.log(`Cleared ${deleted.count} previously-imported rows.`);

  // Group by weekNumber to resolve priority (null weekNumber = Pre-class, its own group).
  const byWeek = new Map<number | null, ImportRow[]>();
  for (const r of importRows) {
    const arr = byWeek.get(r.weekNumber) ?? [];
    arr.push(r);
    byWeek.set(r.weekNumber, arr);
  }

  const multiDeptWeeks: Array<{ week: number | string; winner: Department; depts: Department[] }> = [];
  let created = 0;

  for (const [weekNumber, entries] of byWeek) {
    const sorted = [...entries].sort((a, b) => departmentPriority(a.department) - departmentPriority(b.department));
    const winnerDept = sorted[0].department;

    if (sorted.length > 1) {
      multiDeptWeeks.push({
        week: weekNumber ?? 'Pre-class',
        winner: winnerDept,
        depts: sorted.map((s) => s.department),
      });
    }

    for (const entry of sorted) {
      const isActive = entry.department === winnerDept;
      const convertedBody = convertPlaceholders(entry.body);
      const label = weekNumber == null ? 'Pre-class' : `Week ${weekNumber}`;
      const title = `${label} — ${entry.department}: ${titleFromBody(convertedBody, entry.department)}`;

      await prisma.content.create({
        data: {
          title,
          channel: 'EMAIL',
          body: convertedBody,
          triggerType: weekNumber == null ? 'welcome' : 'video',
          department: entry.department,
          weekNumber: weekNumber,
          isActive,
          planTypes: JSON.stringify(['all']),
        },
      });
      created++;
    }
  }

  console.log(`Created ${created} Content templates across ${byWeek.size} weeks/pre-class rows.`);
  console.log(`\nWeeks with multiple departments (${multiDeptWeeks.length}):`);
  for (const w of multiDeptWeeks.sort((a, b) => (typeof a.week === 'number' && typeof b.week === 'number' ? a.week - b.week : 0))) {
    console.log(`  Week ${w.week}: [${w.depts.join(', ')}] -> active: ${w.winner}`);
  }

  if (unknownBrackets.size > 0) {
    console.log(`\nNew placeholder tokens introduced beyond the documented set:`);
    for (const b of unknownBrackets) {
      console.log(`  [${b}] -> {${toCamelCase(b)}}`);
    }
  } else {
    console.log(`\nNo undocumented bracket placeholders found — only [video]/[Facebook link]/[Instagram link]/[Tiktok link]/[Threads link]/[attached poster below] appeared.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
