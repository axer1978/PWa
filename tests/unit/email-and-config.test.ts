import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadPlans } from '../../src/lib/server/config/plans';
import { outboxSender } from '../../src/lib/server/email';
import { magicLinkEmail } from '../../src/lib/server/email/templates';
import { createRateLimiter } from '../../src/lib/server/rate-limit';

const ROOT = resolve(import.meta.dirname, '../..');
const dirs: string[] = [];
const tmp = () => {
	const d = mkdtempSync(join(tmpdir(), 'cfg-test-'));
	dirs.push(d);
	return d;
};
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('sign-in email', () => {
	const url = 'https://example.com/auth/verify?token=abc&next=%2Flibrary';
	const msg = magicLinkEmail('a@example.com', url, 15);

	it('contains the link and its expiry', () => {
		expect(msg.text).toContain(url);
		expect(msg.text).toContain('15 minutes');
		expect(msg.html).toContain(
			'href="https://example.com/auth/verify?token=abc&#38;next=%2Flibrary"'
		);
	});

	it('is neutral: nothing in it reveals what the service is', () => {
		expect(msg.subject).toBe('Your sign-in link');
		for (const word of ['adult', '18', 'audio', 'session', 'explicit']) {
			expect(`${msg.subject} ${msg.text}`.toLowerCase()).not.toContain(word);
		}
	});

	it('escapes the URL in HTML', () => {
		const evil = magicLinkEmail('a@example.com', 'https://x.test/"><script>alert(1)</script>', 15);
		expect(evil.html).not.toContain('<script>');
	});

	it('the dev outbox writes one JSON file per message', async () => {
		const dir = tmp();
		await outboxSender(dir, 'Sign-in <no-reply@localhost>').send(msg);
		const files = readdirSync(dir);
		expect(files).toHaveLength(1);
		const saved = JSON.parse(readFileSync(join(dir, files[0]!), 'utf8'));
		expect(saved).toMatchObject({ to: 'a@example.com', subject: 'Your sign-in link' });
	});
});

describe('rate limiter', () => {
	it('allows up to the limit per window, per key', () => {
		const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
		expect([rl.hit('a', 0), rl.hit('a', 1), rl.hit('a', 2)]).toEqual([true, true, false]);
		expect(rl.hit('b', 2)).toBe(true);
		expect(rl.hit('a', 1001)).toBe(true);
	});

	it('stays bounded in memory', () => {
		const rl = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
		for (const k of ['a', 'b', 'c', 'd', 'e']) rl.hit(k, 0);
		// The oldest keys were evicted, so 'a' starts a fresh window.
		expect(rl.hit('a', 1)).toBe(true);
	});
});

describe('plans config', () => {
	it('the shipped config is valid and its packs reference real sessions', () => {
		const cfg = loadPlans(join(ROOT, 'config/plans.json'));
		expect(cfg.plans.map((p) => p.id)).toEqual(['monthly', 'yearly', 'starter-pack']);
		const sessionIds = readdirSync(join(ROOT, 'sessions'))
			.filter((f) => f.endsWith('.json') && !f.endsWith('.schema.json'))
			.map((f) => f.replace(/\.json$/, ''));
		for (const p of cfg.plans) {
			if (p.kind === 'pack') for (const s of p.sessions) expect(sessionIds).toContain(s);
		}
	});

	it('rejects duplicate plan ids and bad prices', () => {
		const file = join(tmp(), 'plans.json');
		const plan = {
			id: 'm',
			kind: 'subscription',
			name: 'M',
			priceMinor: 100,
			interval: 'month',
			description: ''
		};
		writeFileSync(file, JSON.stringify({ currency: 'EUR', plans: [plan, plan] }));
		expect(() => loadPlans(file)).toThrow(/duplicate plan id/);
		writeFileSync(file, JSON.stringify({ currency: 'EUR', plans: [{ ...plan, priceMinor: -1 }] }));
		expect(() => loadPlans(file)).toThrow();
	});
});
