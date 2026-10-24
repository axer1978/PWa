import { isRedirect, type Cookies, type RequestEvent } from '@sveltejs/kit';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	SESSION_COOKIE,
	createSession,
	upsertUserByEmail,
	type SessionUser
} from '../../src/lib/server/auth/session';
import type { GeoPolicy } from '../../src/lib/server/config/env-schema';
import type { Db } from '../../src/lib/server/db';
import { sessions, users } from '../../src/lib/server/db/schema';
import {
	createGeoHandle,
	createSessionHandle,
	gateDecision,
	gateHandle
} from '../../src/lib/server/hooks';
import { createTestDb } from '../helpers/test-db';

function fakeCookies(initial: Record<string, string> = {}) {
	const jar = new Map(Object.entries(initial));
	return {
		jar,
		get: (name: string) => jar.get(name),
		set: (name: string, value: string) => void jar.set(name, value),
		delete: (name: string) => void jar.delete(name)
	} as unknown as Cookies & { jar: Map<string, string> };
}

function event(
	path: string,
	opts: {
		method?: string;
		accept?: string;
		headers?: Record<string, string>;
		ip?: string;
		user?: SessionUser | null;
		cookies?: Record<string, string>;
	} = {}
) {
	const headers = new Headers(opts.headers);
	if (opts.accept ?? 'text/html') headers.set('accept', opts.accept ?? 'text/html');
	return {
		url: new URL(path, 'https://app.test'),
		request: new Request(new URL(path, 'https://app.test'), {
			method: opts.method ?? 'GET',
			headers
		}),
		locals: { user: opts.user ?? null } as App.Locals,
		cookies: fakeCookies(opts.cookies),
		isDataRequest: false,
		getClientAddress: () => opts.ip ?? '203.0.113.7'
	} as unknown as RequestEvent;
}

const ok = () => vi.fn(async () => new Response('ok', { status: 200 }));

async function outcome(run: () => Promise<Response>) {
	try {
		const res = await run();
		return {
			status: res.status,
			body: await res.text(),
			location: undefined as string | undefined
		};
	} catch (e) {
		if (isRedirect(e)) return { status: e.status, body: '', location: e.location };
		throw e;
	}
}

const anon = null;
const unverified: SessionUser = { id: 'u1', email: 'a@example.com', avVerified: false };
const verified: SessionUser = { ...unverified, avVerified: true };

describe('gate', () => {
	it.each([
		['/library', anon, true, { redirectTo: '/login?next=%2Flibrary' }],
		['/account', anon, true, { redirectTo: '/login?next=%2Faccount' }],
		['/verify-age', anon, true, { redirectTo: '/login?next=%2Fverify-age' }],
		['/library', unverified, true, { redirectTo: '/verify-age?next=%2Flibrary' }],
		['/api/play/x', anon, false, { status: 401 }],
		['/api/play/x', unverified, false, { status: 403 }],
		['/media/clip.opus', unverified, false, { status: 403 }]
	] as const)('%s for %o (page=%s) is denied', (path, user, page, expected) => {
		const d = gateDecision(new URL(path, 'https://app.test'), user, page);
		expect(d).toMatchObject({ allow: false, ...expected });
	});

	it.each([
		['/', anon],
		['/pricing', anon],
		['/login', anon],
		['/account', unverified],
		['/verify-age', unverified],
		['/library', verified],
		['/api/play/x', verified]
	] as const)('%s is allowed for %o', (path, user) => {
		expect(gateDecision(new URL(path, 'https://app.test'), user, true)).toEqual({ allow: true });
	});

	it('keeps the query string in next', () => {
		const d = gateDecision(new URL('/play/x?from=a', 'https://app.test'), anon, true);
		expect(d).toMatchObject({ redirectTo: '/login?next=%2Fplay%2Fx%3Ffrom%3Da' });
	});

	it('the handle redirects pages, answers API calls with a status, and never resolves', async () => {
		const resolve = ok();
		const page = await outcome(
			() => gateHandle({ event: event('/library'), resolve }) as Promise<Response>
		);
		expect(page).toMatchObject({ status: 303, location: '/login?next=%2Flibrary' });
		const api = await outcome(
			() =>
				gateHandle({
					event: event('/api/x', { accept: 'application/json' }),
					resolve
				}) as Promise<Response>
		);
		expect(api.status).toBe(401);
		expect(resolve).not.toHaveBeenCalled();
	});
});

describe('geo-blocking', () => {
	const policy = (over: Partial<GeoPolicy> = {}): GeoPolicy => ({
		blocked: new Set(['ZZ']),
		unknown: 'allow',
		header: 'x-country-code',
		...over
	});
	const handle = (p: GeoPolicy, reader?: { lookup: (ip: string) => string | undefined }) =>
		createGeoHandle({ policy: () => p, reader: () => reader });

	// The age gate, login and content must never run for a blocked visitor.
	const PRE_GATE_AND_CONTENT = [
		'/',
		'/login',
		'/auth/verify?token=x',
		'/verify-age',
		'/account',
		'/library',
		'/pricing'
	];

	it.each(PRE_GATE_AND_CONTENT)('a blocked country never reaches %s', async (path) => {
		const resolve = ok();
		const r = await outcome(
			() =>
				handle(policy())({
					event: event(path, { headers: { 'x-country-code': 'zz' } }),
					resolve
				}) as Promise<Response>
		);
		expect(r).toMatchObject({ status: 303, location: '/unavailable' });
		expect(resolve).not.toHaveBeenCalled();
	});

	it.each(['/api/play/x', '/media/a.opus', '/login'])(
		'non-page requests from a blocked country get 451 for %s',
		async (path) => {
			const resolve = ok();
			const r = await outcome(
				() =>
					handle(policy())({
						event: event(path, {
							method: path === '/login' ? 'POST' : 'GET',
							accept: 'application/json',
							headers: { 'x-country-code': 'ZZ' }
						}),
						resolve
					}) as Promise<Response>
			);
			expect(r.status).toBe(451);
			expect(resolve).not.toHaveBeenCalled();
		}
	);

	it('serves /unavailable to blocked visitors with status 451', async () => {
		const resolve = ok();
		const r = await outcome(
			() =>
				handle(policy())({
					event: event('/unavailable', { headers: { 'x-country-code': 'ZZ' } }),
					resolve
				}) as Promise<Response>
		);
		expect(r).toMatchObject({ status: 451, body: 'ok' });
	});

	it('falls back to the GeoIP database when there is no header', async () => {
		const resolve = ok();
		const reader = { lookup: (ip: string) => (ip === '198.51.100.9' ? 'ZZ' : 'AA') };
		const blocked = await outcome(
			() =>
				handle(
					policy(),
					reader
				)({
					event: event('/login', { ip: '198.51.100.9' }),
					resolve
				}) as Promise<Response>
		);
		expect(blocked.status).toBe(303);
		const allowed = await outcome(
			() =>
				handle(
					policy(),
					reader
				)({ event: event('/login', { ip: '192.0.2.1' }), resolve }) as Promise<Response>
		);
		expect(allowed.status).toBe(200);
	});

	it('applies the unknown-country policy', async () => {
		const resolve = ok();
		const allow = await outcome(
			() =>
				handle(policy({ unknown: 'allow' }))({
					event: event('/login'),
					resolve
				}) as Promise<Response>
		);
		expect(allow.status).toBe(200);
		const block = await outcome(
			() =>
				handle(policy({ unknown: 'block' }))({
					event: event('/login'),
					resolve
				}) as Promise<Response>
		);
		expect(block).toMatchObject({ status: 303, location: '/unavailable' });
	});

	it('treats non-country header values (Tor "T1", "XX") as unknown', async () => {
		const resolve = ok();
		for (const value of ['T1', 'XX', 'not-a-country']) {
			const r = await outcome(
				() =>
					handle(policy({ unknown: 'block' }))({
						event: event('/login', { headers: { 'x-country-code': value } }),
						resolve
					}) as Promise<Response>
			);
			expect(r.status, value).toBe(303);
		}
	});

	it('always lets /healthz through', async () => {
		const resolve = ok();
		const r = await outcome(
			() =>
				handle(policy({ unknown: 'block' }))({
					event: event('/healthz', { headers: { 'x-country-code': 'ZZ' } }),
					resolve
				}) as Promise<Response>
		);
		expect(r.status).toBe(200);
	});
});

describe('session hook', () => {
	let db: Db;
	let close: () => Promise<void>;
	beforeAll(async () => {
		({ db, close } = await createTestDb());
	});
	afterAll(() => close());
	beforeEach(async () => {
		await db.delete(sessions);
		await db.delete(users);
	});

	const handle = () => createSessionHandle({ db: () => db, ttlDays: () => 30 });

	it('sets locals.user from a valid session cookie', async () => {
		const user = await upsertUserByEmail(db, 'a@example.com');
		const s = await createSession(db, user.id, { ttlDays: 30 });
		const ev = event('/account', { cookies: { [SESSION_COOKIE]: s.token } });
		await handle()({ event: ev, resolve: ok() });
		expect(ev.locals.user).toEqual({ id: user.id, email: 'a@example.com', avVerified: false });
	});

	it('clears an invalid cookie and leaves the user signed out', async () => {
		const ev = event('/account', { cookies: { [SESSION_COOKIE]: 'x'.repeat(43) } });
		await handle()({ event: ev, resolve: ok() });
		expect(ev.locals.user).toBeNull();
		expect((ev.cookies as unknown as { jar: Map<string, string> }).jar.has(SESSION_COOKIE)).toBe(
			false
		);
	});
});
