import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.contentId !== undefined) data.contentId = body.contentId;
  if (body.segmentBranch !== undefined) data.segmentBranch = body.segmentBranch;
  if (body.segmentStatus !== undefined) data.segmentStatus = body.segmentStatus;
  if (body.intervalMinutes !== undefined) {
    const intervalMinutes = Number(body.intervalMinutes);
    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1) {
      return NextResponse.json({ error: 'intervalMinutes must be >= 1' }, { status: 400 });
    }
    data.intervalMinutes = intervalMinutes;
  }
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  const job = await prisma.autoBlastJob.update({
    where: { id: params.id },
    data,
    include: { content: { select: { id: true, title: true, channel: true } } },
  });

  return NextResponse.json(job);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.autoBlastJob.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
