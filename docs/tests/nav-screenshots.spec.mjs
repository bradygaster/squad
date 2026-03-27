/**
 * Playwright screenshot tests for nav sub-grouping (issue #62, P2).
 *
 * Captures BEFORE / AFTER screenshots of the Features sidebar so Brady
 * can visually verify the category-header treatment.
 *
 * Usage:
 *   1. Build the docs site:  cd docs && npm run build
 *   2. Start preview server: cd docs && npx astro preview
 *   3. Run the test:         cd docs && npx playwright test tests/nav-screenshots.spec.mjs
 *
 * Playwright is already installed (@playwright/test ^1.58.2 in docs/).
 * If browsers are missing, run:  npx playwright install
 */

import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = '/squad/';
const SCREENSHOTS_DIR = join(__dirname, '..', 'screenshots');

test.beforeAll(() => {
  if (!existsSync(SCREENSHOTS_DIR)) {
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
});

test.describe('Nav sub-grouping — BEFORE / AFTER screenshots', () => {
  test('capture BEFORE screenshot of Features sidebar', async ({ page }) => {
    // Navigate to a Features page so the sidebar is open with Features expanded
    await page.goto(`${BASE}docs/features/team-setup/`);
    await page.waitForLoadState('networkidle');

    // Locate the sidebar
    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeVisible();

    // Full sidebar screenshot
    await sidebar.screenshot({
      path: join(SCREENSHOTS_DIR, 'nav-before.png'),
    });

    // Also take a full-page screenshot for extra context
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'nav-before-fullpage.png'),
      fullPage: true,
    });
  });

  /**
   * AFTER screenshot — uncomment (remove .skip) once the nav sub-grouping
   * changes are applied to navigation.ts and Sidebar.astro.
   * The test is identical except it saves to nav-after.png for visual diff.
   */
  test('capture AFTER screenshot of Features sidebar', async ({ page }) => {
    await page.goto(`${BASE}docs/features/team-setup/`);
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeVisible();

    await sidebar.screenshot({
      path: join(SCREENSHOTS_DIR, 'nav-after.png'),
    });

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'nav-after-fullpage.png'),
      fullPage: true,
    });
  });
});
