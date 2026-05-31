export default function SectionCard({ title, children, accentColor = '#6366f1', extra, style }) {
  return (
    <div
      style={{
        background: '#020617',
        border: '1px solid #1e293b',
        borderRadius: 10,
        overflow: 'hidden',
        fontFamily: 'DM Sans, sans-serif',
        ...style,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '11px 16px',
          borderBottom: '1px solid #1e293b',
        }}
      >
        {/* Left: accent bar + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 3,
              height: 16,
              borderRadius: 2,
              background: accentColor,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#475569',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            {title}
          </span>
        </div>

        {/* Right: extra slot */}
        {extra && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {extra}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '16px' }}>
        {children}
      </div>
    </div>
  );
}
