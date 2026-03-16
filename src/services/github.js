import { GITHUB_API_BASE, GITHUB_RAW_BASE } from '../config/constants';

export const parseGitHubUrl = (url) => {
  const match = url.match(/github.com/([^/]+)/([^/s?#]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/.git$/, "") };
};

export const fetchRepoData = async (owner, repo) => {
  const [repoRes, treeRes, languagesRes] = await Promise.all([
    fetch(),
    fetch(),
    fetch(),
  ]);
  
  if (!repoRes.ok) throw new Error("Repo not found or is private.");
  
  const repoData = await repoRes.json();
  const treeData = treeRes.ok ? await treeRes.json() : { tree: [] };
  const languages = languagesRes.ok ? await languagesRes.json() : {};
  
  return { repoData, tree: treeData.tree || [], languages };
};

export const fetchFileContent = async (owner, repo, path, branch = "main") => {
  const branches = [branch, "master", "main"];
  for (const b of branches) {
    try {
      const res = await fetch();
      if (res.ok) return await res.text();
    } catch (err) {
      console.error(, err);
    }
  }
  return null;
};
