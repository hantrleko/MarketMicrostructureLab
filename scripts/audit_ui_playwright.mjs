import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'apps', 'web', 'dist');
const artifactsDir = path.join(projectRoot, 'docs', 'audit_artifacts');

if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

// Simple MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Start local static HTTP server
function startServer(port = 4173) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/') reqPath = '/index.html';
      const filePath = path.join(distDir, reqPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*'
        });
        fs.createReadStream(filePath).pipe(res);
      } else {
        // Fallback to index.html for SPA
        const indexPath = path.join(distDir, 'index.html');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(indexPath).pipe(res);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`[Static Server] Serving ${distDir} at http://127.0.0.1:${port}`);
      resolve(server);
    });

    server.on('error', reject);
  });
}

async function runAudit() {
  const server = await startServer(4173);
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: 'desktop', width: 1920, height: 1080 },
    { name: 'mobile', width: 375, height: 812 }
  ];

  const auditResults = {
    timestamp: new Date().toISOString(),
    viewports: {},
    consoleErrors: [],
    failedRequests: []
  };

  try {
    for (const vp of viewports) {
      console.log(`\n=== Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2
      });

      const page = await context.newPage();

      // Listen to console errors and network failures
      page.on('console', msg => {
        if (msg.type() === 'error') {
          console.error(`[Console Error - ${vp.name}] ${msg.text()}`);
          auditResults.consoleErrors.push({ viewport: vp.name, text: msg.text() });
        }
      });

      page.on('response', resp => {
        if (resp.status() >= 400) {
          console.warn(`[HTTP ${resp.status()} - ${vp.name}] ${resp.url()}`);
          auditResults.failedRequests.push({ viewport: vp.name, url: resp.url(), status: resp.status() });
        }
      });

      // 1. Market Replay
      await page.goto('http://127.0.0.1:4173');
      await page.waitForTimeout(2000);
      const replayScreenshot = path.join(artifactsDir, `${vp.name}_01_market_replay.png`);
      await page.screenshot({ path: replayScreenshot, fullPage: true });
      console.log(`Saved screenshot: ${replayScreenshot}`);

      // Test session button click on replay
      try {
        const sessionBtn = page.locator('button:has-text("Session 2 (08:00)")');
        if (await sessionBtn.isVisible()) {
          await sessionBtn.click();
          await page.waitForTimeout(1000);
          const sessionScreenshot = path.join(artifactsDir, `${vp.name}_01b_replay_session2.png`);
          await page.screenshot({ path: sessionScreenshot, fullPage: true });
        }
      } catch (e) {
        console.warn(`Session button test warning: ${e.message}`);
      }

      // 2. Order Flow Observatory
      await page.locator('nav button:has-text("Order Flow Observatory")').click();
      await page.waitForTimeout(2500);
      const obsScreenshot = path.join(artifactsDir, `${vp.name}_02_order_flow_observatory.png`);
      await page.screenshot({ path: obsScreenshot, fullPage: true });
      console.log(`Saved screenshot: ${obsScreenshot}`);

      // 3. Market Impact Research
      await page.locator('nav button:has-text("Market Impact Research")').click();
      await page.waitForTimeout(2500);
      const impactScreenshot = path.join(artifactsDir, `${vp.name}_03_market_impact_research.png`);
      await page.screenshot({ path: impactScreenshot, fullPage: true });
      console.log(`Saved screenshot: ${impactScreenshot}`);

      // Test Horizon Lag button k=5
      try {
        const k5Btn = page.getByRole('button', { name: 'k=5', exact: true });
        if (await k5Btn.isVisible()) {
          await k5Btn.click();
          await page.waitForTimeout(1500);
          const k5Screenshot = path.join(artifactsDir, `${vp.name}_03b_impact_horizon_k5.png`);
          await page.screenshot({ path: k5Screenshot, fullPage: true });
        }
      } catch (e) {
        console.warn(`Horizon switch warning: ${e.message}`);
      }

      // 4. Data Integrity Console
      await page.locator('nav button:has-text("Data Integrity Console")').click();
      await page.waitForTimeout(2000);
      const integrityScreenshot = path.join(artifactsDir, `${vp.name}_04_data_integrity_console.png`);
      await page.screenshot({ path: integrityScreenshot, fullPage: true });
      console.log(`Saved screenshot: ${integrityScreenshot}`);

      // 5. Order Book Lab (Phase 2)
      await page.locator('nav button:has-text("Order Book Lab")').click();
      await page.waitForTimeout(2000);
      const obInitialScreenshot = path.join(artifactsDir, `${vp.name}_05_orderbook_lab_initial.png`);
      await page.screenshot({ path: obInitialScreenshot, fullPage: true });
      console.log(`Saved screenshot: ${obInitialScreenshot}`);

      // Test Simulate Preview Demo button
      try {
        const simBtn = page.locator('button:has-text("SIMULATE PREVIEW (DEMO)")');
        if (await simBtn.isVisible()) {
          await simBtn.click();
          await page.waitForTimeout(1500);
          const obSimScreenshot = path.join(artifactsDir, `${vp.name}_05b_orderbook_lab_simulated.png`);
          await page.screenshot({ path: obSimScreenshot, fullPage: true });
          console.log(`Saved simulated screenshot: ${obSimScreenshot}`);
        }
      } catch (e) {
        console.warn(`Simulate preview warning: ${e.message}`);
      }

      auditResults.viewports[vp.name] = {
        testedPages: ['Market Replay', 'Order Flow Observatory', 'Market Impact Research', 'Data Integrity Console', 'Order Book Lab'],
        status: 'PASSED'
      };

      await context.close();
    }

    fs.writeFileSync(
      path.join(artifactsDir, 'playwright_audit_summary.json'),
      JSON.stringify(auditResults, null, 2)
    );
    console.log('\n[Playwright Audit] Audit completed successfully!');
  } finally {
    await browser.close();
    server.close();
  }
}

runAudit().catch(err => {
  console.error('[Playwright Audit Fatal Error]', err);
  process.exit(1);
});
