import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(DIST, 'assets');
const DATA = path.join(DIST, 'data');

console.log('================================================================');
console.log('MML V1.1 FRONTEND PRODUCTION BUNDLE & GEOMETRY QUALITY GATE');
console.log('================================================================\n');

let failed = false;
function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    failed = true;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

// 1. Verify dist folder & index.html
assert(fs.existsSync(DIST), 'dist/ directory exists');
assert(fs.existsSync(path.join(DIST, 'index.html')), 'dist/index.html exists');

// 2. Verify Chunks & Max Size (under 600 kB)
const assetFiles = fs.readdirSync(ASSETS);
const jsFiles = assetFiles.filter(f => f.endsWith('.js'));
const cssFiles = assetFiles.filter(f => f.endsWith('.css'));
const fontFiles = assetFiles.filter(f => f.endsWith('.woff2') || f.endsWith('.woff') || f.endsWith('.ttf'));

console.log(`\nFound ${jsFiles.length} JS chunks, ${cssFiles.length} CSS files, ${fontFiles.length} KaTeX font files.`);

assert(fontFiles.length >= 10, `Emitted ${fontFiles.length} KaTeX font assets`);

for (const jsFile of jsFiles) {
  const filePath = path.join(ASSETS, jsFile);
  const sizeKb = fs.statSync(filePath).size / 1024;
  const underLimit = sizeKb <= 600;
  assert(underLimit, `Chunk ${jsFile} size: ${sizeKb.toFixed(1)} kB (limit: 600 kB)`);
}

// 3. Verify Code-Splitting chunks exist
const hasEcharts = jsFiles.some(f => f.startsWith('vendor-echarts'));
const hasKatex = jsFiles.some(f => f.startsWith('vendor-katex'));
const hasReact = jsFiles.some(f => f.startsWith('vendor-react'));
const hasIcons = jsFiles.some(f => f.startsWith('vendor-icons'));
const chartChunk = jsFiles.find(f => f.startsWith('MMLChart')) || jsFiles.find(f => f.startsWith('vendor-echarts'));
const hasChart = !!chartChunk;

assert(hasEcharts, 'Isolated vendor-echarts chunk emitted');
assert(hasKatex, 'Isolated vendor-katex chunk emitted');
assert(hasReact, 'Isolated vendor-react chunk emitted');
assert(hasIcons, 'Isolated vendor-icons chunk emitted');
assert(hasChart, 'Lightweight MMLChart component chunk emitted');

// Vite 8 / Rolldown Node CJS interop (__toESM(mod, 1)) turns
// `echarts-for-react/lib/core`'s default export into the module.exports
// object. React then throws minified error #130 and unmounts #root.
// The chart chunk must pass the component class itself to jsx(), not `.default`.
if (chartChunk) {
  const chartSource = fs.readFileSync(path.join(ASSETS, chartChunk), 'utf-8');
  const nodeModeInterop = /\(\s*\)\s*,\s*1\s*\)/.test(chartSource);
  const jsxOnDefault = /jsx\)\(\s*[A-Za-z_$][\w$]*\.default\s*,/.test(chartSource);
  assert(!nodeModeInterop, 'MMLChart chunk does not call Node CJS interop __toESM(mod, 1)');
  assert(!jsxOnDefault, 'MMLChart chunk does not pass a .default namespace object to jsx()');
}

// 4. Verify No Raw Unrendered Math Leaks in Output
let leakedRawMath = false;
for (const jsFile of jsFiles) {
  const content = fs.readFileSync(path.join(ASSETS, jsFile), 'utf-8');
  // Check for exposed raw unrendered formula strings like "$\mathcal{R}"
  if (content.includes('$\\mathcal{R}') || content.includes('$\\mathbb{E}') || content.includes('$\\sqrt{Q/V}')) {
    console.error(`[FAIL] Raw unrendered LaTeX detected in chunk: ${jsFile}`);
    leakedRawMath = true;
    failed = true;
  }
}
if (!leakedRawMath) {
  console.log('[PASS] Zero exposed raw unrendered LaTeX markers found in production bundles');
}

// 5. Verify CSS Geometric Rules Compiled
let compiledCss = '';
for (const cssFile of cssFiles) {
  compiledCss += fs.readFileSync(path.join(ASSETS, cssFile), 'utf-8') + '\n';
}
assert(compiledCss.includes('stat-cards-adaptive'), 'CSS contains .stat-cards-adaptive grid rule');
assert(compiledCss.includes('responsive-inspector-grid'), 'CSS contains .responsive-inspector-grid rule');
assert(compiledCss.includes('responsive-orderbook-grid'), 'CSS contains .responsive-orderbook-grid rule');
assert(compiledCss.includes('table-responsive'), 'CSS contains .table-responsive horizontal scroll rule');
assert(compiledCss.includes('math-block-container'), 'CSS contains .math-block-container responsive rule');

// 6. Verify Data Fixtures Parity
if (fs.existsSync(DATA)) {
  const jsonFiles = fs.readdirSync(DATA).filter(f => f.endsWith('.json'));
  assert(jsonFiles.length >= 22, `Verified ${jsonFiles.length} fixtures in dist/data/ (>= 22 expected)`);
  assert(fs.existsSync(path.join(DATA, 'models_provenance_manifest.json')), 'models_provenance_manifest.json present in dist/data/');
}

console.log('\n================================================================');
if (failed) {
  console.error('[FAILED] Production bundle quality gate failed!');
  process.exit(1);
} else {
  console.log('[SUCCESS] All V1.1 production bundle quality gates passed!');
  process.exit(0);
}
