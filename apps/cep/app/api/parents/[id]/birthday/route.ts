import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const birthday = body.birthday ? new Date(body.birthday) : null;
  const parent = await prisma.parent.update({
    where: { id: params.id },
    data: { birthday },
  });
  return NextResponse.json(parent);
}
