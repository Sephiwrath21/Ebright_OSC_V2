import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { differenceInCalendarMonths } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const branch = url.searchParams.get('branch');
  const status = url.searchParams.get('status');
  const month = url.searchParams.get('month'); // '1' | '2' | '3' | 'all'
  const planType = url.searchParams.get('planType');

  const where: Record<string, unknown> = {};
  if (branch && branch !== 'all') where.branch = { name: branch };
  if (status && status !== 'all') where.status = status;
  if (planType && planType !== 'all') where.plan_type = planType;

  let parents = await prisma.parent.findMany({ where, include: { branch: true } });

  if (month && month !== 'all') {
    const target = parseInt(month);
    parents = parents.filter((p) => {
      const m1 = new Date(p.m1StartDate);
      const now = new Date();
      const monthNum = now < m1 ? 1 : differenceInCalendarMonths(now, m1) + 1;
      return monthNum === target;
    });
  }

  return NextResponse.json({
    count: parents.length,
    parents: parents.map((p) => ({
      id: p.id,
      name: p.name,
      studentName: p.studentName,
      branch: p.branch.name,
      phone: p.phone,
    })),
    estimatedCost: {
      sms: (parents.length * 0.08).toFixed(2),
      wa: (parents.length * 0.15).toFixed(2),
      total: (parents.length * 0.23).toFixed(2),
    },
  });
}
