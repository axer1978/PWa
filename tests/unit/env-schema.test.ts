import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { databaseUrl, EnvError, geoPolicy, parseEnv } from '../../src/lib/server/config/env-schema';

const base = {
	APP_ENV: 'development',
	ORIGIN: 'https://localhost',
	POSTGRES_USER: 'app',
	POSTGRES_PASSWORD: 'p@ss:word',
	POSTGRES_DB: 'app',
	SMTP_URL: 'smtp://mailpit:1025',
	APP_SECRET: 'dev-only-0123456789abcdef0123456789abcdef'
};

const prod = {
	...base,
	APP_ENV: 'production',
	ORIGIN: 'https://example.com',
	AV_PROVIDER: 'yoti',
	PAYMENT_PROVIDER: 'verotel',
	HSTS_MAX_AGE: '31536000',
	BLOCKED_COUNTRIES: '',
	GEO_UNKNOWN_POLICY: 'block',
	APP_SECRET: 'prod-0123456789abcdef0123456789abcdef0123',
	YOTI_SDK_ID: 'sdk-id',
	YOTI_API_KEY: 'api-key',
	VEROTEL_SHOP_ID: '12345',
	VEROTEL_SIGNATURE_KEY: 'sig-key'
};

function issues(source: Record<string, string>): string[] {
	try {
		parseEnv(source);
		return [];
	} catch (e) {
		if (e instanceof EnvError) return e.issues;
		throw e;
	}
}

describe('env schema', () => {
	it('accepts a minimal dev config and defaults providers to mocks', () => {
		const env = parseEnv(base);
		expect(env.AV_PROVIDER).toBe('mock');
		expect(env.PAYMENT_PROVIDER).toBe('mock');
		expect(env.ALLOW_MOCKS).toBe(false);
	});

	it('requires APP_ENV (no silent default)', () => {
		const { APP_ENV: _omit, ...rest } = base;
		expect(issues(rest).some((i) => i.startsWith('APP_ENV'))).toBe(true);
	});

	it('requires a database config', () => {
		const noDb = {
			APP_ENV: 'development',
			ORIGIN: 'https://localhost',
			SMTP_URL: base.SMTP_URL,
			APP_SECRET: base.APP_SECRET
		};
		expect(issues(noDb)).toEqual([expect.stringContaining('DATABASE_URL')]);
	});

	it('accepts a valid production config', () => {
		expect(issues(prod)).toEqual([]);
	});

	describe('refuses mock providers outside development/test', () => {
		it('mock AV in production', () => {
			expect(issues({ ...prod, AV_PROVIDER: 'mock' })).toEqual([
				expect.stringContaining('Mock age verification')
			]);
		});

		it('mock payments in production', () => {
			expect(issues({ ...prod, PAYMENT_PROVIDER: 'mock' })).toEqual([
				expect.stringContaining('Mock payments')
			]);
		});

		it('defaulted (unset) providers in production', () => {
			const { AV_PROVIDER: _a, PAYMENT_PROVIDER: _p, ...rest } = prod;
			expect(issues(rest)).toHaveLength(2);
		});

		it('ALLOW_MOCKS cannot unlock mocks in production', () => {
			const found = issues({ ...prod, AV_PROVIDER: 'mock', ALLOW_MOCKS: 'true' });
			expect(found.some((i) => i.startsWith('ALLOW_MOCKS'))).toBe(true);
		});

		it('mocks in staging only with ALLOW_MOCKS=true', () => {
			const staging = { ...prod, APP_ENV: 'staging', AV_PROVIDER: 'mock' };
			expect(issues(staging)).toHaveLength(1);
			expect(issues({ ...staging, ALLOW_MOCKS: 'true' })).toEqual([]);
		});
	});

	it('requires https ORIGIN and HSTS in production', () => {
		const found = issues({ ...prod, ORIGIN: 'http://example.com', HSTS_MAX_AGE: '0' });
		expect(found).toEqual([
			expect.stringContaining('https'),
			expect.stringContaining('HSTS_MAX_AGE')
		]);
	});

	describe('email', () => {
		it('requires SMTP_URL for the smtp transport', () => {
			const { SMTP_URL: _s, ...rest } = base;
			expect(issues(rest)).toEqual([expect.stringContaining('SMTP_URL')]);
		});

		it('allows the file outbox only in development/test', () => {
			const { SMTP_URL: _s, ...noSmtp } = base;
			expect(issues({ ...noSmtp, EMAIL_TRANSPORT: 'outbox' })).toEqual([]);
			expect(issues({ ...prod, EMAIL_TRANSPORT: 'outbox' })).toEqual([
				expect.stringContaining('EMAIL_TRANSPORT')
			]);
		});
	});

	describe('geo-blocking', () => {
		it('parses the blocked-country list', () => {
			const env = parseEnv({ ...base, BLOCKED_COUNTRIES: ' aa, BB ,,' });
			expect([...geoPolicy(env).blocked]).toEqual(['AA', 'BB']);
		});

		it('rejects malformed country codes', () => {
			expect(issues({ ...base, BLOCKED_COUNTRIES: 'AA,USA' })[0]).toContain('two letters');
		});

		it('defaults to allowing unknown countries outside production', () => {
			const policy = geoPolicy(parseEnv(base));
			expect(policy.unknown).toBe('allow');
			expect(policy.blocked.size).toBe(0);
			expect(policy.header).toBe('x-country-code');
		});

		it('requires both geo settings to be explicit in production', () => {
			const { BLOCKED_COUNTRIES: _b, GEO_UNKNOWN_POLICY: _g, ...rest } = prod;
			expect(issues(rest)).toEqual([
				expect.stringContaining('BLOCKED_COUNTRIES'),
				expect.stringContaining('GEO_UNKNOWN_POLICY')
			]);
		});
	});

	describe('secrets and provider credentials', () => {
		it('requires a long APP_SECRET', () => {
			expect(issues({ ...base, APP_SECRET: 'short' })[0]).toContain('APP_SECRET');
		});

		it('refuses the development APP_SECRET in production', () => {
			expect(issues({ ...prod, APP_SECRET: base.APP_SECRET })).toEqual([
				expect.stringContaining('development value')
			]);
		});

		it.each([
			['STORAGE_DRIVER', 'bunny', ['BUNNY_PULL_ZONE_URL', 'BUNNY_TOKEN_KEY']],
			['AV_PROVIDER', 'yoti', ['YOTI_SDK_ID', 'YOTI_API_KEY']],
			['PAYMENT_PROVIDER', 'verotel', ['VEROTEL_SHOP_ID', 'VEROTEL_SIGNATURE_KEY']]
		])('%s=%s requires its credentials', (key, value, required) => {
			const found = issues({ ...base, [key]: value });
			for (const r of required) expect(found.some((i) => i.startsWith(r))).toBe(true);
		});
	});

	it('.env.example is a valid configuration as shipped', () => {
		const text = readFileSync(resolve(import.meta.dirname, '../../.env.example'), 'utf8');
		const values = Object.fromEntries(
			text
				.split(/\r?\n/)
				.map((l) => l.match(/^([A-Z][A-Z0-9_]*)=(.*)$/))
				.filter((m): m is RegExpMatchArray => m !== null)
				.map((m) => [m[1]!, m[2]!])
		);
		expect(issues(values)).toEqual([]);
	});

	it('builds a database URL from parts, escaping credentials', () => {
		expect(databaseUrl(parseEnv({ ...base, POSTGRES_HOST: 'postgres' }))).toBe(
			'postgres://app:p%40ss%3Aword@postgres:5432/app'
		);
		expect(databaseUrl(parseEnv({ ...base, DATABASE_URL: 'postgres://x@y/z' }))).toBe(
			'postgres://x@y/z'
		);
	});
});
