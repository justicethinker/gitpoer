import {  useState, useRef, useEffect, useCallback  } from 'react';
import { useParams } from 'react-router-dom';
import { parseUrl, fetchRepoContext, tryRaw } from '../utils/github';
import { callAI } from '../utils/ai';
import { renderMd } from '../utils/markdown';
import { useApp } from '../context/AppContext';
import UrlInput from '../components/shared/UrlInput';
import SectionCard from '../components/shared/SectionCard';
import SeverityBadge from '../components/shared/SeverityBadge';
import ProBadge from '../components/shared/ProBadge';

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ACCENT = '#DC2626';

const SCAN_STEPS = [
  'Fetching repo metadata...',
  'Scanning file structure...',
  'Reading commit history...',
  'Analysing code quality...',
  'Getting AI verdict...',
];

// â”€â”€â”€ Score helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function scoreColor(score) {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#84cc16';
  if (score >= 40) return '#eab308';
  if (score >= 25) return '#f97316';
  return '#ef4444';
}

function scoreGrade(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function recruiterOneliner(score) {
  if (score >= 85) return 'Strong portfolio â€” would pass most technical screens.';
  if (score >= 70) return 'Solid foundation, minor polish needed before applying.';
  if (score >= 55) return 'Decent start â€” key gaps will raise recruiter eyebrows.';
  if (score >= 40) return 'Needs work â€” wouldn\'t pass most screens as-is.';
  return 'Major red flags â€” requires significant cleanup before showcasing.';
}

// â”€â”€â”€ Scoring Engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function hasFile(files, ...patterns) {
  return patterns.some(p =>
    files.some(f => {
      const lower = f.toLowerCase();
      if (p instanceof RegExp) return p.test(lower);
      return lower === p.toLowerCase() || lower.endsWith('/' + p.toLowerCase());
    })
  );
}

function topLevelFiles(files) {
  return files.filter(f => !f.includes('/'));
}

function scoreDocumentation(files, readme) {
  let pts = 0;
  const issues = [];
  const wins = [];

  const hasReadme = hasFile(files, 'README.md', 'README.rst', 'README.txt', 'readme.md');
  if (hasReadme) {
    pts += 15;
    wins.push('README file present');
  } else {
    issues.push({ sev: 'critical', msg: 'No README file â€” first thing recruiters look for.' });
  }

  if (hasReadme && readme) {
    if (readme.length > 800) {
      pts += 10;
      wins.push('README is detailed (>800 chars)');
    } else {
      issues.push({ sev: 'high', msg: 'README is too short â€” add more context and depth.' });
    }

    const lower = readme.toLowerCase();
    const hasInstall = /install|npm install|pip install|yarn add|getting.started|setup/i.test(readme);
    if (hasInstall) {
      pts += 8;
      wins.push('Installation instructions present');
    } else {
      issues.push({ sev: 'high', msg: 'No installation instructions in README.' });
    }

    const hasUsage = /usage|example|```|demo|how.to.use/i.test(readme);
    if (hasUsage) {
      pts += 7;
      wins.push('Usage examples or code blocks present');
    } else {
      issues.push({ sev: 'medium', msg: 'Add usage examples or code snippets to README.' });
    }

    const hasScreenshot = /screenshot|demo\.gif|demo\.png|\.gif|\.png|!\[/i.test(readme);
    if (hasScreenshot) {
      pts += 5;
      wins.push('Screenshots or demo media included');
    } else {
      issues.push({ sev: 'low', msg: 'Consider adding a screenshot or demo GIF to README.' });
    }
  }

  const hasContributing = hasFile(files, 'CONTRIBUTING.md', 'CONTRIBUTING.rst', '.github/CONTRIBUTING.md');
  if (hasContributing) {
    pts += 5;
    wins.push('CONTRIBUTING.md present');
  } else {
    issues.push({ sev: 'low', msg: 'No CONTRIBUTING.md â€” add one to invite collaborators.' });
  }

  return { label: 'Documentation', pts, max: 50, issues, wins };
}

function scoreProjectStructure(files, langs) {
  let pts = 0;
  const issues = [];
  const wins = [];

  const hasLicense = hasFile(files, 'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md');
  if (hasLicense) {
    pts += 8;
    wins.push('LICENSE file present');
  } else {
    issues.push({ sev: 'high', msg: 'No LICENSE file â€” repo is legally unusable by others.' });
  }

  const hasGitignore = hasFile(files, '.gitignore');
  if (hasGitignore) {
    pts += 5;
    wins.push('.gitignore configured');
  } else {
    issues.push({ sev: 'medium', msg: 'No .gitignore â€” sensitive or generated files may be tracked.' });
  }

  const envCommitted = files.some(f => {
    const name = f.split('/').pop().toLowerCase();
    return name === '.env' || name === '.env.local' || name === '.env.production';
  });
  if (envCommitted) {
    issues.push({ sev: 'critical', msg: '.env file committed to repo â€” potential credential leak!' });
  } else {
    wins.push('No .env files committed');
  }

  const nodeModulesCommitted = files.some(f => f.startsWith('node_modules/') || f === 'node_modules');
  if (nodeModulesCommitted) {
    issues.push({ sev: 'critical', msg: 'node_modules committed â€” bloats repo and is a serious red flag.' });
  } else {
    wins.push('node_modules not committed');
  }

  const topLevel = topLevelFiles(files);
  if (topLevel.length <= 12) {
    pts += 7;
    wins.push(`Clean top-level structure (${topLevel.length} items)`);
  } else {
    issues.push({ sev: 'medium', msg: `Top-level is cluttered (${topLevel.length} items). Consider organising into folders.` });
  }

  const testsDetected =
    hasFile(files, /\/__tests__\//, /\.test\.(js|ts|jsx|tsx|py|rb|go)$/, /\.spec\.(js|ts|jsx|tsx)$/, /tests\//, /test\//, /spec\//) ||
    files.some(f => /\.(test|spec)\.(js|ts|jsx|tsx|py|rb|go)$/.test(f));
  if (testsDetected) {
    pts += 10;
    wins.push('Test files detected');
  } else {
    issues.push({ sev: 'high', msg: 'No test files found â€” untested code is a dealbreaker for many teams.' });
  }

  return { label: 'Project Structure', pts, max: 30, issues, wins };
}

function scoreCodeQuality(files, commits, pkg) {
  let pts = 0;
  const issues = [];
  const wins = [];

  const hasLinter = hasFile(
    files,
    '.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yaml', '.eslintrc.yml',
    '.eslintrc.cjs', 'eslint.config.js', 'eslint.config.mjs',
    '.pylintrc', 'pylintrc', 'setup.cfg', '.flake8',
    '.rubocop.yml'
  );
  if (hasLinter) {
    pts += 5;
    wins.push('Linter configuration present');
  } else {
    issues.push({ sev: 'medium', msg: 'No linter config found â€” add ESLint, Pylint, or equivalent.' });
  }

  const hasFormatter = hasFile(
    files,
    '.prettierrc', '.prettierrc.js', '.prettierrc.json', 'prettier.config.js',
    '.editorconfig', 'pyproject.toml', '.black'
  );
  if (hasFormatter) {
    pts += 4;
    wins.push('Formatter configuration present');
  } else {
    issues.push({ sev: 'low', msg: 'No formatter config (Prettier / Black / EditorConfig).' });
  }

  const hasCICD = files.some(f =>
    f.startsWith('.github/workflows/') ||
    f === '.travis.yml' ||
    f === 'Jenkinsfile' ||
    f === '.circleci/config.yml' ||
    f === '.gitlab-ci.yml' ||
    f === 'azure-pipelines.yml'
  );
  if (hasCICD) {
    pts += 8;
    wins.push('CI/CD pipeline configured');
  } else {
    issues.push({ sev: 'high', msg: 'No CI/CD pipeline â€” automate your tests and deploys.' });
  }

  const hasEnvExample = hasFile(files, '.env.example', '.env.sample', '.env.template');
  if (hasEnvExample) {
    pts += 3;
    wins.push('.env.example template provided');
  } else {
    issues.push({ sev: 'low', msg: 'Add a .env.example so contributors know required env vars.' });
  }

  if (pkg) {
    try {
      const parsed = typeof pkg === 'string' ? JSON.parse(pkg) : pkg;
      const hasTest = parsed?.scripts?.test && parsed.scripts.test !== 'echo "Error: no test specified" && exit 1';
      if (hasTest) {
        pts += 5;
        wins.push('npm test script configured in package.json');
      } else {
        issues.push({ sev: 'medium', msg: 'package.json has no meaningful test script.' });
      }
    } catch {
      // not a JS project
    }
  }

  return { label: 'Code Quality', pts, max: 25, issues, wins };
}

function scoreCommitHealth(commits) {
  let pts = 0;
  const issues = [];
  const wins = [];

  if (!commits || commits.length === 0) {
    issues.push({ sev: 'medium', msg: 'Could not retrieve commit history.' });
    return { label: 'Commit Health', pts, max: 20, issues, wins };
  }

  // Commit message quality
  const badPatterns = /^(fix|update|wip|temp|test|misc|stuff|changes|asdf|lol|aaa|zzz|commit|initial commit|first commit|add files|done|ok)\.?$/i;
  const badCount = commits.filter(c => {
    const msg = (c.commit?.message || '').split('\n')[0].trim();
    return msg.length < 10 || badPatterns.test(msg);
  }).length;
  const badRatio = badCount / commits.length;

  if (badRatio < 0.15) {
    pts += 8;
    wins.push('Commit messages are descriptive and professional');
  } else if (badRatio < 0.40) {
    pts += 4;
    issues.push({ sev: 'medium', msg: `~${Math.round(badRatio * 100)}% of commits have weak messages â€” improve for professionalism.` });
  } else {
    issues.push({ sev: 'high', msg: `${Math.round(badRatio * 100)}% of commits have vague messages (e.g., "fix", "update", "wip").` });
  }

  // Recent activity
  const lastCommitDate = commits[0]?.commit?.committer?.date || commits[0]?.commit?.author?.date;
  if (lastCommitDate) {
    const daysSince = (Date.now() - new Date(lastCommitDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 90) {
      pts += 6;
      wins.push(`Recently active (last commit ${Math.round(daysSince)} days ago)`);
    } else if (daysSince < 365) {
      issues.push({ sev: 'low', msg: `Last commit was ${Math.round(daysSince)} days ago â€” some staleness.` });
    } else {
      issues.push({ sev: 'medium', msg: `Repo appears abandoned â€” last commit over a year ago.` });
    }
  }

  // Multiple contributors
  const authors = new Set(
    commits.map(c => c.commit?.author?.email || c.author?.login).filter(Boolean)
  );
  if (authors.size >= 2) {
    pts += 6;
    wins.push(`Multiple contributors (${authors.size}) â€” shows collaboration`);
  } else {
    issues.push({ sev: 'low', msg: 'Single contributor â€” no evidence of collaboration or open-source engagement.' });
  }

  return { label: 'Commit Health', pts, max: 20, issues, wins };
}

function scoreDependencies(pkg, files) {
  let pts = 0;
  const issues = [];
  const wins = [];

  const hasLockfile = hasFile(
    files,
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    'Pipfile.lock', 'poetry.lock', 'Cargo.lock', 'go.sum', 'Gemfile.lock'
  );
  if (hasLockfile) {
    pts += 5;
    wins.push('Dependency lockfile committed');
  } else {
    issues.push({ sev: 'medium', msg: 'No lockfile â€” dependency versions are non-deterministic.' });
  }

  if (pkg) {
    try {
      const parsed = typeof pkg === 'string' ? JSON.parse(pkg) : pkg;
      const allDeps = {
        ...(parsed?.dependencies || {}),
        ...(parsed?.devDependencies || {}),
      };
      const wildcards = Object.entries(allDeps).filter(([, v]) => v === '*' || v === 'latest');
      if (wildcards.length === 0) {
        pts += 5;
        wins.push('No wildcard dependency versions');
      } else {
        issues.push({ sev: 'medium', msg: `${wildcards.length} wildcard dependency version(s) â€” pin them for reproducibility.` });
      }
    } catch {
      pts += 5; // benefit of doubt if not a JS project
      wins.push('Non-JS project â€” dependency pinning not applicable');
    }
  } else {
    pts += 3;
  }

  return { label: 'Dependencies', pts, max: 10, issues, wins };
}

// â”€â”€â”€ Feature flag detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function detectFeatureFlags(files, langs) {
  const langKeys = Object.keys(langs || {}).map(l => l.toLowerCase());
  return {
    hasDocker: hasFile(files, 'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore'),
    hasTests: files.some(f => /\.(test|spec)\.(js|ts|jsx|tsx|py|rb|go)$/.test(f) || f.includes('/__tests__/')),
    hasCI: files.some(f => f.startsWith('.github/workflows/') || f === '.travis.yml' || f === '.circleci/config.yml'),
    hasTypes: langKeys.includes('typescript') || hasFile(files, 'tsconfig.json', 'tsconfig.base.json'),
    hasLicense: hasFile(files, 'LICENSE', 'LICENSE.md', 'LICENSE.txt'),
    hasDocs: files.some(f => f.startsWith('docs/') || f.startsWith('documentation/')),
  };
}

// â”€â”€â”€ Animated Score Ring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ScoreRing({ score, color, size = 160 }) {
  const [displayed, setDisplayed] = useState(0);
  const animRef = useRef(null);

  useEffect(() => {
    const start = Date.now();
    const duration = 1200;
    const target = score;

    function tick() {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * target));
      if (progress < 1) {
        animRef.current = requestAnimationFrame(tick);
      }
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [score]);

  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (displayed / 135) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={12}
        />
        {/* Fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke 0.3s' }}
        />
      </svg>
      {/* Center text */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: size * 0.225,
            fontWeight: 700,
            color: color,
            lineHeight: 1,
            letterSpacing: '-0.03em',
          }}
        >
          {displayed}
        </span>
        <span style={{ fontSize: 11, color: '#475569', fontFamily: 'DM Sans, sans-serif', marginTop: 2 }}>
          / 135
        </span>
      </div>
    </div>
  );
}

// â”€â”€â”€ Dimension Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DimensionBar({ dim, accentColor, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const pct = Math.min((dim.pts / dim.max) * 100, 100);
  const barColor = scoreColor(Math.round((dim.pts / dim.max) * 100));

  return (
    <div
      style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          outline: 'none',
          textAlign: 'left',
        }}
      >
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#f1f5f9', fontFamily: 'DM Sans, sans-serif' }}>
          {dim.label}
        </span>
        <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: barColor, fontWeight: 700 }}>
          {dim.pts}<span style={{ color: '#475569', fontWeight: 400 }}>/{dim.max}</span>
        </span>
        {/* Mini bar */}
        <div style={{ width: 80, height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width 0.6s ease' }} />
        </div>
        <span style={{ fontSize: 11, color: '#475569', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>
          â–¾
        </span>
      </button>

      {/* Expanded detail */}
      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dim.wins.map((w, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#94a3b8', fontFamily: 'DM Sans, sans-serif' }}>
              <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>âœ“</span>
              {w}
            </div>
          ))}
          {dim.issues.map((iss, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#94a3b8', fontFamily: 'DM Sans, sans-serif' }}>
              <SeverityBadge severity={iss.sev} />
              <span style={{ flex: 1, paddingTop: 1 }}>{iss.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Feature Flag Pill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FeaturePill({ label, active }) {
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
        background: active ? 'rgba(34,197,94,0.1)' : 'rgba(71,85,105,0.15)',
        color: active ? '#22c55e' : '#475569',
        border: `1px solid ${active ? 'rgba(34,197,94,0.25)' : '#1e293b'}`,
      }}
    >
      <span>{active ? 'âœ“' : 'âœ—'}</span>
      {label}
    </span>
  );
}

// â”€â”€â”€ Loading Overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function LoadingState({ step }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        padding: '56px 24px',
      }}
    >
      {/* Pulsing ring */}
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: `3px solid ${ACCENT}33`,
            animation: 'spin 1.2s linear infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: `3px solid transparent`,
            borderTopColor: ACCENT,
            animation: 'spin 1.2s linear infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
          }}
        >
          ðŸ”
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', margin: '0 0 6px', fontFamily: 'DM Sans, sans-serif' }}>
          Scoring Repository
        </p>
        <p
          style={{
            fontSize: 13,
            color: ACCENT,
            margin: 0,
            fontFamily: 'JetBrains Mono, monospace',
            minHeight: 20,
          }}
        >
          {step}
        </p>
      </div>

      {/* Step indicators */}
      <div style={{ display: 'flex', gap: 6 }}>
        {SCAN_STEPS.map((s, i) => (
          <div
            key={i}
            style={{
              width: 28,
              height: 4,
              borderRadius: 2,
              background: SCAN_STEPS.indexOf(step) >= i ? ACCENT : '#1e293b',
              transition: 'background 0.3s',
            }}
          />
        ))}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function PortfolioScore() {
  const { owner, repo } = useParams();

  const { isAtLimit, incrementGeneration, canUseFeature, openUpgradeModal } = useApp();

  const [url, setUrl] = useState(`https://github.com/${owner}/${repo}`);
  const [loading, setLoading] = useState(false);
  const [scanStep, setScanStep] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [verdict, setVerdict] = useState('');
  const [verdictLoading, setVerdictLoading] = useState(false);

  const stepRef = useRef(0);

  const advanceStep = useCallback((idx) => {
    stepRef.current = idx;
    setScanStep(SCAN_STEPS[idx] || '');
  }, []);

  async function handleScan() {
    if (loading) return;
    if (isAtLimit) {
      openUpgradeModal('generationsPerMonth', 'You have used all your monthly scans. Upgrade for more.');
      return;
    }

    const parsed = parseUrl(url);
    if (!parsed) {
      setError('Please enter a valid GitHub repository URL.');
      return;
    }

    setError('');
    setResult(null);
    setVerdict('');
    setLoading(true);
    setActiveTab('overview');

    try {
      // Step 0: fetch repo metadata
      advanceStep(0);
      const { meta, branch, files, langs, commits } = await fetchRepoContext(parsed.owner, parsed.repo);

      // Step 1: scan file structure
      advanceStep(1);
      await new Promise(r => setTimeout(r, 300)); // brief pause for UX

      // Step 2: commit history
      advanceStep(2);
      const pkg = await tryRaw(parsed.owner, parsed.repo, 'package.json', branch);
      const readme = await tryRaw(parsed.owner, parsed.repo, 'README.md', branch)
        || await tryRaw(parsed.owner, parsed.repo, 'readme.md', branch)
        || await tryRaw(parsed.owner, parsed.repo, 'README.rst', branch)
        || null;

      // Step 3: analyse code quality
      advanceStep(3);
      const dimDoc = scoreDocumentation(files, readme);
      const dimStruct = scoreProjectStructure(files, langs);
      const dimQuality = scoreCodeQuality(files, commits, pkg);
      const dimCommits = scoreCommitHealth(commits);
      const dimDeps = scoreDependencies(pkg, files);

      const dimensions = [dimDoc, dimStruct, dimQuality, dimCommits, dimDeps];
      const totalScore = dimensions.reduce((sum, d) => sum + d.pts, 0);
      const totalMax = dimensions.reduce((sum, d) => sum + d.max, 0); // 135

      // Flatten issues
      const allIssues = dimensions.flatMap(d =>
        d.issues.map(iss => ({ ...iss, dim: d.label }))
      ).sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a.sev] ?? 9) - (order[b.sev] ?? 9);
      });

      const flags = detectFeatureFlags(files, langs);

      const data = {
        meta,
        owner: parsed.owner,
        repo: parsed.repo,
        branch,
        files,
        langs,
        commits,
        dimensions,
        totalScore,
        totalMax,
        allIssues,
        flags,
      };

      setResult(data);
      incrementGeneration();

      // Step 4: AI verdict (if pro)
      advanceStep(4);
      if (canUseFeature('portfolioVerdict')) {
        setVerdictLoading(true);
        try {
          const langList = Object.keys(langs).join(', ') || 'Unknown';
          const issueList = allIssues.slice(0, 8).map(i => `- [${i.sev.toUpperCase()}] ${i.dim}: ${i.msg}`).join('\n');
          const winList = dimensions.flatMap(d => d.wins).slice(0, 6).map(w => `- ${w}`).join('\n');

          const prompt = `You are a senior engineering recruiter reviewing a GitHub repository for job-readiness.

Repository: ${parsed.owner}/${parsed.repo}
Description: ${meta.description || 'None provided'}
Languages: ${langList}
Stars: ${meta.stargazers_count} | Forks: ${meta.forks_count}
GitGrade Score: ${totalScore}/135 (${scoreGrade(totalScore)} grade)

Key wins:
${winList || 'None'}

Key issues found:
${issueList || 'None'}

Write a blunt, specific, actionable 3-paragraph recruiter verdict:
- Paragraph 1: First impression and overall assessment
- Paragraph 2: The two or three most critical specific issues that would cause concern
- Paragraph 3: What to prioritize fixing and what this repo signals about the developer

Be direct, professional, and specific. Do not be generic. Reference actual findings.`;

          const text = await callAI(
            [{ role: 'user', content: prompt }],
            'You are a senior engineering recruiter giving honest, specific feedback on GitHub repositories for job-seekers.',
            1200
          );
          setVerdict(text);
        } catch (err) {
          setVerdict('');
        } finally {
          setVerdictLoading(false);
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
      setScanStep('');
    }
  }

  
  // Auto-load repo on mount (fixed)
  useEffect(() => {
    if (owner && repo) {
      handleScan();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const color = result ? scoreColor(result.totalScore) : ACCENT;
  const grade = result ? scoreGrade(result.totalScore) : 'â€“';
  const canSeeVerdict = canUseFeature('portfolioVerdict');

  return (
    <div
      style={{
        maxWidth: 780,
        margin: '0 auto',
        padding: '24px 16px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>ðŸ†</span>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              color: '#f1f5f9',
              fontFamily: 'DM Sans, sans-serif',
              letterSpacing: '-0.02em',
            }}
          >
            Portfolio Score
          </h1>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.08em',
              color: ACCENT,
              border: `1px solid ${ACCENT}44`,
              background: `${ACCENT}15`,
              borderRadius: 4,
              padding: '2px 7px',
            }}
          >
            0â€“135
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
          Scores your GitHub repo for job-readiness across 5 dimensions. 100% client-side, no data stored.
        </p>
      </div>

      {/* â”€â”€ URL Input â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        style={{
          background: '#020617',
          border: '1px solid #1e293b',
          borderRadius: 10,
          padding: 16,
        }}
      >
        
        {isAtLimit && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#f97316', fontFamily: 'DM Sans, sans-serif' }}>
            âš  Monthly scan limit reached.{' '}
            <button
              onClick={() => openUpgradeModal('generationsPerMonth', 'Upgrade for unlimited scans.')}
              style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontWeight: 700, fontSize: 12, padding: 0, fontFamily: 'DM Sans, sans-serif' }}
            >
              Upgrade â†’
            </button>
          </p>
        )}
      </div>

      {/* â”€â”€ Error â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {error && (
        <div
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 8,
            padding: '12px 16px',
            color: '#ef4444',
            fontSize: 13,
            fontFamily: 'DM Sans, sans-serif',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>âš </span> {error}
        </div>
      )}

      {/* â”€â”€ Loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {loading && (
        <div
          style={{
            background: '#020617',
            border: '1px solid #1e293b',
            borderRadius: 10,
          }}
        >
          <LoadingState step={scanStep} />
        </div>
      )}

      {/* â”€â”€ Results â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {result && !loading && (
        <>
          {/* Repo meta card */}
          <div
            style={{
              background: '#020617',
              border: '1px solid #1e293b',
              borderRadius: 10,
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {/* Repo name + stats */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <a
                  href={result.meta.html_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#f1f5f9',
                    textDecoration: 'none',
                    fontFamily: 'DM Sans, sans-serif',
                    letterSpacing: '-0.01em',
                  }}
                >
                  <span style={{ color: '#94a3b8', fontWeight: 400 }}>{result.owner}/</span>
                  {result.repo}
                  <span style={{ fontSize: 12, marginLeft: 6, opacity: 0.5 }}>â†—</span>
                </a>
                {result.meta.description && (
                  <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', fontFamily: 'DM Sans, sans-serif' }}>
                    {result.meta.description}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                  â­ {result.meta.stargazers_count?.toLocaleString()}
                </span>
                <span style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                  ðŸ´ {result.meta.forks_count?.toLocaleString()}
                </span>
                {result.meta.language && (
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: 'JetBrains Mono, monospace',
                      color: '#6366f1',
                      background: 'rgba(99,102,241,0.12)',
                      border: '1px solid rgba(99,102,241,0.2)',
                      borderRadius: 4,
                      padding: '2px 8px',
                      fontWeight: 600,
                    }}
                  >
                    {result.meta.language}
                  </span>
                )}
              </div>
            </div>

            {/* Feature flags */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <FeaturePill label="Docker" active={result.flags.hasDocker} />
              <FeaturePill label="Tests" active={result.flags.hasTests} />
              <FeaturePill label="CI/CD" active={result.flags.hasCI} />
              <FeaturePill label="TypeScript" active={result.flags.hasTypes} />
              <FeaturePill label="License" active={result.flags.hasLicense} />
              <FeaturePill label="Docs dir" active={result.flags.hasDocs} />
            </div>
          </div>

          {/* â”€â”€ Score Hero â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div
            style={{
              background: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)',
              border: `1px solid ${color}40`,
              borderRadius: 12,
              padding: '28px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 28,
              flexWrap: 'wrap',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Background glow */}
            <div
              style={{
                position: 'absolute',
                top: -40,
                right: -40,
                width: 200,
                height: 200,
                borderRadius: '50%',
                background: `${color}08`,
                pointerEvents: 'none',
              }}
            />

            {/* Score ring */}
            <ScoreRing score={result.totalScore} color={color} size={148} />

            {/* Right content */}
            <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Grade + oneliner */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span
                  style={{
                    fontSize: 56,
                    fontWeight: 900,
                    fontFamily: 'DM Sans, sans-serif',
                    color,
                    lineHeight: 1,
                    letterSpacing: '-0.04em',
                  }}
                >
                  {grade}
                </span>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9', fontFamily: 'DM Sans, sans-serif' }}>
                    {recruiterOneliner(result.totalScore)}
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#475569', fontFamily: 'DM Sans, sans-serif' }}>
                    {result.totalScore} of 135 possible points
                  </p>
                </div>
              </div>

              {/* Dimension mini-badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.dimensions.map((d) => {
                  const pct = Math.round((d.pts / d.max) * 100);
                  const c = scoreColor(pct);
                  return (
                    <div
                      key={d.label}
                      title={`${d.label}: ${d.pts}/${d.max}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 3,
                        padding: '6px 10px',
                        background: '#020617',
                        border: `1px solid ${c}30`,
                        borderRadius: 7,
                        minWidth: 64,
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, color: c, fontFamily: 'JetBrains Mono, monospace' }}>
                        {d.pts}/{d.max}
                      </span>
                      <span style={{ fontSize: 9, color: '#475569', fontFamily: 'DM Sans, sans-serif', textAlign: 'center', lineHeight: 1.2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {d.label.split(' ')[0]}
                      </span>
                      {/* tiny bar */}
                      <div style={{ width: '100%', height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: c, borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* â”€â”€ Tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div>
            {/* Tab bar */}
            <div className="tab-bar" style={{ marginBottom: 16 }}>
              {['overview', 'issues', 'verdict'].map((tab) => (
                <button
                  key={tab}
                  className={`tab-btn${activeTab === tab ? ' active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                  style={
                    activeTab === tab
                      ? { '--tab-active-color': ACCENT }
                      : {}
                  }
                >
                  {tab === 'overview' && 'Overview'}
                  {tab === 'issues' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      Issues
                      {result.allIssues.filter(i => i.sev === 'critical' || i.sev === 'high').length > 0 && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            background: '#ef4444',
                            color: '#fff',
                            borderRadius: 10,
                            padding: '0px 5px',
                            lineHeight: '16px',
                            fontFamily: 'JetBrains Mono, monospace',
                          }}
                        >
                          {result.allIssues.filter(i => i.sev === 'critical' || i.sev === 'high').length}
                        </span>
                      )}
                    </span>
                  )}
                  {tab === 'verdict' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      Recruiter Verdict
                      {!canSeeVerdict && <ProBadge feature="portfolioVerdict" description="Unlock the AI recruiter verdict with a paid plan." />}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* â”€â”€ OVERVIEW TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.dimensions.map((dim, i) => (
                  <DimensionBar key={dim.label} dim={dim} accentColor={ACCENT} defaultOpen={i === 0} />
                ))}
              </div>
            )}

            {/* â”€â”€ ISSUES TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {activeTab === 'issues' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {result.allIssues.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '40px 20px',
                      color: '#22c55e',
                      fontSize: 14,
                      fontFamily: 'DM Sans, sans-serif',
                    }}
                  >
                    ðŸŽ‰ No major issues found! Excellent job-readiness.
                  </div>
                ) : (
                  result.allIssues.map((iss, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        padding: '12px 16px',
                        background: i % 2 === 0 ? '#020617' : '#0f172a',
                        borderBottom: '1px solid #1e293b',
                        borderRadius: i === 0 ? '8px 8px 0 0' : i === result.allIssues.length - 1 ? '0 0 8px 8px' : 0,
                        border: i === 0 ? '1px solid #1e293b' : '0 0 1px 0',
                        borderTop: i === 0 ? '1px solid #1e293b' : 'none',
                        borderLeft: '1px solid #1e293b',
                        borderRight: '1px solid #1e293b',
                        borderBottomWidth: 1,
                        borderBottomStyle: 'solid',
                        borderBottomColor: '#1e293b',
                      }}
                    >
                      <SeverityBadge severity={iss.sev} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 13, color: '#f1f5f9', fontFamily: 'DM Sans, sans-serif' }}>
                          {iss.msg}
                        </span>
                        <span style={{ fontSize: 11, color: '#475569', fontFamily: 'DM Sans, sans-serif' }}>
                          {iss.dim}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* â”€â”€ VERDICT TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {activeTab === 'verdict' && (
              <div style={{ position: 'relative' }}>
                {canSeeVerdict ? (
                  <div
                    style={{
                      background: '#020617',
                      border: '1px solid #1e293b',
                      borderRadius: 10,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Recruiter header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '14px 18px',
                        borderBottom: '1px solid #1e293b',
                        background: '#0f172a',
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 20,
                          flexShrink: 0,
                        }}
                      >
                        ðŸ§‘â€ðŸ’¼
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f1f5f9', fontFamily: 'DM Sans, sans-serif' }}>
                          Senior Engineering Recruiter
                        </p>
                        <p style={{ margin: 0, fontSize: 11, color: '#475569', fontFamily: 'DM Sans, sans-serif' }}>
                          AI-powered Â· Based on repo analysis
                        </p>
                      </div>
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: verdictLoading ? '#eab308' : verdict ? '#22c55e' : '#475569',
                          }}
                        />
                        <span style={{ fontSize: 11, color: '#475569', fontFamily: 'DM Sans, sans-serif' }}>
                          {verdictLoading ? 'Thinking...' : verdict ? 'Ready' : 'Pending'}
                        </span>
                      </div>
                    </div>

                    {/* Verdict content */}
                    <div style={{ padding: '20px 20px 24px' }}>
                      {verdictLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {[1, 2, 3].map(n => (
                            <div key={n} className="skeleton" style={{ height: n === 2 ? 60 : 80, borderRadius: 6 }} />
                          ))}
                        </div>
                      ) : verdict ? (
                        <div
                          className="md-output"
                          style={{ fontSize: 14, lineHeight: 1.75, color: '#94a3b8' }}
                          dangerouslySetInnerHTML={{ __html: renderMd(verdict) }}
                        />
                      ) : (
                        <p style={{ fontSize: 13, color: '#475569', textAlign: 'center', padding: '20px 0', fontFamily: 'DM Sans, sans-serif' }}>
                          AI verdict will appear here after scanning. Re-scan to generate.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Paywalled */
                  <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden' }}>
                    {/* Blurred placeholder */}
                    <div
                      className="paywall-blur"
                      style={{
                        background: '#020617',
                        border: '1px solid #1e293b',
                        borderRadius: 10,
                        padding: '24px 20px',
                        filter: 'blur(5px)',
                        userSelect: 'none',
                        pointerEvents: 'none',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1e293b' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ height: 14, background: '#1e293b', borderRadius: 4, marginBottom: 6, width: '60%' }} />
                          <div style={{ height: 11, background: '#1e293b', borderRadius: 4, width: '40%' }} />
                        </div>
                      </div>
                      {[100, 80, 95, 70, 85].map((w, i) => (
                        <div key={i} style={{ height: 14, background: '#1e293b', borderRadius: 4, marginBottom: 10, width: `${w}%` }} />
                      ))}
                      {[90, 75, 60].map((w, i) => (
                        <div key={i} style={{ height: 14, background: '#1e293b', borderRadius: 4, marginBottom: 10, width: `${w}%` }} />
                      ))}
                    </div>
                    {/* Overlay */}
                    <div
                      className="paywall-overlay"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 12,
                        background: 'rgba(2,8,23,0.65)',
                        backdropFilter: 'blur(2px)',
                        borderRadius: 10,
                      }}
                    >
                      <span style={{ fontSize: 28 }}>ðŸ”’</span>
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#f1f5f9', fontFamily: 'DM Sans, sans-serif' }}>
                          Recruiter Verdict is a Pro Feature
                        </p>
                        <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', fontFamily: 'DM Sans, sans-serif' }}>
                          Get a blunt 3-paragraph AI assessment from a senior engineering recruiter.
                        </p>
                      </div>
                      <button
                        onClick={() => openUpgradeModal('portfolioVerdict', 'Unlock the AI recruiter verdict with a paid plan.')}
                        style={{
                          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                          border: 'none',
                          borderRadius: 8,
                          color: '#fff',
                          fontSize: 13,
                          fontWeight: 700,
                          padding: '10px 22px',
                          cursor: 'pointer',
                          fontFamily: 'DM Sans, sans-serif',
                          boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
                          transition: 'transform 0.1s, box-shadow 0.1s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.45)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.3)'; }}
                      >
                        Upgrade to Dev / Pro â†’
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* â”€â”€ CTA Footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(220,38,38,0.08), rgba(220,38,38,0.04))',
              border: '1px solid rgba(220,38,38,0.2)',
              borderRadius: 10,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700, color: '#f1f5f9', fontFamily: 'DM Sans, sans-serif' }}>
                Fix issues â†’ Re-run to track improvement
              </p>
              <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', fontFamily: 'DM Sans, sans-serif' }}>
                {result.allIssues.filter(i => i.sev === 'critical' || i.sev === 'high').length} critical/high priority issues to resolve
              </p>
            </div>
            <button
              onClick={handleScan}
              disabled={loading || isAtLimit}
              style={{
                background: loading || isAtLimit ? '#1e293b' : ACCENT,
                border: 'none',
                borderRadius: 8,
                color: loading || isAtLimit ? '#475569' : '#fff',
                fontSize: 13,
                fontWeight: 700,
                padding: '10px 20px',
                cursor: loading || isAtLimit ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                transition: 'background 0.15s',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              ðŸ”„ Re-Scan
            </button>
          </div>
        </>
      )}
    </div>
  );
}
