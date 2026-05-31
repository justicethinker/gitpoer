import { useApp } from '../../context/AppContext';

const PLANS = [
  {
    id: 'dev',
    name: 'Dev',
    price: '$8',
    period: '/mo',
    popular: true,
    features: [
      'All 10 AI tools unlocked',
      'Up to 50 scans / month',
      'Priority analysis queue',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19',
    period: '/mo',
    popular: false,
    features: [
      'Everything in Dev',
      'Unlimited scans',
      'Team sharing & exports',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    price: '$59',
    period: '/mo',
    popular: false,
    features: [
      'Everything in Pro',
      'Up to 10 seats',
      'SSO & audit logs',
    ],
  },
];

export default function UpgradeModal() {
  const { upgradeModal, closeUpgradeModal, upgradePlan } = useApp();

  if (!upgradeModal) return null;

  const featureName =
    typeof upgradeModal === 'object' ? upgradeModal.feature : upgradeModal;

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) closeUpgradeModal();
  }

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2,8,23,0.85)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          background: '#020617',
          border: '1px solid #1e293b',
          borderRadius: 16,
          padding: 32,
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Close button */}
        <button
          onClick={closeUpgradeModal}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 8,
            color: '#475569',
            fontSize: 16,
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            outline: 'none',
            lineHeight: 1,
          }}
          aria-label="Close"
        >
          âœ•
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          {/* Gradient icon */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              margin: '0 auto 16px',
              boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
            }}
          >
            âœ¦
          </div>
          <h2
            style={{
              margin: '0 0 8px',
              fontSize: 22,
              fontWeight: 800,
              color: '#f1f5f9',
              letterSpacing: '-0.02em',
            }}
          >
            Unlock Pro Features
          </h2>
          {featureName && (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: '#94a3b8',
              }}
            >
              <span
                style={{
                  background: 'rgba(99,102,241,0.15)',
                  color: '#a5b4fc',
                  borderRadius: 5,
                  padding: '2px 8px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 12,
                }}
              >
                {featureName}
              </span>{' '}
              requires a paid plan.
            </p>
          )}
        </div>

        {/* Plan cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {PLANS.map((plan) => (
            <button
              key={plan.id}
              onClick={() => upgradePlan(plan.id)}
              style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: 10,
                padding: '14px 16px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                transition: 'border-color 0.15s, background 0.15s',
                outline: 'none',
                width: '100%',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#6366f1';
                e.currentTarget.style.background = 'rgba(99,102,241,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#1e293b';
                e.currentTarget.style.background = '#0f172a';
              }}
            >
              {/* Price block */}
              <div style={{ flexShrink: 0, minWidth: 68 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                  <span
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: '#f1f5f9',
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {plan.price}
                  </span>
                  <span style={{ fontSize: 12, color: '#475569' }}>{plan.period}</span>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#94a3b8',
                    marginTop: 1,
                  }}
                >
                  {plan.name}
                  {plan.popular && (
                    <span
                      style={{
                        marginLeft: 6,
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        color: '#fff',
                        fontSize: 9,
                        fontWeight: 700,
                        borderRadius: 4,
                        padding: '1px 5px',
                        verticalAlign: 'middle',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Popular
                    </span>
                  )}
                </div>
              </div>

              {/* Features */}
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {plan.features.map((f, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 12,
                      color: '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ color: '#6366f1', fontSize: 10 }}>âœ“</span>
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        {/* Bottom note */}
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: '#475569',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          For demo purposes, clicking upgrades your plan immediately.
        </p>
      </div>
    </div>
  );
}
