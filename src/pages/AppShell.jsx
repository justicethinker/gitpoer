import React from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function AppShell() {
  const { user, logout, plan, generationsLeft } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) {
    navigate('/login');
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const inRepoContext = location.pathname.includes('/app/repo/');

  return (
    <div style={{ background: '#020617', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Top Navigation */}
      <header style={{ 
        height: 60, borderBottom: '1px solid #1e293b', background: '#0f172a',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {/* Logo */}
          <Link to="/app" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#fff' }}>G</div>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#f0f6fc', letterSpacing: '-0.02em' }}>GitGrade</span>
          </Link>
          
          <div style={{ width: 1, height: 20, background: '#1e293b' }} />
          
          <div style={{ fontSize: 13, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#3b82f6' }}>â—</span> API Connected
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Plan Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f0f6fc', textTransform: 'uppercase' }}>{plan.name} PLAN</div>
              <div style={{ fontSize: 11, color: '#8b949e' }}>{generationsLeft === Infinity ? 'Unlimited' : generationsLeft} left</div>
            </div>
            {plan.id === 'free' && (
              <button onClick={() => navigate('/pricing')} className="btn-primary" style={{ padding: '6px 12px', fontSize: 12, borderRadius: 6 }}>
                Upgrade
              </button>
            )}
          </div>

          <div style={{ width: 1, height: 20, background: '#1e293b' }} />

          {/* User Menu Mock */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={handleLogout} title="Click to logout">
            <img src={user.avatar} alt="avatar" style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #1e293b' }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f0f6fc' }}>{user.handle}</div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, position: 'relative' }}>
        <Outlet />
      </main>

    </div>
  );
}
