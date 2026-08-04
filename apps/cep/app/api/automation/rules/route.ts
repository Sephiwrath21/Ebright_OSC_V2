import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { startOfDay } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET() {
  const todayStart = startOfDay(new Date());
  const types = ['welcome', 'followus', 'followus_reminder', 'video', 'review', 'referral', 'birthday'];

  const results = await Promise.all(
    types.map(async (t) => {
      const sentToday = await prisma.sendLog.count({
        where: { contentType: t, status: 'SENT', sentAt: { gte: todayStart } },
      });
      const skipped = await prisma.sendLog.count({
        where: { contentType: t, status: 'SKIPPED' },
      });
      const last = await prisma.sendLog.findFirst({
        where: { contentType: t, status: 'SENT' },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true },
      });
      return { type: t, sentToday, pending: skipped, lastFired: last?.sentAt ?? null };
    }),
  );
  return NextResponse.json(results);
}
