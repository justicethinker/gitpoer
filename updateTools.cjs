const fs = require('fs');
const path = require('path');

const toolsDir = path.join(__dirname, 'src', 'tools');
const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.jsx'));

for (const file of files) {
  const filePath = path.join(toolsDir, file);
  let code = fs.readFileSync(filePath, 'utf8');

  // 1. Add useParams import if missing
  if (!code.includes('useParams')) {
    code = code.replace(/import \{([^}]+)\} from 'react-router-dom';/g, "import { $1, useParams } from 'react-router-dom';");
    if (!code.includes('useParams')) {
      code = code.replace(/import \{([^}]+)\} from 'react';/, "import { $1 } from 'react';\nimport { useParams } from 'react-router-dom';");
    }
  }

  // 2. Remove UrlInput component rendering
  code = code.replace(/<UrlInput[\s\S]*?\/>/g, '');

  // 3. Update the component body to grab owner/repo and auto-set url
  const componentMatch = code.match(/export default function \w+\(\) \{/);
  if (componentMatch) {
    const injectStr = `
  const { owner, repo } = useParams();
`;
    // Ensure we don't inject twice
    if (!code.includes('const { owner, repo } = useParams();')) {
      code = code.replace(componentMatch[0], componentMatch[0] + injectStr);
    }
    
    // Change const [url, setUrl] = useState(''); to prefill the URL
    code = code.replace(
      /const \[url, setUrl\] = useState\((?:''|"")\);/, 
      "const [url, setUrl] = useState(`https://github.com/${owner}/${repo}`);"
    );
  }

  // 4. Add useEffect to auto-trigger handleScan/loadRepo on mount
  // Some tools use handleScan, some use loadRepo, some use checkRepo
  const scanFnMatch = code.match(/const (handleScan|loadRepo|checkRepo) = /);
  if (scanFnMatch && !code.includes('useEffect(() => {')) {
    const fnName = scanFnMatch[1];
    // Find the return statement to inject just before it
    const returnRegex = /return \(/;
    const useEffectStr = `
  // Auto-load repo on mount
  import { useEffect as UseEffectAlias } from 'react'; // inline import hack
  UseEffectAlias(() => {
    if (url) ${fnName}();
  }, [url, ${fnName}]);

  `;
    // We can just find the last `return (` but it's safer to inject right after the function definition or before `const hasOutput`.
    // Actually, injecting just before `return (` works if we do the last one in the main component.
    // Let's use a simpler approach: hook it into an existing react import and use regular useEffect
    if (!code.includes('useEffect')) {
       code = code.replace(/import \{([^}]+)\} from 'react';/, "import { $1, useEffect } from 'react';");
    }
    
    const effectInject = `
  useEffect(() => {
    if (owner && repo) ${fnName}();
  }, [owner, repo, ${fnName}]);
`;
    // Inject right before `return (`
    const lastReturnIndex = code.lastIndexOf('return (');
    if (lastReturnIndex !== -1 && !code.includes('if (owner && repo)')) {
      code = code.slice(0, lastReturnIndex) + effectInject + code.slice(lastReturnIndex);
    }
  }

  // 5. Hide the top header text that says "Paste a GitHub repo URL..."
  code = code.replace(/Paste a GitHub repo URL/g, 'Analyzing repository');

  // Fix: some components have `import { useState }` and we might have broken it, ensure `useEffect` is there
  if (code.includes('import { useState }') && !code.includes('useEffect')) {
    code = code.replace('import { useState }', 'import { useState, useEffect }');
  }

  fs.writeFileSync(filePath, code);
  console.log(`Updated ${file}`);
}
