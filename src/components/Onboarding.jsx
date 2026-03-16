import { useState } from "react";

// ─── GitHub API ───────────────────────────────────────────────────────────────
const GH = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

function parseUrl(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/\s?#]+)/);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, "") } : null;
}
async function ghFetch(path) {
  const r = await fetch(`${GH}${path}`);
  if (!r.ok) return null;
  return r.json();
}
async function tryRaw(owner, repo, file, branch) {
  for (const b of [branch, "main", "master"]) {
    try { const r = await fetch(`${RAW}/${owner}/${repo}/${b}/${file}`); if (r.ok) return r.text(); } catch {}
  }
  return null;
}

// ─── Deep repo scanner ────────────────────────────────────────────────────────
async function deepScanRepo(owner, repo) {
  const [meta, tree, langs, commits, contributors] = await Promise.all([
    ghFetch(`/repos/${owner}/${repo}`),
    ghFetch(`/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`),
    ghFetch(`/repos/${owner}/${repo}/languages`),
    ghFetch(`/repos/${owner}/${repo}/commits?per_page=30`),
    ghFetch(`/repos/${owner}/${repo}/contributors?per_page=10`),
  ]);
  if (!meta) throw new Error("Repo not found or is private.");

  const branch = meta.default_branch || "main";
  const allFiles = (tree?.tree || []).map(f => f.path).filter(Boolean);

  // Identify key config / entry files
  const configFiles = allFiles.filter(f => {
    const lower = f.toLowerCase();
    return lower.match(/^(package\.json|requirements\.txt|pyproject\.toml|go\.mod|cargo\.toml|pom\.xml|build\.gradle|gemfile|composer\.json)$/);
  });

  const entryFiles = allFiles.filter(f => {
    const lower = f.toLowerCase();
    return lower.match(/(main\.|index\.|app\.|server\.|manage\.py|wsgi\.py|asgi\.py|init\.py)/) &&
      !lower.includes("node_modules") && !lower.includes("test");
  }).slice(0, 5);

  const testFiles = allFiles.filter(f =>
    f.toLowerCase().includes("test") || f.toLowerCase().includes("spec")
  ).slice(0, 8);

  const ciFiles = allFiles.filter(f =>
    f.includes(".github/workflows") || f.includes(".travis") || f.includes("circle") || f.includes("Makefile")
  ).slice(0, 5);

  const docFiles = allFiles.filter(f =>
    f.toLowerCase().startsWith("docs/") || f.toLowerCase().startsWith("doc/")
  ).slice(0, 10);

  // Fetch content of key files
  const filesToRead = [
    ...configFiles.slice(0, 2),
    ...entryFiles.slice(0, 3),
    ...ciFiles.slice(0, 1),
  ];

  const fileContents = await Promise.all(
    filesToRead.map(async f => {
      const content = await tryRaw(owner, repo, f, branch);
      return content ? { path: f, content: content.slice(0, 500) } : null;
    })
  );

  // Architecture signals
  const topFolders = [...new Set(allFiles.map(p => p.split("/")[0]).filter(Boolean))];
  const subfolders = [...new Set(
    allFiles
      .filter(p => p.includes("/"))
      .map(p => p.split("/").slice(0, 2).join("/"))
  )].slice(0, 24);

  // Commit patterns for team context
  const commitAuthors = [...new Set((commits || []).map(c => c.commit?.author?.name).filter(Boolean))];
  const recentMessages = (commits || []).slice(0, 15).map(c => c.commit?.message?.split("\n")[0]);
  const daysSinceLastCommit = commits?.[0]
    ? Math.round((Date.now() - new Date(commits[0].commit?.author?.date)) / 86400000)
    : null;

  // Dependency extraction
  const pkgContent = fileContents.find(f => f?.path === "package.json");
  let deps = [];
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent.content + '"}}}'); // partial parse attempt
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      deps = Object.keys(allDeps).slice(0, 20);
    } catch { deps = []; }
  }

  // Env vars
  const envExampleContent = await tryRaw(owner, repo, ".env.example", branch) ||
    await tryRaw(owner, repo, "env.example", branch);
  const envVars = envExampleContent
    ? envExampleContent.split("\n")
        .filter(l => l.includes("=") && !l.startsWith("#"))
        .map(l => l.split("=")[0].trim())
        .filter(Boolean)
        .slice(0, 20)
    : [];

  // Docker / deployment
  const hasDocker = allFiles.some(f => f.toLowerCase().includes("dockerfile") || f.toLowerCase() === "docker-compose.yml");
  const hasK8s = allFiles.some(f => f.includes("k8s") || f.includes("kubernetes") || f.includes("helm"));
  const hasMakefile = allFiles.some(f => f.toLowerCase() === "makefile");
  const hasTests = testFiles.length > 0;
  const hasCI = ciFiles.length > 0;

  return {
    owner, name: meta.name,
    description: meta.description || "",
    language: Object.keys(langs || {})[0] || "Unknown",
    languages: Object.keys(langs || {}).slice(0, 6),
    langBytes: langs || {},
    topics: meta.topics || [],
    stars: meta.stargazers_count,
    forks: meta.forks_count,
    openIssues: meta.open_issues_count,
    branch,
    topFolders,
    subfolders,
    allFiles: allFiles.slice(0, 80),
    configFiles,
    entryFiles,
    testFiles,
    ciFiles,
    docFiles,
    fileContents: fileContents.filter(Boolean),
    deps,
    envVars,
    hasDocker, hasK8s, hasMakefile, hasTests, hasCI,
    commitAuthors,
    recentMessages,
    contributors: (contributors || []).map(c => c.login),
    daysSinceLastCommit,
    totalFiles: allFiles.length,
  };
}

// ─── Claude generation ────────────────────────────────────────────────────────
const DOC_SECTIONS = {
  overview: {
    id: "overview", label: "Project Overview", icon: "🗺️",
    description: "What it is, why it exists, who uses it",
  },
  architecture: {
    id: "architecture", label: "Architecture", icon: "🏗️",
    description: "How the codebase is structured, key modules and their roles",
  },
  setup: {
    id: "setup", label: "Local Setup", icon: "⚙️",
    description: "Step-by-step environment setup for a new developer",
  },
  flows: {
    id: "flows", label: "Key Code Flows", icon: "🔄",
    description: "Where to start reading, how data moves through the system",
  },
  conventions: {
    id: "conventions", label: "Conventions & Patterns", icon: "📐",
    description: "Code style, patterns used, how to write new features",
  },
  gotchas: {
    id: "gotchas", label: "Gotchas & Landmines", icon: "⚠️",
    description: "Things that will trip you up, non-obvious decisions",
  },
  testing: {
    id: "testing", label: "Testing Guide", icon: "🧪",
    description: "How to run tests, what's covered, how to write new tests",
  },
  deployment: {
    id: "deployment", label: "Deployment", icon: "🚀",
    description: "How the project gets deployed, environments, CI/CD",
  },
};

function buildOnboardingPrompt(ctx, selectedSections, role, customInstructions) {
  const fileContentStr = ctx.fileContents.map(f =>
    `--- ${f.path} ---\n${f.content}`
  ).join("\n\n");

  const repoSignals = `
REPOSITORY SIGNALS:
Name: ${ctx.owner}/${ctx.name}
Description: ${ctx.description || "none"}
Primary Language: ${ctx.language}
All Languages: ${ctx.languages.join(", ")}
Total Files: ${ctx.totalFiles}
Stars: ${ctx.stars} | Open Issues: ${ctx.openIssues}
Active contributors: ${ctx.contributors.slice(0, 6).join(", ") || "unknown"}
Last commit: ${ctx.daysSinceLastCommit !== null ? `${ctx.daysSinceLastCommit} days ago` : "unknown"}

STRUCTURE:
Top-level folders: ${ctx.topFolders.join(", ")}
Key subfolders: ${ctx.subfolders.slice(0, 16).join(", ")}
Entry point files: ${ctx.entryFiles.join(", ") || "none identified"}
Config files: ${ctx.configFiles.join(", ") || "none"}
CI files: ${ctx.ciFiles.join(", ") || "none"}
Test files (sample): ${ctx.testFiles.slice(0, 5).join(", ") || "none"}

INFRASTRUCTURE:
Has Docker: ${ctx.hasDocker}
Has Kubernetes: ${ctx.hasK8s}
Has Makefile: ${ctx.hasMakefile}
Has CI/CD: ${ctx.hasCI}
Has Tests: ${ctx.hasTests}

DEPENDENCIES (${ctx.deps.length} total): ${ctx.deps.slice(0, 15).join(", ")}
ENVIRONMENT VARIABLES: ${ctx.envVars.length > 0 ? ctx.envVars.join(", ") : "none detected"}

RECENT COMMIT MESSAGES (for activity context):
${ctx.recentMessages.slice(0, 10).join("\n")}

KEY FILE CONTENTS:
${fileContentStr || "none available"}`;

  const sectionInstructions = {
    overview: `## 🗺️ Project Overview
Write 3-4 paragraphs covering:
1. What this project does and why it exists (infer from structure + description)
2. Who uses it and in what context (end users, internal tool, library, etc.)
3. High-level technical approach — what kind of project is this architecturally?
4. Current state: active? mature? rapidly evolving? (use commit activity signals)
Be specific. Avoid generic filler.`,

    architecture: `## 🏗️ Architecture
Cover:
1. Overall architecture pattern (MVC, microservices, monolith, event-driven, etc.) — infer from folder structure
2. Key modules/packages and what each is responsible for (use the subfolders)
3. How they relate to each other — data flow at a high level
4. Key design decisions that shape the codebase
5. External services/APIs this project depends on (infer from deps + env vars)
Use a simple text diagram if it helps clarity.`,

    setup: `## ⚙️ Local Development Setup
Write a complete, step-by-step setup guide for a new developer joining the team:
1. Prerequisites (language runtime, tools, versions)
2. Clone and install dependencies
3. Environment variables — list every env var from .env.example with a brief description of what each is
4. Database / external service setup if applicable
5. How to run the project locally
6. How to verify it's working
7. Common setup issues and fixes (infer from project type)
Make it copy-pasteable. Use code blocks for all commands.`,

    flows: `## 🔄 Key Code Flows
Explain the most important code paths a new developer needs to understand:
1. "Where does a request enter the system?" — trace from entry point
2. The 2-3 most important flows in this project (infer from folder names, entry files)
3. "Where to start reading" — which files to open first and in what order
4. How data is modeled and where models/schemas live
Be specific: name actual files and folders.`,

    conventions: `## 📐 Code Conventions & Patterns
Document the patterns used in this codebase:
1. Project-specific patterns (infer from folder structure and deps)
2. Naming conventions (files, functions, variables — infer from file names)
3. How new features should be structured
4. Error handling approach (infer from project type)
5. Any linting/formatting rules in place
6. How to add a new [component/endpoint/model] — the standard pattern`,

    gotchas: `## ⚠️ Gotchas & Non-Obvious Decisions
The things that will trip up a new developer:
1. Non-obvious architectural decisions and WHY they were made
2. Things that look weird but are intentional
3. Common mistakes new devs make on this type of project
4. Environment-specific behaviours
5. Any known technical debt areas (infer from commit messages and structure)
6. "If you see X, don't do Y" — practical warnings
Be honest and direct. This is the most valuable section.`,

    testing: `## 🧪 Testing
Cover:
1. How to run the full test suite
2. How to run a single test
3. What's covered (unit, integration, e2e?) — infer from test file locations
4. How to write a new test — the conventions used
5. Test data / fixtures approach
6. CI testing — what runs on each PR?
Use actual file paths from the repo.`,

    deployment: `## 🚀 Deployment
Cover:
1. Environments (dev, staging, prod) — infer from CI files and folder names
2. How to deploy (commands, CI pipeline, manual steps)
3. Environment variables that differ between environments
4. Docker usage if applicable
5. Any infrastructure-as-code (K8s, Terraform, etc.)
6. Rollback procedure
7. Monitoring / logging approach (infer from deps)`,
  };

  const sectionsToGenerate = selectedSections
    .map(id => sectionInstructions[id])
    .join("\n\n");

  const roleContext = role ? `\nTARGET READER: This onboarding doc is written for a ${role}. Adjust depth and emphasis accordingly.\n` : "";
  const customBlock = customInstructions?.trim()
    ? `\nCUSTOM INSTRUCTIONS (binding — must be reflected throughout):\n━━━━━━━━━━━━━━━━━━\n${customInstructions.trim()}\n━━━━━━━━━━━━━━━━━━\n`
    : "";

  return `You are a senior engineer writing an onboarding document for a new developer joining the team.
Your goal: let a new developer be productive within their first day, without needing to ask senior engineers basic questions.
${roleContext}${customBlock}
${repoSignals}

Write the following sections of the onboarding doc. Be specific — use actual file names, folder names, and dependency names from the repo data above. Infer thoughtfully where information is not explicit. Do NOT use placeholder text.

${sectionsToGenerate}

Return ONLY the raw markdown. No preamble or explanation.`;
}

async function generateSection(ctx, sectionIds, role, customInstructions, onChunk) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: "You are a senior software engineer writing internal onboarding documentation. Be specific, practical, and honest. Name actual files and patterns. Return ONLY raw markdown.",
      messages: [{ role: "user", content: buildOnboardingPrompt(ctx, sectionIds, role, customInstructions) }],
    }),
  });
  const data = await res.json();
  return data.content?.find(b => b.type === "text")?.text || "";
}

// ─── Markdown renderer ────────────────────────────────────────────────────────
function renderMd(md) {
  if (!md) return "";
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^#{4} (.+)$/gm, "<h4 style='color:#94a3b8;font-size:.95em;margin:.5em 0 .2em'>$1</h4>")
    .replace(/^#{3} (.+)$/gm, "<h3 style='color:#cbd5e1;font-size:1.05em;margin:.6em 0 .25em'>$1</h3>")
    .replace(/^#{2} (.+)$/gm, "<h2 style='color:#e2e8f0;font-size:1.2em;border-bottom:1px solid #1e293b;padding-bottom:.2em;margin:.8em 0 .3em'>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 style='color:#f1f5f9;font-size:1.4em;border-bottom:1px solid #1e293b;padding-bottom:.3em;margin:.8em 0 .3em'>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong style='color:#e2e8f0'>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em style='color:#94a3b8'>$1</em>")
    .replace(/`([^`\n]+)`/g, "<code style='background:#1e293b;padding:1px 5px;border-radius:4px;font-size:.82em;color:#fb923c;font-family:monospace'>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:#60a5fa;text-decoration:none">$1</a>')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre style="background:#0d1117;padding:14px 16px;border-radius:8px;overflow-x:auto;margin:.6em 0;border:1px solid #1e293b"><code style="color:#e2e8f0;font-size:.85em;font-family:'JetBrains Mono',monospace">${c.trim()}</code></pre>`)
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #1e293b;margin:.8em 0">')
    .replace(/^\s*[-*] (.+)$/gm, "<li style='color:#94a3b8;margin:.25em 0;font-size:13.5px'>$1</li>")
    .replace(/(<li[\s\S]*?<\/li>\n?)+/g, m => `<ul style="padding-left:18px;margin:.4em 0">${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm, "<li style='color:#94a3b8;margin:.25em 0;font-size:13.5px'>$1</li>")
    .replace(/\n\n+/g, "</p><p style='color:#94a3b8;margin:.4em 0;font-size:13.5px;line-height:1.8'>")
    .replace(/^(?!<[hpuolridbs]|<hr|<pre|<img)(.+)$/gm, m => m.trim() ? `<p style="color:#94a3b8;margin:.4em 0;font-size:13.5px;line-height:1.8">${m}</p>` : "");
}

function downloadMd(content, filename) {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([content], { type: "text/markdown" })),
    download: filename,
  });
  a.click();
}

// ─── UI Components ────────────────────────────────────────────────────────────

function SectionToggle({ section, selected, onToggle, generated }) {
  const isOn = selected.includes(section.id);
  return (
    <div onClick={() => onToggle(section.id)}
      style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: "pointer", border: `1.5px solid ${isOn ? "#3b82f680" : "#1e293b"}`, background: isOn ? "#1e3a8a15" : "transparent", transition: "all .18s", position: "relative" }}>
      {generated && isOn && (
        <div style={{ position: "absolute", top: 6, right: 8, width: 6, height: 6, borderRadius: "50%", background: "#4ade80" }} />
      )}
      <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${isOn ? "#3b82f6" : "#334155"}`, background: isOn ? "#3b82f6" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, transition: "all .15s" }}>
        {isOn && <span style={{ color: "#fff", fontSize: 10, lineHeight: 1 }}>✓</span>}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 13 }}>{section.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: isOn ? "#93c5fd" : "#64748b" }}>{section.label}</span>
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginTop: 2, lineHeight: 1.4 }}>{section.description}</div>
      </div>
    </div>
  );
}

function RepoInsightCard({ ctx }) {
  const totalBytes = Object.values(ctx.langBytes).reduce((a, b) => a + b, 0);
  const langPcts = Object.entries(ctx.langBytes)
    .map(([lang, bytes]) => ({ lang, pct: Math.round((bytes / totalBytes) * 100) }))
    .slice(0, 5);

  return (
    <div style={{ background: "#0d1117", border: "1px solid #1e293b", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #0f172a" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.01em" }}>{ctx.owner}/{ctx.name}</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{ctx.description || "No description"}</div>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {ctx.topics.slice(0, 3).map(t => <span key={t} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: "#1e293b", color: "#64748b", fontWeight: 600 }}>{t}</span>)}
        </div>
      </div>

      {/* Language bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: "hidden", display: "flex", marginBottom: 6 }}>
          {langPcts.map(({ lang, pct }, i) => {
            const colors = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];
            return <div key={lang} style={{ width: `${pct}%`, background: colors[i], transition: "width .5s" }} />;
          })}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {langPcts.map(({ lang, pct }, i) => {
            const colors = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];
            return (
              <span key={lang} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#64748b" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors[i], flexShrink: 0 }} />
                {lang} {pct}%
              </span>
            );
          })}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        {[
          ["Files", ctx.totalFiles, "#94a3b8"],
          ["Contributors", ctx.contributors.length, "#60a5fa"],
          ["Issues", ctx.openIssues, "#f87171"],
          ["Last commit", ctx.daysSinceLastCommit !== null ? `${ctx.daysSinceLastCommit}d` : "—", ctx.daysSinceLastCommit < 30 ? "#4ade80" : "#f59e0b"],
        ].map(([l, v, c]) => (
          <div key={l} style={{ background: "#0a0f1a", borderRadius: 6, padding: "7px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{v}</div>
            <div style={{ fontSize: 9, color: "#334155", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Feature flags */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {[
          ["🐳 Docker", ctx.hasDocker],
          ["☸ K8s", ctx.hasK8s],
          ["🧪 Tests", ctx.hasTests],
          ["⚙ CI/CD", ctx.hasCI],
          ["🔧 Makefile", ctx.hasMakefile],
          ["📚 Docs", ctx.docFiles.length > 0],
          ["🔐 Env vars", ctx.envVars.length > 0],
        ].map(([l, ok]) => (
          <span key={l} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 8, background: ok ? "#052e16" : "#0f172a", color: ok ? "#4ade80" : "#1e293b", border: `1px solid ${ok ? "#166534" : "#0f172a"}`, fontWeight: 600 }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function GenerationProgress({ generating, currentSection, completedSections, totalSections }) {
  if (!generating) return null;
  const pct = Math.round((completedSections / totalSections) * 100);
  return (
    <div style={{ background: "#0d1117", border: "1px solid #1e293b", borderRadius: 10, padding: "16px 18px", marginBottom: 20, animation: "fadein .3s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>
          {currentSection ? `Writing: ${currentSection}` : "Generating…"}
        </div>
        <div style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: "#3b82f6", fontWeight: 700 }}>{pct}%</div>
      </div>
      <div style={{ height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#3b82f6,#8b5cf6)", borderRadius: 2, transition: "width .4s ease" }} />
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function OnboardingGen() {
  const [url, setUrl] = useState("");
  const [ctx, setCtx] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [scanError, setScanError] = useState("");

  const [selectedSections, setSelectedSections] = useState(
    ["overview", "architecture", "setup", "flows", "gotchas"]
  );
  const [role, setRole] = useState("full-stack engineer");
  const [customInstructions, setCustomInstructions] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [currentSection, setCurrentSection] = useState("");
  const [completedCount, setCompletedCount] = useState(0);
  const [output, setOutput] = useState(null);
  const [genError, setGenError] = useState("");

  const [view, setView] = useState("preview");
  const [copied, setCopied] = useState(false);

  const SCAN_MSGS = [
    "Reading file tree…",
    "Identifying entry points…",
    "Scanning config files…",
    "Reading key source files…",
    "Analysing dependencies…",
    "Detecting infrastructure…",
  ];

  const loadRepo = async () => {
    const parsed = parseUrl(url.trim());
    if (!parsed) { setScanError("Enter a valid GitHub repo URL."); return; }
    setScanError(""); setCtx(null); setOutput(null); setScanning(true);
    let mi = 0; setScanMsg(SCAN_MSGS[0]);
    const iv = setInterval(() => { mi = Math.min(mi + 1, SCAN_MSGS.length - 1); setScanMsg(SCAN_MSGS[mi]); }, 900);
    try {
      const c = await deepScanRepo(parsed.owner, parsed.repo);
      setCtx(c);
    } catch (e) { setScanError(e.message || "Failed to scan repo."); }
    finally { clearInterval(iv); setScanning(false); }
  };

  const toggleSection = (id) => {
    setSelectedSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const generate = async () => {
    if (!ctx || selectedSections.length === 0) return;
    setGenerating(true); setGenError(""); setOutput(null);
    setCompletedCount(0);

    // Generate all selected sections in one call (batched for quality)
    // But update progress visually per section label
    const sectionLabels = selectedSections.map(id => DOC_SECTIONS[id].label);
    let labelIdx = 0;
    setCurrentSection(sectionLabels[0]);
    const iv = setInterval(() => {
      labelIdx = Math.min(labelIdx + 1, sectionLabels.length - 1);
      setCurrentSection(sectionLabels[labelIdx]);
      setCompletedCount(c => Math.min(c + 1, selectedSections.length - 1));
    }, 3500);

    try {
      const md = await generateSection(ctx, selectedSections, role, customInstructions);
      setOutput(md);
      setCompletedCount(selectedSections.length);
    } catch (e) { setGenError(e.message || "Generation failed."); }
    finally { clearInterval(iv); setGenerating(false); setCurrentSection(""); }
  };

  const filename = ctx ? `ONBOARDING-${ctx.owner}-${ctx.name}.md` : "ONBOARDING.md";

  const ROLES = [
    "full-stack engineer", "backend engineer", "frontend engineer",
    "DevOps / SRE", "junior developer", "senior engineer",
    "engineering manager", "contractor / consultant",
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0", fontFamily: "'DM Sans','Segoe UI',sans-serif", paddingBottom: 80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *{box-sizing:border-box}
        @keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        input::placeholder,textarea::placeholder{color:#1e293b}
        select{appearance:none}
        ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #0f172a", padding: "15px 26px", display: "flex", alignItems: "center", gap: 12, background: "#0d1117" }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#0f766e,#1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🤝</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em" }}>Onboarding Doc Generator</div>
          <div style={{ fontSize: 11, color: "#334155" }}>New developer guide from real codebase analysis</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          {ctx && <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 8, background: "#052e16", color: "#4ade80", border: "1px solid #16653488", fontWeight: 600 }}>✓ {ctx.owner}/{ctx.name} scanned</span>}
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "26px 18px" }}>

        {/* URL input */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "#334155", marginBottom: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>GitHub Repository</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={url} onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !scanning && loadRepo()}
              placeholder="https://github.com/username/repository"
              style={{ flex: 1, padding: "11px 14px", borderRadius: 8, background: "#0d1117", border: "1px solid #1e293b", color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none", transition: "border-color .2s" }}
              onFocus={e => e.target.style.borderColor = "#0f766e"}
              onBlur={e => e.target.style.borderColor = "#1e293b"} />
            <button onClick={loadRepo} disabled={scanning || !url.trim()}
              style={{ padding: "11px 20px", borderRadius: 8, border: "none", background: scanning || !url.trim() ? "#0f172a" : "#0f766e", color: scanning || !url.trim() ? "#1e293b" : "#fff", fontSize: 13, fontWeight: 700, cursor: scanning ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              {scanning ? scanMsg : "Deep Scan →"}
            </button>
          </div>
          {scanError && <div style={{ marginTop: 6, color: "#ef4444", fontSize: 12 }}>⚠ {scanError}</div>}
          {!ctx && !scanning && (
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#1e293b" }}>Try:</span>
              {["tiangolo/fastapi", "vercel/next.js", "facebook/react"].map(eg => (
                <button key={eg} onClick={() => setUrl(`https://github.com/${eg}`)} style={{ padding: "3px 9px", borderRadius: 5, border: "1px solid #1e293b", background: "transparent", color: "#334155", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{eg}</button>
              ))}
            </div>
          )}
        </div>

        {/* Main content after scan */}
        {ctx && (
          <div style={{ animation: "fadein .35s ease" }}>
            <RepoInsightCard ctx={ctx} />

            <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, alignItems: "start" }}>

              {/* Left: config panel */}
              <div>
                {/* Section selector */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Sections to Generate
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 16 }}>
                  {Object.values(DOC_SECTIONS).map(s => (
                    <SectionToggle key={s.id} section={s} selected={selectedSections}
                      onToggle={toggleSection} generated={!!output} />
                  ))}
                </div>

                <div style={{ display: "flex", gap: 5, marginBottom: 16 }}>
                  <button onClick={() => setSelectedSections(Object.keys(DOC_SECTIONS))}
                    style={{ flex: 1, padding: "6px", borderRadius: 6, border: "1px solid #1e293b", background: "transparent", color: "#475569", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>All</button>
                  <button onClick={() => setSelectedSections(["overview", "architecture", "setup", "flows", "gotchas"])}
                    style={{ flex: 1, padding: "6px", borderRadius: 6, border: "1px solid #1e293b", background: "transparent", color: "#475569", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Essential</button>
                  <button onClick={() => setSelectedSections([])}
                    style={{ flex: 1, padding: "6px", borderRadius: 6, border: "1px solid #1e293b", background: "transparent", color: "#334155", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>None</button>
                </div>

                {/* Role selector */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>New Developer Role</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {ROLES.map(r => (
                      <button key={r} onClick={() => setRole(r)}
                        style={{ padding: "4px 9px", borderRadius: 6, border: `1px solid ${role === r ? "#0f766e" : "#1e293b"}`, background: role === r ? "#0f766e20" : "transparent", color: role === r ? "#34d399" : "#475569", fontSize: 11, fontWeight: role === r ? 700 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom instructions */}
                <div style={{ border: `1px solid ${showCustom || customInstructions ? "#334155" : "#1e293b"}`, borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
                  <div onClick={() => setShowCustom(s => !s)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer", background: "#0d1117" }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: customInstructions?.trim() ? "#0f766e" : "#334155", transition: "background .2s" }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: customInstructions?.trim() ? "#34d399" : "#475569", flex: 1 }}>
                      Custom Instructions{customInstructions?.trim() && " · active"}
                    </span>
                    <span style={{ fontSize: 11, color: "#334155" }}>{showCustom ? "▲" : "▼"}</span>
                  </div>
                  {showCustom && (
                    <div style={{ padding: "10px 12px", borderTop: "1px solid #1e293b", background: "#020817" }}>
                      <textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)}
                        rows={5} placeholder={`Examples:
• "This is a microservices project — explain service boundaries clearly"
• "We use Domain-Driven Design — use DDD terminology"
• "New hires are junior devs fresh out of bootcamp"
• "Include a Day 1 checklist at the top"
• "Our staging env is at staging.myapp.com"
• "We use Linear for issue tracking, not GitHub Issues"
• "The most confusing part is the event sourcing in /events — spend extra time there"`}
                        style={{ width: "100%", padding: "9px 11px", borderRadius: 6, background: "#0d1117", border: `1px solid ${customInstructions?.trim() ? "#0f766e40" : "#1e293b"}`, color: "#e2e8f0", fontSize: 11, fontFamily: "inherit", lineHeight: 1.65, resize: "vertical", outline: "none" }}
                        onFocus={e => e.target.style.borderColor = "#0f766e"}
                        onBlur={e => e.target.style.borderColor = customInstructions?.trim() ? "#0f766e40" : "#1e293b"} />
                    </div>
                  )}
                </div>

                {/* Generate button */}
                <button onClick={generate} disabled={generating || selectedSections.length === 0}
                  style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: generating || selectedSections.length === 0 ? "#0f172a" : "linear-gradient(135deg,#0f766e,#1d4ed8)", color: generating || selectedSections.length === 0 ? "#1e293b" : "#fff", fontSize: 14, fontWeight: 800, cursor: generating ? "not-allowed" : "pointer", fontFamily: "inherit", letterSpacing: "-0.01em", transition: "all .2s" }}>
                  {generating ? "Generating…" : `Generate ${selectedSections.length} Sections 🤝`}
                </button>
                {genError && <div style={{ marginTop: 8, color: "#ef4444", fontSize: 11 }}>⚠ {genError}</div>}
              </div>

              {/* Right: output */}
              <div>
                <GenerationProgress generating={generating} currentSection={currentSection}
                  completedSections={completedCount} totalSections={selectedSections.length} />

                {output ? (
                  <div style={{ border: "1px solid #1e293b", borderRadius: 10, overflow: "hidden" }}>
                    {/* Toolbar */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "#0d1117", borderBottom: "1px solid #1e293b", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#4ade80" }}>✓ ONBOARDING.md</span>
                      <span style={{ fontSize: 11, color: "#334155", fontFamily: "'JetBrains Mono',monospace" }}>
                        {selectedSections.length} sections · {output.length} chars
                      </span>
                      <div style={{ flex: 1 }} />
                      <div style={{ display: "flex", background: "#020817", border: "1px solid #1e293b", borderRadius: 6, overflow: "hidden" }}>
                        {["preview", "raw"].map(v => (
                          <button key={v} onClick={() => setView(v)} style={{ padding: "4px 10px", border: "none", background: view === v ? "#1e293b" : "transparent", color: view === v ? "#e2e8f0" : "#334155", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            {v === "preview" ? "👁" : "⌨"}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => { navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #1e293b", background: copied ? "#052e16" : "#0d1117", color: copied ? "#4ade80" : "#475569", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        {copied ? "✓ Copied" : "⎘ Copy"}
                      </button>
                      <button onClick={() => downloadMd(output, filename)}
                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #1e293b", background: "#0d1117", color: "#475569", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        ⬇ ONBOARDING.md
                      </button>
                    </div>

                    {/* Content */}
                    <div style={{ maxHeight: 580, overflowY: "auto", background: "#020817" }}>
                      {view === "raw"
                        ? <pre style={{ margin: 0, padding: 18, fontSize: 12, lineHeight: 1.75, color: "#94a3b8", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "'JetBrains Mono',monospace" }}>{output}</pre>
                        : <div style={{ padding: "22px 26px" }} dangerouslySetInnerHTML={{ __html: renderMd(output) }} />
                      }
                    </div>

                    {/* Placement tips */}
                    <div style={{ padding: "12px 16px", borderTop: "1px solid #1e293b", background: "#0a0f1a" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 7 }}>Where to use this</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {[
                          "📁 /docs/ONBOARDING.md in the repo",
                          "📝 Notion / Confluence page",
                          "🔗 Linked from README",
                          "📬 Emailed to new hires before Day 1",
                          "🐙 GitHub Wiki",
                        ].map(tip => (
                          <span key={tip} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, background: "#1e293b", color: "#475569" }}>{tip}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : !generating && (
                  <div style={{ height: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1px dashed #1e293b", borderRadius: 10, color: "#1e293b", gap: 8 }}>
                    <span style={{ fontSize: 32 }}>🤝</span>
                    <span style={{ fontSize: 12, color: "#334155" }}>Select sections, set the role, then generate</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!ctx && !scanning && !scanError && (
          <div style={{ textAlign: "center", padding: "56px 0", color: "#1e293b" }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>🤝</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#334155", marginBottom: 6 }}>Generate a new developer onboarding guide</div>
            <div style={{ fontSize: 12, color: "#1e293b", maxWidth: 460, margin: "0 auto", lineHeight: 1.85 }}>
              Deep-scans the codebase — entry points, config files, dependencies, CI setup, env vars —
              then writes a complete guide so new hires are productive on Day 1 without pinging senior devs.
            </div>
            <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, maxWidth: 500, margin: "20px auto 0" }}>
              {Object.values(DOC_SECTIONS).map(s => (
                <div key={s.id} style={{ padding: "10px 8px", background: "#0d1117", border: "1px solid #1e293b", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ fontSize: 10, color: "#334155", fontWeight: 600 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
