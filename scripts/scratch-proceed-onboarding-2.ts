import { config } from "dotenv";
config();
import { prisma } from "../src/lib/prisma";
import { positionGroup } from "../src/lib/employeeStages";

const TARGETS = [
  { userId: 2004, name: "Mohammad Zulhilmi Bin Kasmin" },
  { userId: 2062, name: "Nur Afrina Binti Nazaha" },
];

async function main() {
  for (const t of TARGETS) {
    const employment = await prisma.employment.findFirst({
      where: { user_id: t.userId },
      orderBy: { start_date: "desc" },
    });
    console.log(`\n${t.name} (user_id ${t.userId}):`);
    if (!employment) {
      console.log("  ABORT: no employment record found.");
      continue;
    }
    console.log(`  employment_id: ${employment.employment_id}`);
    console.log(`  current status: ${employment.status}, probation: ${employment.probation}, start_date: ${employment.start_date}`);
    const group = positionGroup(employment.position);
    console.log(`  positionGroup("${employment.position}"): ${group}`);
    if (group === "Full Time") {
      console.log("  ABORT: Full Time — proceedFromOnboarding refuses this path (must go via Probation confirmation).");
      continue;
    }
    if (employment.status === "active") {
      console.log("  Already active — skipping, no-op.");
      continue;
    }

    // This is the EXACT write proceedFromOnboarding() performs — start_date
    // is deliberately untouched, per explicit instruction.
    const updated = await prisma.employment.update({
      where: { employment_id: employment.employment_id },
      data: { status: "active", probation: false },
    });
    console.log(`  -> Updated: status=${updated.status}, probation=${updated.probation}, start_date=${updated.start_date} (unchanged)`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
