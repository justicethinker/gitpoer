import React, { useState } from 'react';
import { parseUrl, ghFetch, tryRaw, fetchRepoContext } from '../utils/github';
import { callAI } from '../utils/ai';
import { dlMd, copyToClipboard } from '../utils/markdown';
import { useApp } from '../context/AppContext';
import OutputBox from '../components/shared/OutputBox';
import UrlInput from '../components/shared/UrlInput';
import SectionCard from '../components/shared/SectionCard';

const ACCENT = '#2563eb';

const RUNTIMES = [
  { id: 'node', label: 'Node.js', color: '#22c55e', detect: files => files.some(f => f === 'package.json') },
  { id: 'python', label: 'Python', color: '#3b82f6', detect: files => files.some(f => f === 'requirements.txt' || f === 'pyproject.toml') },
  { id: 'go', label: 'Go', color: '#06b6d4', detect: files => files.some(f => f === 'go.mod') },
  { id: 'rust', label: 'Rust', color: '#f97316', detect: files => files.some(f => f === 'Cargo.toml') },
  { id: 'ruby', label: 'Ruby', color: '#ef4444', detect: files => files.some(f => f === 'Gemfile') },
  { id: 'java', label: 'Java', color: '#eab308', detect: files => files.some(f => f === 'pom.xml' || f === 'build.gradle') },
  { id: 'php', label: 'PHP', color: '#8b5cf6', detect: files => files.some(f => f === 'composer.json') },
];

const FRAMEWORKS = [
  { id: 'nextjs', label: 'Next.js', detect: files => files.some(f => f.includes('next.config')) },
  { id: 'react', label: 'React', detect: files => false }, // detected from package.json
  { id: 'django', label: 'Django', detect: files => files.some(f => f === 'manage.py') },
  { id: 'fastapi', label: 'FastAPI', detect: files => files.some(f => f === 'main.py') },
  { id: 'vue', label: 'Vue', detect: files => files.some(f => f.includes('vue.config')) },
  { id: 'angular', label: 'Angular', detect: files => files.some(f => f === 'angular.json') },
];

const ENTRY_POINTS = ['main.py', 'app.py', 'server.py', 'index.js', 'server.js', 'app.js', 'main.go', 'app.go', 'main.rs', 'Main.java'];

function getInstallCmd(runtime, { owner, repo }) {
  const cmds = {
    node: `npm install`,
    python: `pip install -r requirements.txt`,
    go: `go mod download`,
    rust: `cargo build`,
    ruby: `bundle install`,
    java: `mvn install`,
    php: `composer install`,
  };
  return cmds[runtime?.id] || 'install dependencies';
}

function getRunCmd(runtime, entry) {
  if (runtime?.id === 'node') return 'npm run dev';
  if (runtime?.id === 'python') return `python ${entry || 'main.py'}`;
  if (runtime?.id === 'go') return 'go run .';
  if (runtime?.id === 'rust') return 'cargo run';
  if (runtime?.id === 'ruby') return 'ruby app.rb';
  return './start.sh';
}

export default function QuickInstall() {
  const { owner, repo } = useParams();

  const { incrementGeneration, isAtLimit, openUpgradeModal, addRecentRepo } = useApp();
  const [url, setUrl] = useState(`https://github.com/${owner}/${repo}`);
  const [scanning, setScanning] = useState(false);
  const [stack, setStack] = useState(null);
  const [error, setError] = useState('');
  const [audience, setAudience] = useState('developer');
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState({});

  const doScan = async () => {
    const parsed = parseUrl(url);
    if (!parsed) { setError('Enter a valid GitHub repo URL'); return; }
    setError(''); setScanning(true); setStack(null); setOutput('');
    try {
      const { owner, repo } = parsed;
      const ctx = await fetchRepoContext(owner, repo);
      addRecentRepo(owner, repo);
      const files = ctx.files || [];

      const runtime = RUNTIMES.find(r => r.detect(files)) || null;
      const framework = FRAMEWORKS.find(fw => fw.detect(files)) || null;
      const entry = ENTRY_POINTS.find(e => files.includes(e)) || null;
      const hasDocker = files.some(f => f === 'Dockerfile' || f === 'docker-compose.yml' || f === 'docker-compose.yaml');
      const databases = [];
      if (files.some(f => /prisma|typeorm|sequelize|mongoose/.test(f))) databases.push('ORM detected');
      if (files.some(f => /postgres|pg/.test(f))) databases.push('PostgreSQL');
      if (files.some(f => /mongo/.test(f))) databases.push('MongoDB');

      // Read .env.example for env vars
      let envVars = [];
      const envExample = await tryRaw(owner, repo, '.env.example', ctx.meta.default_branch);
      if (envExample) {
        envVars = envExample.split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => l.split('=')[0].trim());
      }

      // Read package.json for scripts
      let scripts = {};
      const pkgRaw = await tryRaw(owner, repo, 'package.json', ctx.meta.default_branch);
      if (pkgRaw) { try { scripts = JSON.parse(pkgRaw).scripts || {}; } catch {} }

      // Read entry file for context
      let entryContent = '';
      if (entry) { entryContent = (await tryRaw(owner, repo, entry, ctx.meta.default_branch) || '').slice(0, 600); }

      setStack({ owner, repo, meta: ctx.meta, files, runtime, framework, entry, hasDocker, databases, envVars, scripts, envExample, entryContent, branch: ctx.meta.default_branch });
    } catch (e) { setError(e.message); }
    finally { setScanning(false); }
  };

  const generate = async () => {
    if (!stack) return;
    if (isAtLimit) { openUpgradeModal('Quick Install', 'Generate installation guides'); return; }
    setGenerating(true); setOutput('');
    try {
      const { owner, repo, runtime, framework, entry, hasDocker, databases, envVars, scripts, entryContent, envExample } = stack;
      const systemPrompt = audience === 'developer'
        ? 'You are a developer writing a concise, no-nonsense install guide. Commands only, minimal prose, assume terminal proficiency.'
        : audience === 'non-developer'
        ? 'You are writing for a non-developer. Every step explained. No jargon. Encouraging tone. Tell them what each command does.'
        : 'Write a dual-section guide: first a Quick Start (developer-terse commands), then a Detailed Walkthrough (non-developer friendly).';

      const ctx = `Repository: ${owner}/${repo}
Runtime: ${runtime?.label || 'Unknown'}
Framework: ${framework?.label || 'None detected'}
Entry point: ${entry || 'Unknown'}
Docker: ${hasDocker ? 'Yes' : 'No'}
Database: ${databases.join(', ') || 'None detected'}
Required env vars: ${envVars.join(', ') || 'None'}
npm scripts: ${Object.entries(scripts).map(([k, v]) => `${k}: ${v}`).join(', ') || 'None'}
.env.example:
${envExample || 'Not present'}
Entry file snippet:
${entryContent || 'Not available'}`;

      const prompt = `${ctx}\n\nGenerate a complete installation guide for this repository.\nTarget audience: ${audience}.\nInclude: Prerequisites, Installation steps, Environment setup, Running locally, Common issues/troubleshooting.\nBe specific to this exact repo â€” use actual file names, actual commands, actual env vars.`;
      const result = await callAI([{ role: 'user', content: prompt }], systemPrompt, 2000);
      setOutput(result);
      incrementGeneration();
    } catch (e) { setError(e.message); }
    finally { setGenerating(false); }
  };

  const copyCmd = async (key, cmd) => { await copyToClipboard(cmd); setCopied(p => ({ ...p, [key]: true })); setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 2000); };

  const oneLinerCmds = stack ? {
    clone: `git clone https://github.com/${stack.owner}/${stack.repo}`,
    install: getInstallCmd(stack.runtime, stack),
    run: getRunCmd(stack.runtime, stack.entry),
    combined: `git clone https://github.com/${stack.owner}/${stack.repo} && cd ${stack.repo} && ${getInstallCmd(stack.runtime, stack)} && ${getRunCmd(stack.runtime, stack.entry)}`,
  } : {};

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 28 }}>âš¡</span>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-.02em' }}>Quick Install</h1>
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>Detect the stack and generate a complete installation guide</p>
          </div>
        </div>
        
        {error && <div style={{ marginTop: 10, padding: '10px 14px', background: '#ef444415', border: '1px solid #ef444430', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>{error}</div>}
      </div>

      {stack && (
        <div className="fade-up">
          {/* Stack card */}
          <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              {stack.runtime && (
                <div style={{ textAlign: 'center', background: `${stack.runtime.color}15`, border: `1px solid ${stack.runtime.color}30`, borderRadius: 10, padding: '12px 20px' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: stack.runtime.color }}>{stack.runtime.label}</div>
                  <div style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>RUNTIME</div>
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{stack.owner}/{stack.repo}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {stack.framework && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#1e293b', color: '#94a3b8' }}>{stack.framework.label}</span>}
                  {stack.entry && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#1e293b', color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace" }}>entry: {stack.entry}</span>}
                  {stack.hasDocker && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#1e40af20', color: '#3b82f6' }}>ðŸ³ Docker</span>}
                  {stack.databases.map(db => <span key={db} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#0f766e20', color: '#0f766e' }}>ðŸ—„ {db}</span>)}
                </div>
                {stack.envVars.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: '#475569' }}>ENV VARS:</span>
                    {stack.envVars.slice(0, 8).map(v => <code key={v} style={{ fontSize: 10, padding: '1px 6px', background: '#eab30815', color: '#eab308', borderRadius: 3, border: '1px solid #eab30830', fontFamily: "'JetBrains Mono',monospace" }}>{v}</code>)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* One-liner commands */}
          <SectionCard title="One-Liner Commands" accentColor={ACCENT} style={{ marginBottom: 16 }}>
            {Object.entries(oneLinerCmds).map(([key, cmd]) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: '#475569', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase' }}>{key === 'combined' ? 'ðŸ”— Full Combined' : key}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#020817', borderRadius: 7, border: '1px solid #1e293b', padding: '10px 12px' }}>
                  <code style={{ flex: 1, fontSize: 12, color: '#a5f3fc', fontFamily: "'JetBrains Mono',monospace", wordBreak: 'break-all' }}>{cmd}</code>
                  <button onClick={() => copyCmd(key, cmd)} style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 5, background: '#1e293b', color: copied[key] ? '#22c55e' : '#94a3b8', border: 'none', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                    {copied[key] ? 'Copied âœ“' : 'Copy'}
                  </button>
                </div>
              </div>
            ))}
          </SectionCard>

          {/* Audience selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[['developer', 'ðŸ‘©â€ðŸ’» Developer'], ['non-developer', 'ðŸ‘¤ Non-Developer'], ['both', 'ðŸ‘¥ Both']].map(([id, label]) => (
              <button key={id} onClick={() => setAudience(id)} style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: audience === id ? ACCENT : '#020617', color: audience === id ? '#fff' : '#94a3b8', border: `1px solid ${audience === id ? ACCENT : '#1e293b'}` }}>{label}</button>
            ))}
          </div>

          <button onClick={generate} disabled={generating} className="btn btn-primary" style={{ background: ACCENT, width: '100%', justifyContent: 'center', padding: '12px', marginBottom: 20, fontSize: 14 }}>
            {generating ? 'â³ Generating install guide...' : 'âš¡ Generate Install Guide'}
          </button>

          {output && <OutputBox content={output} filename={`INSTALL-${stack.owner}-${stack.repo}.md`} accentColor={ACCENT} />}
        </div>
      )}
    </div>
  );
}
