import "server-only";
import { prisma } from "@/lib/prisma";

// Scheduled sweep (see instrumentation.ts) for Transfer's "Temporary
// Transfer" type — once a transfer's end_date has passed, the employee's
// current employment.branch_id/department_id is reverted back to whatever
// from_location resolves to, mirroring the exact same "look up by name
// against both tables, clear the other FK" logic addTransfer() already uses
// to apply the "To" side (see employeeRecordActions.ts). reverted_at is set
// immediately after, so a row is only ever reverted once even if the sweep
// runs again before the next scheduled interval.
//
// Deliberately reverts to from_location outright rather than checking
// whether a later transfer/promotion has since moved the employee again —
// only reasonable for the common case where the temporary transfer is the
// most recent change; a genuinely conflicting subsequent move isn't
// something the current data model can detect.
export async function revertExpiredTemporaryTransfers(): Promise<number> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const due = await prisma.transfer.findMany({
    where: {
      type: "Temporary Transfer",
      reverted_at: null,
      end_date: { lte: new Date(`${todayIso}T00:00:00Z`) },
    },
  });

  let reverted = 0;
  for (const t of due) {
    if (t.from_location) {
      const [branch, department] = await Promise.all([
        prisma.branch.findFirst({ where: { branch_name: t.from_location } }),
        prisma.department.findFirst({ where: { department_name: t.from_location } }),
      ]);
      if (branch || department) {
        const current = await prisma.employment.findFirst({
          where: { user_id: t.user_id },
          orderBy: { start_date: "desc" },
          select: { employment_id: true },
        });
        if (current) {
          await prisma.employment.update({
            where: { employment_id: current.employment_id },
            data: { branch_id: branch?.branch_id ?? null, department_id: department?.department_id ?? null },
          });
        }
      }
    }
    await prisma.transfer.update({ where: { transfer_id: t.transfer_id }, data: { reverted_at: new Date() } });
    reverted++;
  }
  return reverted;
}
