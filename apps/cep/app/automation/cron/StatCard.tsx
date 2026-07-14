export function StatCard({ label, value, color = '#111827' }: { label: string; value: number | string; color?: string }) {
  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)',
      }}
    >
      <div
        style={{
          fontSize: '10px',
          color: '#9ca3af',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 700, color, marginTop: '6px', lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}