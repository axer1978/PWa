import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { accessFor, safeNext, type Access } from '../../src/lib/server/access';

const ROUTES = resolve(import.meta.dirname, '../../src/routes');

/**
 * Every route and the access level it must have. Adding a route without adding
 * it here fails the first test, so opening something up is always deliberate.
 * Parameterised routes list the concrete paths to check.
 */
const EXPECTED: Record<string, { access: Access; paths?: string[] }> = {
	'/': { access: 'public' },
	'/pricing': { access: 'public' },
	'/legal/[doc]': { access: 'public', paths: ['/legal/terms', '/legal/privacy', '/legal/age'] },
	'/login': { access: 'public' },
	'/logout': { access: 'public' },
	'/auth/verify': { access: 'public' },
	'/unavailable': { access: 'public' },
	'/healthz': { access: 'public' },
	'/account': { access: 'auth' },
	'/verify-age': { access: 'auth' },
	'/library': { access: 'verified' }
};

function routeIds(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) routeIds(full, out);
		else if (/^\+(page|server)\.(svelte|ts|js)$|^\+page\.server\.ts$/.test(entry.name)) {
			const rel = relative(ROUTES, dir).split(sep).join('/');
			// Route groups like (app) don't appear in URLs.
			const id = `/${rel}`.replace(/\/\([^)]+\)/g, '') || '/';
			if (!out.includes(id)) out.push(id);
		}
	}
	return out;
}

describe('route access policy', () => {
	const found = routeIds(ROUTES).sort();

	it('every route in src/routes has an explicit expected access level', () => {
		const missing = found.filter((id) => !(id in EXPECTED));
		expect(missing, 'add these routes to EXPECTED in access.test.ts').toEqual([]);
		const stale = Object.keys(EXPECTED).filter((id) => !found.includes(id));
		expect(stale, 'these routes no longer exist').toEqual([]);
	});

	it.each(Object.entries(EXPECTED))('%s is %o', (id, { access, paths }) => {
		for (const path of paths ?? [id]) {
			expect(accessFor(path), path).toBe(access);
			if (path !== '/') expect(accessFor(`${path}/`), `${path}/`).toBe(access);
		}
	});

	it.each([
		'/api/play/demo-free/clips',
		'/media/demo-free-intro.opus',
		'/play/demo-free',
		'/Library',
		'/legal/anything-else',
		'/pricing/extra',
		'/account/../library',
		'/totally-new-route'
	])('defaults to verified for %s (default-deny)', (path) => {
		expect(accessFor(path)).toBe('verified');
	});

	it('treats build assets as public', () => {
		expect(accessFor('/_app/immutable/entry/start.js')).toBe('public');
	});
});

describe('safeNext (open-redirect guard)', () => {
	it.each([
		['/library', '/library'],
		['/play/x?resume=1', '/play/x?resume=1'],
		['//evil.example', undefined],
		['/\\evil.example', undefined],
		['https://evil.example/', undefined],
		['javascript:alert(1)', undefined],
		['library', undefined],
		['', undefined],
		[null, undefined]
	])('%s → %s', (input, expected) => {
		expect(safeNext(input)).toBe(expected);
	});
});
