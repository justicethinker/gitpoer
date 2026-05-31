import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div style={{ background: '#020617', minHeight: '100vh', color: '#f8fafc', fontFamily: 'DM Sans, sans-serif' }}>
      <nav style={{ padding: '0 5vw', height: 72, display: 'flex', alignItems: 'center', borderBottom: '1px solid #1e293b', background: '#020617' }}>
        <button onClick={() => navigate('/')} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          ← Back to Home
        </button>
      </nav>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '60px 5vw 120px' }}>
        <h1 style={{ fontSize: 40, fontWeight: 800, marginBottom: 16, letterSpacing: '-0.02em', color: '#f8fafc' }}>Privacy Policy</h1>
        <p style={{ color: '#94a3b8', fontSize: 16, marginBottom: 40 }}>Last Updated: May 31, 2026</p>

        <section style={{ marginBottom: 40, color: '#cbd5e1', lineHeight: 1.8 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#f8fafc', marginBottom: 16 }}>1. Information We Collect</h2>
          <p style={{ marginBottom: 16 }}>
            When you use GitGrade, we collect certain information to provide and improve our services:
          </p>
          <ul style={{ paddingLeft: 24, marginBottom: 16 }}>
            <li style={{ marginBottom: 8 }}><strong>Account Information:</strong> When you sign in via GitHub, we receive basic profile information such as your name, email address, and profile picture.</li>
            <li style={{ marginBottom: 8 }}><strong>Repository Data:</strong> We access public repositories you choose to analyze. We do not store your source code permanently; it is only processed in-memory to generate documentation and insights.</li>
            <li style={{ marginBottom: 8 }}><strong>API Keys:</strong> If you provide your own API key (e.g., Gemini), it is stored locally in your browser and never transmitted to our servers for storage.</li>
          </ul>
        </section>

        <section style={{ marginBottom: 40, color: '#cbd5e1', lineHeight: 1.8 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#f8fafc', marginBottom: 16 }}>2. How We Use Information</h2>
          <p style={{ marginBottom: 16 }}>We use the collected data exclusively to:</p>
          <ul style={{ paddingLeft: 24, marginBottom: 16 }}>
            <li style={{ marginBottom: 8 }}>Provide the core functionality of generating documentation and auditing repositories.</li>
            <li style={{ marginBottom: 8 }}>Authenticate users and manage subscription tiers.</li>
            <li style={{ marginBottom: 8 }}>Improve our AI prompt engineering to yield better results for all users.</li>
          </ul>
        </section>

        <section style={{ marginBottom: 40, color: '#cbd5e1', lineHeight: 1.8 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#f8fafc', marginBottom: 16 }}>3. AI Data Processing</h2>
          <p style={{ marginBottom: 16 }}>
            GitGrade utilizes third-party large language models (such as Google Gemini). Code snippets and metadata from your public repositories may be sent to these APIs to generate READMEs, changelogs, and audits. We ensure that our API providers are bound by strict data processing agreements that prohibit training their models on your private data without consent.
          </p>
        </section>

        <section style={{ marginBottom: 40, color: '#cbd5e1', lineHeight: 1.8 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#f8fafc', marginBottom: 16 }}>4. Data Security</h2>
          <p style={{ marginBottom: 16 }}>
            We implement industry-standard security measures to protect your data. All data in transit is encrypted using TLS/SSL. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section style={{ color: '#cbd5e1', lineHeight: 1.8 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#f8fafc', marginBottom: 16 }}>5. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us at <a href="mailto:privacy@gitgrade.dev" style={{ color: '#3b82f6', textDecoration: 'none' }}>privacy@gitgrade.dev</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
