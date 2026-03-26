import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4321/squad/docs/reference/api';
const SCREENSHOT_DIR = 'docs/tests/screenshots';

const pages = [
  { slug: '',                               name: 'api-landing',         label: 'API Reference Landing' },
  { slug: '/class-runtimeeventbus',         name: 'api-class',           label: 'Class — RuntimeEventBus' },
  { slug: '/interface-agentcapability',     name: 'api-interface',       label: 'Interface — AgentCapability' },
  { slug: '/function-definesquad',          name: 'api-function',        label: 'Function — defineSquad' },
  { slug: '/typealias-agentref',            name: 'api-typealias',       label: 'Type Alias — AgentRef' },
  { slug: '/variable-default_fallback_chains', name: 'api-variable',    label: 'Variable — DEFAULT_FALLBACK_CHAINS' },
];

try {
  // Ensure screenshot output directory exists
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Verify dev server is running before attempting screenshots
  const healthCheck = await fetch(BASE).catch(() => null);
  if (!healthCheck || !healthCheck.ok) {
    console.error(`❌ Dev server not reachable at ${BASE}. Start it with: npm run docs:dev`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  for (const { slug, name, label } of pages) {
    const url = `${BASE}${slug}`;
    console.log(`📸 ${label}: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` });
  }

  await browser.close();
  console.log(`\n✅ Captured ${pages.length} screenshots`);
} catch (err) {
  console.error('❌ Screenshot capture failed:', err.message);
  process.exit(1);
}
