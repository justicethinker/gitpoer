import {   useState, useCallback  , useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { parseUrl, ghFetch, tryRaw, fetchRepoContext } from '../utils/github';
import { callAI } from '../utils/ai';
import { renderMd, dlMd } from '../utils/markdown';
import { useApp } from '../context/AppContext';
import OutputBox from '../components/shared/OutputBox';
import UrlInput from '../components/shared/UrlInput';
import SectionCard from '../components/shared/SectionCard';
import ProBadge from '../components/shared/ProBadge';
import AudienceSelector, { AUDIENCES } from '../components/shared/AudienceSelector';

// â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ACCENT = '#1E40AF';
const ACCENT_LIGHT = 'rgba(30,64,175,0.12)';
const ACCENT_BORDER = 'rgba(30,64,175,0.3)';

const LOADING_MESSAGES = [
  'Fetching repo data...',
  'Reading file structure...',
  'Reading source files...',
  'Generating README...',
];

// Detectable feature flags based on file presence
const FEATURE_DETECTORS = [
  { key: 'docker', label: 'Docker', files: ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore'] },
  { key: 'ci', label: 'CI/CD', files: ['.github/workflows', '.travis.yml', 'Jenkinsfile', '.circleci/config.yml', '.gitlab-ci.yml'] },
  { key: 'tests', label: 'Tests', files: ['jest.config.js', 'jest.config.ts', 'pytest.ini', 'setup.cfg', '__tests__', 'test/', 'tests/'] },
  { key: 'typescript', label: 'TypeScript', files: ['tsconfig.json', 'tsconfig.base.json'] },
  { key: 'graphql', label: 'GraphQL', files: ['schema.graphql', 'schema.gql', 'graphql/', '.graphql'] },
  { key: 'eslint', label: 'ESLint', files: ['.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yaml', '.eslintignore'] },
  { key: 'makefile', label: 'Makefile', files: ['Makefile', 'makefile'] },
  { key: 'env', label: '.env', files: ['.env.example', '.env.sample', '.env.template'] },
  { key: 'license', label: 'License', files: ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING'] },
  { key: 'contributing', label: 'Contributing', files: ['CONTRIBUTING.md', 'CONTRIBUTING', 'CONTRIBUTING.txt'] },
];

// â”€â”€ Toggle definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TOGGLES = [
  {
    key: 'badges',
    label: 'Shields.io Badges',
    desc: 'Language, license, and last-commit badges at the top',
    icon: 'ðŸ·ï¸',
  },
  {
    key: 'codeExamples',
    label: 'Code Examples',
    desc: 'Inline snippet from a detected source file',
    icon: 'ðŸ’»',
  },
  {
    key: 'detailedInstall',
    label: 'Detailed Installation',
    desc: 'Step-by-step with version requirements and prerequisites',
    icon: 'âš™ï¸',
  },
  {
    key: 'contributing',
    label: 'Contributing Guide',
    desc: 'Contributor guidelines, PR flow, and code of conduct',
    icon: 'ðŸ¤',
  },
  {
    key: 'license',
    label: 'License Section',
    desc: 'License type with brief explanation',
    icon: 'ðŸ“œ',
  },
  {
    key: 'quickstart',
    label: 'QUICKSTART.md',
    desc: 'Also generate a separate quick-start document',
    icon: 'âš¡',
  },
  {
    key: 'wiki',
    label: 'Wiki Home Page',
    desc: 'Generate a GitHub Wiki home page (Home.md)',
    icon: 'ðŸ“–',
  },
];

// â”€â”€ Helper: pick a sample source file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SOURCE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.rb', '.java',
  '.cpp', '.c', '.cs', '.swift', '.kt', '.php', '.ex', '.exs',
];
const EXCLUDE_PATTERNS = [
  'node_modules', 'dist/', 'build/', '.next/', 'vendor/', '__pycache__',
  'coverage/', '.git/', 'test/', 'tests/', '__tests__/', '.spec.', '.test.',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
];

function pickSampleFile(files) {
  const candidates = files.filter((f) => {
    const lower = f.toLowerCase();
    if (EXCLUDE_PATTERNS.some((p) => lower.includes(p))) return false;
    return SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  });
  // Prefer main entry files
  const preferred = candidates.find((f) => {
    const base = f.split('/').pop().toLowerCase();
    return ['main.ts', 'main.js', 'index.ts', 'index.js', 'app.ts', 'app.js',
      'main.py', 'app.py', 'server.py', 'main.go', 'main.rs'].includes(base);
  });
  return preferred || candidates[0] || null;
}

// â”€â”€ Helper: detect features from file tree â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function detectFeatures(files) {
  const detected = [];
  const fileSet = new Set(files.map((f) => f.toLowerCase()));
  for (const detector of FEATURE_DETECTORS) {
    const found = detector.files.some((pat) => {
      const lower = pat.toLowerCase();
      return fileSet.has(lower) || [...fileSet].some((f) => f.includes(lower));
    });
    if (found) detected.push(detector.label);
  }
  return detected;
}

// â”€â”€ Helper: format language bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function formatLangs(langs) {
  if (!langs || !Object.keys(langs).length) return '';
  const total = Object.values(langs).reduce((s, v) => s + v, 0);
  return Object.entries(langs)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([lang, bytes]) => `${lang} ${((bytes / total) * 100).toFixed(1)}%`)
    .join(' Â· ');
}

// â”€â”€ AI Prompt builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildPrompt({ meta, langs, files, existingReadme, packageJson, sampleCode, sampleFile, toggles, customInstructions, audienceFocus }) {
  const langBar = formatLangs(langs);
  const topFiles = files.slice(0, 40).join('\n');
  const topics = meta.topics?.join(', ') || 'none';

  const sections = [];
  if (toggles.badges) sections.push('- A row of shields.io badges: language badge, license badge, last-commit badge (use the real GitHub owner/repo path)');
  if (toggles.codeExamples && sampleCode) sections.push('- A "Quick Example" or "Usage" section with a relevant code snippet from the provided sample file');
  if (toggles.detailedInstall) sections.push('- A detailed "Installation" section with prerequisites (language version, package manager), step-by-step commands, and any environment variable setup');
  if (toggles.contributing) sections.push('- A "Contributing" section with PR guidelines, issue templates mention, and a brief code of conduct reference');
  if (toggles.license) sections.push('- A "License" section naming the license and what it means for users');
  if (!toggles.detailedInstall) sections.push('- A simple "Getting Started" section with install and run commands');

  const enabledSections = sections.join('\n');

  return `You are an expert technical writer generating a professional, complete README.md for a real GitHub repository. Use the repository data below to write a highly specific, immediately usable README â€” no generic placeholders, no "your project description here", no fill-in-the-blank sections.

## Repository Information
- **Name**: ${meta.full_name}
- **Description**: ${meta.description || 'No description provided â€” infer from the file structure and code'}
- **Primary Language**: ${meta.language || 'Unknown'}
- **Language Breakdown**: ${langBar || 'N/A'}
- **Stars**: ${meta.stargazers_count?.toLocaleString() || 0}
- **Forks**: ${meta.forks_count?.toLocaleString() || 0}
- **Topics**: ${topics}
- **Homepage**: ${meta.homepage || 'N/A'}
- **License**: ${meta.license?.name || 'Not specified'}
- **Default Branch**: ${meta.default_branch || 'main'}

## File Tree (top 40 files)
\`\`\`
${topFiles}
\`\`\`

${existingReadme ? `## Existing README (for context/inspiration â€” improve upon it)
\`\`\`markdown
${existingReadme.slice(0, 3000)}
\`\`\`
` : ''}

${packageJson ? `## package.json Dependencies
\`\`\`json
${packageJson.slice(0, 2000)}
\`\`\`
` : ''}

${sampleCode ? `## Sample Source File: \`${sampleFile}\`
\`\`\`
${sampleCode.slice(0, 800)}
\`\`\`
` : ''}

## Required Sections
Generate a README.md that includes:
${enabledSections}
- A clear project title with a short, punchy tagline
- A "What is this?" or overview paragraph that is specific to this repo
- A table of contents if the README will be long (more than 4 sections)

## Audience Target
${audienceFocus}

## Output Rules
- Use GitHub Flavored Markdown
- Make it immediately usable â€” no placeholders like "[your description]" or "[TODO]"
- Be specific: reference actual files, technologies, and patterns seen in this repo
- Badges should use the real \`${meta.full_name}\` path on shields.io
- Code blocks should use the correct language syntax highlighting tag
- Keep it professional but approachable

${customInstructions ? `## Additional Instructions from the User
${customInstructions}
` : ''}

Output ONLY the README.md content â€” no preamble, no explanation, start directly with the markdown.`;
}

// â”€â”€ Quickstart prompt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildQuickstartPrompt({ meta, langs, existingReadme, packageJson }) {
  return `Generate a QUICKSTART.md for the GitHub repository \`${meta.full_name}\`.

Repository context:
- Description: ${meta.description || 'See the main README'}
- Language: ${meta.language || 'Unknown'}
- Languages: ${formatLangs(langs)}
${packageJson ? `- Has package.json with: ${packageJson.slice(0, 500)}` : ''}
${existingReadme ? `- Existing README excerpt: ${existingReadme.slice(0, 1000)}` : ''}

Write a concise QUICKSTART.md that gets a developer running in under 5 minutes:
1. Prerequisites (tools + versions)
2. Clone & install (exact commands)
3. Configure (any required env vars or config files)
4. Run (the single command to start)
5. Verify it's working (what they should see / test endpoint / first success)

Be specific to this repo. Use fenced code blocks with the right language tags. No placeholders.
Output ONLY the markdown, starting with the # heading.`;
}

// â”€â”€ Wiki prompt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildWikiPrompt({ meta, langs, files }) {
  const topFiles = files.slice(0, 30).join('\n');
  return `Generate a GitHub Wiki Home.md page for the repository \`${meta.full_name}\`.

Repository context:
- Description: ${meta.description || 'N/A'}
- Language: ${meta.language || 'Unknown'}
- Languages: ${formatLangs(langs)}
- File tree:
${topFiles}

Create a helpful wiki home page that:
1. Introduces the project with an overview paragraph
2. Lists wiki sections with links (use relative wiki links like [[Section Name]])
3. Suggests logical wiki pages based on the project structure (e.g., Architecture, API Reference, Configuration, Deployment, Troubleshooting)
4. Includes a "Getting Help" section with links to issues, discussions, etc.

Be specific to this repo's technology stack and structure.
Output ONLY the markdown, starting with the # heading.`;
}

// â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ReadmeGenerator() {
  const { owner, repo } = useParams();

  const { isAtLimit, incrementGeneration, addRecentRepo, canUseFeature, openUpgradeModal } = useApp();

  // URL state
  const [url, setUrl] = useState(`https://github.com/${owner}/${repo}`);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');

  // Repo data
  const [repoData, setRepoData] = useState(null); // { meta, langs, files, detectedFeatures, existingReadme, packageJson, sampleCode, sampleFile }

  // Toggles â€” all true by default
  const [toggles, setToggles] = useState({
    badges: true,
    codeExamples: true,
    detailedInstall: true,
    contributing: true,
    license: true,
    quickstart: true,
    wiki: true,
  });

  // Custom instructions
  const [customInstructions, setCustomInstructions] = useState('');
  const canCustomInstructions = canUseFeature('customInstructions');

  // Audience
  const [audienceId, setAudienceId] = useState('default');

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [genError, setGenError] = useState('');

  // Outputs
  const [readmeMd, setReadmeMd] = useState('');
  const [quickstartMd, setQuickstartMd] = useState('');
  const [wikiMd, setWikiMd] = useState('');

  // â”€â”€ Scan repo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleScan = useCallback(async () => {
    const parsed = parseUrl(url);
    if (!parsed) {
      setScanError('Please enter a valid GitHub repository URL.');
      return;
    }
    setScanError('');
    setScanning(true);
    setRepoData(null);
    setReadmeMd('');
    setQuickstartMd('');
    setWikiMd('');
    setGenError('');

    try {
      // Step 1: fetch repo context
      const { meta, branch, files, langs } = await fetchRepoContext(parsed.owner, parsed.repo);

      // Step 2: fetch optional files in parallel
      const [existingReadme, packageJson] = await Promise.all([
        tryRaw(parsed.owner, parsed.repo, 'README.md', branch),
        tryRaw(parsed.owner, parsed.repo, 'package.json', branch),
      ]);

      // Step 3: pick and fetch a sample source file
      const sampleFile = pickSampleFile(files);
      let sampleCode = null;
      if (sampleFile) {
        sampleCode = await tryRaw(parsed.owner, parsed.repo, sampleFile, branch);
      }

      const detectedFeatures = detectFeatures(files);

      addRecentRepo(parsed.owner, parsed.repo);
      setRepoData({ meta, langs, files, detectedFeatures, existingReadme, packageJson, sampleCode, sampleFile });
    } catch (err) {
      setScanError(err.message || 'Failed to fetch repository data.');
    } finally {
      setScanning(false);
    }
  }, [url, addRecentRepo]);

  // â”€â”€ Toggle handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function handleToggle(key) {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // â”€â”€ Generate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleGenerate = useCallback(async () => {
    if (!repoData) return;
    if (isAtLimit) {
      openUpgradeModal('generations', 'You have used all your generations this month. Upgrade to continue.');
      return;
    }

    setGenError('');
    setGenerating(true);
    setLoadingStep(0);
    setReadmeMd('');
    setQuickstartMd('');
    setWikiMd('');

    const { meta, langs, files, existingReadme, packageJson, sampleCode, sampleFile } = repoData;

    try {
      // Step 0 â†’ already "Fetching repo data" done at scan time
      // Step through loading messages
      setLoadingStep(0);
      await new Promise((r) => setTimeout(r, 300));
      setLoadingStep(1);
      await new Promise((r) => setTimeout(r, 300));
      setLoadingStep(2);
      await new Promise((r) => setTimeout(r, 300));
      setLoadingStep(3);

      // Build README prompt
      const audience = AUDIENCES.find(a => a.id === audienceId) || AUDIENCES[0];
      const readmePrompt = buildPrompt({
        meta, langs, files, existingReadme, packageJson,
        sampleCode, sampleFile, toggles,
        customInstructions: canCustomInstructions ? customInstructions.trim() : '',
        audienceFocus: audience.promptFocus,
      });

      // Fire README generation
      const readmeResult = await callAI(readmePrompt);
      setReadmeMd(readmeResult);

      // Fire quickstart + wiki in parallel if enabled
      const extras = await Promise.all([
        toggles.quickstart
          ? callAI(buildQuickstartPrompt({ meta, langs, existingReadme, packageJson }))
          : Promise.resolve(''),
        toggles.wiki
          ? callAI(buildWikiPrompt({ meta, langs, files }))
          : Promise.resolve(''),
      ]);
      if (toggles.quickstart) setQuickstartMd(extras[0]);
      if (toggles.wiki) setWikiMd(extras[1]);

      incrementGeneration();
    } catch (err) {
      setGenError(err.message || 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }, [repoData, toggles, customInstructions, canCustomInstructions, isAtLimit, incrementGeneration, openUpgradeModal]);

  // â”€â”€ Computed flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const hasOutput = readmeMd || quickstartMd || wikiMd;
  const activeToggleCount = Object.values(toggles).filter(Boolean).length;

  
  // Auto-load repo on mount (fixed)
  useEffect(() => {
    if (owner && repo) {
      handleScan();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        padding: '28px 0',
        fontFamily: 'DM Sans, sans-serif',
        minHeight: '100%',
      }}
    >
      {/* â”€â”€ Header â”€â”€ */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              color: '#f1f5f9',
              letterSpacing: '-0.02em',
            }}
          >
            ðŸ“„ README Generator
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
            Analyzing repository to instantly generate a professional, tailored README.md
          </p>
        </div>
        <div
          style={{
            background: ACCENT_LIGHT,
            border: `1px solid ${ACCENT_BORDER}`,
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 12,
            color: '#93c5fd',
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {activeToggleCount} / {TOGGLES.length} sections
        </div>
      </div>

      {/* â”€â”€ URL Input â”€â”€ */}
      

      {/* Scan error */}
      {scanError && (
        <div
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 8,
            padding: '10px 16px',
            color: '#f87171',
            fontSize: 13,
          }}
        >
          âš ï¸ {scanError}
        </div>
      )}

      {/* â”€â”€ Repo Card (after scan) â”€â”€ */}
      {repoData && (
        <div className="fade-up">
          <RepoCard repoData={repoData} accentColor={ACCENT} />
        </div>
      )}

      {/* â”€â”€ Main body: two-column layout â”€â”€ */}
      {repoData && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(280px, 360px) 1fr',
            gap: 20,
            alignItems: 'start',
          }}
        >
          {/* â”€â”€ LEFT COLUMN: Toggles + Custom Instructions + Generate â”€â”€ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Toggle section */}
            <SectionCard title="Generation Options" accentColor={ACCENT}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {TOGGLES.map((t) => (
                  <ToggleRow
                    key={t.key}
                    toggle={t}
                    enabled={toggles[t.key]}
                    onToggle={() => handleToggle(t.key)}
                    accentColor={ACCENT}
                    disabled={generating}
                  />
                ))}
              </div>
            </SectionCard>

            {/* Custom instructions */}
            <SectionCard
              title="Custom Instructions"
              accentColor={ACCENT}
              extra={
                !canCustomInstructions ? (
                  <ProBadge
                    feature="customInstructions"
                    description="Custom instructions let you guide exactly how Claude writes your README."
                  />
                ) : null
              }
            >
              <div style={{ position: 'relative' }}>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder={
                    canCustomInstructions
                      ? 'e.g. "Focus on the Python API. Add a Docker Compose section. Keep it under 300 lines."'
                      : 'Upgrade to Dev or Pro to use custom instructions...'
                  }
                  disabled={!canCustomInstructions || generating}
                  rows={5}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                    color: canCustomInstructions ? '#f1f5f9' : '#475569',
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 13,
                    lineHeight: 1.6,
                    padding: '10px 12px',
                    resize: 'vertical',
                    outline: 'none',
                    cursor: canCustomInstructions ? 'text' : 'not-allowed',
                    transition: 'border-color 0.15s',
                    opacity: generating ? 0.6 : 1,
                  }}
                  onFocus={(e) => {
                    if (canCustomInstructions) e.currentTarget.style.borderColor = ACCENT;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#1e293b';
                  }}
                />
                {!canCustomInstructions && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 8,
                      background: 'rgba(2,8,23,0.55)',
                      backdropFilter: 'blur(2px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                    onClick={() =>
                      openUpgradeModal(
                        'customInstructions',
                        'Custom instructions let you guide exactly how Claude writes your README.',
                      )
                    }
                  >
                    <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                      ðŸ”’ Pro feature â€” click to unlock
                    </span>
                  </div>
                )}
              </div>
            </SectionCard>

            <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Audience Targeting</div>
            <AudienceSelector value={audienceId} onChange={setAudienceId} />

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={generating || !repoData}
              style={{
                width: '100%',
                padding: '14px 0',
                background: generating || !repoData ? '#1e293b' : `linear-gradient(135deg, ${ACCENT}, #2563eb)`,
                border: 'none',
                borderRadius: 10,
                color: generating || !repoData ? '#475569' : '#fff',
                fontFamily: 'DM Sans, sans-serif',
                fontWeight: 800,
                fontSize: 15,
                cursor: generating || !repoData ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
                letterSpacing: '-0.01em',
                boxShadow: generating || !repoData ? 'none' : '0 4px 20px rgba(30,64,175,0.35)',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                if (!generating && repoData) {
                  e.currentTarget.style.boxShadow = '0 6px 28px rgba(30,64,175,0.5)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = generating || !repoData ? 'none' : '0 4px 20px rgba(30,64,175,0.35)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {generating ? 'âœ¦ Generating...' : 'âœ¦ Generate README'}
            </button>

            {/* Generation error */}
            {genError && (
              <div
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#f87171',
                  fontSize: 12,
                }}
              >
                âš ï¸ {genError}
              </div>
            )}
          </div>

          {/* â”€â”€ RIGHT COLUMN: Outputs â”€â”€ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Loading state */}
            {generating && (
              <div className="fade-in">
                <LoadingCard step={loadingStep} accentColor={ACCENT} />
              </div>
            )}

            {/* README output */}
            {readmeMd && (
              <div className="fade-up">
                <OutputBox
                  content={readmeMd}
                  filename="README.md"
                  accentColor={ACCENT}
                />
              </div>
            )}

            {/* QUICKSTART output */}
            {quickstartMd && toggles.quickstart && (
              <div className="fade-up">
                <OutputBox
                  content={quickstartMd}
                  filename="QUICKSTART.md"
                  accentColor={ACCENT}
                />
              </div>
            )}

            {/* Wiki output */}
            {wikiMd && toggles.wiki && (
              <div className="fade-up">
                <OutputBox
                  content={wikiMd}
                  filename="Home.md (Wiki)"
                  accentColor={ACCENT}
                />
              </div>
            )}

            {/* Empty state placeholder */}
            {!generating && !hasOutput && (
              <EmptyOutputState accentColor={ACCENT} />
            )}
          </div>
        </div>
      )}

      {/* Empty state before scan */}
      {!repoData && !scanning && !scanError && (
        <div className="fade-in">
          <PreScanHero accentColor={ACCENT} />
        </div>
      )}
    </div>
  );
}

// â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function RepoCard({ repoData, accentColor }) {
  const { meta, langs, detectedFeatures } = repoData;
  const langBar = formatLangs(langs);

  return (
    <div
      style={{
        background: '#020617',
        border: `1px solid ${ACCENT_BORDER}`,
        borderRadius: 12,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Top row: name + stats */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: '#f1f5f9',
                fontFamily: 'JetBrains Mono, monospace',
                letterSpacing: '-0.02em',
              }}
            >
              {meta.full_name}
            </span>
            {meta.private && (
              <span
                style={{
                  background: 'rgba(245,158,11,0.12)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245,158,11,0.25)',
                  borderRadius: 5,
                  padding: '2px 7px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Private
              </span>
            )}
          </div>
          {meta.description && (
            <p style={{ margin: '5px 0 0', fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
              {meta.description}
            </p>
          )}
        </div>
        {/* Stats */}
        <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
          <StatPill icon="â­" value={meta.stargazers_count?.toLocaleString() || '0'} label="Stars" />
          <StatPill icon="ðŸ´" value={meta.forks_count?.toLocaleString() || '0'} label="Forks" />
          {meta.open_issues_count > 0 && (
            <StatPill icon="ðŸ”´" value={meta.open_issues_count?.toLocaleString()} label="Issues" />
          )}
        </div>
      </div>

      {/* Language bar */}
      {langBar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: accentColor,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}>
            {langBar}
          </span>
        </div>
      )}

      {/* Detected feature pills */}
      {detectedFeatures.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {detectedFeatures.map((feat) => (
            <span
              key={feat}
              className="flag-on"
              style={{ fontSize: 11 }}
            >
              âœ“ {feat}
            </span>
          ))}
        </div>
      )}

      {/* Topics */}
      {meta.topics?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {meta.topics.map((topic) => (
            <span
              key={topic}
              style={{
                background: ACCENT_LIGHT,
                color: '#93c5fd',
                border: `1px solid ${ACCENT_BORDER}`,
                borderRadius: 20,
                padding: '2px 9px',
                fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 500,
              }}
            >
              {topic}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StatPill({ icon, value, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', fontFamily: 'JetBrains Mono, monospace' }}>
        {value}
      </span>
      <span style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
    </div>
  );
}

function ToggleRow({ toggle, enabled, onToggle, accentColor, disabled }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 10px',
        borderRadius: 8,
        background: enabled ? 'rgba(30,64,175,0.06)' : 'transparent',
        border: `1px solid ${enabled ? ACCENT_BORDER : 'transparent'}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
        userSelect: 'none',
        opacity: disabled ? 0.6 : 1,
      }}
      onClick={() => !disabled && onToggle()}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ fontSize: 15 }}>{toggle.icon}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: enabled ? '#f1f5f9' : '#94a3b8', lineHeight: 1.3 }}>
            {toggle.label}
          </div>
          <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.3, marginTop: 1 }}>
            {toggle.desc}
          </div>
        </div>
      </div>
      {/* Toggle switch */}
      <div
        style={{
          width: 34,
          height: 20,
          borderRadius: 10,
          background: enabled ? accentColor : '#1e293b',
          border: `1px solid ${enabled ? accentColor : '#334155'}`,
          position: 'relative',
          flexShrink: 0,
          transition: 'background 0.2s, border-color 0.2s',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: enabled ? 16 : 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          }}
        />
      </div>
    </div>
  );
}

function LoadingCard({ step, accentColor }) {
  return (
    <div
      style={{
        background: '#020617',
        border: `1px solid ${ACCENT_BORDER}`,
        borderRadius: 12,
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        alignItems: 'flex-start',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Spinner color={accentColor} />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>
          {LOADING_MESSAGES[step] || 'Working...'}
        </span>
      </div>
      {/* Progress steps */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {LOADING_MESSAGES.map((msg, i) => (
          <div key={msg} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: i < step ? accentColor : i === step ? ACCENT_LIGHT : '#1e293b',
                border: `2px solid ${i <= step ? accentColor : '#334155'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.3s',
              }}
            >
              {i < step && (
                <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>âœ“</span>
              )}
              {i === step && (
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: accentColor,
                    animation: 'pulse 1s infinite',
                  }}
                />
              )}
            </div>
            <span
              style={{
                fontSize: 12,
                color: i <= step ? '#f1f5f9' : '#475569',
                fontWeight: i === step ? 600 : 400,
                transition: 'color 0.3s',
              }}
            >
              {msg}
            </span>
          </div>
        ))}
      </div>
      {/* Skeleton lines */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        {[90, 75, 82, 60, 88].map((w, i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: 12, borderRadius: 6, width: `${w}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function Spinner({ color }) {
  return (
    <div
      style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        border: `2px solid ${color}33`,
        borderTop: `2px solid ${color}`,
        animation: 'spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

function EmptyOutputState({ accentColor }) {
  return (
    <div
      style={{
        background: '#020617',
        border: '1px dashed #1e293b',
        borderRadius: 12,
        padding: '48px 32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: ACCENT_LIGHT,
          border: `1px solid ${ACCENT_BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
        }}
      >
        ðŸ“
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>
          Your README will appear here
        </div>
        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, maxWidth: 300 }}>
          Configure your options on the left, then click{' '}
          <span style={{ color: '#93c5fd', fontWeight: 600 }}>Generate README</span> to create
          your professional documentation.
        </div>
      </div>
    </div>
  );
}

function PreScanHero({ accentColor }) {
  const features = [
    { icon: 'ðŸ·ï¸', label: 'Shields.io badges auto-configured' },
    { icon: 'ðŸ’»', label: 'Real code examples from your repo' },
    { icon: 'âš™ï¸', label: 'Step-by-step install instructions' },
    { icon: 'âš¡', label: 'Separate QUICKSTART.md generation' },
    { icon: 'ðŸ“–', label: 'GitHub Wiki home page' },
    { icon: 'ðŸ¤', label: 'Contributing & license sections' },
  ];
return (
    <div
      style={{
        background: '#020617',
        border: '1px solid #1e293b',
        borderRadius: 14,
        padding: '32px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <div>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: ACCENT_LIGHT,
            border: `2px solid ${ACCENT_BORDER}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 30,
            margin: '0 auto 16px',
          }}
        >
          ðŸ“„
        </div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
          Generate a README in seconds
        </h2>
        <p style={{ margin: '10px 0 0', fontSize: 13, color: '#94a3b8', lineHeight: 1.6, maxWidth: 420 }}>
          Paste any public GitHub repository URL above. GitGrade will scan the file structure,
          detect technologies, and use AI to write a complete, specific README â€” not a generic template.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 10,
          width: '100%',
          maxWidth: 560,
        }}
      >
        {features.map((f) => (
          <div
            key={f.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 8,
              padding: '9px 12px',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{f.icon}</span>
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, lineHeight: 1.3 }}>
              {f.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
