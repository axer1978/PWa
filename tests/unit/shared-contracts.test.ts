import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/lib/server/config/env-schema';
import { CatalogError, loadCatalog } from '../../src/lib/server/content/catalog';
import { safeEqual, deriveKey } from '../../src/lib/server/crypto';
import { cspExtras, extendCsp } from '../../src/lib/server/csp';
import type { Db } from '../../src/lib/server/db';
import { entitlements, users } from '../../src/lib/server/db/schema';
import { accessMap, canPlay, planSummary } from '../../src/lib/server/entitlements';
import { createUser } from '../helpers/fixtures';
import { createTestDb } from '../helpers/test-db';

const ROOT = resolve(import.meta.dirname, '../..');

describe('session catalog', () => {
	it('loads and compiles every demo session', () => {
		const catalog = loadCatalog(join(ROOT, 'sessions'));
		expect(catalog.entries.map((e) => e.id).sort()).toEqual(['demo-free', 'demo-pack', 'demo-sub']);
		const free = catalog.byId.get('demo-free')!;
		expect(free.access).toBe('free');
		expect(free.graph.nodes.size).toBe(free.session.nodes.length);
		expect(free.clipIds).toContain('demo-free-intro');
	});

	it('refuses to start with an invalid session', () => {
		const dir = mkdtempSync(join(tmpdir(), 'catalog-'));
		try {
			const bad = JSON.parse(
				readFileSync(join(ROOT, 'tests/fixtures/sessions/trapped-cycle.json'), 'utf8')
			);
			writeFileSync(join(dir, 'trapped-cycle.json'), JSON.stringify(bad));
			expect(() => loadCatalog(dir)).toThrow(CatalogError);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('entitlement rules', () => {
	let db: Db;
	let close: () => Promise<void>;
	beforeAll(async () => {
		({ db, close } = await createTestDb());
	});
	afterAll(() => close());
	beforeEach(async () => {
		await db.delete(entitlements);
		await db.delete(users);
	});

	const now = new Date('2026-10-24T12:00:00Z');
	const day = 86_400_000;
	const free = { id: 'demo-free', access: 'free' as const };
	const sub = { id: 'demo-sub', access: 'paid' as const };
	const pack = { id: 'demo-pack', access: 'paid' as const };

	async function grant(userId: string, over: Partial<typeof entitlements.$inferInsert>) {
		await db.insert(entitlements).values({
			userId,
			kind: 'subscription',
			planId: 'monthly',
			provider: 'mock',
			providerRef: `ref-${Math.random()}`,
			status: 'active',
			currentPeriodEnd: new Date(now.getTime() + 10 * day),
			...over
		});
	}

	it('free sessions need no entitlement; paid ones do', async () => {
		const u = await createUser(db, { verified: true });
		expect(await canPlay(db, u.id, free, now)).toBe(true);
		expect(await canPlay(db, u.id, sub, now)).toBe(false);
	});

	it.each([
		['active, period running', { status: 'active' as const }, true],
		['cancelled, period running (keeps access)', { status: 'cancelled' as const }, true],
		[
			'cancelled, period over',
			{ status: 'cancelled' as const, currentPeriodEnd: new Date(now.getTime() - 1) },
			false
		],
		[
			'active but period over',
			{ status: 'active' as const, currentPeriodEnd: new Date(now.getTime() - 1) },
			false
		],
		['expired', { status: 'expired' as const }, false],
		['revoked (refund/chargeback)', { status: 'revoked' as const }, false]
	])('subscription %s → %s', async (_label, over, expected) => {
		const u = await createUser(db, { verified: true });
		await grant(u.id, over);
		expect(await canPlay(db, u.id, sub, now)).toBe(expected);
		expect(await canPlay(db, u.id, pack, now)).toBe(expected);
	});

	it('a pack unlocks only the sessions it was bought with, for good', async () => {
		const u = await createUser(db, { verified: true });
		await grant(u.id, {
			kind: 'pack',
			planId: 'starter-pack',
			currentPeriodEnd: null,
			sessionIds: ['demo-pack']
		});
		expect(await canPlay(db, u.id, pack, new Date(now.getTime() + 3650 * day))).toBe(true);
		expect(await canPlay(db, u.id, sub, now)).toBe(false);
		const map = await accessMap(db, u.id, [free, sub, pack], now);
		expect(Object.fromEntries(map)).toEqual({
			'demo-free': true,
			'demo-sub': false,
			'demo-pack': true
		});
	});

	it('a revoked pack unlocks nothing', async () => {
		const u = await createUser(db, { verified: true });
		await grant(u.id, {
			kind: 'pack',
			planId: 'starter-pack',
			currentPeriodEnd: null,
			sessionIds: ['demo-pack'],
			status: 'revoked'
		});
		expect(await canPlay(db, u.id, pack, now)).toBe(false);
	});

	it('entitlements are per user', async () => {
		const a = await createUser(db, { verified: true });
		const b = await createUser(db, { verified: true });
		await grant(a.id, {});
		expect(await canPlay(db, b.id, sub, now)).toBe(false);
	});

	it('summarises the current plan for the account page', async () => {
		const u = await createUser(db, { verified: true });
		await grant(u.id, { status: 'cancelled', providerRef: 'sale-1' });
		const s = await planSummary(db, u.id, now);
		expect(s.subscription).toMatchObject({
			planId: 'monthly',
			status: 'cancelled',
			providerRef: 'sale-1'
		});
		expect(s.packs).toEqual([]);
	});
});

describe('runtime CSP origins', () => {
	const base =
		"default-src 'self'; media-src 'self' blob:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'";

	it('appends configured provider and CDN origins', () => {
		const out = extendCsp(base, {
			'form-action': ['https://secure.verotel.com'],
			'media-src': ['https://cdn.example.b-cdn.net'],
			'connect-src': ['https://cdn.example.b-cdn.net']
		});
		expect(out).toContain("form-action 'self' https://secure.verotel.com");
		expect(out).toContain("media-src 'self' blob: https://cdn.example.b-cdn.net");
		expect(out).toContain("connect-src 'self' https://cdn.example.b-cdn.net");
		expect(out).toContain("frame-ancestors 'none'");
	});

	it('changes nothing with the local/mock defaults', () => {
		const env = parseEnv({
			APP_ENV: 'development',
			ORIGIN: 'https://localhost',
			DATABASE_URL: 'postgres://x@y/z',
			SMTP_URL: 'smtp://mailpit:1025',
			APP_SECRET: 'x'.repeat(32)
		});
		expect(extendCsp(base, cspExtras(env))).toBe(base);
	});
});

describe('crypto helpers', () => {
	it('compares in constant time and derives distinct keys per purpose', () => {
		expect(safeEqual('abc', 'abc')).toBe(true);
		expect(safeEqual('abc', 'abd')).toBe(false);
		expect(safeEqual('abc', 'abcd')).toBe(false);
		expect(deriveKey('s'.repeat(32), 'media').equals(deriveKey('s'.repeat(32), 'av-mock'))).toBe(
			false
		);
	});
});
