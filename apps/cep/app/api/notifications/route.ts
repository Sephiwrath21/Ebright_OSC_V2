import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '15');
  const notifications = await prisma.ebrightCepNotification.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { parent: { select: { id: true, name: true, studentName: true } } },
  });
  return NextResponse.json(notifications);
}
