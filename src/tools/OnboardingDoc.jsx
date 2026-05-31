import {  useState, useRef  } from 'react';
import { useParams } from 'react-router-dom';
import { parseUrl, ghFetch, tryRaw, fetchRepoContext } from '../utils/github';
import { callAI } from '../utils/ai';
import { renderMd, dlMd } from '../utils/markdown';
import { useApp } from '../context/AppContext';
import OutputBox from '../components/shared/OutputBox';
import UrlInput from '../components/shared/UrlInput';
import SectionCard from '../components/shared/SectionCard';

// â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ACCENT = '#0F766E';

const ALL_SECTIONS = [
  {
    id: 'overview',
    label: 'Project Overview',
    emoji: 'ðŸ—ºï¸',
    desc: 'What it does, who uses it, technical approach, activity state',
  },
  {
    id: 'architecture',
    label: 'Architecture',
    emoji: 'ðŸ—ï¸',
    desc: 'Pattern inferred from folders, modules, data flow, external services',
  },
  {
    id: 'setup',
    label: 'Local Setup',
    emoji: 'âš™ï¸',
    desc: 'Every env var explained, clone + install + run commands',
  },
  {
    id: 'flows',
    label: 'Key Code Flows',
    emoji: 'ðŸ”„',
    desc: 'Where requests enter, main flows, files to read first',
  },
  {
    id: 'conventions',
    label: 'Conventions & Patterns',
    emoji: 'ðŸ“',
    desc: 'Naming conventions, how to add features, error handling',
  },
  {
    id: 'gotchas',
    label: 'Gotchas & Landmines',
    emoji: 'âš ï¸',
    desc: 'Non-obvious decisions, known tech debt, practical warnings',
  },
  {
    id: 'testing',
    label: 'Testing Guide',
    emoji: 'ðŸ§ª',
    desc: 'Run tests, write tests, test data',
  },
  {
    id: 'deployment',
    label: 'Deployment',
    emoji: 'ðŸš€',
    desc: 'Environments, deploy commands, CI pipeline, rollback',
  },
];

const DEFAULT_SELECTED = new Set(['overview', 'architecture', 'setup', 'flows', 'gotchas']);

const ESSENTIAL_SELECTED = new Set(['overview', 'setup', 'gotchas']);

const ROLE_PRESETS = [
  'full-stack engineer',
  'backend engineer',
  'frontend engineer',
  'DevOps / SRE',
  'junior developer',
  'senior engineer',
  'engineering manager',
  'contractor / consultant',
];

// â”€â”€ Deep scan file lists â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CONFIG_FILES = [
  'package.json',
  'requirements.txt',
  'pyproject.toml',
  'go.mod',
  'Cargo.toml',
  'cargo.toml',
  '.env.example',
  '.env.sample',
  'Makefile',
  'docker-compose.yml',
  'docker-compose.yaml',
];

const ENTRY_FILES = [
  'main.py',
  'app.py',
  'server.py',
  'index.js',
  'server.js',
  'app.js',
  'main.js',
  'index.ts',
  'server.ts',
  'app.ts',
  'main.ts',
  'app.go',
  'main.go',
  'cmd/main.go',
  'src/main.rs',
  'lib/main.rb',
  'app.rb',
];

const MAX_FILE_CHARS = 500;

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function truncate(str, maxLen = MAX_FILE_CHARS) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + `\nâ€¦ [truncated, ${str.length - maxLen} more chars]` : str;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return 'â€”';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}yr ago`;
}

function getTopLang(langs) {
  const entries = Object.entries(langs || {});
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function getLangColor(lang) {
  const map = {
    JavaScript: '#f7df1e',
    TypeScript: '#3178c6',
    Python: '#3572a5',
    Go: '#00add8',
    Rust: '#dea584',
    Java: '#b07219',
    'C++': '#f34b7d',
    C: '#555555',
    Ruby: '#701516',
    PHP: '#4f5d95',
    Swift: '#f05138',
    Kotlin: '#a97bff',
    Shell: '#89e051',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Vue: '#41b883',
    Svelte: '#ff3e00',
  };
  return map[lang] || ACCENT;
}

// â”€â”€ Language bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function LangBar({ langs }) {
  const total = Object.values(langs).reduce((a, b) => a + b, 0);
  if (!total) return null;
  const sorted = Object.entries(langs).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Bar */}
      <div
        style={{
          display: 'flex',
          height: 8,
          borderRadius: 4,
          overflow: 'hidden',
          gap: 1,
        }}
      >
        {sorted.map(([lang, bytes]) => (
          <div
            key={lang}
            title={`${lang}: ${((bytes / total) * 100).toFixed(1)}%`}
            style={{
              flex: bytes,
              background: getLangColor(lang),
            }}
          />
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
        {sorted.slice(0, 6).map(([lang, bytes]) => (
          <div key={lang} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: getLangColor(lang),
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'DM Sans, sans-serif' }}>
              {lang}{' '}
              <span style={{ color: '#475569' }}>{((bytes / total) * 100).toFixed(1)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// â”€â”€ Stat pill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatPill({ label, value, icon }) {
  return (
    <div
      style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 8,
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 90,
        flex: 1,
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', fontFamily: 'DM Sans, sans-serif', lineHeight: 1 }}>
        {value ?? 'â€”'}
      </span>
      <span style={{ fontSize: 10, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'DM Sans, sans-serif' }}>
        {label}
      </span>
    </div>
  );
}

// â”€â”€ Feature flag pill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FeatureFlag({ label, active }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'DM Sans, sans-serif',
        background: active ? 'rgba(15,118,110,0.13)' : '#0f172a',
        color: active ? '#2dd4bf' : '#475569',
        border: `1px solid ${active ? 'rgba(15,118,110,0.35)' : '#1e293b'}`,
      }}
    >
      <span style={{ fontSize: 8, opacity: 0.9 }}>{active ? 'â—' : 'â—‹'}</span>
      {label}
    </span>
  );
}

// â”€â”€ Section toggle button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SectionToggle({ section, selected, onToggle }) {
  const on = selected.has(section.id);
  return (
    <button
      onClick={() => onToggle(section.id)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        width: '100%',
        background: on ? 'rgba(15,118,110,0.10)' : 'transparent',
        border: `1px solid ${on ? 'rgba(15,118,110,0.35)' : '#1e293b'}`,
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.15s, border-color 0.15s',
        outline: 'none',
      }}
    >
      {/* Checkbox */}
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: `2px solid ${on ? ACCENT : '#1e293b'}`,
          background: on ? ACCENT : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {on && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3L3.5 5.5L8 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      {/* Label + desc */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: on ? '#f1f5f9' : '#94a3b8', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.3 }}>
          {section.emoji} {section.label}
        </div>
        <div style={{ fontSize: 11, color: '#475569', fontFamily: 'DM Sans, sans-serif', marginTop: 2, lineHeight: 1.4 }}>
          {section.desc}
        </div>
      </div>
    </button>
  );
}

// â”€â”€ Progress bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ProgressBar({ value, label, phase }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }}>
          {phase === 'scanning' ? 'ðŸ” Scanning repoâ€¦' : `âœï¸ Generating: ${label}`}
        </span>
        <span style={{ fontSize: 12, color: ACCENT, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
          {Math.round(value)}%
        </span>
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{
            width: `${value}%`,
            background: `linear-gradient(90deg, ${ACCENT}, #14b8a6)`,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}

// â”€â”€ Tip row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function TipRow({ icon, tip }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5 }}>{tip}</span>
    </div>
  );
}

// â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function OnboardingDoc() {
  const { owner, repo } = useParams();

  const { isAtLimit, incrementGeneration } = useApp();

  const [url, setUrl] = useState(`https://github.com/${owner}/${repo}`);
  const [scanning, setScanning] = useState(false);
  const [repoCtx, setRepoCtx] = useState(null);      // result of deep scan
  const [scannedFiles, setScannedFiles] = useState({}); // { filename: content }
  const [scanError, setScanError] = useState('');

  const [selected, setSelected] = useState(new Set(DEFAULT_SELECTED));
  const [role, setRole] = useState('full-stack engineer');
  const [customInstructions, setCustomInstructions] = useState('');

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [progressPhase, setProgressPhase] = useState('scanning');
  const [genError, setGenError] = useState('');
  const [output, setOutput] = useState('');

  const abortRef = useRef(false);

  // â”€â”€ Section selection helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function toggleSection(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(ALL_SECTIONS.map((s) => s.id)));
  }

  function selectEssential() {
    setSelected(new Set(ESSENTIAL_SELECTED));
  }

  function selectNone() {
    setSelected(new Set());
  }

  // â”€â”€ Deep Scan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleScan() {
    const parsed = parseUrl(url);
    if (!parsed) {
      setScanError('Please enter a valid GitHub repository URL.');
      return;
    }
    setScanError('');
    setRepoCtx(null);
    setScannedFiles({});
    setOutput('');
    setGenError('');
    setScanning(true);

    try {
      const ctx = await fetchRepoContext(parsed.owner, parsed.repo);

      // Fetch contributors count
      const contributors = await ghFetch(
        `/repos/${parsed.owner}/${parsed.repo}/contributors?per_page=1&anon=1`
      );

      // Fetch open issues/PRs counts
      const issuesData = await ghFetch(
        `/repos/${parsed.owner}/${parsed.repo}/issues?state=open&per_page=1`
      );

      // Attach extras to meta
      ctx.meta._contributorsCount = Array.isArray(contributors) ? contributors.length : '?';
      ctx.meta._issuesOpen = ctx.meta.open_issues_count ?? '?';

      // Fetch CI workflow files
      const workflowPaths = ctx.files
        .filter((f) => f.startsWith('.github/workflows/') && (f.endsWith('.yml') || f.endsWith('.yaml')))
        .slice(0, 4);

      // Combine config + entry + ci files to fetch
      const filesToFetch = [
        ...CONFIG_FILES,
        ...ENTRY_FILES,
        ...workflowPaths,
      ];

      // Fetch all in parallel
      const results = await Promise.all(
        filesToFetch.map(async (file) => {
          const content = await tryRaw(parsed.owner, parsed.repo, file, ctx.branch);
          return [file, content];
        })
      );

      const fileMap = {};
      for (const [file, content] of results) {
        if (content) fileMap[file] = content;
      }

      setRepoCtx({ ...ctx, parsed });
      setScannedFiles(fileMap);
    } catch (err) {
      setScanError(err.message || 'Failed to scan repository.');
    } finally {
      setScanning(false);
    }
  }

  // â”€â”€ Generate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleGenerate() {
    if (!repoCtx) return;
    if (isAtLimit) {
      setGenError('You have reached your monthly generation limit. Please upgrade your plan.');
      return;
    }
    if (selected.size === 0) {
      setGenError('Please select at least one section to generate.');
      return;
    }

    abortRef.current = false;
    setGenError('');
    setOutput('');
    setGenerating(true);
    setProgress(0);
    setProgressPhase('scanning');
    setProgressLabel('');

    try {
      const { meta, branch, files, langs, commits, parsed } = repoCtx;

      // â”€â”€ Build prompt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      setProgressPhase('generating');
      setProgressLabel('Building contextâ€¦');
      setProgress(10);

      const selectedSections = ALL_SECTIONS.filter((s) => selected.has(s.id));

      // Summarize file tree
      const treeLines = files.slice(0, 300);
      const treeStr = treeLines.join('\n') + (files.length > 300 ? `\nâ€¦ and ${files.length - 300} more files` : '');

      // Build file contents block
      const fileContentsBlock = Object.entries(scannedFiles)
        .map(([path, content]) => `### ${path}\n\`\`\`\n${truncate(content)}\n\`\`\``)
        .join('\n\n');

      // Recent commits
      const commitLines = (commits || [])
        .slice(0, 15)
        .map((c) => `- ${c.sha?.slice(0, 7)} | ${c.commit?.author?.date?.slice(0, 10)} | ${c.commit?.message?.split('\n')[0]}`)
        .join('\n');

      // Languages summary
      const langsStr = Object.entries(langs || {})
        .sort((a, b) => b[1] - a[1])
        .map(([l]) => l)
        .join(', ');

      // Feature flags
      const hasDocker = !!(scannedFiles['docker-compose.yml'] || scannedFiles['docker-compose.yaml']);
      const hasMakefile = !!scannedFiles['Makefile'];
      const hasCI = Object.keys(scannedFiles).some((f) => f.startsWith('.github/workflows/'));
      const hasEnvExample = !!(scannedFiles['.env.example'] || scannedFiles['.env.sample']);

      // Sections to generate
      const sectionPrompts = selectedSections.map((s) => `- **${s.emoji} ${s.label}**: ${s.desc}`).join('\n');

      const customBlock = customInstructions.trim()
        ? `\n\n## BINDING CUSTOM INSTRUCTIONS\nThe following instructions MUST be followed exactly and take priority:\n${customInstructions.trim()}`
        : '';

      const system = `You are a senior engineer writing a comprehensive onboarding document for a software project. Your output must be:
- Specific: name actual files, actual commands, actual env vars found in the scanned data
- Practical: written for a ${role} who is joining the project today
- Complete: no placeholders, no "[TBD]", no "see docs for details" â€” if information is in the data, use it
- Well-structured markdown with clear headings, code blocks, and bullet points
- Honest: if something is unclear or missing from the scan data, say so briefly rather than fabricating`;

      const userMsg = `Generate a comprehensive onboarding document for the repository **${parsed.owner}/${parsed.repo}**.

## TARGET AUDIENCE
Role: **${role}**

## REPOSITORY METADATA
- Full name: ${meta.full_name}
- Description: ${meta.description || 'Not provided'}
- Primary language: ${getTopLang(langs) || 'Unknown'}
- All languages: ${langsStr || 'Unknown'}
- Default branch: ${branch}
- Stars: ${meta.stargazers_count ?? 0} | Forks: ${meta.forks_count ?? 0} | Open issues: ${meta.open_issues_count ?? 0}
- License: ${meta.license?.spdx_id || 'None'}
- Last push: ${meta.pushed_at ? new Date(meta.pushed_at).toDateString() : 'Unknown'}
- Created: ${meta.created_at ? new Date(meta.created_at).toDateString() : 'Unknown'}
- Has wiki: ${meta.has_wiki ? 'Yes' : 'No'}
- Topics: ${(meta.topics || []).join(', ') || 'None'}

## INFRASTRUCTURE FLAGS
- Docker Compose: ${hasDocker ? 'YES â€” see docker-compose file below' : 'No'}
- Makefile: ${hasMakefile ? 'YES â€” see Makefile below' : 'No'}
- CI workflows: ${hasCI ? 'YES â€” see workflow files below' : 'No'}
- .env example: ${hasEnvExample ? 'YES â€” see below' : 'No'}

## FILE TREE (first 300 paths)
\`\`\`
${treeStr}
\`\`\`

## SCANNED FILE CONTENTS
${fileContentsBlock || 'No key files could be fetched.'}

## RECENT COMMITS
${commitLines || 'No commits available.'}

## SECTIONS TO GENERATE
Generate ONLY these sections (skip others):
${sectionPrompts}

Format as a single markdown document with:
- A top-level H1 title: "# Onboarding Guide: ${meta.full_name}"
- A brief intro paragraph mentioning this was auto-generated by GitGrade
- One H2 heading per section using exactly the emoji and label provided
- Rich, specific content for each section based on the actual scanned data
- Code blocks with the correct language tag (bash, json, yaml, go, python, js, etc.)
- Command examples that are actually runnable based on the build system detected
- Env var tables where applicable (var name | description | example value | required)
${customBlock}`;

      // Simulate section progress during generation
      let progressTick = 15;
      const totalSections = selectedSections.length;
      const progressPerSection = (85 - progressTick) / totalSections;

      const progressInterval = setInterval(() => {
        setProgress((p) => {
          const next = p + progressPerSection / 8; // smooth increment
          return Math.min(next, 90);
        });
        progressTick += 1;
        const sectionIdx = Math.min(
          Math.floor((progressTick - 15) / ((85 - 15) / totalSections)),
          totalSections - 1
        );
        if (selectedSections[sectionIdx]) {
          setProgressLabel(`${selectedSections[sectionIdx].emoji} ${selectedSections[sectionIdx].label}`);
        }
      }, 400);

      const result = await callAI(
        [{ role: 'user', content: userMsg }],
        system,
        8000
      );

      clearInterval(progressInterval);

      if (abortRef.current) return;

      setProgress(100);
      setProgressLabel('Done!');
      setOutput(result);
      incrementGeneration();
    } catch (err) {
      setGenError(err.message || 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  // â”€â”€ Derived state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const parsed = parseUrl(url);
  const hasRepo = !!repoCtx;
  const downloadFilename = repoCtx
    ? `ONBOARDING-${repoCtx.parsed.owner}-${repoCtx.parsed.repo}.md`
    : 'ONBOARDING.md';

  const hasDocker = !!(scannedFiles['docker-compose.yml'] || scannedFiles['docker-compose.yaml']);
  const hasMakefile = !!scannedFiles['Makefile'];
  const hasCI = Object.keys(scannedFiles).some((f) => f.startsWith('.github/workflows/'));
  const hasEnvExample = !!(scannedFiles['.env.example'] || scannedFiles['.env.sample']);
  const hasTests = repoCtx
    ? repoCtx.files.some((f) => f.includes('test') || f.includes('spec') || f.includes('__tests__'))
    : false;

  
  // Auto-load repo on mount (fixed)
  useEffect(() => {
    if (owner && repo) {
      handleScan();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '32px 24px 64px',
        fontFamily: 'DM Sans, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {/* â”€â”€ Header â”€â”€ */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 24 }}>ðŸ“‹</span>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
              Onboarding Doc Generator
            </h1>
            <span
              style={{
                background: 'rgba(15,118,110,0.18)',
                color: '#2dd4bf',
                border: '1px solid rgba(15,118,110,0.35)',
                borderRadius: 6,
                padding: '2px 9px',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Deep Scan
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', maxWidth: 560, lineHeight: 1.5 }}>
            Paste a GitHub URL to generate a role-specific onboarding guide. GitGrade reads your actual config files, env vars, CI pipelines, and entry points â€” no generic output.
          </p>
        </div>
      </div>

      {/* â”€â”€ URL Input â”€â”€ */}
      <SectionCard title="Repository URL" accentColor={ACCENT}>
        
        {scanError && (
          <p style={{ margin: '10px 0 0', fontSize: 13, color: '#f87171', fontFamily: 'DM Sans, sans-serif' }}>
            âš ï¸ {scanError}
          </p>
        )}
      </SectionCard>

      {/* â”€â”€ Repo insight card (after scan) â”€â”€ */}
      {hasRepo && (
        <div
          className="fade-up"
          style={{
            background: '#020617',
            border: `1px solid rgba(15,118,110,0.35)`,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {/* Card header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 18px',
              borderBottom: '1px solid #1e293b',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 3, height: 16, borderRadius: 2, background: ACCENT, flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                }}
              >
                Repository Insight
              </span>
            </div>
            <a
              href={repoCtx.meta.html_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                color: ACCENT,
                textDecoration: 'none',
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 600,
              }}
            >
              {repoCtx.parsed.owner}/{repoCtx.parsed.repo} â†—
            </a>
          </div>

          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Description */}
            {repoCtx.meta.description && (
              <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', lineHeight: 1.5 }}>
                {repoCtx.meta.description}
              </p>
            )}

            {/* Language bar */}
            {Object.keys(repoCtx.langs).length > 0 && <LangBar langs={repoCtx.langs} />}

            {/* Stats grid */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <StatPill icon="ðŸ“" label="Files" value={repoCtx.files.length.toLocaleString()} />
              <StatPill icon="â­" label="Stars" value={(repoCtx.meta.stargazers_count ?? 0).toLocaleString()} />
              <StatPill icon="ðŸ›" label="Open Issues" value={(repoCtx.meta.open_issues_count ?? 0).toLocaleString()} />
              <StatPill
                icon="ðŸ•"
                label="Last Commit"
                value={formatDate(repoCtx.meta.pushed_at)}
              />
              <StatPill icon="ðŸ´" label="Forks" value={(repoCtx.meta.forks_count ?? 0).toLocaleString()} />
              <StatPill icon="ðŸ“„" label="Files Read" value={Object.keys(scannedFiles).length} />
            </div>

            {/* Feature flags */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <FeatureFlag label="Docker" active={hasDocker} />
              <FeatureFlag label="Makefile" active={hasMakefile} />
              <FeatureFlag label="CI/CD" active={hasCI} />
              <FeatureFlag label=".env example" active={hasEnvExample} />
              <FeatureFlag label="Tests" active={hasTests} />
              <FeatureFlag label="License" active={!!repoCtx.meta.license?.spdx_id} />
              <FeatureFlag label="Wiki" active={repoCtx.meta.has_wiki} />
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Two-column: Controls + Output â”€â”€ */}
      {hasRepo && (
        <div
          className="fade-up"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(320px, 380px) 1fr',
            gap: 20,
            alignItems: 'start',
          }}
        >
          {/* â”€â”€ Left column: controls â”€â”€ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Section toggles */}
            <SectionCard
              title="Document Sections"
              accentColor={ACCENT}
              extra={
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { label: 'All', action: selectAll },
                    { label: 'Essential', action: selectEssential },
                    { label: 'None', action: selectNone },
                  ].map(({ label, action }) => (
                    <button
                      key={label}
                      onClick={action}
                      style={{
                        background: 'none',
                        border: '1px solid #1e293b',
                        borderRadius: 6,
                        color: '#94a3b8',
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '3px 9px',
                        cursor: 'pointer',
                        fontFamily: 'DM Sans, sans-serif',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        transition: 'color 0.15s, border-color 0.15s',
                        outline: 'none',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = ACCENT;
                        e.currentTarget.style.color = '#f1f5f9';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#1e293b';
                        e.currentTarget.style.color = '#94a3b8';
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ALL_SECTIONS.map((section) => (
                  <SectionToggle
                    key={section.id}
                    section={section}
                    selected={selected}
                    onToggle={toggleSection}
                  />
                ))}
              </div>
              {/* Selection summary */}
              <p style={{ margin: '10px 0 0', fontSize: 11, color: '#475569', fontFamily: 'DM Sans, sans-serif' }}>
                {selected.size} of {ALL_SECTIONS.length} sections selected
              </p>
            </SectionCard>

            {/* Role preset */}
            <SectionCard title="Target Role" accentColor={ACCENT}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ROLE_PRESETS.map((r) => {
                  const active = role === r;
                  return (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      style={{
                        background: active ? 'rgba(15,118,110,0.16)' : '#0f172a',
                        border: `1px solid ${active ? 'rgba(15,118,110,0.45)' : '#1e293b'}`,
                        borderRadius: 20,
                        color: active ? '#2dd4bf' : '#94a3b8',
                        fontSize: 12,
                        fontWeight: active ? 700 : 500,
                        padding: '5px 13px',
                        cursor: 'pointer',
                        fontFamily: 'DM Sans, sans-serif',
                        transition: 'all 0.15s',
                        outline: 'none',
                      }}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            {/* Custom instructions */}
            <SectionCard title="Custom Instructions" accentColor={ACCENT}>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder={`Optional binding instructionsâ€¦\nExamples:\nâ€¢ "Focus on the payment service"\nâ€¢ "We use Temporal for workflows"\nâ€¢ "Always mention the monorepo layout"`}
                rows={5}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  color: '#f1f5f9',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 13,
                  padding: '10px 12px',
                  resize: 'vertical',
                  outline: 'none',
                  lineHeight: 1.5,
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = ACCENT; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#1e293b'; }}
              />
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#475569', fontFamily: 'DM Sans, sans-serif' }}>
                These instructions are injected as a binding block in the AI prompt.
              </p>
            </SectionCard>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={generating || isAtLimit || selected.size === 0}
              style={{
                width: '100%',
                padding: '14px 0',
                background:
                  generating || isAtLimit || selected.size === 0
                    ? '#1e293b'
                    : `linear-gradient(135deg, ${ACCENT}, #14b8a6)`,
                border: 'none',
                borderRadius: 10,
                color: generating || isAtLimit || selected.size === 0 ? '#475569' : '#fff',
                fontSize: 15,
                fontWeight: 800,
                fontFamily: 'DM Sans, sans-serif',
                cursor: generating || isAtLimit || selected.size === 0 ? 'not-allowed' : 'pointer',
                letterSpacing: '0.01em',
                transition: 'background 0.2s, color 0.2s',
                outline: 'none',
                boxShadow:
                  generating || isAtLimit || selected.size === 0
                    ? 'none'
                    : `0 0 24px rgba(15,118,110,0.35)`,
              }}
            >
              {generating
                ? 'Generatingâ€¦'
                : isAtLimit
                ? 'Generation limit reached'
                : `ðŸ“‹ Generate ${selected.size} Section${selected.size !== 1 ? 's' : ''}`}
            </button>

            {isAtLimit && (
              <div
                className="upgrade-banner"
                style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8' }}
              >
                Upgrade your plan to generate more documents.
              </div>
            )}

            {genError && (
              <p style={{ margin: 0, fontSize: 13, color: '#f87171', fontFamily: 'DM Sans, sans-serif' }}>
                âš ï¸ {genError}
              </p>
            )}
          </div>

          {/* â”€â”€ Right column: output â”€â”€ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            {/* Progress */}
            {generating && (
              <div
                style={{
                  background: '#020617',
                  border: '1px solid #1e293b',
                  borderRadius: 10,
                  padding: '16px 18px',
                }}
              >
                <ProgressBar value={progress} label={progressLabel} phase={progressPhase} />
              </div>
            )}

            {/* Output box */}
            {output ? (
              <OutputBox
                content={output}
                filename={downloadFilename}
                accentColor={ACCENT}
              />
            ) : !generating ? (
              <div
                style={{
                  background: '#020617',
                  border: '1px dashed #1e293b',
                  borderRadius: 10,
                  padding: '48px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: 36 }}>ðŸ“‹</span>
                <p style={{ margin: 0, fontSize: 14, color: '#475569', lineHeight: 1.5 }}>
                  Select sections, pick a role, and click{' '}
                  <strong style={{ color: '#94a3b8' }}>Generate</strong> to produce your onboarding doc.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* â”€â”€ Usage Tips â”€â”€ */}
      <SectionCard title="Usage Tips" accentColor={ACCENT}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TipRow
            icon="ðŸ“"
            tip={
              <>
                Save as <code className="mono" style={{ background: '#0f172a', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>docs/ONBOARDING.md</code> in the root of your repository so GitHub renders it automatically.
              </>
            }
          />
          <TipRow
            icon="ðŸ—’ï¸"
            tip="Paste into a Notion or Confluence page â€” the markdown renders natively in both. Use it as the first page of your Engineering Handbook."
          />
          <TipRow
            icon="ðŸ”—"
            tip={
              <>
                Add a link in your <code className="mono" style={{ background: '#0f172a', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>README.md</code>: <em>"â†’ See ONBOARDING.md to get started in &lt;30 minutes"</em> so new hires find it immediately.
              </>
            }
          />
          <TipRow
            icon="ðŸ”„"
            tip="Re-generate every quarter or after a major architectural change â€” the deep scan always reflects the current state of your repo."
          />
          <TipRow
            icon="ðŸ§‘â€ðŸ’¼"
            tip="Generate different role variants for the same repo: one for a backend engineer, one for a DevOps engineer, one for an engineering manager. Each gets a different focus."
          />
          <TipRow
            icon="âš™ï¸"
            tip="Use the Custom Instructions box to focus on a specific microservice, a feature area, or to inject team-specific context that isn't visible in code."
          />
        </div>
      </SectionCard>
    </div>
  );
}
