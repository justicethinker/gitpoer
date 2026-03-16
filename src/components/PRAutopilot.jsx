import { useState, useCallback } from "react";

// ─── GitHub API ───────────────────────────────────────────────────────────────
const GH = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

function parseUrl(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/\s?#]+)/);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, "") } : null;
}
function parsePrUrl(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/\s?#]+)\/pull\/(\d+)/);
  return m ? { owner: m[1], repo: m[2], prNumber: m[3] } : null;
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

// ─── Data fetchers ────────────────────────────────────────────────────────────
async function fetchPRData(owner, repo, prNumber) {
  const [pr, commits, files] = await Promise.all([
    ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`),
    ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=30`),
    ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=50`),
  ]);
  if (!pr) throw new Error("PR not found. Make sure it's a public repo.");
  return { pr, commits: commits || [], files: files || [] };
}

async function fetchBranchDiff(owner, repo, base, head) {
  const [compare, baseInfo] = await Promise.all([
    ghFetch(`/repos/${owner}/${repo}/compare/${base}...${head}`),
    ghFetch(`/repos/${owner}/${repo}`),
  ]);
  if (!compare) throw new Error("Could not compare these branches.");
  return {
    commits: compare.commits || [],
    files: compare.files || [],
    stats: { ahead: compare.ahead_by, behind: compare.behind_by },
    defaultBranch: baseInfo?.default_branch || "main",
  };
}

async function loadRepoBranches(owner, repo) {
  const [branches, prs] = await Promise.all([
    ghFetch(`/repos/${owner}/${repo}/branches?per_page=30`),
    ghFetch(`/repos/${owner}/${repo}/pulls?state=open&per_page=20`),
  ]);
  return {
    branches: (branches || []).map(b => b.name),
    openPRs: (prs || []).map(p => ({ number: p.number, title: p.title, head: p.head?.ref, base: p.base?.ref })),
  };
}

// ─── Diff analysis ────────────────────────────────────────────────────────────
function analyseDiff(commits, files) {
  const commitMsgs = commits.map(c => c.commit?.message?.split("\n")[0] || "");
  const authors = [...new Set(commits.map(c => c.commit?.author?.name).filter(Boolean))];

  // Classify files by change type
  const added = files.filter(f => f.status === "added").map(f => f.filename);
  const modified = files.filter(f => f.status === "modified").map(f => f.filename);
  const deleted = files.filter(f => f.status === "removed").map(f => f.filename);
  const renamed = files.filter(f => f.status === "renamed").map(f => `${f.previous_filename} → ${f.filename}`);

  // Detect change categories from file paths
  const isTest = f => /test|spec|__tests__/i.test(f);
  const isDocs = f => /docs?\/|readme|changelog|\.md$/i.test(f);
  const isConfig = f => /config|\.env|\.yml|\.yaml|\.json|\.toml|makefile/i.test(f.split("/").pop());
  const isStyle = f => /\.css|\.scss|\.sass|\.less|styled/i.test(f);
  const isMigration = f => /migrat|schema|\.sql/i.test(f);
  const isCI = f => /\.github\/|travis|circle|jenkinsfile/i.test(f);

  const allFilePaths = files.map(f => f.filename);
  const categories = {
    hasTests: allFilePaths.some(isTest),
    hasDocs: allFilePaths.some(isDocs),
    hasConfig: allFilePaths.some(isConfig),
    hasStyles: allFilePaths.some(isStyle),
    hasMigrations: allFilePaths.some(isMigration),
    hasCI: allFilePaths.some(isCI),
  };

  // Conventional commit type detection
  const typePattern = /^(feat|fix|chore|docs|refactor|test|perf|style|build|ci|break)(\(.+?\))?!?:/i;
  const types = commitMsgs.map(m => {
    const match = m.match(typePattern);
    return match ? match[1].toLowerCase() : null;
  }).filter(Boolean);
  const primaryType = types.length > 0
    ? Object.entries(types.reduce((acc, t) => ({ ...acc, [t]: (acc[t] || 0) + 1 }), {}))
        .sort(([,a],[,b]) => b - a)[0]?.[0]
    : null;

  const stats = {
    additions: files.reduce((s, f) => s + (f.additions || 0), 0),
    deletions: files.reduce((s, f) => s + (f.deletions || 0), 0),
    filesChanged: files.length,
    commits: commits.length,
  };

  // Detect breaking changes
  const isBreaking = commitMsgs.some(m => m.includes("!:") || m.toLowerCase().includes("breaking")) ||
    (deleted.length > 0 && deleted.some(f => f.includes("api") || f.includes("interface")));

  // Detect if it's likely a UI change
  const isUIChange = allFilePaths.some(f => isStyle(f) || /component|view|page|layout|template/i.test(f));

  return {
    commitMsgs, authors, added, modified, deleted, renamed,
    categories, primaryType, stats, isBreaking, isUIChange,
    topChangedFiles: [...files]
      .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions))
      .slice(0, 8)
      .map(f => ({ filename: f.filename, additions: f.additions, deletions: f.deletions, status: f.status })),
  };
}

// ─── PR templates ─────────────────────────────────────────────────────────────
const TEMPLATES = {
  standard: {
    id: "standard", label: "Standard PR", icon: "📋",
    description: "What changed, why, how to test",
    color: "#3b82f6",
  },
  feature: {
    id: "feature", label: "Feature PR", icon: "✨",
    description: "New feature with context, demo notes, edge cases",
    color: "#8b5cf6",
  },
  bugfix: {
    id: "bugfix", label: "Bug Fix", icon: "🐛",
    description: "Root cause, fix approach, regression coverage",
    color: "#ef4444",
  },
  refactor: {
    id: "refactor", label: "Refactor / Cleanup", icon: "♻️",
    description: "What was changed, why, what stays the same",
    color: "#f59e0b",
  },
  breaking: {
    id: "breaking", label: "Breaking Change", icon: "⚠️",
    description: "What breaks, migration guide, version bump",
    color: "#dc2626",
  },
  release: {
    id: "release", label: "Release PR", icon: "🚀",
    description: "Full release notes, checklist, deployment steps",
    color: "#10b981",
  },
};

// ─── Prompt builder ───────────────────────────────────────────────────────────
function buildPRPrompt(analysis, prMeta, templateId, teamContext, customInstructions) {
  const { commitMsgs, authors, added, modified, deleted, categories, primaryType, stats, isBreaking, isUIChange, topChangedFiles } = analysis;

  const diffSummary = `
DIFF STATS: ${stats.commits} commits · ${stats.filesChanged} files · +${stats.additions}/-${stats.deletions} lines
AUTHORS: ${authors.join(", ")}
PRIMARY CHANGE TYPE: ${primaryType || "mixed"}
BREAKING CHANGE DETECTED: ${isBreaking}
UI CHANGES: ${isUIChange}

COMMIT MESSAGES:
${commitMsgs.slice(0, 15).join("\n")}

TOP CHANGED FILES:
${topChangedFiles.map(f => `${f.status.toUpperCase().padEnd(8)} ${f.filename} (+${f.additions}/-${f.deletions})`).join("\n")}

FILES ADDED (${added.length}): ${added.slice(0, 10).join(", ") || "none"}
FILES MODIFIED (${modified.length}): ${modified.slice(0, 10).join(", ") || "none"}  
FILES DELETED (${deleted.length}): ${deleted.slice(0, 8).join(", ") || "none"}

CHANGE CATEGORIES:
${Object.entries(categories).filter(([,v]) => v).map(([k]) => k).join(", ") || "general code changes"}`;

  const prContext = prMeta ? `
PR NUMBER: #${prMeta.number}
PR TITLE (current): "${prMeta.title}"
BASE BRANCH: ${prMeta.base}
HEAD BRANCH: ${prMeta.head}` : "";

  const teamBlock = teamContext?.trim()
    ? `\nTEAM CONTEXT:\n${teamContext.trim()}\n` : "";

  const customBlock = customInstructions?.trim()
    ? `\nCUSTOM INSTRUCTIONS (binding — apply throughout):\n━━━━━━━━━━━━━━━━━━━━\n${customInstructions.trim()}\n━━━━━━━━━━━━━━━━━━━━\n` : "";

  const templateInstructions = {
    standard: `Write a clear, complete PR description. Include:
## Summary
2-3 sentences: what changed and why (not HOW — explain intent)

## Changes Made  
Specific bullet list — group related changes, don't list every file

## Type of Change
Checkboxes: [ ] Bug fix [ ] New feature [ ] Breaking change [ ] Refactor [ ] Docs [ ] CI/CD

## How to Test
Step-by-step — how does a reviewer verify this works? Name actual commands or routes if inferable.

## Notes for Reviewer
Any specific areas to scrutinize, context they need, or decisions made

${isUIChange ? "## Screenshots\n_Add before/after screenshots for UI changes_\n" : ""}
${isBreaking ? "## ⚠️ Breaking Changes\nExplicit migration steps\n" : ""}`,

    feature: `Write a feature PR description. Include:
## What This Adds
Clear description of the new capability — write it as a user story or outcome

## Why
The problem it solves or value it creates

## How It Works
Brief technical explanation — where the main logic lives, key design decision made

## Checklist
- [ ] Tests added/updated
- [ ] Docs updated  
- [ ] Feature flag needed?
- [ ] Analytics events added?
- [ ] Mobile/responsive checked?

## How to Review
How to exercise the feature. Include test data, feature flags, or routes needed.

${isUIChange ? "## Demo\n_Add a GIF or screenshots_\n" : ""}

## Edge Cases Handled
List 2-3 edge cases you specifically thought about`,

    bugfix: `Write a bug fix PR description. Include:
## Bug Description
What was happening, when it happened, who was affected

## Root Cause
What was actually wrong — be technically specific

## Fix
What you changed and why this approach (vs alternatives)

## Regression Testing
How to confirm the bug is fixed. Include reproduction steps for the original bug.

## Related Issues
Closes #[issue number if inferable]

## Risk Assessment
Could this fix break anything else? What did you check?`,

    refactor: `Write a refactor/cleanup PR description. Include:
## What Changed
Structural changes made — be specific about what moved where

## Why This Refactor
The problem with the old structure, the benefit of the new one

## What Stays the Same
Explicitly confirm: same behaviour, same API, same outputs — reviewers need this reassurance

## Testing Approach
How you verified nothing broke

## Before/After
If there's a clear structural improvement, illustrate it briefly

## Notes
Any files to look at especially carefully`,

    breaking: `Write a breaking change PR description. Make it comprehensive. Include:
## ⚠️ BREAKING CHANGE
State exactly what breaks — be explicit, no softening

## What Changed
The technical change made

## Why This Was Necessary
Justification — breaking changes need strong rationale

## Migration Guide
Step-by-step instructions for users/developers to update their code.
Include before/after code examples.

## Version Impact
Semver: this is a MAJOR version bump. Note the new version.

## Deprecation Timeline
If this was previously deprecated, note when

## Checklist
- [ ] CHANGELOG updated
- [ ] Version bumped
- [ ] Migration guide written
- [ ] Downstream services notified
- [ ] Docs updated`,

    release: `Write a release PR description. Include:
## Release Summary
What this release delivers in 2-3 sentences

## What's New
Features added since last release

## Bug Fixes
Issues resolved

## Breaking Changes
Any breaking changes (if none, say so explicitly)

## Upgrade Steps
Any manual steps required for deployment/upgrade

## Deployment Checklist
- [ ] DB migrations run
- [ ] Env vars updated
- [ ] Feature flags toggled
- [ ] Cache cleared if needed
- [ ] Docs/changelog published

## Rollback Plan
How to revert if something goes wrong`,
  };

  return `You are an expert software engineer writing a GitHub Pull Request description.
Your goal: write a PR description so complete and clear that reviewers can understand the change without asking questions.
${teamBlock}${customBlock}
${diffSummary}
${prContext}

${templateInstructions[templateId]}

RULES:
- Infer intent from commit messages + file names — don't just list files
- Be specific: name actual files, functions, or endpoints where inferable
- Fill in all sections — no empty sections or placeholder text
- If something is not determinable from the diff, say "See commit history" or omit gracefully
- Return ONLY the raw markdown. No preamble.`;
}

async function generatePRDesc(analysis, prMeta, templateId, teamContext, customInstructions) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: "You are a senior software engineer writing GitHub PR descriptions. Be specific, practical, and clear. Fill all sections with real content. Return ONLY raw markdown.",
      messages: [{ role: "user", content: buildPRPrompt(analysis, prMeta, templateId, teamContext, customInstructions) }],
    }),
  });
  const data = await res.json();
  return data.content?.find(b => b.type === "text")?.text || "";
}

async function suggestTitle(analysis, prMeta) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: "You suggest concise, conventional-commit-style PR titles. Return ONLY a JSON array of 3 strings, no explanation.",
      messages: [{
        role: "user",
        content: `Suggest 3 PR title options for this change.
Current title: "${prMeta?.title || "none"}"
Primary type: ${analysis.primaryType || "mixed"}
Commits: ${analysis.commitMsgs.slice(0, 8).join(" | ")}
Top files: ${analysis.topChangedFiles.slice(0, 5).map(f => f.filename).join(", ")}
Breaking: ${analysis.isBreaking}

Return JSON array only: ["title 1", "title 2", "title 3"]
Use conventional commit format: type(scope): description`
      }],
    }),
  });
  const data = await res.json();
  const text = data.content?.find(b => b.type === "text")?.text || "[]";
  try { return JSON.parse(text.replace(/```json|```/g, "").trim()); }
  catch { return []; }
}

// ─── Markdown renderer ────────────────────────────────────────────────────────
function renderMd(md) {
  if (!md) return "";
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^#{4} (.+)$/gm, "<h4 style='color:#94a3b8;font-size:.93em;margin:.5em 0 .2em'>$1</h4>")
    .replace(/^#{3} (.+)$/gm, "<h3 style='color:#cbd5e1;font-size:1.02em;margin:.65em 0 .25em'>$1</h3>")
    .replace(/^#{2} (.+)$/gm, "<h2 style='color:#e2e8f0;font-size:1.18em;border-bottom:1px solid #1e293b;padding-bottom:.2em;margin:.8em 0 .3em'>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 style='color:#f1f5f9;font-size:1.35em;border-bottom:1px solid #1e293b;padding-bottom:.3em;margin:.8em 0 .3em'>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong style='color:#e2e8f0'>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em style='color:#94a3b8'>$1</em>")
    .replace(/`([^`\n]+)`/g, "<code style='background:#1e293b;padding:1px 5px;border-radius:4px;font-size:.82em;color:#fb923c;font-family:monospace'>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:#60a5fa;text-decoration:none">$1</a>')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre style="background:#0d1117;padding:12px 14px;border-radius:7px;overflow-x:auto;margin:.5em 0;border:1px solid #1e293b"><code style="color:#e2e8f0;font-size:.85em;font-family:'JetBrains Mono',monospace">${c.trim()}</code></pre>`)
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #1e293b;margin:.7em 0">')
    .replace(/^\s*- \[([ x])\] (.+)$/gm, (_, c, t) => `<div style="display:flex;gap:8px;align-items:flex-start;padding:3px 0"><span style="width:15px;height:15px;border:1.5px solid ${c==="x"?"#3b82f6":"#334155"};border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0;margin-top:2px;background:${c==="x"?"#3b82f620":"transparent"};color:#3b82f6">${c==="x"?"✓":""}</span><span style="color:#94a3b8;font-size:13px;line-height:1.5">${t}</span></div>`)
    .replace(/^\s*[-*] (.+)$/gm, "<li style='color:#94a3b8;margin:.2em 0;font-size:13px;line-height:1.6'>$1</li>")
    .replace(/(<li[\s\S]*?<\/li>\n?)+/g, m => `<ul style="padding-left:16px;margin:.35em 0">${m}</ul>`)
    .replace(/\n\n+/g, "</p><p style='color:#94a3b8;margin:.4em 0;font-size:13px;line-height:1.75'>")
    .replace(/^(?!<[hpuolridbs]|<hr|<pre|<div)(.+)$/gm, m => m.trim() ? `<p style="color:#94a3b8;margin:.35em 0;font-size:13px;line-height:1.75">${m}</p>` : "");
}

function downloadMd(content, filename) {
  Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([content], { type: "text/markdown" })),
    download: filename,
  }).click();
}

// ─── UI components ────────────────────────────────────────────────────────────

function TemplateCard({ tmpl, selected, onClick }) {
  const on = selected === tmpl.id;
  return (
    <div onClick={onClick} style={{
      padding: "9px 11px", borderRadius: 8, cursor: "pointer",
      border: `1.5px solid ${on ? tmpl.color : "#1e293b"}`,
      background: on ? tmpl.color + "0f" : "transparent",
      transition: "all .17s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 17 }}>{tmpl.icon}</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: on ? tmpl.color : "#64748b" }}>{tmpl.label}</div>
          <div style={{ fontSize: 10, color: "#334155", marginTop: 1, lineHeight: 1.3 }}>{tmpl.description}</div>
        </div>
      </div>
    </div>
  );
}

function DiffStatBadge({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 12px", background: "#0d1117", border: "1px solid #1e293b", borderRadius: 7 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: "#334155", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
    </div>
  );
}

function FileList({ files, label }) {
  const [expanded, setExpanded] = useState(false);
  const show = expanded ? files : files.slice(0, 5);
  const statusColor = { added: "#4ade80", modified: "#60a5fa", removed: "#f87171", renamed: "#f59e0b" };
  const statusLabel = { added: "A", modified: "M", removed: "D", renamed: "R" };
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{label} ({files.length})</div>
      {show.map((f, i) => (
        <div key={i} style={{ display: "flex", gap: 7, alignItems: "center", padding: "3px 0", borderBottom: "1px solid #0a0f1a" }}>
          <span style={{ fontSize: 9, fontWeight: 800, width: 14, textAlign: "center", color: statusColor[f.status] || "#64748b", fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{statusLabel[f.status] || "?"}</span>
          <span style={{ fontSize: 11, color: "#475569", fontFamily: "'JetBrains Mono',monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.filename}</span>
          <span style={{ fontSize: 10, color: "#334155", fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>+{f.additions}/-{f.deletions}</span>
        </div>
      ))}
      {files.length > 5 && (
        <button onClick={() => setExpanded(e => !e)} style={{ marginTop: 4, fontSize: 10, color: "#334155", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "2px 0" }}>
          {expanded ? "Show less ▲" : `+${files.length - 5} more ▼`}
        </button>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function PRAutopilot() {
  // Input mode: "pr" (by PR URL/number) or "branch" (manual branch compare)
  const [inputMode, setInputMode] = useState("pr");
  const [prUrl, setPrUrl] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [headBranch, setHeadBranch] = useState("");
  const [repoBranches, setRepoBranches] = useState([]);
  const [openPRs, setOpenPRs] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [loadError, setLoadError] = useState("");

  const [diffData, setDiffData] = useState(null);   // { analysis, prMeta, repoMeta }
  const [template, setTemplate] = useState("standard");
  const [teamContext, setTeamContext] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [showContext, setShowContext] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState(null);
  const [titleSuggestions, setTitleSuggestions] = useState([]);
  const [genError, setGenError] = useState("");
  const [view, setView] = useState("preview");
  const [copied, setCopied] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState(null);

  const LOAD_MSGS = ["Fetching PR data…", "Reading commits…", "Analysing changed files…", "Detecting change categories…"];

  const loadRepo = async () => {
    const parsed = parseUrl(repoUrl.trim());
    if (!parsed) { setLoadError("Enter a valid GitHub repo URL."); return; }
    setLoadError(""); setLoading(true); setLoadMsg("Loading branches…");
    try {
      const { branches, openPRs: prs } = await loadRepoBranches(parsed.owner, parsed.repo);
      setRepoBranches(branches);
      setOpenPRs(prs);
      if (branches.includes("main")) setBaseBranch("main");
      else if (branches.includes("master")) setBaseBranch("master");
      else if (branches[0]) setBaseBranch(branches[0]);
    } catch (e) { setLoadError(e.message || "Failed to load repo."); }
    finally { setLoading(false); }
  };

  const fetchDiff = async () => {
    setLoadError(""); setDiffData(null); setOutput(null); setTitleSuggestions([]);
    setLoading(true);
    let mi = 0; setLoadMsg(LOAD_MSGS[0]);
    const iv = setInterval(() => { mi = Math.min(mi + 1, LOAD_MSGS.length - 1); setLoadMsg(LOAD_MSGS[mi]); }, 1200);

    try {
      if (inputMode === "pr") {
        const parsed = parsePrUrl(prUrl.trim()) || (() => {
          // Try as just a PR number on an already-loaded repo
          const num = prUrl.trim().match(/^\d+$/)?.[0];
          const repo = parseUrl(repoUrl.trim());
          return num && repo ? { ...repo, prNumber: num } : null;
        })();
        if (!parsed) throw new Error("Enter a full GitHub PR URL (e.g. github.com/owner/repo/pull/123)");
        const { pr, commits, files } = await fetchPRData(parsed.owner, parsed.repo, parsed.prNumber);
        const analysis = analyseDiff(commits, files);
        const prMeta = { number: pr.number, title: pr.title, base: pr.base?.ref, head: pr.head?.ref, body: pr.body };
        setDiffData({ analysis, prMeta, files, owner: parsed.owner, repo: parsed.repo });
        // Auto-detect best template
        if (analysis.isBreaking) setTemplate("breaking");
        else if (analysis.primaryType === "fix") setTemplate("bugfix");
        else if (analysis.primaryType === "feat") setTemplate("feature");
        else if (analysis.primaryType === "refactor" || analysis.primaryType === "chore") setTemplate("refactor");
      } else {
        const parsed = parseUrl(repoUrl.trim());
        if (!parsed) throw new Error("Enter a valid GitHub repo URL first.");
        if (!headBranch) throw new Error("Select a head branch to compare.");
        const { commits, files, stats } = await fetchBranchDiff(parsed.owner, parsed.repo, baseBranch, headBranch);
        if (commits.length === 0 && files.length === 0) throw new Error("No differences found between these branches.");
        const analysis = analyseDiff(commits, files);
        if (analysis.isBreaking) setTemplate("breaking");
        else if (analysis.primaryType === "fix") setTemplate("bugfix");
        else if (analysis.primaryType === "feat") setTemplate("feature");
        else if (analysis.primaryType === "refactor") setTemplate("refactor");
        setDiffData({ analysis, prMeta: { base: baseBranch, head: headBranch }, files, owner: parsed.owner, repo: parsed.repo, stats });
      }
    } catch (e) { setLoadError(e.message || "Failed to load diff."); }
    finally { clearInterval(iv); setLoading(false); }
  };

  const generate = async () => {
    if (!diffData) return;
    setGenerating(true); setGenError(""); setOutput(null); setTitleSuggestions([]);
    try {
      const [desc, titles] = await Promise.all([
        generatePRDesc(diffData.analysis, diffData.prMeta, template, teamContext, customInstructions),
        suggestTitle(diffData.analysis, diffData.prMeta),
      ]);
      setOutput(desc);
      setTitleSuggestions(titles);
      setSelectedTitle(null);
    } catch (e) { setGenError(e.message || "Generation failed."); }
    finally { setGenerating(false); }
  };

  const activeTemplate = TEMPLATES[template];
  const analysis = diffData?.analysis;

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0", fontFamily: "'DM Sans','Segoe UI',sans-serif", paddingBottom: 80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *{box-sizing:border-box}
        @keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        @keyframes slidein{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        input::placeholder,textarea::placeholder{color:#1e293b}
        select{appearance:none;cursor:pointer}
        select option{background:#0d1117}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #0f172a", padding: "15px 26px", display: "flex", alignItems: "center", gap: 12, background: "#0d1117" }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#7c3aed,#2563eb)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🔀</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em" }}>PR Autopilot</div>
          <div style={{ fontSize: 11, color: "#334155" }}>Instant PR descriptions from real diffs</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {diffData && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, background: "#1e1040", color: "#a78bfa", border: "1px solid #7c3aed40", fontWeight: 600 }}>
            {diffData.analysis.stats.commits} commits · {diffData.analysis.stats.filesChanged} files
          </span>}
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, alignItems: "start" }}>

          {/* ── Left panel ── */}
          <div>
            {/* Input mode toggle */}
            <div style={{ display: "flex", background: "#0d1117", border: "1px solid #1e293b", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
              {[["pr", "🔗 PR URL"], ["branch", "🌿 Branch compare"]].map(([mode, label]) => (
                <button key={mode} onClick={() => { setInputMode(mode); setLoadError(""); setDiffData(null); setOutput(null); }}
                  style={{ flex: 1, padding: "8px", border: "none", background: inputMode === mode ? "#1e293b" : "transparent", color: inputMode === mode ? "#e2e8f0" : "#334155", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* PR URL mode */}
            {inputMode === "pr" && (
              <div style={{ marginBottom: 14, animation: "fadein .2s ease" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>GitHub PR URL</div>
                <input value={prUrl} onChange={e => setPrUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !loading && fetchDiff()}
                  placeholder="github.com/owner/repo/pull/123"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 7, background: "#0d1117", border: "1px solid #1e293b", color: "#e2e8f0", fontSize: 12.5, fontFamily: "inherit", outline: "none", transition: "border-color .2s", marginBottom: 8 }}
                  onFocus={e => e.target.style.borderColor = "#7c3aed"}
                  onBlur={e => e.target.style.borderColor = "#1e293b"} />
                <div style={{ fontSize: 10, color: "#1e293b", marginBottom: 8 }}>Paste any open or merged PR link</div>

                {/* Open PRs quick-pick if repo loaded */}
                {openPRs.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Quick pick open PRs</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 140, overflowY: "auto" }}>
                      {openPRs.map(pr => (
                        <button key={pr.number} onClick={() => setPrUrl(`https://github.com/${parseUrl(repoUrl)?.owner}/${parseUrl(repoUrl)?.repo}/pull/${pr.number}`)}
                          style={{ padding: "6px 9px", borderRadius: 6, border: "1px solid #1e293b", background: "transparent", color: "#475569", fontSize: 11, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all .15s" }}
                          onMouseEnter={e => { e.target.style.background = "#1e293b"; e.target.style.color = "#94a3b8"; }}
                          onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = "#475569"; }}>
                          <span style={{ color: "#334155", fontFamily: "'JetBrains Mono',monospace" }}>#{pr.number}</span>
                          {" "}<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.title.slice(0, 30)}{pr.title.length > 30 ? "…" : ""}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Branch compare mode */}
            {inputMode === "branch" && (
              <div style={{ marginBottom: 14, animation: "fadein .2s ease" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Repository</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <input value={repoUrl} onChange={e => setRepoUrl(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !loading && loadRepo()}
                    placeholder="github.com/owner/repo"
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 6, background: "#0d1117", border: "1px solid #1e293b", color: "#e2e8f0", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                    onFocus={e => e.target.style.borderColor = "#7c3aed"}
                    onBlur={e => e.target.style.borderColor = "#1e293b"} />
                  <button onClick={loadRepo} disabled={loading || !repoUrl.trim()}
                    style={{ padding: "8px 10px", borderRadius: 6, border: "none", background: "#1e293b", color: "#94a3b8", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                    Load
                  </button>
                </div>

                {repoBranches.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[["Base", baseBranch, setBaseBranch], ["Head", headBranch, setHeadBranch]].map(([label, val, set]) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
                        <select value={val} onChange={e => set(e.target.value)}
                          style={{ width: "100%", padding: "7px 10px", borderRadius: 6, background: "#0d1117", border: "1px solid #1e293b", color: val ? "#e2e8f0" : "#334155", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", outline: "none" }}>
                          {!val && <option value="">Select…</option>}
                          {repoBranches.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Repo URL for PR mode (for branch loading) */}
            {inputMode === "pr" && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Repo URL <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional, for open PRs list)</span></div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input value={repoUrl} onChange={e => setRepoUrl(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !loading && loadRepo()}
                    placeholder="github.com/owner/repo"
                    style={{ flex: 1, padding: "7px 10px", borderRadius: 6, background: "#0d1117", border: "1px solid #1e293b", color: "#e2e8f0", fontSize: 11.5, fontFamily: "inherit", outline: "none" }}
                    onFocus={e => e.target.style.borderColor = "#7c3aed"}
                    onBlur={e => e.target.style.borderColor = "#1e293b"} />
                  <button onClick={loadRepo} disabled={loading || !repoUrl.trim()}
                    style={{ padding: "7px 9px", borderRadius: 6, border: "none", background: "#1e293b", color: "#64748b", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Load</button>
                </div>
              </div>
            )}

            {/* Fetch button */}
            <button onClick={fetchDiff} disabled={loading || (inputMode === "pr" ? !prUrl.trim() : !headBranch)}
              style={{ width: "100%", padding: "10px", borderRadius: 7, border: "none", background: loading || (inputMode === "pr" ? !prUrl.trim() : !headBranch) ? "#0f172a" : "#4f46e5", color: loading ? "#334155" : "#fff", fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", marginBottom: 6, transition: "all .2s" }}>
              {loading ? loadMsg : "Analyse Diff →"}
            </button>
            {loadError && <div style={{ color: "#ef4444", fontSize: 11, marginBottom: 10 }}>⚠ {loadError}</div>}

            {/* Template picker */}
            {diffData && (
              <div style={{ animation: "fadein .3s ease" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", margin: "14px 0 7px" }}>
                  PR Template
                  {analysis?.isBreaking && <span style={{ marginLeft: 6, color: "#ef4444", fontSize: 9 }}>⚠ breaking detected</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
                  {Object.values(TEMPLATES).map(t => (
                    <TemplateCard key={t.id} tmpl={t} selected={template} onClick={() => setTemplate(t.id)} />
                  ))}
                </div>

                {/* Team context + custom instructions */}
                <div style={{ border: `1px solid ${showContext ? "#334155" : "#1e293b"}`, borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
                  <div onClick={() => setShowContext(s => !s)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer", background: "#0d1117" }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: (teamContext || customInstructions)?.trim() ? "#7c3aed" : "#334155", transition: "background .2s" }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: (teamContext || customInstructions)?.trim() ? "#a78bfa" : "#475569", flex: 1 }}>
                      Context & Instructions{(teamContext || customInstructions)?.trim() && " · active"}
                    </span>
                    <span style={{ fontSize: 11, color: "#334155" }}>{showContext ? "▲" : "▼"}</span>
                  </div>
                  {showContext && (
                    <div style={{ padding: "10px 12px", borderTop: "1px solid #1e293b", background: "#020817", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", marginBottom: 5 }}>Team Context (reusable across PRs)</div>
                        <textarea value={teamContext} onChange={e => setTeamContext(e.target.value)} rows={3}
                          placeholder={`Examples:
• "We use Linear for tickets — link format: LIN-123"
• "All PRs need a Jira ticket reference"
• "We do trunk-based development"
• "Screenshots required for all UI changes"`}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 6, background: "#0d1117", border: "1px solid #1e293b", color: "#e2e8f0", fontSize: 11, fontFamily: "inherit", lineHeight: 1.6, resize: "vertical", outline: "none" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", marginBottom: 5 }}>Custom Instructions (this PR)</div>
                        <textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)} rows={3}
                          placeholder={`Examples:
• "This fixes the auth bug reported by Stripe"
• "Closes #234 and #189"
• "DO NOT merge until the deploy freeze lifts"
• "Part 2 of 3 in the payment refactor"
• "Needs security review before merge"`}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 6, background: "#0d1117", border: "1px solid #1e293b", color: "#e2e8f0", fontSize: 11, fontFamily: "inherit", lineHeight: 1.6, resize: "vertical", outline: "none" }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Generate */}
                <button onClick={generate} disabled={generating}
                  style={{ width: "100%", padding: "11px", borderRadius: 7, border: "none", background: generating ? "#0f172a" : `linear-gradient(135deg,#7c3aed,#2563eb)`, color: generating ? "#334155" : "#fff", fontSize: 13, fontWeight: 800, cursor: generating ? "not-allowed" : "pointer", fontFamily: "inherit", letterSpacing: "-0.01em" }}>
                  {generating ? "Generating…" : `Write PR Description ${activeTemplate.icon}`}
                </button>
                {genError && <div style={{ marginTop: 6, color: "#ef4444", fontSize: 11 }}>⚠ {genError}</div>}
              </div>
            )}
          </div>

          {/* ── Right panel ── */}
          <div>
            {/* Diff summary */}
            {diffData && (
              <div style={{ background: "#0d1117", border: "1px solid #1e293b", borderRadius: 10, padding: "14px 16px", marginBottom: 16, animation: "fadein .3s ease" }}>
                {/* Stats row */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  <DiffStatBadge label="Commits" value={analysis.stats.commits} color="#e2e8f0" />
                  <DiffStatBadge label="Files" value={analysis.stats.filesChanged} color="#94a3b8" />
                  <DiffStatBadge label="Added" value={`+${analysis.stats.additions}`} color="#4ade80" />
                  <DiffStatBadge label="Deleted" value={`-${analysis.stats.deletions}`} color="#f87171" />
                  {diffData.prMeta?.number && <DiffStatBadge label="PR" value={`#${diffData.prMeta.number}`} color="#a78bfa" />}
                  {analysis.isBreaking && <DiffStatBadge label="Breaking" value="⚠" color="#ef4444" />}
                </div>

                {/* Authors + detected type */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {analysis.authors.map(a => (
                    <span key={a} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, background: "#1e293b", color: "#64748b" }}>👤 {a}</span>
                  ))}
                  {analysis.primaryType && (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, background: "#1e1040", color: "#a78bfa", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{analysis.primaryType}</span>
                  )}
                  {Object.entries(analysis.categories).filter(([,v]) => v).map(([k]) => (
                    <span key={k} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, background: "#0f172a", color: "#334155" }}>
                      {k === "hasTests" ? "🧪 tests" : k === "hasDocs" ? "📝 docs" : k === "hasCI" ? "⚙ CI" : k === "hasMigrations" ? "🗄 migration" : k === "hasStyles" ? "🎨 styles" : "📦 config"}
                    </span>
                  ))}
                </div>

                {/* File list */}
                <FileList files={diffData.files} label="Changed Files" />
              </div>
            )}

            {/* Title suggestions */}
            {titleSuggestions.length > 0 && (
              <div style={{ background: "#0d1117", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 14px", marginBottom: 14, animation: "fadein .3s ease" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>✨ Suggested PR Titles</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {titleSuggestions.map((t, i) => (
                    <div key={i} onClick={() => setSelectedTitle(selectedTitle === i ? null : i)}
                      style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", borderRadius: 7, border: `1px solid ${selectedTitle === i ? "#7c3aed" : "#1e293b"}`, background: selectedTitle === i ? "#1e104020" : "transparent", cursor: "pointer", transition: "all .15s" }}>
                      <span style={{ fontSize: 11, color: "#334155", fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{i + 1}.</span>
                      <span style={{ fontSize: 12, color: selectedTitle === i ? "#a78bfa" : "#64748b", fontFamily: "'JetBrains Mono',monospace", flex: 1 }}>{t}</span>
                      <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(t); }}
                        style={{ padding: "2px 7px", borderRadius: 4, border: "1px solid #1e293b", background: "transparent", color: "#334155", fontSize: 10, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                        Copy
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Output panel */}
            {output && (
              <div style={{ border: "1px solid #1e293b", borderRadius: 10, overflow: "hidden", animation: "fadein .35s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 13px", background: "#0d1117", borderBottom: "1px solid #1e293b", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa" }}>{activeTemplate.icon} {activeTemplate.label}</span>
                  <span style={{ fontSize: 11, color: "#334155", fontFamily: "'JetBrains Mono',monospace" }}>
                    {diffData.prMeta?.base} ← {diffData.prMeta?.head || "feature"}
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
                    style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #1e293b", background: copied ? "#1e1040" : "#0d1117", color: copied ? "#a78bfa" : "#475569", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    {copied ? "✓ Copied" : "⎘ Copy"}
                  </button>
                  <button onClick={() => downloadMd(output, `PR-${diffData.prMeta?.number || "description"}.md`)}
                    style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #1e293b", background: "#0d1117", color: "#475569", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    ⬇ .md
                  </button>
                </div>
                <div style={{ maxHeight: 560, overflowY: "auto", background: "#020817" }}>
                  {view === "raw"
                    ? <pre style={{ margin: 0, padding: 16, fontSize: 12, lineHeight: 1.75, color: "#64748b", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "'JetBrains Mono',monospace" }}>{output}</pre>
                    : <div style={{ padding: "20px 24px" }} dangerouslySetInnerHTML={{ __html: renderMd(output) }} />
                  }
                </div>
                <div style={{ padding: "10px 14px", borderTop: "1px solid #1e293b", background: "#0a0f1a", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "#334155" }}>Use it:</span>
                  {["Paste into GitHub PR body", "Edit then submit", "Switch template → re-generate"].map(tip => (
                    <span key={tip} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "#1e293b", color: "#475569" }}>{tip}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Empty right state */}
            {!diffData && !loading && (
              <div style={{ height: 340, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1px dashed #1e293b", borderRadius: 10, color: "#1e293b", gap: 10 }}>
                <span style={{ fontSize: 36 }}>🔀</span>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: "#334155", fontWeight: 600, marginBottom: 4 }}>Paste a PR URL or pick branches</div>
                  <div style={{ fontSize: 11, color: "#1e293b", maxWidth: 260, lineHeight: 1.7 }}>
                    Analyses the real diff — commits, files, change types — then writes a complete PR description
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                  {Object.values(TEMPLATES).map(t => (
                    <span key={t.id} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 7, background: "#0d1117", border: "1px solid #1e293b", color: "#1e293b" }}>{t.icon} {t.label}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
