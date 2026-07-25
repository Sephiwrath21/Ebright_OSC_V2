import { prisma } from '@/lib/prisma';
import { getCronEnabled } from '@/lib/cronSettings';
import { TestSendPanel } from './TestSendPanel';

export const dynamic = 'force-dynamic';

export default async function AutomationToolsPage() {
  const [parentRows, cronEnabled] = await Promise.all([
    prisma.parent.findMany({
      where: { status: { in: ['active', 'trial'] } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, studentName: true, branch: { select: { name: true } } },
    }),
    getCronEnabled(),
  ]);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>Automation tools</h1>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 0' }}>
          Admin-only. Force-fire a single rule against one parent, for testing/troubleshooting (e.g. verifying
          Day-14 follow-us actually fires correctly) — separate from the main Cron monitor so it&apos;s not one
          click away by accident against real parent data.
        </p>
      </div>
      <TestSendPanel
        parents={parentRows.map((p) => ({ ...p, branch: p.branch.name }))}
        cronEnabled={cronEnabled}
      />
    </div>
  );
}
