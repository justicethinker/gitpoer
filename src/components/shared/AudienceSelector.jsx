import React from 'react';

export const AUDIENCES = [
  {
    id: 'default',
    emoji: 'ðŸ“„',
    label: 'Standard',
    promptFocus: 'Write a clean, standard open-source README.'
  },
  {
    id: 'recruiter',
    emoji: 'ðŸ§‘â€ðŸ’¼',
    label: 'Recruiter',
    promptFocus: `Write a GitHub README optimised for a **technical recruiter**.
CRITICAL: Recruiters skim. Make every line count. Avoid fluff. Include 1-cmd setup.`
  },
  {
    id: 'hackathon',
    emoji: 'ðŸ†',
    label: 'Hackathon Judge',
    promptFocus: `Write a GitHub README optimised for a **hackathon judge**.
CRITICAL: Lead with the problem. Make the novelty unmissable. Show don't tell.`
  },
  {
    id: 'opensource',
    emoji: 'ðŸŒ',
    label: 'Open Source',
    promptFocus: `Write a GitHub README optimised for **open source contributors and maintainers**.
CRITICAL: Technical, welcoming, thorough. Include architecture overview and contributing guide.`
  },
  {
    id: 'internship',
    emoji: 'ðŸŽ“',
    label: 'Internship App',
    promptFocus: `Write a GitHub README optimised for a **student applying to internships**.
CRITICAL: Authentic and growth-focused. Include "Why I Built This" and "What I Learned".`
  }
];

export default function AudienceSelector({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
      {AUDIENCES.map(a => (
        <button
          key={a.id}
          onClick={() => onChange(a.id)}
          style={{
            padding: '6px 14px',
            borderRadius: 20,
            background: value === a.id ? 'rgba(16, 185, 129, 0.15)' : '#1e293b',
            border: `1px solid ${value === a.id ? '#3b82f6' : '#334155'}`,
            color: value === a.id ? '#3b82f6' : '#94a3b8',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.2s ease',
          }}
        >
          <span>{a.emoji}</span>
          {a.label}
        </button>
      ))}
    </div>
  );
}
