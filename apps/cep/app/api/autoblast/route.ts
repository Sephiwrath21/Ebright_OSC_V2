import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const jobs = await prisma.autoBlastJob.findMany({
    orderBy: [{ isActive: 'desc' }, { nextRunAt: 'asc' }],
    include: { content: { select: { id: true, title: true, channel: true } } },
  });
  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const contentId = body.contentId;
  const intervalMinutes = Number(body.intervalMinutes);
  const segmentBranch = body.segmentBranch ?? 'all';
  const segmentStatus = body.segmentStatus ?? 'active';
  const isActive = body.isActive === undefined ? true : Boolean(body.isActive);

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!contentId) return NextResponse.json({ error: 'contentId is required' }, { status: 400 });
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1) {
    return NextResponse.json({ error: 'intervalMinutes must be >= 1' }, { status: 400 });
  }

  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) return NextResponse.json({ error: 'contentId not found' }, { status: 400 });

  const now = new Date();
  const job = await prisma.autoBlastJob.create({
    data: {
      name,
      contentId,
      segmentBranch,
      segmentStatus,
      intervalMinutes,
      isActive,
      nextRunAt: new Date(now.getTime() + intervalMinutes * 60_000),
    },
    include: { content: { select: { id: true, title: true, channel: true } } },
  });

  return NextResponse.json(job);
}
