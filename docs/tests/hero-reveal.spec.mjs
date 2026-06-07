import { test, expect } from '@playwright/test';

// Regression test for the home-page scroll-reveal sections disappearing after a
// View Transitions navigation away from and back to the home page.
//
// Repro steps (matches the reported bug):
//   1. Land on the home page.
//   2. Open search, run a query, click a result (navigates via View Transitions).
//   3. Click the logo to go back home (navigates via View Transitions).
//   4. Scroll the under-hero ".reveal" section into view.
//
// Before the fix the IntersectionObserver that adds `.visible` lived in a module
// `<script>` that only runs once per session, so it never re-ran after the
// View Transition swap and the reveal sections stayed at opacity:0 (invisible).

/** Scroll the first under-hero reveal section into view and report its state. */
async function firstRevealState(page) {
  const section = page.locator('section.reveal').first();
  await section.scrollIntoViewIfNeeded();
  return section;
}

test('home reveal sections animate in on initial load', async ({ page }) => {
  await page.goto('/squad/');
  const section = await firstRevealState(page);
  await expect(section).toHaveClass(/visible/, { timeout: 5000 });
  await expect(section).toHaveCSS('opacity', '1');
});

test('home reveal sections still animate in after navigating away and back', async ({ page }) => {
  await page.goto('/squad/');
  // Make sure the home page hero rendered.
  await expect(page.locator('h1')).toContainText('bring your ideas to life');

  // 1. Open the search modal and run a query.
  await page.locator('#search-btn').click();
  await expect(page.locator('#search-modal')).toBeVisible();
  await page.locator('#search-input').fill('installation');

  // 2. Wait for results and click the first one (navigates via View Transitions).
  const firstResult = page.locator('#search-results a').first();
  await expect(firstResult).toBeVisible({ timeout: 10000 });
  await firstResult.click();

  // We should now be on a docs page, not the home page.
  await page.waitForURL((url) => url.pathname !== '/squad/' && url.pathname.startsWith('/squad/'), { timeout: 10000 });
  await expect(page.locator('h1')).toBeVisible();

  // 3. Click the logo to navigate back to the home page.
  await page.locator('header a[href="/squad/"]').first().click();
  await page.waitForURL('**/squad/', { timeout: 10000 });
  await expect(page.locator('h1')).toContainText('bring your ideas to life');

  // 4. Scroll the under-hero reveal section into view — it must become visible.
  const section = await firstRevealState(page);
  await expect(section).toHaveClass(/visible/, { timeout: 5000 });
  await expect(section).toHaveCSS('opacity', '1');
});

test('home reveal sections animate in when reaching home via View Transition', async ({ page }) => {
  // Start on a docs page (full load) so the home page script is only ever loaded
  // during the client-side View Transition to home — the trickiest timing path.
  await page.goto('/squad/docs/get-started/installation/');
  await expect(page.locator('h1')).toBeVisible();

  await page.locator('header a[href="/squad/"]').first().click();
  await page.waitForURL('**/squad/', { timeout: 10000 });
  await expect(page.locator('h1')).toContainText('bring your ideas to life');

  const section = await firstRevealState(page);
  await expect(section).toHaveClass(/visible/, { timeout: 5000 });
  await expect(section).toHaveCSS('opacity', '1');
});
