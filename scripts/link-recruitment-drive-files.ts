// Links new employees' Offer Letter and Resume from the
// GOOGLE_DRIVE_RECRUITMENT_HIRED_ID Drive folder into hrfs
// (employment.offer_letter_file_id / resume.resume_file_id).
//
// Usage (needs env from .env — loaded below):
//   npm run link:recruitment-drive              # dry run, prints the report
//   npm run link:recruitment-drive -- --apply   # actually writes the links
//
// Re-scans every employee on every run (not just new hires) — already-set
// hrfs fields are always skipped, never overwritten. The Drive side is
// read-only regardless of --apply (only ever lists folder contents, never
// creates/moves/deletes anything there).

import "dotenv/config";

import { runRecruitmentDriveLink } from "../src/lib/recruitmentDriveLink";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

(async () => {
  const apply = flag("apply");
  console.log(`[link-recruitment-drive] ${apply ? "APPLYING" : "dry run"}`);

  const report = await runRecruitmentDriveLink({ apply });

  console.log(`\nProcessed ${report.processed} employee(s).`);
  console.log(
    `${apply ? "Linked" : "Would link"}: ${report.offerLetterLinked} Offer Letter, ${report.resumeLinked} Resume.`,
  );

  const positionEntries = Object.entries(report.resolvedPositionCounts).sort((a, b) => b[1] - a[1]);
  console.log(`\nDistinct live-resolved position values seen this run (${positionEntries.length}):`);
  for (const [position, count] of positionEntries) console.log(`  "${position}" -> ${count}`);

  if (report.linked.length > 0) {
    console.log(`\n${apply ? "Linked" : "Would link"}:`);
    for (const l of report.linked) console.log(`  ${l.name} — ${l.field}: "${l.fileName}" (fileId=${l.fileId})`);
  }

  if (report.ambiguous.length > 0) {
    console.log(`\nAmbiguous — multiple matching files, none picked automatically (${report.ambiguous.length}):`);
    for (const a of report.ambiguous) {
      console.log(`  ${a.name} (${a.department} / ${a.position}) — ${a.field}: ${a.candidates.map((c) => `"${c}"`).join(", ")}`);
    }
  }

  if (report.fileNotFound.length > 0) {
    console.log(`\nFolder found, but file(s) missing (${report.fileNotFound.length}):`);
    for (const f of report.fileNotFound) {
      console.log(`  ${f.name} (${f.department} / ${f.position}) — missing: ${f.missing.join(", ")}`);
    }
  }

  if (report.folderNotFound.length > 0) {
    console.log(`\nDepartment/position folder not found (${report.folderNotFound.length}):`);
    for (const f of report.folderNotFound) {
      console.log(`  ${f.name} — department="${f.department}" position="${f.position}" (no matching ${f.missing} folder)`);
    }
  }

  if (report.unmappedPosition.length > 0) {
    console.log(`\nPosition value not recognized — skipped (${report.unmappedPosition.length}):`);
    for (const u of report.unmappedPosition) {
      console.log(`  ${u.name} — department="${u.department}" position="${u.position}"`);
    }
  }

  const alreadySetCount = report.skippedAlreadySet.length;
  if (alreadySetCount > 0) {
    console.log(`\nAlready had a value, skipped (not overwritten): ${alreadySetCount}`);
  }

  if (!apply) {
    console.log("\nDry run — nothing was written. Re-run with --apply to write these links to hrfs.");
  }
})().catch((error) => {
  console.error("[link-recruitment-drive] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
