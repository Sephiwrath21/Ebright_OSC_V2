import { prisma } from "./src/lib/prisma";

async function main() {
  const updates = [
    { name: "Nurul Haziqah Binti Md Badrul Hisham", employmentId: 255, branch_id: 15, department_id: null as number | null },
    { name: "Putri Ellya Sari Binti Sharif", employmentId: 256, branch_id: 12, department_id: null as number | null },
    { name: "Nur Farah Nabila Binti Ramzairi", employmentId: 254, branch_id: null as number | null, department_id: 5 },
  ];
  for (const u of updates) {
    const result = await prisma.employment.update({
      where: { employment_id: u.employmentId },
      data: { branch_id: u.branch_id, department_id: u.department_id },
      include: { branch: true, department: true },
    });
    console.log(u.name, "-> updated. branch:", result.branch?.branch_code, "dept:", result.department?.department_code);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
