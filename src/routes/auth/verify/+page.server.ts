import { fail, redirect } from '@sveltejs/kit';
import { safeNext } from '$lib/server/access';
import { consumeMagicLink } from '$lib/server/auth/magic-link';
import { createSession, upsertUserByEmail } from '$lib/server/auth/session';
import { isWellFormedToken } from '$lib/server/auth/tokens';
import { getDb } from '$lib/server/db';
import { getEnv } from '$lib/server/env';
import { setSessionCookie } from '$lib/server/hooks';
import type { Actions, PageServerLoad } from './$types';

// GET only renders a "Continue" button, and the token is spent on POST. Email
// scanners that pre-fetch links therefore can't use up the sign-in link.
export const load: PageServerLoad = ({ url, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });
	const token = url.searchParams.get('token');
	return {
		token: isWellFormedToken(token) ? token : null,
		next: safeNext(url.searchParams.get('next')) ?? null
	};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const db = getDb();
		const email = await consumeMagicLink(db, form.get('token'));
		if (!email) return fail(400, { error: 'invalid' as const });

		const user = await upsertUserByEmail(db, email);
		const session = await createSession(db, user.id, { ttlDays: getEnv().SESSION_TTL_DAYS });
		setSessionCookie(cookies, session.token, session.expiresAt);

		const next = safeNext(String(form.get('next') ?? ''));
		if (user.avVerified) redirect(303, next ?? '/library');
		redirect(303, next ? `/verify-age?next=${encodeURIComponent(next)}` : '/verify-age');
	}
};
