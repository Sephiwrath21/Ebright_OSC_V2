import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { startOfMonth } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET() {
  const monthStart = startOfMonth(new Date());
  const [totalParents, activeParents, smsThisMonth, pendingBirthdays, recentLogs, upcomingEvents] = await Promise.all([
    prisma.parent.count(),
    prisma.parent.count({ where: { status: 'active' } }),
    prisma.sendLog.count({ where: { status: 'SENT', sentAt: { gte: monthStart } } }),
    prisma.parent.count({ where: { birthday: null, status: 'active' } }),
    prisma.sendLog.findMany({
      orderBy: { sentAt: 'desc' },
      take: 15,
      include: { parent: { select: { id: true, name: true, studentName: true, branch: { select: { name: true } } } } },
    }),
    prisma.calendarEvent.findMany({
      where: { date: { gte: new Date() } },
      orderBy: { date: 'asc' },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    stats: { totalParents, activeParents, smsThisMonth, pendingBirthdays },
    recentLogs,
    upcomingEvents,
  });
}
