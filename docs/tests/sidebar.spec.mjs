/**
 * Playwright e2e tests for docs sidebar behavior.
 */
import { test, expect } from '@playwright/test';

const START = '/squad/docs/get-started/five-minute-start/';
const TARGET = '/squad/docs/scenarios/ci-cd-integration/';

test.describe('Docs sidebar navigation', () => {
  test('keeps the sidebar scroll position when opening another article', async ({ page }) => {
    await page.goto(START);

    await page.evaluate(() => sessionStorage.removeItem('squad-docs-sidebar-scroll'));

    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeVisible();

    await page.evaluate(() => {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar) {
        throw new Error('Sidebar not found');
      }

      sidebar.scrollTop = 900;
      sidebar.dispatchEvent(new Event('scroll'));
      window.scrollTo(0, 1000);
    });

    const initialSidebarScroll = await page.evaluate(() => {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar) {
        throw new Error('Sidebar not found');
      }

      return sidebar.scrollTop;
    });

    expect(initialSidebarScroll).toBeGreaterThan(0);

    await page.evaluate((targetHref) => {
      const link = document.querySelector(`#sidebar a[href="${targetHref}"]`)
        ?? document.querySelector('#sidebar a[href*="docs/scenarios/ci-cd-integration/"]');

      if (!(link instanceof HTMLAnchorElement)) {
        throw new Error('Target sidebar link not found');
      }

      link.click();
    }, TARGET);

    await page.waitForURL(new RegExp(TARGET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await page.waitForTimeout(100);

    const restoredSidebarScroll = await page.evaluate(() => {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar) {
        throw new Error('Sidebar not found');
      }

      return sidebar.scrollTop;
    });

    const pageScroll = await page.evaluate(() => window.scrollY);

    expect(pageScroll).toBeLessThan(20);
    expect(Math.abs(restoredSidebarScroll - initialSidebarScroll)).toBeLessThan(10);
  });
});
