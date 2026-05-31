import React, { useState } from 'react';
import { parsePrUrl, ghFetch } from '../utils/github';
import { callAI } from '../utils/ai';
import { copyToClipboard } from '../utils/markdown';
import { useApp } from '../context/AppContext';
import OutputBox from '../components/shared/OutputBox';
import SectionCard from '../components/shared/SectionCard';

const ACCENT = '#7C3AED';

const TEMPLATES = [
  { id: 'standard', emoji: 'ðŸ“‹', label: 'Standard PR' },
  { id: 'feature', emoji: 'âœ¨', label: 'Feature PR' },
  { id: 'bugfix', emoji: 'ðŸ›', label: 'Bug Fix' },
  { id: 'refactor', emoji: 'â™»ï¸', label: 'Refactor' },
  { id: 'breaking', emoji: 'âš ï¸', label: 'Breaking Change' },
  { id: 'release', emoji: 'ðŸš€', label: 'Release PR' },
];

function detectPrimaryType(commits) {
  const typeCounts = {};
  const typeRx = /^(feat|fix|chore|refactor|docs|style|test|ci|perf|build)[\(!:]/;
  commits.forEach(c => {
    const m = c.commit.message.match(typeRx);
    if (m) typeCounts[m[1]] = (typeCounts[m[1]] || 0) + 1;
  });
  let maxType = null; let maxCount = 0;
  for (const [t, cnt] of Object.entries(typeCounts)) { if (cnt > maxCount) { maxType = t; maxCount = cnt; } }
  return maxType;
}

function autoDetectTemplate(commits) {
  const allMessages = commits.map(c => c.commit.message).join(' ').toLowerCase();
  if (allMessages.includes('breaking') || commits.some(c => /!\s*:/.test(c.commit.message))) return 'breaking';
  const primary = detectPrimaryType(commits);
  if (primary === 'fix') return 'bugfix';
  if (primary === 'feat') return 'feature';
  if (primary === 'refactor' || primary === 'chore') return 'refactor';
  return 'standard';
}

const TEMPLATE_PROMPTS = {
  standard: (ctx) => `Generate a Standard PR description for this pull request.\n\n${ctx}\n\nFormat:\n## Summary\n(2-3 sentences)\n## Changes Made\n- bullet list\n## Type of Change\n- [ ] Bug fix\n- [ ] New feature\n- [ ] Breaking change\n- [ ] Documentation update\n## How to Test\n## Notes for Reviewer`,
  feature: (ctx) => `Generate a Feature PR description.\n\n${ctx}\n\nFormat:\n## What This Adds\n## Why We're Adding It\n## How It Works (brief technical overview)\n## Checklist\n- [ ] Tests added\n- [ ] Docs updated\n## Edge Cases Considered`,
  bugfix: (ctx) => `Generate a Bug Fix PR description.\n\n${ctx}\n\nFormat:\n## Bug Description\n## Root Cause\n## Fix Applied\n## Regression Testing\n## Related Issues\n## Risk Assessment`,
  refactor: (ctx) => `Generate a Refactor PR description.\n\n${ctx}\n\nFormat:\n## What Changed\n## Why We Refactored\n## What Stays the Same (behavior-preserving)\n## Testing Approach\n## Migration Notes (if any)`,
  breaking: (ctx) => `Generate a Breaking Change PR description.\n\n${ctx}\n\nFormat:\n## âš ï¸ BREAKING CHANGE\n(1 sentence summary)\n## What Changed\n## Migration Guide\n### Before:\n\`\`\`\n[old code]\n\`\`\`\n### After:\n\`\`\`\n[new code]\n\`\`\`\n## Version Impact\n## Affected Users`,
  release: (ctx) => `Generate a Release PR description.\n\n${ctx}\n\nFormat:\n## Release Summary\n## What's New âœ¨\n## Bug Fixes ðŸ›\n## Breaking Changes âš ï¸\n## Upgrade Steps\n## Checklist\n- [ ] CHANGELOG updated\n- [ ] Version bumped\n- [ ] Release notes drafted`,
};

export default function PRAutopilot() {
  const { owner, repo } = useParams();

  const { incrementGeneration, isAtLimit, openUpgradeModal } = useApp();
  const [prUrl, setPrUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState('');
  const [prData, setPrData] = useState(null);
  const [error, setError] = useState('');
  const [template, setTemplate] = useState('standard');
  const [autoTemplate, setAutoTemplate] = useState('standard');
  const [teamContext, setTeamContext] = useState(() => localStorage.getItem('gg_pr_team_ctx') || '');
  const [customInstructions, setCustomInstructions] = useState('');
  const [output, setOutput] = useState('');
  const [titles, setTitles] = useState([]);
  const [copiedTitle, setCopiedTitle] = useState(null);
  const [generating, setGenerating] = useState(false);

  const saveTeamContext = (val) => { setTeamContext(val); localStorage.setItem('gg_pr_team_ctx', val); };

  const loadPR = async () => {
    const parsed = parsePrUrl(prUrl);
    if (!parsed) { setError('Enter a valid PR URL: https://github.com/owner/repo/pull/123'); return; }
    setError(''); setLoading(true); setOutput(''); setPrData(null);
    const msgs = ['Fetching PR data...', 'Analysing commits...', 'Detecting change type...'];
    let mi = 0; setLoadMsg(msgs[0]);
    const interval = setInterval(() => { mi = Math.min(mi + 1, msgs.length - 1); setLoadMsg(msgs[mi]); }, 800);
    try {
      const { owner, repo, pr } = parsed;
      const [meta, commits, files] = await Promise.all([
        ghFetch(`/repos/${owner}/${repo}/pulls/${pr}`),
        ghFetch(`/repos/${owner}/${repo}/pulls/${pr}/commits?per_page=30`),
        ghFetch(`/repos/${owner}/${repo}/pulls/${pr}/files?per_page=50`),
      ]);
      if (!meta) throw new Error('PR not found. Ensure the repo is public and the PR number is correct.');
      const detectedTemplate = autoDetectTemplate(commits || []);
      setAutoTemplate(detectedTemplate); setTemplate(detectedTemplate);
      setPrData({ owner, repo, pr, meta, commits: commits || [], files: files || [] });
    } catch (e) { setError(e.message); }
    finally { clearInterval(interval); setLoading(false); }
  };

  const generate = async (tpl = template) => {
    if (!prData) return;
    if (isAtLimit) { openUpgradeModal('PR Autopilot', 'Write PR descriptions with AI'); return; }
    setGenerating(true); setOutput('');
    try {
      const { owner, repo, pr, meta, commits, files } = prData;
      const commitList = commits.slice(0, 30).map(c => `- ${c.commit.message.split('\n')[0]}`).join('\n');
      const fileList = files.slice(0, 30).map(f => `${f.status}: ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n');
      const ctx = `PR #${pr} in ${owner}/${repo}
Title: ${meta.title}
Author: ${meta.user?.login}
Base: ${meta.base?.ref} â† Head: ${meta.head?.ref}
Commits (${commits.length}):
${commitList}
Changed files (${files.length}):
${fileList}
${teamContext ? `\nTeam conventions:\n${teamContext}` : ''}
${customInstructions ? `\nCustom instructions:\n${customInstructions}` : ''}`;

      const [desc, titlesRaw] = await Promise.all([
        callAI([{ role: 'user', content: TEMPLATE_PROMPTS[tpl](ctx) }], 'You are an expert developer writing a PR description. Be specific to the actual code changes, not generic.', 1800),
        callAI([{ role: 'user', content: `Based on these commits, suggest 3 PR titles in conventional commit format (type(scope): description). Just return 3 lines, no numbering.\n\n${commitList}` }], 'Return exactly 3 lines, each a git commit title in conventional commit format.', 200),
      ]);
      setOutput(desc);
      setTitles(titlesRaw.split('\n').filter(t => t.trim()).slice(0, 3));
      incrementGeneration();
    } catch (e) { setError(e.message); }
    finally { setGenerating(false); }
  };

  const copyTitle = async (t, i) => { await copyToClipboard(t); setCopiedTitle(i); setTimeout(() => setCopiedTitle(null), 2000); };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 28 }}>ðŸ”€</span>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-.02em' }}>PR Autopilot</h1>
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>Paste a PR URL and get a professional description auto-written</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={prUrl} onChange={e => setPrUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadPR()} placeholder="https://github.com/owner/repo/pull/123" style={{ flex: 1, padding: '11px 14px', borderRadius: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }} />
          <button onClick={loadPR} disabled={loading} className="btn btn-primary" style={{ background: ACCENT }}>
            {loading ? loadMsg : 'Load PR'}
          </button>
        </div>
        {error && <div style={{ marginTop: 10, padding: '10px 14px', background: '#ef444415', border: '1px solid #ef444430', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>{error}</div>}
      </div>

      {prData && (
        <div className="fade-up">
          {/* PR Summary */}
          <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>{prData.meta.title}</div>
            <div style={{ fontSize: 12, color: '#475569' }}>#{prData.pr} by {prData.meta.user?.login} Â· {prData.meta.base?.ref} â† {prData.meta.head?.ref}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {[
                { label: `${prData.commits.length} commits`, color: ACCENT },
                { label: `${prData.files.length} files`, color: '#94a3b8' },
                { label: `Auto: ${TEMPLATES.find(t => t.id === autoTemplate)?.label}`, color: '#22c55e' },
              ].map(b => <span key={b.label} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: `${b.color}20`, color: b.color, border: `1px solid ${b.color}30` }}>{b.label}</span>)}
            </div>
          </div>

          {/* Team context */}
          <SectionCard title="Team Context" accentColor={ACCENT} style={{ marginBottom: 16 }}>
            <textarea value={teamContext} onChange={e => saveTeamContext(e.target.value)} placeholder="Persistent team conventions (saved across sessions). e.g. 'We use Linear tickets, format: LIN-123. Always link the ticket.'" style={{ width: '100%', minHeight: 70, padding: '10px 12px', borderRadius: 6, resize: 'vertical', fontSize: 12, lineHeight: 1.6 }} />
          </SectionCard>

          {/* Template selector */}
          <SectionCard title="Template" accentColor={ACCENT} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => { setTemplate(t.id); if (output) generate(t.id); }} style={{ padding: '7px 13px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: template === t.id ? ACCENT : '#0f172a', color: template === t.id ? '#fff' : '#94a3b8', border: `1px solid ${template === t.id ? ACCENT : '#1e293b'}`, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {t.emoji} {t.label} {t.id === autoTemplate && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#22c55e20', color: '#22c55e', marginLeft: 2 }}>AUTO</span>}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* Custom instructions */}
          <SectionCard title="Custom Instructions" accentColor={ACCENT} style={{ marginBottom: 16 }}>
            <textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)} placeholder="Any specific requirements for this PR description..." style={{ width: '100%', minHeight: 60, padding: '10px 12px', borderRadius: 6, resize: 'vertical', fontSize: 12 }} />
          </SectionCard>

          <button onClick={() => generate()} disabled={generating} className="btn btn-primary" style={{ background: ACCENT, width: '100%', justifyContent: 'center', padding: '12px', marginBottom: 20, fontSize: 14 }}>
            {generating ? 'âœï¸ Writing PR description...' : 'âœ¨ Generate PR Description'}
          </button>

          {/* Suggested titles */}
          {titles.length > 0 && (
            <SectionCard title="Suggested PR Titles" accentColor={ACCENT} style={{ marginBottom: 16 }}>
              {titles.map((t, i) => (
                <div key={i} onClick={() => copyTitle(t, i)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#0f172a', borderRadius: 6, marginBottom: 6, cursor: 'pointer', border: '1px solid #1e293b', transition: 'all .15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = ACCENT} onMouseLeave={e => e.currentTarget.style.borderColor = '#1e293b'}>
                  <code style={{ flex: 1, fontSize: 12, color: '#c084fc', fontFamily: "'JetBrains Mono',monospace" }}>{t}</code>
                  <span style={{ fontSize: 11, color: copiedTitle === i ? '#22c55e' : '#475569', flexShrink: 0 }}>{copiedTitle === i ? 'Copied âœ“' : 'Click to copy'}</span>
                </div>
              ))}
            </SectionCard>
          )}

          {/* Output */}
          {output && <OutputBox content={output} filename={`PR-${prData.pr}-description.md`} accentColor={ACCENT} />}
        </div>
      )}
    </div>
  );
}
