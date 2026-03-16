import { useState, useEffect } from "react";

// ─── GitHub API ───────────────────────────────────────────────────────────────
const GH = "https://api.github.com";

function parseUrl(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/\s?#]+)/);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, "") } : null;
}
async function ghFetch(path) {
  const r = await fetch(`${GH}${path}`);
  if (!r.ok) return null;
  return r.json();
}

async function loadRepoMeta(owner, repo) {
  const [meta, tags, branches] = await Promise.all([
    ghFetch(`/repos/${owner}/${repo}`),
    ghFetch(`/repos/${owner}/${repo}/tags?per_page=20`),
    ghFetch(`/repos/${owner}/${repo}/branches?per_page=20`),
  ]);
  if (!meta) throw new Error("Repo not found or is private.");
  return {
    owner, name: meta.name,
    defaultBranch: meta.default_branch || "main",
    language: meta.language || "Unknown",
    stars: meta.stargazers_count,
    tags: (tags || []).map(t => ({ name: t.name, sha: t.commit?.sha })),
    branches: (branches || []).map(b => ({ name: b.name, sha: b.commit?.sha })),
  };
}

async function fetchCommitsBetween(owner, repo, base, head, perPage = 50) {
  // Compare two refs using GitHub compare API
  const data = await ghFetch(`/repos/${owner}/${repo}/compare/${base}...${head}`);
  if (!data || !data.commits) return [];
  return data.commits.slice(-perPage).map(c => ({
    sha: c.sha?.slice(0, 7),
    fullSha: c.sha,
    message: c.commit?.message || "",
    author: c.commit?.author?.name || "Unknown",
    date: c.commit?.author?.date || "",
    url: c.html_url || "",
  }));
}

async function fetchRecentCommits(owner, repo, branch, perPage = 30) {
  const data = await ghFetch(`/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${perPage}`);
  if (!data) return [];
  return data.map(c => ({
    sha: c.sha?.slice(0, 7),
    fullSha: c.sha,
    message: c.commit?.message || "",
    author: c.commit?.author?.name || "Unknown",
    date: c.commit?.author?.date || "",
    url: c.html_url || "",
  }));
}

async function fetchFilesChanged(owner, repo, base, head) {
  const data = await ghFetch(`/repos/${owner}/${repo}/compare/${base}...${head}`);
  if (!data?.files) return { files: [], stats: { additions: 0, deletions: 0, changed: 0 } };
  return {
    files: data.files.slice(0, 40).map(f => ({
      filename: f.filename,
      status: f.status, // added, removed, modified, renamed
      additions: f.additions,
      deletions: f.deletions,
    })),
    stats: {
      additions: data.files.reduce((s, f) => s + f.additions, 0),
      deletions: data.files.reduce((s, f) => s + f.deletions, 0),
      changed: data.files.length,
    },
  };
}

// ─── Changelog formats ────────────────────────────────────────────────────────
const FORMATS = {
  keepachangelog: {
    id: "keepachangelog",
    label: "Keep a Changelog",
    icon: "📋",
    description: "Standard format: Added / Changed / Deprecated / Removed / Fixed / Security",
    color: "#3b82f6",
  },
  release: {
    id: "release",
    label: "GitHub Release Notes",
    icon: "🚀",
    description: "Markdown release notes — ready to paste into a GitHub Release",
    color: "#8b5cf6",
  },
  technical: {
    id: "technical",
    label: "Technical Summary",
    icon: "⚙️",
    description: "Engineer-facing — covers architecture changes, API changes, breaking changes",
    color: "#f59e0b",
  },
  userfacing: {
    id: "userfacing",
    label: "User-Facing",
    icon: "👥",
    description: "Non-technical language — for product updates, newsletters, or blog posts",
    color: "#10b981",
  },
  pr: {
    id: "pr",
    label: "PR Description",
    icon: "🔀",
    description: "Structured PR body — what changed, why, how to test, screenshots needed",
    color: "#ef4444",
  },
};

// ─── Claude generation ────────────────────────────────────────────────────────
function buildChangelogPrompt(meta, commits, fileData, fromRef, toRef, format, customInstructions) {
  const commitList = commits.map(c =>
    `[${c.sha}] ${c.message.split("\n")[0]} — ${c.author} (${c.date?.slice(0, 10)})`
  ).join("\n");

  const fileList = fileData.files.slice(0, 25).map(f =>
    `${f.status.toUpperCase().padEnd(8)} ${f.filename} (+${f.additions}/-${f.deletions})`
  ).join("\n");

  const stats = `${fileData.stats.changed} files changed, +${fileData.stats.additions} additions, -${fileData.stats.deletions} deletions`;

  const formatInstructions = {
    keepachangelog: `Format using Keep a Changelog standard (https://keepachangelog.com):
## [Unreleased] or ## [version] - date
### Added — new features
### Changed — changes to existing functionality
### Deprecated — soon-to-be removed features
### Removed — removed features
### Fixed — bug fixes
### Security — vulnerabilities
Only include sections that have actual entries. Be specific — name the actual feature/fix.`,

    release: `Format as GitHub Release Notes markdown:
- Start with a 1-2 sentence highlight summary of what this release does
- "## What's New" section with bullet points for features
- "## Bug Fixes" section if applicable
- "## Breaking Changes" section if applicable (highlight prominently)
- "## Contributors" section listing unique commit authors
- End with upgrade instructions if needed
Make it feel like a real release — specific, exciting where warranted, honest about breaking changes.`,

    technical: `Format as a technical changelog for engineers:
- "## Summary" — 2-3 sentences on what changed architecturally
- "## API Changes" — any interface/API modifications (breaking or not)
- "## Breaking Changes" — explicit callout with migration notes
- "## Internal Changes" — refactors, dependency updates, performance
- "## Files of Interest" — highlight the most significant file changes
- Use precise technical language. Name functions, modules, endpoints where inferable.`,

    userfacing: `Format as user-facing product update notes. Rules:
- Zero technical jargon — no mention of commits, SHAs, files, or code
- Lead with user benefit ("You can now...", "We fixed...", "It's faster to...")
- Group by user-visible impact, not code structure  
- Friendly, clear tone — imagine a product email or blog post section
- "🆕 New", "🐛 Fixed", "⚡ Improved", "🗑 Removed" emoji categories
- Under 200 words — users don't read long changelogs`,

    pr: `Format as a GitHub Pull Request description:
## Summary
(1-2 sentences: what and why)

## Changes Made
- Bullet list of specific changes

## Type of Change
- [ ] Bug fix
- [ ] New feature  
- [ ] Breaking change
- [ ] Refactor / cleanup
- [ ] Docs update

## How to Test
(Infer testing steps from the changed files)

## Breaking Changes
(If any — be explicit)

## Screenshots
(Note: add screenshots if UI was changed)`,
  };

  return `You are writing a changelog/release notes for a software project.

REPO: ${meta.owner}/${meta.name} (${meta.language})
DIFF RANGE: ${fromRef} → ${toRef}
STATS: ${stats}

COMMITS (${commits.length} total):
${commitList}

FILES CHANGED:
${fileList}

${customInstructions?.trim() ? `CUSTOM INSTRUCTIONS (treat as binding constraints):
━━━━━━━━━━━━━━━━━━━━━━━━━
${customInstructions.trim()}
━━━━━━━━━━━━━━━━━━━━━━━━━

` : ""}
FORMAT REQUIREMENTS:
${formatInstructions[format]}

RULES:
- Infer meaning from commit messages + file names — don't just list commits verbatim
- Group related commits into single logical entries
- Ignore noise commits (merge commits, typo fixes, "wip", "fix lint")
- If a commit message uses conventional commits format (feat:, fix:, chore:) use those categories
- Be specific: "Added user authentication with JWT" not "Added authentication"
- Return ONLY the raw markdown changelog. No preamble.`;
}

async function generateChangelog(meta, commits, fileData, fromRef, toRef, format, customInstructions) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: "You are an expert technical writer who creates clear, accurate changelog entries. Always follow custom instructions as hard constraints. Return ONLY raw markdown.",
      messages: [{ role: "user", content: buildChangelogPrompt(meta, commits, fileData, fromRef, toRef, format, customInstructions) }],
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
    .replace(/^#{3} (.+)$/gm, "<h3>$1</h3>")
    .replace(/^#{2} (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:#60a5fa">$1</a>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #1e293b;margin:.6em 0">')
    .replace(/^\s*[-*] \[( |x)\] (.+)$/gm, (_, c, t) => `<div style="display:flex;gap:8px;align-items:center;padding:2px 0"><span style="width:14px;height:14px;border:1px solid #334155;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0">${c === "x" ? "✓" : ""}</span><span style="color:#94a3b8;font-size:13px">${t}</span></div>`)
    .replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul style="padding-left:16px;margin:.3em 0">${m}</ul>`)
    .replace(/\n\n+/g, "</p><p>")
    .replace(/^(?!<[hpuolridbs]|<hr)(.+)$/gm, m => m.trim() ? `<p>${m}</p>` : "");
}

function downloadMd(content, filename) {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([content], { type: "text/markdown" })),
    download: filename,
  });
  a.click();
}

// ─── UI Components ────────────────────────────────────────────────────────────

function RefSelector({ label, options, value, onChange, placeholder }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>{label}</div>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "9px 12px", borderRadius: 7, background: "#0d1117", border: "1px solid #1e293b", color: value ? "#e2e8f0" : "#334155", fontSize: 13, fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
        <option value="">{placeholder}</option>
        {options.tags?.length > 0 && (
          <optgroup label="Tags / Releases">
            {options.tags.map(t => <option key={t.name} value={t.name}>🏷 {t.name}</option>)}
          </optgroup>
        )}
        {options.branches?.length > 0 && (
          <optgroup label="Branches">
            {options.branches.map(b => <option key={b.name} value={b.name}>🌿 {b.name}</option>)}
          </optgroup>
        )}
      </select>
    </div>
  );
}

function CommitRow({ commit, index }) {
  const typeMap = {
    "feat": { color: "#10b981", label: "feat" },
    "fix": { color: "#ef4444", label: "fix" },
    "chore": { color: "#64748b", label: "chore" },
    "docs": { color: "#3b82f6", label: "docs" },
    "refactor": { color: "#f59e0b", label: "refactor" },
    "test": { color: "#8b5cf6", label: "test" },
    "perf": { color: "#f97316", label: "perf" },
    "style": { color: "#06b6d4", label: "style" },
    "build": { color: "#84cc16", label: "build" },
    "ci": { color: "#a78bfa", label: "ci" },
  };

  const firstLine = commit.message.split("\n")[0];
  const conventionalMatch = firstLine.match(/^(\w+)(\(.+?\))?!?:\s*/);
  const type = conventionalMatch ? typeMap[conventionalMatch[1]] : null;
  const cleanMsg = conventionalMatch ? firstLine.replace(conventionalMatch[0], "") : firstLine;

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 0", borderBottom: "1px solid #0d1117", animation: `rowIn .25s ease ${index * 30}ms both` }}>
      <code style={{ fontSize: 11, color: "#334155", fontFamily: "'JetBrains Mono',monospace", flexShrink: 0, marginTop: 1 }}>{commit.sha}</code>
      {type && (
        <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: type.color + "20", color: type.color, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0, marginTop: 2 }}>{type.label}</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cleanMsg}</div>
        <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>{commit.author} · {commit.date?.slice(0, 10)}</div>
      </div>
    </div>
  );
}

function FormatCard({ format, selected, onClick }) {
  const isSelected = selected === format.id;
  return (
    <div onClick={onClick} style={{
      padding: "10px 12px", borderRadius: 8, cursor: "pointer",
      border: `1.5px solid ${isSelected ? format.color : "#1e293b"}`,
      background: isSelected ? format.color + "0f" : "transparent",
      transition: "all .18s",
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 16 }}>{format.icon}</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: isSelected ? format.color : "#94a3b8" }}>{format.label}</div>
          <div style={{ fontSize: 10, color: "#334155", lineHeight: 1.4, marginTop: 1 }}>{format.description}</div>
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 14px", background: "#0d1117", border: "1px solid #1e293b", borderRadius: 8 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#334155", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
    </div>
  );
}

function OutputPanel({ content, format, fromRef, toRef, repoName }) {
  const [view, setView] = useState("preview");
  const [copied, setCopied] = useState(false);
  if (!content) return null;
  const filename = `CHANGELOG-${fromRef}-to-${toRef}.md`.replace(/[^a-zA-Z0-9.-]/g, "-");
  return (
    <div style={{ border: "1px solid #1e293b", borderRadius: 10, overflow: "hidden", marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#0d1117", borderBottom: "1px solid #1e293b", flexWrap: "wrap" }}>
        <span style={{ fontSize: 14 }}>{format.icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: format.color }}>{format.label}</span>
        <span style={{ fontSize: 11, color: "#334155", fontFamily: "'JetBrains Mono',monospace" }}>{fromRef} → {toRef}</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", background: "#020817", border: "1px solid #1e293b", borderRadius: 6, overflow: "hidden" }}>
          {["preview", "raw"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding: "4px 10px", border: "none", background: view === v ? "#1e293b" : "transparent", color: view === v ? "#e2e8f0" : "#334155", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {v === "preview" ? "👁" : "⌨"}
            </button>
          ))}
        </div>
        <button onClick={() => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #1e293b", background: copied ? "#052e16" : "#0d1117", color: copied ? "#4ade80" : "#475569", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          {copied ? "✓ Copied" : "⎘ Copy"}
        </button>
        <button onClick={() => downloadMd(content, filename)}
          style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #1e293b", background: "#0d1117", color: "#475569", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          ⬇ .md
        </button>
      </div>
      <div style={{ maxHeight: 500, overflowY: "auto", background: "#020817" }}>
        {view === "raw"
          ? <pre style={{ margin: 0, padding: 16, fontSize: 12, lineHeight: 1.75, color: "#94a3b8", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "'JetBrains Mono',monospace" }}>{content}</pre>
          : <div style={{ padding: "20px 24px", fontSize: 13.5, lineHeight: 1.9, color: "#cbd5e1" }}
              dangerouslySetInnerHTML={{ __html: renderMd(content) }} />
        }
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function RepoDiff() {
  const [url, setUrl] = useState("");
  const [meta, setMeta] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [metaError, setMetaError] = useState("");

  const [fromRef, setFromRef] = useState("");
  const [toRef, setToRef] = useState("");
  const [manualFrom, setManualFrom] = useState("");
  const [manualTo, setManualTo] = useState("");
  const [useManual, setUseManual] = useState(false);

  const [format, setFormat] = useState("keepachangelog");
  const [customInstructions, setCustomInstructions] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [commits, setCommits] = useState([]);
  const [fileData, setFileData] = useState(null);
  const [output, setOutput] = useState(null);
  const [genError, setGenError] = useState("");

  const [recentCommits, setRecentCommits] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const loadRepo = async () => {
    const parsed = parseUrl(url.trim());
    if (!parsed) { setMetaError("Enter a valid GitHub repo URL."); return; }
    setMetaError(""); setMeta(null); setCommits([]); setOutput(null);
    setFromRef(""); setToRef(""); setRecentCommits([]); setLoadingMeta(true);
    try {
      const m = await loadRepoMeta(parsed.owner, parsed.repo);
      setMeta(m);
      // Auto-populate to = defaultBranch, from = latest tag if available
      if (m.tags.length > 0) setFromRef(m.tags[0].name);
      setToRef(m.defaultBranch);
      // Load recent commits for context
      setLoadingRecent(true);
      const rc = await fetchRecentCommits(m.owner, m.name, m.defaultBranch, 20);
      setRecentCommits(rc);
    } catch (e) { setMetaError(e.message || "Failed to load repo."); }
    finally { setLoadingMeta(false); setLoadingRecent(false); }
  };

  const effectiveFrom = useManual ? manualFrom : fromRef;
  const effectiveTo = useManual ? manualTo : toRef;
  const canGenerate = meta && effectiveFrom && effectiveTo && effectiveFrom !== effectiveTo;

  const runAnalysis = async () => {
    if (!canGenerate) return;
    setLoading(true); setGenError(""); setOutput(null); setCommits([]); setFileData(null);

    const msgs = [
      "Fetching commits between refs…",
      "Analyzing changed files…",
      "Classifying commit types…",
      "Writing plain-English changelog…",
    ];
    let mi = 0; setLoadMsg(msgs[0]);
    const iv = setInterval(() => { mi = Math.min(mi + 1, msgs.length - 1); setLoadMsg(msgs[mi]); }, 1800);

    try {
      const [commitList, files] = await Promise.all([
        fetchCommitsBetween(meta.owner, meta.name, effectiveFrom, effectiveTo),
        fetchFilesChanged(meta.owner, meta.name, effectiveFrom, effectiveTo),
      ]);
      if (commitList.length === 0) throw new Error("No commits found between these refs. Check that the range is correct.");
      setCommits(commitList);
      setFileData(files);
      const md = await generateChangelog(meta, commitList, files, effectiveFrom, effectiveTo, format, customInstructions);
      setOutput(md);
    } catch (e) { setGenError(e.message || "Something went wrong."); }
    finally { clearInterval(iv); setLoading(false); }
  };

  const activeFormat = FORMATS[format];

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0", fontFamily: "'DM Sans','Segoe UI',sans-serif", paddingBottom: 80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *{box-sizing:border-box}
        @keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        @keyframes rowIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        input::placeholder,textarea::placeholder{color:#1e293b}
        select option{background:#0d1117;color:#e2e8f0}
        select optgroup{color:#475569;font-size:11px}
        ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
        h1,h2,h3{color:#e2e8f0;margin:.6em 0 .3em;line-height:1.3}
        h1{font-size:1.35em;border-bottom:1px solid #1e293b;padding-bottom:.25em}
        h2{font-size:1.15em} h3{font-size:1em;color:#94a3b8}
        code{background:#1e293b;padding:1px 5px;border-radius:4px;font-size:.82em;color:#fb923c}
        strong{color:#e2e8f0} li{color:#94a3b8;margin:.2em 0;font-size:13px}
        p{color:#94a3b8;margin:.35em 0;font-size:13.5px;line-height:1.75}
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #0f172a", padding: "15px 26px", display: "flex", alignItems: "center", gap: 12, background: "#0d1117" }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#1e40af,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>📝</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em" }}>Changelog Generator</div>
          <div style={{ fontSize: 11, color: "#334155" }}>Plain-English diffs between any two refs</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 5, alignItems: "center" }}>
          {meta && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#052e16", color: "#4ade80", border: "1px solid #166534", fontWeight: 600 }}>✓ {meta.owner}/{meta.name}</span>}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "26px 18px" }}>

        {/* Step 1 — Load repo */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: meta ? "#052e16" : "#1e293b", border: `2px solid ${meta ? "#16a34a" : "#334155"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: meta ? "#4ade80" : "#475569", flexShrink: 0 }}>
              {meta ? "✓" : "1"}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: meta ? "#4ade80" : "#94a3b8" }}>Load Repository</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginLeft: 30 }}>
            <input value={url} onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !loadingMeta && loadRepo()}
              placeholder="https://github.com/username/repository"
              style={{ flex: 1, padding: "10px 13px", borderRadius: 7, background: "#0d1117", border: "1px solid #1e293b", color: "#e2e8f0", fontSize: 13.5, fontFamily: "inherit", outline: "none", transition: "border-color .2s" }}
              onFocus={e => e.target.style.borderColor = "#3b82f6"}
              onBlur={e => e.target.style.borderColor = "#1e293b"} />
            <button onClick={loadRepo} disabled={loadingMeta || !url.trim()}
              style={{ padding: "10px 18px", borderRadius: 7, border: "none", background: loadingMeta || !url.trim() ? "#0f172a" : "#1e40af", color: loadingMeta || !url.trim() ? "#1e293b" : "#e2e8f0", fontSize: 13, fontWeight: 700, cursor: loadingMeta ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              {loadingMeta ? "Loading…" : "Load →"}
            </button>
          </div>
          {metaError && <div style={{ marginTop: 6, marginLeft: 30, color: "#ef4444", fontSize: 12 }}>⚠ {metaError}</div>}
          {!meta && !loadingMeta && (
            <div style={{ marginTop: 8, marginLeft: 30, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#1e293b" }}>Try:</span>
              {["vercel/next.js", "tiangolo/fastapi", "facebook/react"].map(eg => (
                <button key={eg} onClick={() => setUrl(`https://github.com/${eg}`)} style={{ padding: "3px 9px", borderRadius: 5, border: "1px solid #1e293b", background: "transparent", color: "#334155", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{eg}</button>
              ))}
            </div>
          )}
        </div>

        {/* Step 2 — Select refs */}
        {meta && (
          <div style={{ marginBottom: 24, animation: "fadein .3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: canGenerate ? "#052e16" : "#1e293b", border: `2px solid ${canGenerate ? "#16a34a" : "#334155"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: canGenerate ? "#4ade80" : "#475569", flexShrink: 0 }}>
                {canGenerate ? "✓" : "2"}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: canGenerate ? "#4ade80" : "#94a3b8" }}>Select Diff Range</span>
            </div>

            <div style={{ marginLeft: 30 }}>
              {/* Toggle manual/selector */}
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {[false, true].map(m => (
                  <button key={String(m)} onClick={() => setUseManual(m)}
                    style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${useManual === m ? "#3b82f6" : "#1e293b"}`, background: useManual === m ? "#1e3a8a30" : "transparent", color: useManual === m ? "#3b82f6" : "#475569", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    {m ? "✏ Manual SHA / branch" : "📋 Select from list"}
                  </button>
                ))}
              </div>

              {!useManual ? (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                  <RefSelector label="From (older)" options={meta} value={fromRef} onChange={setFromRef} placeholder="Select tag or branch…" />
                  <div style={{ paddingBottom: 10, color: "#334155", fontSize: 18, fontWeight: 300 }}>→</div>
                  <RefSelector label="To (newer)" options={meta} value={toRef} onChange={setToRef} placeholder="Select tag or branch…" />
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                  {[["From (SHA, tag, branch)", manualFrom, setManualFrom], ["To (SHA, tag, branch)", manualTo, setManualTo]].map(([lbl, val, set]) => (
                    <div key={lbl} style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>{lbl}</div>
                      <input value={val} onChange={e => set(e.target.value)} placeholder="e.g. v1.2.0 or abc123f"
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 7, background: "#0d1117", border: "1px solid #1e293b", color: "#e2e8f0", fontSize: 13, fontFamily: "'JetBrains Mono',monospace", outline: "none", transition: "border-color .2s" }}
                        onFocus={e => e.target.style.borderColor = "#3b82f6"}
                        onBlur={e => e.target.style.borderColor = "#1e293b"} />
                    </div>
                  ))}
                </div>
              )}

              {/* Recent commits preview */}
              {recentCommits.length > 0 && (
                <div style={{ marginTop: 14, background: "#0d1117", border: "1px solid #1e293b", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "8px 12px", borderBottom: "1px solid #1e293b", fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Recent commits on {meta.defaultBranch} (for context)
                  </div>
                  <div style={{ padding: "4px 12px", maxHeight: 160, overflowY: "auto" }}>
                    {recentCommits.slice(0, 10).map((c, i) => <CommitRow key={c.sha} commit={c} index={i} />)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3 — Format + options */}
        {meta && (
          <div style={{ marginBottom: 24, animation: "fadein .4s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#1e293b", border: "2px solid #334155", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#475569", flexShrink: 0 }}>3</div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>Choose Format</span>
            </div>
            <div style={{ marginLeft: 30 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8, marginBottom: 14 }}>
                {Object.values(FORMATS).map(f => (
                  <FormatCard key={f.id} format={f} selected={format} onClick={() => setFormat(f.id)} />
                ))}
              </div>

              {/* Custom instructions */}
              <div style={{ border: `1px solid ${showCustom || customInstructions ? "#334155" : "#1e293b"}`, borderRadius: 8, overflow: "hidden" }}>
                <div onClick={() => setShowCustom(s => !s)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer", background: "#0d1117" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: customInstructions?.trim() ? "#3b82f6" : "#334155", transition: "background .2s" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: customInstructions?.trim() ? "#3b82f6" : "#475569", flex: 1 }}>
                    Custom Instructions
                    {customInstructions?.trim() && <span style={{ fontWeight: 400, color: "#334155" }}> · active</span>}
                  </span>
                  <span style={{ fontSize: 11, color: "#334155" }}>{showCustom ? "▲" : "▼"}</span>
                </div>
                {showCustom && (
                  <div style={{ padding: "10px 12px", borderTop: "1px solid #1e293b", background: "#020817" }}>
                    <div style={{ fontSize: 11, color: "#475569", marginBottom: 7, lineHeight: 1.5 }}>
                      Shape how the changelog is written. These are binding constraints.
                    </div>
                    <textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)}
                      rows={4} placeholder={`Examples:
• "This is a public release — use user-facing language even in technical sections"
• "Version number is v2.4.0 — use that in the header"
• "Audience is engineers on the internal team — be terse"
• "Flag any breaking changes in red/bold prominently"
• "We use conventional commits — preserve feat:/fix: labels"
• "Skip all chore: and ci: commits entirely"`}
                      style={{ width: "100%", padding: "9px 11px", borderRadius: 6, background: "#0d1117", border: `1px solid ${customInstructions?.trim() ? "#1e40af" : "#1e293b"}`, color: "#e2e8f0", fontSize: 11.5, fontFamily: "inherit", lineHeight: 1.65, resize: "vertical", outline: "none" }}
                      onFocus={e => e.target.style.borderColor = "#3b82f6"}
                      onBlur={e => e.target.style.borderColor = customInstructions?.trim() ? "#1e40af" : "#1e293b"} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Generate button */}
        {meta && (
          <div style={{ marginLeft: 30, marginBottom: 24 }}>
            <button onClick={runAnalysis} disabled={!canGenerate || loading}
              style={{ padding: "12px 28px", borderRadius: 8, border: "none", background: !canGenerate || loading ? "#0f172a" : `linear-gradient(135deg, ${activeFormat.color}, ${activeFormat.color}cc)`, color: !canGenerate || loading ? "#1e293b" : "#fff", fontSize: 14, fontWeight: 800, cursor: !canGenerate || loading ? "not-allowed" : "pointer", fontFamily: "inherit", letterSpacing: "-0.01em", transition: "all .2s" }}>
              {loading ? loadMsg : `Generate ${activeFormat.icon} ${activeFormat.label}`}
            </button>
            {!canGenerate && meta && <span style={{ marginLeft: 10, fontSize: 11, color: "#334155" }}>Select two different refs to continue</span>}
            {genError && <div style={{ marginTop: 8, color: "#ef4444", fontSize: 12 }}>⚠ {genError}</div>}
          </div>
        )}

        {/* Results */}
        {(commits.length > 0 || fileData) && !loading && (
          <div style={{ marginLeft: 30, animation: "fadein .35s ease" }}>
            {/* Stats row */}
            {fileData && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <StatPill label="Commits" value={commits.length} color="#e2e8f0" />
                <StatPill label="Files" value={fileData.stats.changed} color="#94a3b8" />
                <StatPill label="Added" value={`+${fileData.stats.additions}`} color="#4ade80" />
                <StatPill label="Deleted" value={`-${fileData.stats.deletions}`} color="#f87171" />
                <div style={{ flex: 1, padding: "8px 14px", background: "#0d1117", border: "1px solid #1e293b", borderRadius: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "#334155", fontFamily: "'JetBrains Mono',monospace" }}>{effectiveFrom}</span>
                  <span style={{ color: "#1e293b" }}>→</span>
                  <span style={{ fontSize: 11, color: "#334155", fontFamily: "'JetBrains Mono',monospace" }}>{effectiveTo}</span>
                </div>
              </div>
            )}

            {/* Commit list */}
            {commits.length > 0 && (
              <div style={{ background: "#0d1117", border: "1px solid #1e293b", borderRadius: 8, overflow: "hidden", marginBottom: 0 }}>
                <div style={{ padding: "8px 12px", borderBottom: "1px solid #1e293b", fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {commits.length} commits analysed
                </div>
                <div style={{ padding: "4px 12px", maxHeight: 200, overflowY: "auto" }}>
                  {commits.map((c, i) => <CommitRow key={c.sha} commit={c} index={i} />)}
                </div>
              </div>
            )}

            {/* Output */}
            {output && (
              <OutputPanel content={output} format={activeFormat} fromRef={effectiveFrom} toRef={effectiveTo} repoName={meta?.name} />
            )}
          </div>
        )}

        {/* Empty state */}
        {!meta && !loadingMeta && !metaError && (
          <div style={{ textAlign: "center", padding: "56px 0", color: "#1e293b" }}>
            <div style={{ fontSize: 46, marginBottom: 14 }}>📝</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#334155", marginBottom: 6 }}>Turn commits into readable changelogs</div>
            <div style={{ fontSize: 12, color: "#1e293b", maxWidth: 420, margin: "0 auto", lineHeight: 1.8 }}>
              Compare any two tags, branches, or SHAs. Get a plain-English changelog in any format — Keep a Changelog, GitHub Release, PR description, or user-facing notes.
            </div>
            <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {Object.values(FORMATS).map(f => (
                <span key={f.id} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, background: "#0d1117", border: "1px solid #1e293b", color: "#334155" }}>{f.icon} {f.label}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
