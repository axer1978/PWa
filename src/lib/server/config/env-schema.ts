import { z } from 'zod';

// Pure env parsing, with no SvelteKit imports, so unit tests and CLI scripts can use it.

const flag = z
	.enum(['true', 'false'])
	.default('false')
	.transform((v) => v === 'true');

/** Environments where mock providers are allowed without an explicit override. */
const MOCK_SAFE_ENVS = new Set(['development', 'test']);

/** Comma-separated ISO 3166-1 alpha-2 codes, e.g. "AA,BB". Empty string = none. */
const countryList = z
	.string()
	.transform((s) =>
		s
			.split(',')
			.map((c) => c.trim().toUpperCase())
			.filter(Boolean)
	)
	.pipe(z.array(z.string().regex(/^[A-Z]{2}$/, 'country codes are two letters (ISO 3166-1)')));

export const envSchema = z
	.object({
		// Required, with no default: a missing value must fail boot rather than
		// silently enable dev behaviour (mocks) in production.
		APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
		ORIGIN: z.url(),

		DATABASE_URL: z.string().min(1).optional(),
		POSTGRES_USER: z.string().min(1).optional(),
		POSTGRES_PASSWORD: z.string().min(1).optional(),
		POSTGRES_DB: z.string().min(1).optional(),
		POSTGRES_HOST: z.string().min(1).default('localhost'),
		POSTGRES_PORT: z.coerce.number().int().positive().default(5432),

		AV_PROVIDER: z.enum(['mock', 'yoti']).default('mock'),
		PAYMENT_PROVIDER: z.enum(['mock', 'verotel']).default('mock'),
		STORAGE_DRIVER: z.enum(['local', 'bunny']).default('local'),
		/** Staging-only escape hatch: permits mock providers outside development/test. */
		ALLOW_MOCKS: flag,

		/** Read by Caddy; validated here so production can't boot without HSTS. */
		HSTS_MAX_AGE: z.coerce.number().int().nonnegative().default(0),

		// --- Email (magic links) ---
		/** `outbox` writes messages as JSON files instead of sending (development/test only). */
		EMAIL_TRANSPORT: z.enum(['smtp', 'outbox']).default('smtp'),
		/** e.g. smtp://mailpit:1025 or smtps://user:pass@smtp.example.com:465 */
		SMTP_URL: z.string().min(1).optional(),
		/** Keep it neutral: it shows in the listener's inbox. */
		EMAIL_FROM: z.string().min(3).default('Sign-in <no-reply@localhost>'),
		OUTBOX_DIR: z.string().min(1).default('.outbox'),
		MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
		/** Sign-in link requests allowed per IP per 15 minutes (in memory; IPs aren't stored). */
		AUTH_LINKS_PER_IP: z.coerce.number().int().min(1).max(10_000).default(10),
		SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

		// --- Geo-blocking ---
		/** Required in production (may be empty): which countries to block is a legal decision. */
		BLOCKED_COUNTRIES: countryList.optional(),
		/** What to do when no country can be determined. Required in production. */
		GEO_UNKNOWN_POLICY: z.enum(['allow', 'block']).optional(),
		/** Country header set by infrastructure you control (Caddy strips client copies). */
		GEO_COUNTRY_HEADER: z
			.string()
			.regex(/^[A-Za-z0-9-]+$/)
			.default('X-Country-Code'),
		/** MaxMind-format country database (DB-IP Lite works) used when there's no header. */
		GEOIP_DB_PATH: z.string().min(1).optional(),

		// --- Secrets ---
		/**
		 * Root secret for HMAC signatures (local signed media URLs, mock providers).
		 * Purpose-specific keys are derived from it (crypto.ts deriveKey).
		 */
		APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),

		// --- Media delivery ---
		MEDIA_DIR: z.string().min(1).default('content/audio'),
		MEDIA_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
		/** Pull zone base URL, e.g. https://example.b-cdn.net (or a custom CDN hostname). */
		BUNNY_PULL_ZONE_URL: z.url().optional(),
		/** The pull zone's Token Authentication key. */
		BUNNY_TOKEN_KEY: z.string().min(8).optional(),
		/** Folder inside the storage zone that holds the clips, e.g. /audio. */
		BUNNY_PATH_PREFIX: z
			.string()
			.regex(/^(\/[A-Za-z0-9_-]+)*$/, 'a path like /audio, without a trailing slash')
			.default('/audio'),
		/** Storage zone credentials: used only by scripts/sync-audio-to-bunny.ts, never by the app. */
		BUNNY_STORAGE_ZONE: z.string().min(1).optional(),
		BUNNY_STORAGE_PASSWORD: z.string().min(1).optional(),
		BUNNY_STORAGE_HOST: z.string().min(1).default('storage.bunnycdn.com'),

		// --- Age verification: Yoti ---
		YOTI_SDK_ID: z.string().min(1).optional(),
		YOTI_API_KEY: z.string().min(1).optional(),
		/** Yoti age verification API base URL. */
		YOTI_BASE_URL: z.url().default('https://age.yoti.com/api/v1'),
		/** Yoti hosted age verification page the browser is sent to. */
		YOTI_HOSTED_URL: z.url().default('https://age.yoti.com'),
		YOTI_AGE_THRESHOLD: z.coerce.number().int().min(18).max(25).default(18),

		// --- Payments: Verotel FlexPay ---
		VEROTEL_SHOP_ID: z.string().min(1).optional(),
		VEROTEL_SIGNATURE_KEY: z.string().min(1).optional(),
		VEROTEL_BASE_URL: z.url().default('https://secure.verotel.com'),

		// --- Analytics (optional; self-hosted Umami, cookieless) ---
		UMAMI_WEBSITE_ID: z.uuid().optional(),
		UMAMI_SCRIPT_PATH: z
			.string()
			.regex(/^\/[A-Za-z0-9/_.-]+$/)
			.default('/stats/script.js')
	})
	.superRefine((env, ctx) => {
		if (!env.DATABASE_URL && !(env.POSTGRES_USER && env.POSTGRES_PASSWORD && env.POSTGRES_DB)) {
			ctx.addIssue({
				code: 'custom',
				path: ['DATABASE_URL'],
				message: 'Set DATABASE_URL, or all of POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB'
			});
		}

		const mocksAllowed = MOCK_SAFE_ENVS.has(env.APP_ENV) || env.ALLOW_MOCKS;
		if (env.APP_ENV === 'production' && env.ALLOW_MOCKS) {
			ctx.addIssue({
				code: 'custom',
				path: ['ALLOW_MOCKS'],
				message: 'ALLOW_MOCKS must not be set in production'
			});
		}
		if (!mocksAllowed) {
			if (env.AV_PROVIDER === 'mock') {
				ctx.addIssue({
					code: 'custom',
					path: ['AV_PROVIDER'],
					message: `Mock age verification is not allowed when APP_ENV=${env.APP_ENV}`
				});
			}
			if (env.PAYMENT_PROVIDER === 'mock') {
				ctx.addIssue({
					code: 'custom',
					path: ['PAYMENT_PROVIDER'],
					message: `Mock payments are not allowed when APP_ENV=${env.APP_ENV}`
				});
			}
		}

		if (env.EMAIL_TRANSPORT === 'outbox' && !MOCK_SAFE_ENVS.has(env.APP_ENV)) {
			ctx.addIssue({
				code: 'custom',
				path: ['EMAIL_TRANSPORT'],
				message: `EMAIL_TRANSPORT=outbox is only for development/test, not ${env.APP_ENV}`
			});
		}
		if (env.EMAIL_TRANSPORT === 'smtp' && !env.SMTP_URL) {
			ctx.addIssue({
				code: 'custom',
				path: ['SMTP_URL'],
				message: 'SMTP_URL is required when EMAIL_TRANSPORT=smtp'
			});
		}

		const need = (cond: boolean, keys: (keyof typeof env)[], why: string) => {
			if (!cond) return;
			for (const key of keys) {
				if (!env[key]) {
					ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when ${why}` });
				}
			}
		};
		need(
			env.STORAGE_DRIVER === 'bunny',
			['BUNNY_PULL_ZONE_URL', 'BUNNY_TOKEN_KEY'],
			'STORAGE_DRIVER=bunny'
		);
		need(env.AV_PROVIDER === 'yoti', ['YOTI_SDK_ID', 'YOTI_API_KEY'], 'AV_PROVIDER=yoti');
		need(
			env.PAYMENT_PROVIDER === 'verotel',
			['VEROTEL_SHOP_ID', 'VEROTEL_SIGNATURE_KEY'],
			'PAYMENT_PROVIDER=verotel'
		);

		if (env.APP_ENV === 'production') {
			if (env.APP_SECRET.startsWith('dev-only')) {
				ctx.addIssue({
					code: 'custom',
					path: ['APP_SECRET'],
					message:
						'APP_SECRET is still the development value; generate one with `openssl rand -base64 48`'
				});
			}
			if (env.BLOCKED_COUNTRIES === undefined) {
				ctx.addIssue({
					code: 'custom',
					path: ['BLOCKED_COUNTRIES'],
					message: 'BLOCKED_COUNTRIES must be set explicitly in production (empty means none)'
				});
			}
			if (env.GEO_UNKNOWN_POLICY === undefined) {
				ctx.addIssue({
					code: 'custom',
					path: ['GEO_UNKNOWN_POLICY'],
					message: 'GEO_UNKNOWN_POLICY (allow | block) must be set explicitly in production'
				});
			}
			if (!env.ORIGIN.startsWith('https://')) {
				ctx.addIssue({
					code: 'custom',
					path: ['ORIGIN'],
					message: 'ORIGIN must be https in production'
				});
			}
			if (env.HSTS_MAX_AGE < 15_552_000) {
				ctx.addIssue({
					code: 'custom',
					path: ['HSTS_MAX_AGE'],
					message: 'HSTS_MAX_AGE must be at least 15552000 (180 days) in production'
				});
			}
		}
	});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
	constructor(readonly issues: string[]) {
		super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
		this.name = 'EnvError';
	}
}

export function parseEnv(source: Record<string, string | undefined>): Env {
	const result = envSchema.safeParse(source);
	if (!result.success) {
		throw new EnvError(
			result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
		);
	}
	return result.data;
}

export interface GeoPolicy {
	blocked: ReadonlySet<string>;
	unknown: 'allow' | 'block';
	header: string;
}

export function geoPolicy(env: Env): GeoPolicy {
	return {
		blocked: new Set(env.BLOCKED_COUNTRIES ?? []),
		unknown: env.GEO_UNKNOWN_POLICY ?? 'allow',
		header: env.GEO_COUNTRY_HEADER.toLowerCase()
	};
}

export function mocksActive(env: Env): boolean {
	return env.AV_PROVIDER === 'mock' || env.PAYMENT_PROVIDER === 'mock';
}

export function databaseUrl(env: Env): string {
	if (env.DATABASE_URL) return env.DATABASE_URL;
	const user = encodeURIComponent(env.POSTGRES_USER ?? '');
	const pass = encodeURIComponent(env.POSTGRES_PASSWORD ?? '');
	return `postgres://${user}:${pass}@${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${env.POSTGRES_DB ?? ''}`;
}
