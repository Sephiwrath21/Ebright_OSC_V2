import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const users = await prisma.users.findMany({
  where: { user_profile: { full_name: { contains: "Iqbal Hakim", mode: "insensitive" } } },
  include: {
    user_profile: true,
    role: true,
    employment: { include: { branch: true, department: true } },
  },
});

for (const u of users) {
  console.log({
    user_id: u.user_id,
    email: u.email,
    full_name: u.user_profile?.full_name,
    users_status: u.status,
    role_id: u.role_id,
    role_type: u.role?.role_type,
    employment: u.employment.map((e) => ({
      employment_id: e.employment_id,
      status: e.status,
      probation: e.probation,
      start_date: e.start_date?.toISOString().slice(0, 10),
      end_date: e.end_date?.toISOString().slice(0, 10),
      position: e.position,
      department: e.department?.department_name,
      branch: e.branch?.branch_name,
    })),
  });
}

await prisma.$disconnect();
