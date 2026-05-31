import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

function PricingCard({ planId, name, price, desc, features, isPopular, buttonText, onSelect }) {
  return (
    <div style={{
      background: '#0f172a', border: `1px solid ${isPopular ? '#3b82f6' : '#1e293b'}`,
      borderRadius: 12, padding: 32, display: 'flex', flexDirection: 'column',
      position: 'relative', flex: '1 1 250px'
    }}>
      {isPopular && (
        <div style={{
          position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
          background: '#3b82f6', color: '#fff', fontSize: 11, fontWeight: 800,
          padding: '4px 12px', borderRadius: 12, letterSpacing: '0.05em', textTransform: 'uppercase'
        }}>
          Most Popular
        </div>
      )}
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#f0f6fc', marginBottom: 8 }}>{name}</h3>
      <p style={{ fontSize: 13, color: '#8b949e', marginBottom: 20, minHeight: 40 }}>{desc}</p>
      <div style={{ marginBottom: 32 }}>
        <span style={{ fontSize: 40, fontWeight: 900, color: '#f0f6fc', letterSpacing: '-0.02em' }}>${price}</span>
        <span style={{ fontSize: 14, color: '#8b949e' }}>/mo</span>
      </div>
      <button 
        onClick={() => onSelect(planId)}
        className={isPopular ? 'btn-primary' : 'btn-ghost'}
        style={{ width: '100%', padding: '12px 0', justifyContent: 'center', marginBottom: 32, fontSize: 15 }}
      >
        {buttonText}
      </button>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        {features.map((f, i) => (
          <li key={i} style={{ fontSize: 13, color: '#f0f6fc', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ color: '#3b82f6', flexShrink: 0 }}>âœ“</span>
            <span style={{ lineHeight: 1.4 }}>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PricingPage() {
  const navigate = useNavigate();
  const [navHover, setNavHover] = useState(false);

  const handleSelect = (planId) => {
    if (planId === 'free') {
      navigate('/login');
    } else {
      navigate(`/checkout/${planId}`);
    }
  };

  return (
    <div style={{ background: '#020617', minHeight: '100vh', color: '#f0f6fc', fontFamily: 'DM Sans, sans-serif' }}>
      
      {/* â”€â”€ NAV â”€â”€ */}
      <nav style={{
        padding: '0 5vw', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #1e293b'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => navigate('/')}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#fff' }}>G</div>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#f0f6fc', letterSpacing: '-0.02em' }}>GitGrade</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <a href="/#features" style={{ fontSize: 14, color: '#8b949e', textDecoration: 'none', fontWeight: 600 }}>Features</a>
          <button
            onMouseEnter={() => setNavHover(true)}
            onMouseLeave={() => setNavHover(false)}
            onClick={() => navigate('/login')}
            style={{
              background: navHover ? '#2563eb' : '#3b82f6', border: 'none', borderRadius: 6,
              color: '#fff', padding: '8px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s ease'
            }}
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* â”€â”€ PRICING â”€â”€ */}
      <section style={{ padding: '80px 5vw 120px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 16 }}>Simple, transparent pricing</h1>
          <p style={{ fontSize: 18, color: '#8b949e' }}>Start free. Upgrade when you need more power.</p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'stretch' }}>
          <PricingCard
            planId="free"
            name="Free"
            price="0"
            desc="For students and occasional users making basic improvements."
            buttonText="Start for Free"
            onSelect={handleSelect}
            features={[
              '5 generations per month',
              'Access to all 10 tools',
              'Basic standard output',
              '3 supported languages',
              '2 Audience Mode variants'
            ]}
          />
          <PricingCard
            planId="dev"
            name="Dev"
            price="8"
            desc="For developers actively building their portfolio and applying for jobs."
            buttonText="Upgrade to Dev"
            isPopular={true}
            onSelect={handleSelect}
            features={[
              '100 generations per month',
              'Custom instructions for AI',
              'Improved Doc Validator logic',
              '10 supported languages',
              'All 4 Audience Mode variants',
              'Full Portfolio Verdicts'
            ]}
          />
          <PricingCard
            planId="pro"
            name="Pro"
            price="19"
            desc="For maintainers and freelancers managing multiple large repositories."
            buttonText="Upgrade to Pro"
            onSelect={handleSelect}
            features={[
              'Unlimited generations',
              'Everything in Dev plan',
              'Bulk repo scanning',
              '20 supported languages',
              'Export reports as PDF',
              'Priority API queue'
            ]}
          />
        </div>
      </section>

      {/* â”€â”€ FOOTER â”€â”€ */}
      <footer style={{ borderTop: '1px solid #1e293b', padding: '40px 5vw', textAlign: 'center', color: '#6e7681', fontSize: 14 }}>
        <p>Â© 2024 GitGrade. Grade your repo, land the job.</p>
      </footer>
    </div>
  );
}
