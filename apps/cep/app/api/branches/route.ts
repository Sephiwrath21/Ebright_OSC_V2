import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const activeOnly = new URL(req.url).searchParams.get('activeOnly');
  const branches = await prisma.ebrightCepBranch.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(branches);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const existing = await prisma.ebrightCepBranch.findUnique({ where: { name } });
  if (existing) return NextResponse.json({ error: `A branch named "${name}" already exists` }, { status: 409 });

  const branch = await prisma.ebrightCepBranch.create({ data: { name } });
  return NextResponse.json(branch);
}
