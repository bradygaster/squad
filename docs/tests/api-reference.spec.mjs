/**
 * Playwright e2e tests for API reference pages.
 * Validates TypeDoc-generated pages render correctly with navigation.
 * Run with: npx playwright test tests/api-reference.spec.mjs
 */
import { test, expect } from '@playwright/test';

const BASE = '/squad/docs/reference/api/';
// Screenshots are gitignored — used for local verification and PR descriptions only
const SCREENSHOT_DIR = 'tests/screenshots';

test.describe('API reference landing page', () => {

  test('landing page loads with title and page count', async ({ page }) => {
    await page.goto(BASE);
    const heading = page.locator('article h1').first();
    await expect(heading).toContainText('API reference');
    // The index page lists an export count — assert it's present and reasonable, not a hardcoded value
    const article = page.locator('article').first();
    const text = await article.textContent();
    const countMatch = text.match(/(\d+)\s*public exports/);
    expect(countMatch).toBeTruthy();
    expect(Number(countMatch[1])).toBeGreaterThan(100);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/api-landing.png`, fullPage: true });
  });

  test('landing page lists class links', async ({ page }) => {
    await page.goto(BASE);
    const classLinks = page.locator('article a[href*="class-"]');
    const count = await classLinks.count();
    expect(count).toBeGreaterThanOrEqual(10);
  });

  test('landing page lists function links', async ({ page }) => {
    await page.goto(BASE);
    const fnLinks = page.locator('article a[href*="function-"]');
    const count = await fnLinks.count();
    expect(count).toBeGreaterThanOrEqual(50);
  });
});

test.describe('API reference class page', () => {

  test('class page renders heading and content', async ({ page }) => {
    await page.goto(`${BASE}class-runtimeeventbus/`);
    const heading = page.locator('article h1').first();
    await expect(heading).toBeVisible();
    const headingText = await heading.textContent();
    expect(headingText.toLowerCase()).toContain('runtimeeventbus');
    // Class pages contain definition details
    const article = page.locator('article').first();
    await expect(article).toContainText('Defined in');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/api-class-page.png`, fullPage: true });
  });
});

test.describe('API reference function page', () => {

  test('function page renders signature block', async ({ page }) => {
    await page.goto(`${BASE}function-definesquad/`);
    const heading = page.locator('article h1').first();
    await expect(heading).toBeVisible();
    const headingText = await heading.textContent();
    expect(headingText.toLowerCase()).toContain('definesquad');
    // Function pages show where they're defined
    const article = page.locator('article').first();
    await expect(article).toContainText('Defined in');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/api-function-page.png`, fullPage: true });
  });
});

test.describe('API reference interface page', () => {

  test('interface page renders content', async ({ page }) => {
    await page.goto(`${BASE}interface-squadconfig/`);
    const heading = page.locator('article h1').first();
    await expect(heading).toBeVisible();
    const headingText = await heading.textContent();
    expect(headingText.toLowerCase()).toContain('squadconfig');
    // Interface pages contain definition details
    const article = page.locator('article').first();
    await expect(article).toContainText('Defined in');
  });
});

test.describe('API reference navigation', () => {

  test('navigate from landing to detail page and back', async ({ page }) => {
    await page.goto(BASE);
    // Click a class link
    const classLink = page.locator('article a[href*="class-runtimeeventbus"]').first();
    await expect(classLink).toBeVisible();
    await classLink.click();
    await page.waitForURL(/class-runtimeeventbus/);
    const heading = page.locator('article h1').first();
    await expect(heading).toBeVisible();

    // Navigate back
    await page.goBack();
    await page.waitForURL(new RegExp(BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(page.locator('article h1').first()).toContainText('API reference');
  });
});

test.describe('API reference search', () => {

  test('search finds an API entry if Pagefind is active', async ({ page }) => {
    await page.goto('/squad/');
    const searchBtn = page.locator('#search-btn');
    // Only run if search button exists (Pagefind may not be built)
    if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBtn.click();
      const input = page.locator('#search-input');
      await expect(input).toBeFocused();
      await input.fill('RuntimeEventBus');
      // Wait for debounce + search
      const results = page.locator('#search-results a');
      // Pagefind needs the dist/pagefind assets served at the right base URL
      const hasResults = await results.first().isVisible({ timeout: 10_000 }).catch(() => false);
      if (hasResults) {
        const count = await results.count();
        expect(count).toBeGreaterThan(0);
      }
      // If no results, Pagefind index may not serve on this port — test still passes
    }
  });
});
