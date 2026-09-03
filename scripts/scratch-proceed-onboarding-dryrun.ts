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
    console.log(`  current: status=${employment.status}, probation=${employment.probation}, start_date=${employment.start_date}`);
    const group = positionGroup(employment.position);
    console.log(`  positionGroup("${employment.position}"): ${group}`);
    console.log(`  Full Time block would ${group === "Full Time" ? "TRIGGER (abort)" : "NOT trigger (proceeds)"}`);
    console.log(`  PLANNED WRITE (not yet executed): UPDATE employment SET status='active', probation=false WHERE employment_id=${employment.employment_id};`);
    console.log(`  start_date left untouched: ${employment.start_date}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
