import { expect, test } from '@playwright/test';

// Mechanical checks of the DESIGN.md rules on every pre-gate page: 375px with
// no sideways scroll, ≥ 44px tap targets, one h1, visible focus.
const PAGES = [
	'/',
	'/pricing',
	'/login',
	'/legal/terms',
	'/legal/privacy',
	'/legal/age',
	'/unavailable'
];

test.describe('pre-gate pages at 375px', () => {
	test.use({ viewport: { width: 375, height: 740 } });

	for (const path of PAGES) {
		test(`${path} fits, has one h1, and has 44px tap targets`, async ({ page }) => {
			await page.goto(path);
			await expect(page.locator('h1')).toHaveCount(1);

			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(0);

			// Inline links inside running text are exempt (WCAG 2.5.8 inline exception).
			const small = await page.$$eval('a, button, input', (els) =>
				els
					.filter((el) => !el.closest('p, dd, .skip') && (el as HTMLElement).offsetParent !== null)
					.map((el) => ({
						text: el.textContent?.trim() || el.getAttribute('name'),
						h: el.getBoundingClientRect().height
					}))
					.filter((b) => b.h < 44)
			);
			expect(small, 'tap targets under 44px').toEqual([]);
		});
	}

	test('keyboard focus is visible', async ({ page, browserName }) => {
		test.skip(browserName === 'webkit', 'WebKit only tabs to links with a system setting enabled');
		await page.goto('/login');
		await page.keyboard.press('Tab'); // skip link
		await page.keyboard.press('Tab'); // wordmark
		const outline = await page.evaluate(() => {
			const el = document.activeElement as HTMLElement;
			const s = getComputedStyle(el);
			return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
		});
		expect(outline.style).toBe('solid');
		expect(outline.width).toBeGreaterThanOrEqual(2);
	});
});

test('unknown paths are gated too: signed-out visitors go to sign-in, not a 404', async ({
	page
}) => {
	// Default-deny also means the app never reveals which paths exist.
	await page.goto('/legal/nope');
	expect(page.url()).toMatch(/\/login\?next=%2Flegal%2Fnope$/);
});
