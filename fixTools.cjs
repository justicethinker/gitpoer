const fs = require('fs');
const path = require('path');

const toolsDir = path.join(__dirname, 'src', 'tools');
const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.jsx'));

for (const file of files) {
  const filePath = path.join(toolsDir, file);
  let code = fs.readFileSync(filePath, 'utf8');

  // 1. Remove the broken injected useEffect
  const brokenEffectRegex = /\s*useEffect\(\(\) => \{\s*if \(owner && repo\) (handleScan|loadRepo|checkRepo)\(\);\s*\}, \[owner, repo, (handleScan|loadRepo|checkRepo)\]\);\s*/g;
  code = code.replace(brokenEffectRegex, '\n');

  // Find which function this file uses
  const scanFnMatch = code.match(/const (handleScan|loadRepo|checkRepo) =/);
  const scanFnMatchFunc = code.match(/async function (handleScan|loadRepo|checkRepo)\(\)/);
  const fnName = scanFnMatch ? scanFnMatch[1] : (scanFnMatchFunc ? scanFnMatchFunc[1] : null);

  if (fnName) {
    // 2. Inject the correct useEffect right AFTER the scan function definition finishes, or just before the render section.
    // The safest place is just before the "return (" of the MAIN component.
    // We can find the main component's return by looking for "// ── Render" or "// ─── Render"
    
    const correctEffect = `
  // Auto-load repo on mount (fixed)
  useEffect(() => {
    if (owner && repo) {
      ${fnName}();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
`;

    // Try to replace "// ── Render" or "// ─── Render"
    if (code.includes('// ── Render')) {
      code = code.replace('// ── Render', correctEffect + '\n  // ── Render');
    } else if (code.includes('// ─── Render')) {
      code = code.replace('// ─── Render', correctEffect + '\n  // ─── Render');
    } else {
      // Fallback: inject before the FIRST `const hasOutput =` or `return (` after `export default function`
      // This is trickier, but we can just find the export default function and inject at the top of it, 
      // but we have to call it in a useEffect so it doesn't matter where it is inside the component, as long as it's inside.
      // Wait, we can't inject at the top of the component because fnName might be used before it's defined (if it's a const).
      // So we inject after the fnName declaration.
      
      const fnDecl = scanFnMatch ? scanFnMatch[0] : scanFnMatchFunc[0];
      // Let's just find the closing brace of the scan function? Hard with regex.
      // Easiest fallback: look for `const color =` or `const grade =`
      if (code.includes('const color =')) {
        code = code.replace('const color =', correctEffect + '\n  const color =');
      }
    }
  }

  // Also fix missing imports for useRef if needed, but we used [] so we don't need useRef.
  
  fs.writeFileSync(filePath, code);
  console.log(`Fixed ${file}`);
}
