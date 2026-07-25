import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const logs = await prisma.sendLog.findMany({
    where: { triggeredBy: 'autoblast' },
    orderBy: { sentAt: 'desc' },
    take: 30,
    include: { parent: { select: { id: true, name: true, studentName: true, branch: { select: { name: true } } } } },
  });
  return NextResponse.json(
    logs.map((l) => ({ ...l, parent: l.parent ? { ...l.parent, branch: l.parent.branch.name } : null })),
  );
}
