import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { normalizeEmail, maskEmail } from '../../src/lib/server/auth/email-address';
import {
	consumeMagicLink,
	createMagicLink,
	PER_EMAIL_LIMIT,
	PER_EMAIL_WINDOW_MS
} from '../../src/lib/server/auth/magic-link';
import {
	createSession,
	deleteSession,
	upsertUserByEmail,
	validateSession
} from '../../src/lib/server/auth/session';
import { hashToken, isWellFormedToken, newToken } from '../../src/lib/server/auth/tokens';
import type { Db } from '../../src/lib/server/db';
import { magicLinks, sessions, users } from '../../src/lib/server/db/schema';
import { createTestDb } from '../helpers/test-db';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
	({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
	await db.delete(sessions);
	await db.delete(magicLinks);
	await db.delete(users);
});

const t0 = new Date('2026-10-20T12:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);
const MIN = 60_000;

describe('tokens and addresses', () => {
	it('tokens are 43-char base64url and unique', () => {
		const a = newToken();
		expect(isWellFormedToken(a)).toBe(true);
		expect(a).not.toBe(newToken());
		expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
		expect(isWellFormedToken('short')).toBe(false);
		expect(isWellFormedToken(`${a}'; drop table users;--`)).toBe(false);
	});

	it('normalises email addresses', () => {
		expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com');
		expect(normalizeEmail('not-an-email')).toBeNull();
		expect(normalizeEmail(42)).toBeNull();
		expect(maskEmail('alice@example.com')).toBe('a***@example.com');
	});
});

describe('magic links', () => {
	it('can be used exactly once', async () => {
		const link = await createMagicLink(db, 'a@example.com', { ttlMinutes: 15, now: t0 });
		expect(link.ok).toBe(true);
		if (!link.ok) return;
		expect(await consumeMagicLink(db, link.token, { now: at(MIN) })).toBe('a@example.com');
		expect(await consumeMagicLink(db, link.token, { now: at(2 * MIN) })).toBeNull();
	});

	it('expire after their TTL', async () => {
		const link = await createMagicLink(db, 'a@example.com', { ttlMinutes: 15, now: t0 });
		if (!link.ok) throw new Error('unexpected');
		expect(await consumeMagicLink(db, link.token, { now: at(15 * MIN) })).toBeNull();
	});

	it('only store a hash of the token', async () => {
		const link = await createMagicLink(db, 'a@example.com', { ttlMinutes: 15, now: t0 });
		if (!link.ok) throw new Error('unexpected');
		const rows = await db.select().from(magicLinks);
		expect(rows).toHaveLength(1);
		expect(rows[0]!.tokenHash).toBe(hashToken(link.token));
		expect(JSON.stringify(rows)).not.toContain(link.token);
	});

	it('reject unknown and malformed tokens', async () => {
		expect(await consumeMagicLink(db, newToken(), { now: t0 })).toBeNull();
		expect(await consumeMagicLink(db, 'garbage', { now: t0 })).toBeNull();
		expect(await consumeMagicLink(db, undefined, { now: t0 })).toBeNull();
	});

	it('using one link retires the other outstanding links for that address', async () => {
		const a = await createMagicLink(db, 'a@example.com', { ttlMinutes: 15, now: t0 });
		const b = await createMagicLink(db, 'a@example.com', { ttlMinutes: 15, now: at(MIN) });
		if (!a.ok || !b.ok) throw new Error('unexpected');
		expect(await consumeMagicLink(db, b.token, { now: at(2 * MIN) })).toBe('a@example.com');
		expect(await consumeMagicLink(db, a.token, { now: at(3 * MIN) })).toBeNull();
	});

	it('are rate-limited per address, and the window slides', async () => {
		for (let i = 0; i < PER_EMAIL_LIMIT; i++) {
			const r = await createMagicLink(db, 'a@example.com', { ttlMinutes: 15, now: at(i * 1000) });
			expect(r.ok).toBe(true);
		}
		const over = await createMagicLink(db, 'a@example.com', { ttlMinutes: 15, now: at(5000) });
		expect(over).toEqual({ ok: false, reason: 'rate_limited' });
		// Other addresses are unaffected.
		expect((await createMagicLink(db, 'b@example.com', { ttlMinutes: 15, now: at(5000) })).ok).toBe(
			true
		);
		// Once the window has passed, links can be requested again.
		const later = await createMagicLink(db, 'a@example.com', {
			ttlMinutes: 15,
			now: at(PER_EMAIL_WINDOW_MS + 5000)
		});
		expect(later.ok).toBe(true);
	});

	it('do not create a user until one is used', async () => {
		await createMagicLink(db, 'a@example.com', { ttlMinutes: 15, now: t0 });
		expect(await db.$count(users)).toBe(0);
	});
});

describe('sessions', () => {
	const ttlDays = 30;
	const DAY = 86_400_000;

	it('resolve to their user and are stored only as a hash', async () => {
		const user = await upsertUserByEmail(db, 'a@example.com');
		const s = await createSession(db, user.id, { ttlDays, now: t0 });
		const v = await validateSession(db, s.token, { ttlDays, now: at(DAY) });
		expect(v?.user).toEqual({ id: user.id, email: 'a@example.com', avVerified: false });
		expect(v?.renewed).toBe(false);
		const [row] = await db.select().from(sessions);
		expect(row!.idHash).toBe(hashToken(s.token));
	});

	it('slide forward once past half their lifetime', async () => {
		const user = await upsertUserByEmail(db, 'a@example.com');
		const s = await createSession(db, user.id, { ttlDays, now: t0 });
		const v = await validateSession(db, s.token, { ttlDays, now: at(16 * DAY) });
		expect(v?.renewed).toBe(true);
		expect(v?.expiresAt.getTime()).toBe(at(16 * DAY + ttlDays * DAY).getTime());
	});

	it('are deleted once expired', async () => {
		const user = await upsertUserByEmail(db, 'a@example.com');
		const s = await createSession(db, user.id, { ttlDays, now: t0 });
		expect(await validateSession(db, s.token, { ttlDays, now: at(ttlDays * DAY) })).toBeNull();
		expect(await db.$count(sessions)).toBe(0);
	});

	it('end on sign-out', async () => {
		const user = await upsertUserByEmail(db, 'a@example.com');
		const s = await createSession(db, user.id, { ttlDays, now: t0 });
		await deleteSession(db, s.token);
		expect(await validateSession(db, s.token, { ttlDays, now: t0 })).toBeNull();
	});

	it('reflect the current age-verification status', async () => {
		const user = await upsertUserByEmail(db, 'a@example.com');
		const s = await createSession(db, user.id, { ttlDays, now: t0 });
		await db
			.update(users)
			.set({ avVerified: true, avVerifiedAt: t0, avProvider: 'mock', avProviderRef: 'ref-1' })
			.where(eq(users.id, user.id));
		const v = await validateSession(db, s.token, { ttlDays, now: t0 });
		expect(v?.user.avVerified).toBe(true);
	});

	it('upsert returns the same user for the same address', async () => {
		const a = await upsertUserByEmail(db, 'a@example.com');
		const b = await upsertUserByEmail(db, 'a@example.com');
		expect(b.id).toBe(a.id);
	});

	it('the database refuses a verified flag without timestamp, provider and reference', async () => {
		const user = await upsertUserByEmail(db, 'a@example.com');
		await expect(
			db.update(users).set({ avVerified: true }).where(eq(users.id, user.id))
		).rejects.toThrow();
	});
});
