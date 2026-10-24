import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, deleteSession } from '$lib/server/auth/session';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

// POST only (SvelteKit's CSRF origin check covers form posts). Public, so a
// stale tab can always sign out, even after the session has expired.
export const POST: RequestHandler = async ({ cookies }) => {
	await deleteSession(getDb(), cookies.get(SESSION_COOKIE));
	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/');
};

export const GET: RequestHandler = () => redirect(303, '/account');
