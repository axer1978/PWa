import { expect, test } from '@playwright/test';

test('healthz reports ok', async ({ request }) => {
	const res = await request.get('/healthz');
	expect(res.status()).toBe(200);
	expect(await res.json()).toEqual({ status: 'ok' });
	expect(res.headers()['cache-control']).toBe('no-store');
});

test('pages carry a strict CSP from SvelteKit', async ({ request }) => {
	const csp = (await request.get('/')).headers()['content-security-policy'] ?? '';
	expect(csp).toContain("default-src 'self'");
	expect(csp).toContain("frame-ancestors 'none'");
	expect(csp).toMatch(/script-src 'self'( 'sha256-[^']+')+/);
});

test('Caddy adds the security headers', async ({ request, baseURL }) => {
	test.skip(!baseURL?.startsWith('https://'), 'only meaningful through Caddy');
	const headers = (await request.get('/healthz')).headers();
	expect(headers['referrer-policy']).toBe('same-origin');
	expect(headers['x-content-type-options']).toBe('nosniff');
	expect(headers['strict-transport-security']).toMatch(/^max-age=\d+/);
	expect(headers['server']).toBeUndefined();
});
