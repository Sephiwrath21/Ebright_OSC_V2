import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

const adapter = new PrismaPg({
  connectionString: process.env.HRFS_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  options: "-c TimeZone=UTC",
  max: 3,
  connectionTimeoutMillis: 15_000,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = await prisma.users.findMany({
    where: {
      user_profile: { full_name: { contains: "loghabaalan", mode: "insensitive" } },
    },
    include: {
      user_profile: { select: { full_name: true, nric: true, phone: true, nationality: true } },
      employment: {
        select: { employment_id: true, employee_id: true, position: true, status: true, start_date: true },
        orderBy: { start_date: "desc" },
      },
    },
    orderBy: { user_id: "asc" },
  });

  console.log(`Found ${rows.length} account(s) matching "loghabaalan"\n`);
  for (const u of rows) {
    console.log(`--- User #${u.user_id} ---`);
    console.log("email       :", u.email);
    console.log("user status :", u.status);
    console.log("created_at  :", u.created_at.toISOString().slice(0, 10));
    console.log("full_name   :", u.user_profile?.full_name ?? "(no profile)");
    console.log("nric        :", u.user_profile?.nric ?? "(none)");
    console.log("phone       :", u.user_profile?.phone ?? "(none)");
    console.log("nationality :", u.user_profile?.nationality ?? "(none)");
    if (u.employment.length === 0) {
      console.log("employment  : (none)");
    } else {
      for (const e of u.employment) {
        console.log(`employment  : id=${e.employment_id} emp_id=${e.employee_id ?? "NULL"} pos=${e.position} status=${e.status} start=${e.start_date?.toISOString().slice(0, 10)}`);
      }
    }
    console.log("");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
