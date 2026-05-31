import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

// â”€â”€â”€ Bento Box Tool Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function BentoCard({ emoji, name, desc, colSpan = 1, rowSpan = 1 }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '24px',
        display: 'flex', flexDirection: 'column', gap: 16,
        gridColumn: `span ${colSpan}`, gridRow: `span ${rowSpan}`,
        transition: 'all 0.2s',
        transform: hover ? 'translateY(-2px)' : 'none',
        borderColor: hover ? '#3b82f6' : '#1e293b',
        cursor: 'default'
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 12, background: '#3b82f615',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
        border: '1px solid #3b82f630',
      }}>
        {emoji}
      </div>
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f0f6fc', marginBottom: 6 }}>{name}</h3>
        <p style={{ fontSize: 14, color: '#8b949e', lineHeight: 1.6, margin: 0 }}>{desc}</p>
      </div>
    </div>
  );
}

// â”€â”€â”€ Main Landing Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function LandingPage() {
  const navigate = useNavigate();
  const [navHover, setNavHover] = useState(false);

  return (
    <div style={{ background: '#020617', minHeight: '100vh', color: '#f0f6fc', fontFamily: 'DM Sans, sans-serif' }}>
      
      {/* â”€â”€ NAV â”€â”€ */}
      <nav style={{
        padding: '0 5vw', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #1e293b', background: '#020617'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => window.scrollTo(0,0)}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#fff' }}>G</div>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#f0f6fc', letterSpacing: '-0.02em' }}>GitGrade</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <a href="#features" style={{ fontSize: 14, color: '#8b949e', textDecoration: 'none', fontWeight: 600 }}>Features</a>
          <a href="/pricing" style={{ fontSize: 14, color: '#8b949e', textDecoration: 'none', fontWeight: 600 }}>Pricing</a>
          <button
            onMouseEnter={() => setNavHover(true)}
            onMouseLeave={() => setNavHover(false)}
            onClick={() => navigate('/login')}
            style={{
              background: navHover ? '#2563eb' : '#3b82f6',
              border: 'none', borderRadius: 8,
              color: '#fff', padding: '8px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s ease',
            }}
          >
            Open App
          </button>
        </div>
      </nav>

      {/* â”€â”€ HERO â”€â”€ */}
      <section style={{ padding: '160px 5vw 100px', textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: 'clamp(48px, 8vw, 80px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.04em', marginBottom: 24 }}>
          Grade your repo.<br/>
          <span style={{ color: '#3b82f6' }}>Land the job.</span>
        </h1>
        <p style={{ fontSize: 20, color: '#8b949e', lineHeight: 1.6, marginBottom: 48, maxWidth: 640, margin: '0 auto 48px' }}>
          Turn messy GitHub repos into professional portfolios. Score, document, and improve any public repo in seconds.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <button onClick={() => navigate('/login')} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '16px 36px', fontSize: 16, fontWeight: 700, borderRadius: 12, cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => {e.currentTarget.style.background='#2563eb'}} onMouseLeave={e => {e.currentTarget.style.background='#3b82f6'}}>
            Grade My Repo â†’
          </button>
          <button onClick={() => navigate('/pricing')} style={{ background: 'transparent', color: '#8b949e', border: '1px solid #1e293b', padding: '16px 36px', fontSize: 16, fontWeight: 700, borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => {e.currentTarget.style.color='#f0f6fc'; e.currentTarget.style.borderColor='#8b949e'}} onMouseLeave={e => {e.currentTarget.style.color='#8b949e'; e.currentTarget.style.borderColor='#1e293b'}}>
            See Pricing
          </button>
        </div>
      </section>

      {/* ——— BENTO BOX FEATURES ——— */}
      <section id="features" style={{ padding: '80px 5vw' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 16, letterSpacing: '-0.02em' }}>Everything you need</h2>
          <p style={{ textAlign: 'center', color: '#8b949e', fontSize: 18, marginBottom: 60 }}>Stop fighting with markdown. Let the system write your docs.</p>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
            gap: 20,
            gridAutoRows: 'minmax(180px, auto)'
          }}>
            <BentoCard emoji="📊" name="Portfolio Score" desc="Deterministically grade your repos across 5 dimensions: code quality, docs, structure, and more." colSpan={2} />
            <BentoCard emoji="📄" name="README Generator" desc="Auto-write beautiful, comprehensive documentation perfectly tailored to your code." />
            
            <BentoCard emoji="↔️" name="PR Autopilot" desc="Writes detailed pull request descriptions by analyzing your diffs." />
            <BentoCard emoji="📝" name="Changelog" desc="Generate polished release notes directly from your commit history." />
            <BentoCard emoji="🤝" name="Onboarding Doc" desc="Generate contributing wikis so new developers can get started in minutes." />

            <BentoCard emoji="🔍" name="Repo Audit" desc="Identify junk files, exposed secrets, and security vulnerabilities instantly." />
            <BentoCard emoji="⚡" name="Quick Install" desc="Generate copy-paste install scripts for 20+ package managers." />
            <BentoCard emoji="🌐" name="Multi-Language" desc="Translate your READMEs into 20 languages to reach a global open-source audience." />
            
            <BentoCard emoji="✅" name="Doc Validator" desc="Score and check your documentation for typos and inaccuracies." />
            <BentoCard emoji="📦" name="Issue Templates" desc="Generate standard GitHub issue templates for Bug Reports and Feature Requests." colSpan={2} />
          </div>
        </div>
      </section>

      {/* ——— HOW IT WORKS ——— */}
      <section style={{ padding: '120px 5vw', background: '#0f172a', borderTop: '1px solid #1e293b' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 60, letterSpacing: '-0.02em' }}>How it works</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 40, textAlign: 'center' }}>
            {[
              { num: '1', title: 'Connect GitHub', desc: 'Sign in securely and sync your public repositories instantly.' },
              { num: '2', title: 'Select a Repo', desc: 'Choose a repository from your unified GitGrade dashboard.' },
              { num: '3', title: 'Generate & Export', desc: 'Run our tools and export polished markdown in seconds.' }
            ].map(step => (
              <div key={step.num} style={{ position: 'relative' }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: '#3b82f6', lineHeight: 1, marginBottom: 16 }}>{step.num}</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#f0f6fc' }}>{step.title}</h3>
                <p style={{ color: '#8b949e', fontSize: 14, lineHeight: 1.6 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* â”€â”€ FOOTER â”€â”€ */}
      <footer style={{ borderTop: '1px solid #1e293b', padding: '60px 5vw 40px', background: '#020617' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 40, marginBottom: 40 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#fff' }}>G</div>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#f0f6fc' }}>GitGrade</span>
            </div>
            <p style={{ color: '#8b949e', fontSize: 14, maxWidth: 250 }}>Grade your repo. Land the job. The ultimate suite for developers.</p>
          </div>
          <div style={{ display: 'flex', gap: 60 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <strong style={{ color: '#f0f6fc', fontSize: 14 }}>Product</strong>
              <a href="#features" style={{ color: '#8b949e', fontSize: 14, textDecoration: 'none' }}>Features</a>
              <a href="/pricing" style={{ color: '#8b949e', fontSize: 14, textDecoration: 'none' }}>Pricing</a>
              <a href="/login" style={{ color: '#8b949e', fontSize: 14, textDecoration: 'none' }}>Login</a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <strong style={{ color: '#f0f6fc', fontSize: 14 }}>Legal</strong>
              <a href="/privacy" style={{ color: '#8b949e', fontSize: 14, textDecoration: 'none' }}>Privacy Policy</a>
              <a href="/terms" style={{ color: '#8b949e', fontSize: 14, textDecoration: 'none' }}>Terms of Service</a>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', color: '#8b949e', fontSize: 13, borderTop: '1px solid #1e293b', paddingTop: 24 }}>
          Â© 2024 GitGrade. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
