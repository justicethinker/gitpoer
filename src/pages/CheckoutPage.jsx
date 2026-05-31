import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp, PLANS } from '../context/AppContext';

export default function CheckoutPage() {
  const { plan } = useParams();
  const navigate = useNavigate();
  const { upgradePlan } = useApp();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // If invalid plan in URL or free plan, redirect home
  const planData = PLANS[plan];
  if (!planData || plan === 'free') {
    navigate('/');
    return null;
  }

  const handleCheckout = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setSuccess(true);
      upgradePlan(plan);
      setTimeout(() => {
        navigate('/app');
      }, 1500);
    }, 1500);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617' }}>
      
      {/* Top Left Logo Nav */}
      <div style={{ position: 'absolute', top: 24, left: 32, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => navigate('/')}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#fff' }}>G</div>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#f0f6fc', letterSpacing: '-0.02em' }}>GitGrade</span>
      </div>

      <div style={{ width: '100%', maxWidth: 800, display: 'flex', gap: 40, flexWrap: 'wrap-reverse', padding: 24 }}>
        
        {/* Left: Checkout Form */}
        <div style={{ flex: '1 1 360px' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f0f6fc', marginBottom: 24 }}>Complete your upgrade</h1>
          
          {success ? (
            <div style={{ padding: '24px', background: '#3b82f615', border: '1px solid #3b82f630', borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>ðŸŽ‰</div>
              <h3 style={{ fontSize: 18, color: '#3b82f6', marginBottom: 8 }}>Payment Successful!</h3>
              <p style={{ color: '#8b949e', fontSize: 14 }}>You are now on the {planData.name} plan. Redirecting to dashboard...</p>
            </div>
          ) : (
            <form onSubmit={handleCheckout} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#8b949e', marginBottom: 6 }}>Email Address</label>
                <input type="email" required placeholder="you@example.com" style={{ width: '100%', padding: '10px 14px' }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#8b949e', marginBottom: 6 }}>Card Information</label>
                <div style={{ border: '1px solid #1e293b', borderRadius: 6, overflow: 'hidden' }}>
                  <input type="text" required placeholder="1234 5678 9101 1121" style={{ width: '100%', padding: '10px 14px', border: 'none', borderBottom: '1px solid #1e293b', borderRadius: 0 }} />
                  <div style={{ display: 'flex' }}>
                    <input type="text" required placeholder="MM / YY" style={{ flex: 1, padding: '10px 14px', border: 'none', borderRight: '1px solid #1e293b', borderRadius: 0 }} />
                    <input type="text" required placeholder="CVC" style={{ flex: 1, padding: '10px 14px', border: 'none', borderRadius: 0 }} />
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#8b949e', marginBottom: 6 }}>Name on Card</label>
                <input type="text" required placeholder="John Doe" style={{ width: '100%', padding: '10px 14px' }} />
              </div>
              <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 15, justifyContent: 'center' }}>
                {loading ? 'Processing...' : `Pay $${planData.price}`}
              </button>
              <p style={{ fontSize: 11, color: '#6e7681', textAlign: 'center', marginTop: 16 }}>
                This is a mock checkout for GitGrade. No real charges will be made.
              </p>
            </form>
          )}
        </div>

        {/* Right: Order Summary */}
        <div style={{ flex: '1 1 300px', alignSelf: 'flex-start' }}>
          <div style={{ padding: 24, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#f0f6fc', marginBottom: 16, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Order Summary</h2>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#f0f6fc' }}>GitGrade {planData.name}</div>
                <div style={{ fontSize: 12, color: '#8b949e' }}>Billed monthly</div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f0f6fc' }}>${planData.price}</div>
            </div>
            
            <div style={{ height: 1, background: '#1e293b', margin: '16px 0' }} />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f0f6fc' }}>Total due today</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#3b82f6' }}>${planData.price}</div>
            </div>

            <div style={{ marginTop: 24, padding: 16, background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Object.keys(planData.features).slice(0, 4).map(key => (
                  <li key={key} style={{ fontSize: 12, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#3b82f6' }}>âœ“</span> {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  </li>
                ))}
                {Object.keys(planData.features).length > 4 && (
                  <li style={{ fontSize: 12, color: '#6e7681', fontStyle: 'italic', marginLeft: 20 }}>+ more features...</li>
                )}
              </ul>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
