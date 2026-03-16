import React, { useState } from "react";

// ─── GitHub helpers ───────────────────────────────────────────────────────────
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
async function fetchRepoContext(owner, repo) {
  const [meta, tree, langs, commits] = await Promise.all([
    ghFetch(`/repos/${owner}/${repo}`),
    ghFetch(`/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`),
    ghFetch(`/repos/${owner}/${repo}/languages`),
    ghFetch(`/repos/${owner}/${repo}/commits?per_page=10`),
  ]);
  if (!meta) throw new Error("Repo not found or is private.");
  const files = (tree?.tree || []).map(f => f.path).filter(Boolean);
  const branch = meta.default_branch || "main";
  const topFolders = [...new Set(files.map(p => p.split("/")[0]))].slice(0, 12);
  const sampleFile = (tree?.tree || []).find(f =>
    f.path?.match(/\.(py|js|ts|rb|go|java|rs|cpp|cs)$/) && !f.path.includes("test")
  );
  const [readme, pkg, codeSnippet] = await Promise.all([
    tryRaw(owner, repo, "README.md", branch),
    tryRaw(owner, repo, "package.json", branch),
    sampleFile ? tryRaw(owner, repo, sampleFile.path, branch) : Promise.resolve(null),
  ]);
  return {
    owner, name: meta.name,
    description: meta.description || "",
    language: Object.keys(langs || {})[0] || "Unknown",
    languages: Object.keys(langs || {}).slice(0, 5),
    topics: meta.topics || [],
    stars: meta.stargazers_count,
    forks: meta.forks_count,
    homepage: meta.homepage || "",
    branch, topFolders,
    files: files.slice(0, 40),
    hasDemo: files.some(f => f.toLowerCase().includes("demo") || f.toLowerCase().includes("screenshot")),
    hasTests: files.some(f => f.toLowerCase().includes("test") || f.toLowerCase().includes("spec")),
    hasCI: files.some(f => f.includes(".github/workflows") || f.includes(".travis")),
    hasDocker: files.some(f => f.toLowerCase().includes("docker")),
    hasDocs: files.some(f => f.toLowerCase().startsWith("docs/")),
    readme: readme?.slice(0, 600) || "",
    codeSnippet: codeSnippet?.slice(0, 600) || "",
    pkg: pkg ? (() => { try { return JSON.parse(pkg); } catch { return null; } })() : null,
  };
}

// ─── Audience definitions (Updated for monochrome aesthetic) ───────────────────
const AUDIENCES = {
  recruiter: {
    id: "recruiter", label: "Recruiter / HR", icon: "🧑‍💼",
    tagline: "For job applications & portfolio reviews",
    description: "Optimized for someone spending 30 seconds deciding if you're worth interviewing. Leads with impact, tech stack, and live demo.",
    priorities: ["What it does", "Tech proof", "Live demo", "Setup speed", "Code quality signals"],
    instructionPlaceholder: `e.g. "I'm applying to fintech startups — emphasize reliability" or "I have 2 YOE — don't make it sound senior"`,
    instructionLabel: "What should the recruiter know about you or the role?",
  },
  hackathon: {
    id: "hackathon", label: "Hackathon Judge", icon: "🏆",
    tagline: "For demo days & competitions",
    description: "Judges scan 40 repos in 2 hours. Problem + solution + demo link in the first 5 lines. Everything else is secondary.",
    priorities: ["Problem statement", "Demo/video link", "What's novel", "Team & timeline", "Tech used"],
    instructionPlaceholder: `e.g. "We built this in 24 hours, 3-person team" or "Demo video: https://youtube.com/..."`,
    instructionLabel: "Hackathon context, theme, judging criteria, or team info?",
  },
  opensource: {
    id: "opensource", label: "Open Source", icon: "🌐",
    tagline: "For community contributors",
    description: "Contributors need to understand architecture fast and know exactly how to help. Emphasizes contribution paths.",
    priorities: ["Architecture overview", "Contribution guide", "Roadmap", "Design decisions", "Community"],
    instructionPlaceholder: `e.g. "Good first issues are labeled 'beginner-friendly'" or "We follow conventional commits"`,
    instructionLabel: "Community setup, contribution rules, or governance model?",
  },
  intern: {
    id: "intern", label: "Internship App", icon: "🎓",
    tagline: "For new-grad applications",
    description: "Reviewers look for learning, curiosity, and clean fundamentals. Authenticity over buzzwords.",
    priorities: ["What you learned", "Problem you solved", "Challenges overcome", "Clean setup", "Future ideas"],
    instructionPlaceholder: `e.g. "I built this during my databases course" or "My biggest technical win was optimizing the query"`,
    instructionLabel: "Who are you, what are you applying for, what should they know?",
  },
};

// ─── Prompt builder ───────────────────────────────────────────────────────────
const BASE_PROMPTS = {
  recruiter: (ctx) => `You are writing a GitHub README optimized for a technical recruiter who spends 30 seconds on each repo. REPO FACTS: Name: ${ctx.owner}/${ctx.name} | Language: ${ctx.language} | Stack: ${ctx.languages.join(", ")}\nDescription: ${ctx.description}\nStars: ${ctx.stars} | Live site: ${ctx.homepage}\nHas tests: ${ctx.hasTests} | Has CI: ${ctx.hasCI} | Has demo: ${ctx.hasDemo}\nFolders: ${ctx.topFolders.join(", ")}\nBASE README STRUCTURE:\n1. First 3 lines: what it does, tech stack, demo link\n2. Shields.io badges\n3. "Built With"\n4. "Key Features" (resume-style bullets)\n5. One-command setup\n6. "Technical Decisions"\nTone: confident, professional, results-focused. No filler.`,
  hackathon: (ctx) => `You are writing a GitHub README for a hackathon submission. Judges scan 40 repos in 2 hours. REPO FACTS: Name: ${ctx.owner}/${ctx.name} | Stack: ${ctx.languages.join(", ")}\nDescription: ${ctx.description}\nHas demo: ${ctx.hasDemo}\nFolders: ${ctx.topFolders.join(", ")}\nBASE README STRUCTURE:\n1. FIRST LINE: bold problem statement\n2. SECOND LINE: your solution\n3. THIRD LINE: demo link\n4. "The Problem"\n5. "Our Solution"\n6. "Demo"\n7. "Tech Stack"\n8. "How to Run"\n9. "What's Next"\nTone: punchy, energetic, show-don't-tell.`,
  opensource: (ctx) => `You are writing a GitHub README for an open source project seeking contributors. REPO FACTS: Name: ${ctx.owner}/${ctx.name} | Stack: ${ctx.languages.join(", ")}\nStars: ${ctx.stars} | Forks: ${ctx.forks}\nFolders: ${ctx.topFolders.join(", ")}\nFiles: ${ctx.files.slice(0, 20).join(", ")}\nBASE README STRUCTURE:\n1. One-line description + badges\n2. "Why this project exists"\n3. "Architecture Overview"\n4. "Getting Started"\n5. "Contributing"\n6. "Roadmap"\n7. "Design Decisions"\n8. "Community"\nTone: welcoming, technically deep, community-first.`,
  intern: (ctx) => `You are writing a GitHub README for an internship/new-grad portfolio project. REPO FACTS: Name: ${ctx.owner}/${ctx.name} | Stack: ${ctx.languages.join(", ")}\nHas tests: ${ctx.hasTests}\nFolders: ${ctx.topFolders.join(", ")}\nBASE README STRUCTURE:\n1. Tagline showing excitement\n2. "What I Built"\n3. "Why I Built This"\n4. "Technical Challenges & How I Solved Them" [MOST IMPORTANT]\n5. "What I Learned"\n6. "Tech Stack"\n7. Clean installation\n8. "If I Had More Time"\nTone: genuine, curious, learning-focused. Authenticity beats buzzwords.`,
};

function buildPrompt(ctx, audienceId, customInstructions) {
  const base = BASE_PROMPTS[audienceId](ctx);
  const hasCustom = customInstructions?.trim().length > 0;
  return `${base}\n\n${hasCustom ? `CUSTOM INSTRUCTIONS FROM USER (BINDING CONSTRAINTS):\n${customInstructions.trim()}\nIntegrate these instructions throughout the README.` : "No custom instructions — use defaults."}\n\nReturn ONLY raw markdown. No explanation. No wrapping code fences.`;
}

async function generateForAudience(ctx, audienceId, customInstructions) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: "You are an expert technical writer who creates targeted GitHub documentation. Always follow custom instructions as hard constraints. Return ONLY raw markdown.",
      messages: [{ role: "user", content: buildPrompt(ctx, audienceId, customInstructions) }],
    }),
  });
  const data = await res.json();
  return data.content?.find(b => b.type === "text")?.text || "";
}

async function generateDiff(ctx, outputs, customInstructions) {
  const ids = Object.keys(outputs);
  if (ids.length < 2) return null;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: "You are a documentation strategist. Be specific and concise.",
      messages: [{ role: "user", content: `Compare these README versions for "${ctx.owner}/${ctx.name}" generated for: ${ids.map(id => AUDIENCES[id].label).join(", ")}. Write 2-3 sentences max covering differences. Max 120 words total.` }],
    }),
  });
  const data = await res.json();
  return data.content?.find(b => b.type === "text")?.text || "";
}

// ─── Markdown renderer (Updated for Light Mode) ────────────────────────────────
function renderMd(md) {
  if (!md) return "";
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^#{6} (.+)$/gm, "<h6 class='font-bold text-sm mt-4 mb-2'>$1</h6>")
    .replace(/^#{5} (.+)$/gm, "<h5 class='font-bold text-base mt-4 mb-2'>$1</h5>")
    .replace(/^#{4} (.+)$/gm, "<h4 class='font-bold text-lg mt-4 mb-2'>$1</h4>")
    .replace(/^#{3} (.+)$/gm, "<h3 class='font-bold text-xl mt-5 mb-2'>$1</h3>")
    .replace(/^#{2} (.+)$/gm, "<h2 class='font-extrabold text-2xl mt-6 mb-3 border-b pb-2'>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 class='font-black text-3xl mt-4 mb-4'>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong class='font-bold'>$1</strong>").replace(/\*(.+?)\*/g, "<em class='italic'>$1</em>")
    .replace(/`([^`\n]+)`/g, "<code class='bg-gray-100 text-black px-1.5 py-0.5 rounded text-sm font-mono'>$1</code>")
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre class='bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto my-4 text-sm font-mono'><code>${c.trim()}</code></pre>`)
    .replace(/^---$/gm, "<hr class='my-6 border-gray-200'>")
    .replace(/^\s*[-*] (.+)$/gm, "<li class='ml-4 list-disc mb-1 text-gray-700'>$1</li>")
    .replace(/\n\n+/g, "</p><p class='mb-4 text-gray-700 leading-relaxed'>")
    .replace(/^(?!<[hpuolpribs]|<hr|<pre)(.+)$/gm, m => m.trim() ? `<p class='mb-4 text-gray-700 leading-relaxed'>${m}</p>` : "");
}

function downloadMd(content, filename) {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([content], { type: "text/markdown" })),
    download: filename,
  });
  a.click();
}

// ─── Custom Instructions Panel ────────────────────────────────────────────────
function InstructionsPanel({ audience, value, onChange, hasOutput }) {
  const hasContent = value?.trim().length > 0;

  return (
    <div className={`mb-6 border rounded-xl overflow-hidden transition-all ${hasContent ? 'bg-gray-50 border-gray-300' : 'bg-white border-gray-200'}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold tracking-wider text-gray-500 uppercase">
            {audience.instructionLabel}
          </label>
          {hasOutput && hasContent && (
             <span className="px-2 py-1 text-[10px] font-bold text-white bg-black rounded-md">APPLIED</span>
          )}
        </div>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={audience.instructionPlaceholder}
          rows={3}
          className="w-full px-4 py-3 text-sm text-black bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black focus:ring-1 focus:ring-black resize-y"
        />
        <div className="flex items-center gap-2 mt-2">
           <div className={`w-2 h-2 rounded-full ${hasContent ? 'bg-black' : 'bg-gray-300'}`}></div>
           <span className="text-xs font-medium text-gray-500">
             {hasContent ? 'Custom instructions active. These override defaults.' : `Leave blank to use default ${audience.label} template.`}
           </span>
        </div>
      </div>
    </div>
  );
}

// ─── Audience selector card ───────────────────────────────────────────────────
function AudienceCard({ audience, selected, onClick, generated, loading, hasInstructions }) {
  const isSelected = selected === audience.id;
  return (
    <div 
      onClick={onClick} 
      className={`p-4 rounded-xl cursor-pointer transition-all border ${
        isSelected ? 'bg-black border-black text-white shadow-md' : 'bg-white border-gray-200 hover:border-gray-400 text-black'
      } relative overflow-hidden`}
    >
      {loading && <div className="absolute top-0 left-0 right-0 h-1 bg-gray-300 animate-pulse" />}
      <div className="flex items-center gap-4">
        <span className="text-2xl">{audience.icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-black'}`}>{audience.label}</span>
            {generated && <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${isSelected ? 'bg-white text-black' : 'bg-black text-white'}`}>READY</span>}
            {loading && <span className={`text-[9px] font-bold animate-pulse ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>GEN...</span>}
            {hasInstructions && !loading && <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${isSelected ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>✏ CUSTOM</span>}
          </div>
          <div className={`text-xs ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>{audience.tagline}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Output viewer ────────────────────────────────────────────────────────────
function OutputViewer({ content, audience }) {
  const [view, setView] = useState("preview");
  const [copied, setCopied] = useState(false);
  
  if (!content) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-400 border border-gray-200 border-dashed rounded-xl bg-gray-50">
      <span className="text-4xl">{audience.icon}</span>
      <span className="text-sm font-medium text-gray-500">Click Generate to create the {audience.label} README</span>
    </div>
  );

  return (
    <div className="overflow-hidden bg-white border border-gray-200 rounded-xl">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex overflow-hidden bg-white border border-gray-300 rounded-lg">
          {["preview", "raw"].map(v => (
            <button 
              key={v} 
              onClick={() => setView(v)} 
              className={`px-4 py-1.5 text-xs font-bold transition-colors ${view === v ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {v === "preview" ? "Preview" : "Raw Data"}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button 
          onClick={() => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className={`px-4 py-1.5 text-xs font-bold transition-colors border rounded-lg ${copied ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
        >
          {copied ? "✓ Copied" : "Copy Content"}
        </button>
        <button 
          onClick={() => downloadMd(content, `README-${audience.id}.md`)}
          className="px-4 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Download .md
        </button>
      </div>
      
      <div className="overflow-y-auto max-h-[600px] p-6">
        {view === "raw"
          ? <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono">{content}</pre>
          : <div dangerouslySetInnerHTML={{ __html: renderMd(content) }} />
        }
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function AudienceMode() {
  const [url, setUrl] = useState("");
  const [ctx, setCtx] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const [selectedAudience, setSelectedAudience] = useState("recruiter");
  const [generatingFor, setGeneratingFor] = useState(null);
  const [outputs, setOutputs] = useState({});
  const [genError, setGenError] = useState("");

  const [instructions, setInstructions] = useState({ recruiter: "", hackathon: "", opensource: "", intern: "" });
  const setInstruction = (id, val) => setInstructions(prev => ({ ...prev, [id]: val }));
  const [outputHasCustom, setOutputHasCustom] = useState({});

  const [diffLoading, setDiffLoading] = useState(false);
  const [diff, setDiff] = useState(null);

  const fetchRepo = async () => {
    const parsed = parseUrl(url.trim());
    if (!parsed) { setFetchError("Enter a valid GitHub repo URL."); return; }
    setFetchError(""); setCtx(null); setOutputs({}); setDiff(null);
    setOutputHasCustom({}); setFetching(true);
    try {
      setCtx(await fetchRepoContext(parsed.owner, parsed.repo));
    } catch (e) { setFetchError(e.message || "Failed to fetch repo."); }
    finally { setFetching(false); }
  };

  const generate = async (audienceId) => {
    if (!ctx) return;
    setGeneratingFor(audienceId); setGenError("");
    try {
      const md = await generateForAudience(ctx, audienceId, instructions[audienceId]);
      setOutputs(o => ({ ...o, [audienceId]: md }));
      setOutputHasCustom(o => ({ ...o, [audienceId]: !!instructions[audienceId]?.trim() }));
      setSelectedAudience(audienceId);
    } catch (e) { setGenError(e.message || "Generation failed. (Check API Keys/CORS in your environment)."); }
    finally { setGeneratingFor(null); }
  };

  const generateAll = async () => {
    if (!ctx) return;
    for (const id of Object.keys(AUDIENCES)) {
      setGeneratingFor(id);
      try {
        const md = await generateForAudience(ctx, id, instructions[id]);
        setOutputs(o => ({ ...o, [id]: md }));
        setOutputHasCustom(o => ({ ...o, [id]: !!instructions[id]?.trim() }));
      } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
    setGeneratingFor(null);
  };

  const runDiff = async () => {
    if (!ctx || Object.keys(outputs).length < 2) return;
    setDiffLoading(true);
    try { setDiff(await generateDiff(ctx, outputs, instructions)); } catch {}
    setDiffLoading(false);
  };

  const activeAudience = AUDIENCES[selectedAudience];
  const generatedCount = Object.keys(outputs).length;

  return (
    <div className="min-h-screen font-sans text-gray-900 bg-white selection:bg-gray-200">
      
      {/* Header */}
      <div className="flex items-center gap-4 px-8 py-6 bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="flex items-center justify-center w-8 h-8 font-extrabold text-white bg-black rounded-md">
          A
        </div>
        <div>
          <div className="text-lg font-bold tracking-tight">AI Documentation</div>
          <div className="text-xs text-gray-500 font-medium mt-0.5">Targeted READMEs with custom instructions</div>
        </div>
        <div className="flex gap-2 ml-auto">
          {Object.values(AUDIENCES).map(a => (
            <span key={a.id} title={a.label} className={`text-[10px] px-2.5 py-1 rounded-full font-bold transition-all ${
              outputs[a.id] ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'
            }`}>
              {a.icon} {outputHasCustom[a.id] ? "✏" : ""}
            </span>
          ))}
        </div>
      </div>

      <div className="max-w-6xl px-6 py-12 mx-auto">

        {/* URL input */}
        <div className="mb-12">
          <label className="block mb-2 text-xs font-bold tracking-wider text-gray-500 uppercase">Target Repository</label>
          <div className="flex gap-3">
            <input 
              value={url} 
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !fetching && fetchRepo()}
              placeholder="https://github.com/username/repository"
              className="flex-1 px-4 py-3 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
            />
            <button 
              onClick={fetchRepo} 
              disabled={fetching || !url.trim()} 
              className="px-8 py-3 text-sm font-bold text-white transition-all bg-black rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap shadow-md"
            >
              {fetching ? "Scanning..." : "Load Repository"}
            </button>
          </div>
          {fetchError && <div className="mt-2 text-xs font-bold text-red-500">⚠ {fetchError}</div>}
          
          {!ctx && !fetching && (
            <div className="flex items-center gap-3 mt-4">
              <span className="text-xs font-bold text-gray-400">Try examples:</span>
              {["facebook/react", "tiangolo/fastapi", "vercel/next.js"].map(eg => (
                <button key={eg} onClick={() => setUrl(`https://github.com/${eg}`)} className="px-3 py-1 text-xs font-medium text-gray-600 transition-colors bg-gray-100 rounded hover:bg-gray-200">
                  {eg}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Repo loaded */}
        {ctx && (
          <div className="animate-fade-in">
            {/* Repo summary */}
            <div className="flex flex-wrap items-center gap-6 p-6 mb-8 bg-gray-50 border border-gray-200 rounded-xl">
              <div>
                <div className="text-lg font-extrabold tracking-tight text-black">{ctx.owner}/{ctx.name}</div>
                <div className="mt-1 text-sm text-gray-500">{ctx.description || "No description provided."}</div>
              </div>
              <div className="flex flex-wrap gap-2 ml-auto">
                {ctx.languages.map(l => <span key={l} className="px-3 py-1 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-full">{l}</span>)}
                <span className="px-3 py-1 text-xs font-bold text-black bg-white border border-gray-200 rounded-full">★ {ctx.stars}</span>
              </div>
              <div className="w-full flex flex-wrap gap-3 pt-4 border-t border-gray-200">
                {[["Tests", ctx.hasTests], ["CI/CD", ctx.hasCI], ["Docker", ctx.hasDocker], ["Docs", ctx.hasDocs], ["Demo", ctx.hasDemo]].map(([l, ok]) => (
                  <span key={l} className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md border ${ok ? 'bg-black text-white border-black' : 'bg-white text-gray-400 border-gray-200'}`}>
                    {ok ? "✓" : "✗"} {l}
                  </span>
                ))}
              </div>
            </div>

            {/* Main 2-column layout */}
            <div className="grid grid-cols-1 gap-8 md:grid-cols-[300px_1fr] items-start">
              
              {/* Left col: audience selector + actions */}
              <div>
                <div className="mb-4 text-xs font-bold tracking-wider text-gray-500 uppercase">Select Target Audience</div>
                <div className="flex flex-col gap-3 mb-6">
                  {Object.values(AUDIENCES).map(a => (
                    <AudienceCard 
                      key={a.id} audience={a} selected={selectedAudience}
                      onClick={() => setSelectedAudience(a.id)}
                      generated={!!outputs[a.id]} loading={generatingFor === a.id}
                      hasInstructions={!!instructions[a.id]?.trim()} 
                    />
                  ))}
                </div>

                <button 
                  onClick={() => generate(selectedAudience)} disabled={!!generatingFor}
                  className="w-full px-4 py-3 mb-3 text-sm font-bold text-white transition-all bg-black rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-md"
                >
                  {generatingFor === selectedAudience ? `Generating...` : `Generate ${activeAudience.label} Docs`}
                </button>

                <button 
                  onClick={generateAll} disabled={!!generatingFor}
                  className="w-full px-4 py-3 mb-6 text-sm font-bold text-black transition-all bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  {generatingFor ? `Working on ${AUDIENCES[generatingFor]?.label}...` : "⚡ Generate All Four"}
                </button>

                {generatedCount >= 2 && (
                  <button 
                    onClick={runDiff} disabled={diffLoading}
                    className="w-full px-4 py-3 text-sm font-bold text-black transition-all bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 disabled:text-gray-400"
                  >
                    {diffLoading ? "Comparing..." : `🔍 Compare ${generatedCount} versions`}
                  </button>
                )}
                {genError && <div className="mt-4 text-xs font-bold text-red-500">⚠ {genError}</div>}
              </div>

              {/* Right col: instructions + output */}
              <div>
                <InstructionsPanel
                  audience={activeAudience}
                  value={instructions[selectedAudience]}
                  onChange={val => setInstruction(selectedAudience, val)}
                  hasOutput={!!outputs[selectedAudience]}
                />

                <div className="flex items-center gap-3 p-4 mb-4 bg-gray-50 border border-gray-200 rounded-xl">
                  <span className="text-2xl">{activeAudience.icon}</span>
                  <div>
                    <div className="font-bold text-sm text-black">{activeAudience.label} Perspective</div>
                    <div className="text-xs text-gray-500 mt-0.5">{activeAudience.description}</div>
                  </div>
                </div>

                <OutputViewer content={outputs[selectedAudience]} audience={activeAudience} />

                {diff && (
                  <div className="p-6 mt-6 bg-gray-50 border border-gray-200 rounded-xl animate-fade-in">
                    <div className="mb-4 text-xs font-bold tracking-wider text-black uppercase">🔍 Version Comparison</div>
                    <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{diff}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!ctx && !fetching && !fetchError && (
          <div className="py-24 text-center">
            <div className="mb-6 text-5xl">🎯</div>
            <h3 className="mb-4 text-2xl font-extrabold tracking-tight text-black">Same repo. Four different narratives.</h3>
            <p className="max-w-lg mx-auto text-gray-500 leading-relaxed">
              Load a public repository, pick your target audience, add custom context, and automatically generate README documentation that speaks directly to the reader.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}