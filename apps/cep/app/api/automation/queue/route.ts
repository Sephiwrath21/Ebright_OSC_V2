import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { EngagementStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const status = url.searchParams.get('status');

  const logs = await prisma.sendLog.findMany({
    where: {
      ...(type && type !== 'all' ? { contentType: type } : {}),
      ...(status && status !== 'all' ? { status: status as EngagementStatus } : {}),
    },
    include: { parent: { select: { id: true, name: true, studentName: true, branch: { select: { name: true } } } } },
    orderBy: { sentAt: 'desc' },
    take: 200,
  });
  return NextResponse.json(logs);
}
