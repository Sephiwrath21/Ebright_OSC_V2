import { DemoPanel } from '@/components/automation/DemoPanel';

export const dynamic = 'force-dynamic';

export default function AdminDemoPage() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>Demo controls</h1>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 0' }}>
          Admin-only. Manually fire triggers for presentation/testing.
        </p>
      </div>
      <DemoPanel />
    </div>
  );
}
