import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const rule = await prisma.automationRule.update({
    where: { id: Number(params.id) },
    data: {
      ...(body.description !== undefined ? { description: body.description || null } : {}),
      ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
    },
  });
  return NextResponse.json(rule);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {

  await prisma.automationRule.delete({ where: { id: Number(params.id) } });
  return NextResponse.json({ success: true });
}
