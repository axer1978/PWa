import { expect, test } from '@playwright/test';

// The local harness blocks the reserved code "ZZ" and trusts X-Country-Code
// directly. Behind Caddy the header is stripped from clients, so this suite
// needs direct app access (E2E_GEO_URL) when run against the compose stack.
const geoURL = process.env.E2E_GEO_URL ?? (process.env.E2E_BASE_URL ? undefined : '');
test.skip(geoURL === undefined, 'set E2E_GEO_URL to the app port to run geo tests via compose');

const BLOCKED = { 'X-Country-Code': 'ZZ' };

test.describe('geo-blocking', () => {
	test.use({ extraHTTPHeaders: BLOCKED });

	test('a blocked country lands on the neutral page with HTTP 451', async ({ page }) => {
		const res = await page.goto(`${geoURL}/`);
		expect(page.url()).toMatch(/\/unavailable$/);
		expect(res?.status()).toBe(451);
		await expect(page.getByRole('heading', { name: 'Not available here' })).toBeVisible();
		// A dead end: no way into sign-in or anything else.
		await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
	});

	test('a blocked country never reaches sign-in, the age check or content', async ({ page }) => {
		for (const path of [
			'/login',
			'/auth/verify?token=x',
			'/verify-age',
			'/account',
			'/library',
			'/pricing'
		]) {
			await page.goto(`${geoURL}${path}`);
			expect(page.url(), path).toMatch(/\/unavailable$/);
		}
	});

	test('a blocked country cannot request a sign-in link', async ({ request }) => {
		const res = await request.post(`${geoURL}/login`, {
			form: { email: 'blocked@example.com' },
			headers: { origin: new URL(`${geoURL}/`, 'http://localhost:4173').origin, ...BLOCKED }
		});
		expect(res.status()).toBe(451);
	});
});

test('other countries are not affected', async ({ page }) => {
	await page.setExtraHTTPHeaders({ 'X-Country-Code': 'AA' });
	await page.goto(`${geoURL}/login`);
	await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
