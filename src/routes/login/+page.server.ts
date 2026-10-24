import { fail, redirect } from '@sveltejs/kit';
import { safeNext } from '$lib/server/access';
import { maskEmail, normalizeEmail } from '$lib/server/auth/email-address';
import { createMagicLink } from '$lib/server/auth/magic-link';
import { getDb } from '$lib/server/db';
import { getEmailSender } from '$lib/server/email';
import { magicLinkEmail } from '$lib/server/email/templates';
import { getEnv } from '$lib/server/env';
import { createRateLimiter } from '$lib/server/rate-limit';
import type { Actions, PageServerLoad } from './$types';

/**
 * Per-IP limit, in memory only (IPs are never stored); per-email limits live in
 * magic-link.ts. Created on first use: env isn't available while SvelteKit
 * analyses this module at build time.
 */
let perIp: ReturnType<typeof createRateLimiter> | undefined;
const ipLimiter = () =>
	(perIp ??= createRateLimiter({ limit: getEnv().AUTH_LINKS_PER_IP, windowMs: 15 * 60_000 }));

export const load: PageServerLoad = ({ locals, url }) => {
	const next = safeNext(url.searchParams.get('next'));
	if (locals.user) redirect(303, next ?? '/library');
	return { next: next ?? null };
};

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		const form = await request.formData();
		const raw = String(form.get('email') ?? '').slice(0, 320);
		const next = safeNext(String(form.get('next') ?? ''));
		const email = normalizeEmail(raw);
		if (!email) return fail(400, { email: raw, error: 'invalid' as const });

		if (!ipLimiter().hit(getClientAddress())) {
			return fail(429, { email, error: 'rate_limited' as const });
		}

		const env = getEnv();
		const link = await createMagicLink(getDb(), email, { ttlMinutes: env.MAGIC_LINK_TTL_MINUTES });
		if (!link.ok) return fail(429, { email, error: 'rate_limited' as const });

		const url = new URL('/auth/verify', env.ORIGIN);
		url.searchParams.set('token', link.token);
		if (next) url.searchParams.set('next', next);

		try {
			await getEmailSender(env).send(magicLinkEmail(email, url.href, env.MAGIC_LINK_TTL_MINUTES));
		} catch (e) {
			console.error(`[auth] sign-in email to ${maskEmail(email)} failed:`, e);
			return fail(502, { email, error: 'send_failed' as const });
		}
		return { sent: true as const, email, ttlMinutes: env.MAGIC_LINK_TTL_MINUTES };
	}
};
