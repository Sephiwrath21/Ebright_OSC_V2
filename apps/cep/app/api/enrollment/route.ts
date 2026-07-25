import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const parents = await prisma.parent.findMany({
    select: { enrollDate: true, branch: { select: { name: true } }, program: true },
  });

  // Monthly totals
  const byMonth: Record<string, { total: number; branches: Record<string, number> }> = {};
  for (const p of parents) {
    const key = `${p.enrollDate.getFullYear()}-${String(p.enrollDate.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = { total: 0, branches: {} };
    byMonth[key].total++;
    byMonth[key].branches[p.branch.name] = (byMonth[key].branches[p.branch.name] ?? 0) + 1;
  }

  const branches: Record<string, number> = {};
  for (const p of parents) {
    branches[p.branch.name] = (branches[p.branch.name] ?? 0) + 1;
  }

  return NextResponse.json({ byMonth, branches, total: parents.length });
}
