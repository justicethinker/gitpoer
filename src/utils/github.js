// Cached versions of GitHub API calls to prevent redundant loading
const memCache = new Map();

function getCache(key) {
  const cached = memCache.get(key);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 5) { // 5 min cache
    return cached.data;
  }
  return null;
}

function setCache(key, data) {
  memCache.set(key, { data, timestamp: Date.now() });
}

export function parseUrl(urlStr) {
  if (!urlStr) return null;
  try {
    let clean = urlStr.trim().replace(/\/$/, '');
    if (!clean.startsWith('http')) clean = 'https://' + clean;
    const url = new URL(clean);
    if (url.hostname !== 'github.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch (e) {
    return null;
  }
}

export function parsePrUrl(urlStr) {
  if (!urlStr) return null;
  try {
    let clean = urlStr.trim().replace(/\/$/, '');
    if (!clean.startsWith('http')) clean = 'https://' + clean;
    const url = new URL(clean);
    if (url.hostname !== 'github.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 4 || parts[2] !== 'pull') return null;
    return { owner: parts[0], repo: parts[1], pr: parts[3] };
  } catch (e) {
    return null;
  }
}

export async function ghFetch(path, options = {}) {
  const cacheKey = `ghFetch:${path}`;
  const cached = getCache(cacheKey);
  if (cached && !options.skipCache) return cached;

  const token = import.meta.env.VITE_GITHUB_TOKEN;
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    ...(token && { 'Authorization': `token ${token}` })
  };

  const res = await fetch(`https://api.github.com${path}`, { headers, ...options });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Repository or resource not found (is it private?)');
    if (res.status === 403) throw new Error('GitHub API rate limit exceeded. Add a token to .env.');
    throw new Error(`GitHub API error: ${res.statusText}`);
  }
  
  const data = await res.json();
  setCache(cacheKey, data);
  return data;
}

export async function tryRaw(owner, repo, filePath, branch = 'main') {
  const cacheKey = `raw:${owner}:${repo}:${branch}:${filePath}`;
  const cached = getCache(cacheKey);
  if (cached !== null) return cached;

  try {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    const res = await fetch(url);
    if (!res.ok) {
      setCache(cacheKey, ''); // Cache misses as empty string so we don't retry
      return '';
    }
    const text = await res.text();
    setCache(cacheKey, text);
    return text;
  } catch {
    setCache(cacheKey, '');
    return '';
  }
}

// Complex helper that fetches meta, tree, and languages in one go
export async function fetchRepoContext(owner, repo) {
  const cacheKey = `context:${owner}:${repo}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const meta = await ghFetch(`/repos/${owner}/${repo}`);
  const branch = meta.default_branch || 'main';
  
  const [treeData, langs] = await Promise.all([
    ghFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`).catch(() => ({ tree: [] })),
    ghFetch(`/repos/${owner}/${repo}/languages`).catch(() => ({})),
  ]);

  const files = treeData.tree.filter(t => t.type === 'blob').map(t => t.path);
  
  const result = { meta, branch, files, langs };
  setCache(cacheKey, result);
  return result;
}
