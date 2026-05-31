import React from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';

export default function ProfilePage() {
  const { state } = useApp();
  const navigate = useNavigate();

  return (
    <div style={{ padding: 40, maxWidth: 800, margin: '0 auto' }}>
      <button onClick={() => navigate('/app')} style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', marginBottom: 20, fontWeight: 700 }}>
        â† Back to Dashboard
      </button>
      
      <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f0f6fc', marginBottom: 24 }}>My Profile</h1>
      
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 32, display: 'flex', gap: 32, alignItems: 'center' }}>
        <div style={{ width: 100, height: 100, borderRadius: '50%', background: '#1e293b', border: '2px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: '#f1f5f9' }}>
          {state.user?.name ? state.user.name.charAt(0).toUpperCase() : 'U'}
        </div>
        
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#f0f6fc', marginBottom: 8 }}>{state.user?.name || 'User'}</h2>
          <div style={{ color: '#8b949e', fontSize: 14, marginBottom: 16 }}>{state.user?.email || 'user@example.com'}</div>
          
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 20, color: '#3b82f6', fontSize: 13, fontWeight: 600 }}>
            <span style={{ fontSize: 14 }}>ðŸš€</span> {state.plan.toUpperCase()} Plan
          </div>
        </div>
      </div>
    </div>
  );
}
