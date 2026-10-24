import { redirect, type Cookies, type Handle, type RequestEvent } from '@sveltejs/kit';
import { accessFor, safeNext } from './access';
import { SESSION_COOKIE, validateSession, type SessionUser } from './auth/session';
import type { GeoPolicy } from './config/env-schema';
import { extendCsp, type CspExtras } from './csp';
import type { Db } from './db';
import { isBlocked, resolveCountry, type CountryReader } from './geo';

// The request pipeline, in order: geo → session → gate (see hooks.server.ts).
// Each step is a factory so unit tests can run it with fakes.

/** Paths that skip geo-blocking and session lookup entirely. */
const INFRA_PATHS = new Set(['/healthz', '/favicon.svg', '/robots.txt']);

/** A browser page navigation (or SvelteKit's client-side data request for one). */
export function wantsPage(event: Pick<RequestEvent, 'request' | 'isDataRequest'>): boolean {
	if (event.isDataRequest) return true;
	return (
		event.request.method === 'GET' &&
		(event.request.headers.get('accept') ?? '').includes('text/html')
	);
}

export function createGeoHandle(deps: {
	policy: () => GeoPolicy;
	reader: () => CountryReader | undefined;
}): Handle {
	return async ({ event, resolve }) => {
		const path = event.url.pathname;
		if (INFRA_PATHS.has(path)) return resolve(event);

		let ip: string | undefined;
		try {
			ip = event.getClientAddress();
		} catch {
			ip = undefined;
		}
		const policy = deps.policy();
		const country = resolveCountry(event.request.headers, ip, policy, deps.reader());
		event.locals.country = country;
		if (!isBlocked(country, policy)) return resolve(event);

		// Blocked: nothing past this point runs (no session, no login, no age gate).
		if (path === '/unavailable' || path === '/unavailable/') {
			const res = await resolve(event);
			return new Response(res.body, {
				status: 451,
				statusText: 'Unavailable For Legal Reasons',
				headers: res.headers
			});
		}
		if (wantsPage(event)) redirect(303, '/unavailable');
		return new Response('Not available in your region.', {
			status: 451,
			headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
		});
	};
}

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt
	});
}

export function createSessionHandle(deps: { db: () => Db; ttlDays: () => number }): Handle {
	return async ({ event, resolve }) => {
		event.locals.user = null;
		if (INFRA_PATHS.has(event.url.pathname)) return resolve(event);

		const token = event.cookies.get(SESSION_COOKIE);
		if (token) {
			const session = await validateSession(deps.db(), token, { ttlDays: deps.ttlDays() });
			if (session) {
				event.locals.user = session.user;
				if (session.renewed) setSessionCookie(event.cookies, token, session.expiresAt);
			} else {
				event.cookies.delete(SESSION_COOKIE, { path: '/' });
			}
		}
		return resolve(event);
	};
}

export type GateDecision =
	| { allow: true }
	| { allow: false; redirectTo: string }
	| { allow: false; status: 401 | 403; message: string };

/** Pure gate decision for a request; exported for unit tests. */
export function gateDecision(url: URL, user: SessionUser | null, page: boolean): GateDecision {
	const access = accessFor(url.pathname);
	// 'signed' routes (/media) authorise themselves from the URL signature and
	// re-check the signer's age verification; they answer 403, never redirect.
	if (access === 'public' || access === 'signed') return { allow: true };

	const next = encodeURIComponent(safeNext(url.pathname + url.search) ?? '/');
	if (!user) {
		return page
			? { allow: false, redirectTo: `/login?next=${next}` }
			: { allow: false, status: 401, message: 'Sign-in required.' };
	}
	if (access === 'verified' && !user.avVerified) {
		return page
			? { allow: false, redirectTo: `/verify-age?next=${next}` }
			: { allow: false, status: 403, message: 'Age verification required.' };
	}
	return { allow: true };
}

/** Appends runtime-configured origins (CDN, hosted payment/AV pages) to SvelteKit's CSP. */
export function createCspHandle(extras: () => CspExtras): Handle {
	return async ({ event, resolve }) => {
		const response = await resolve(event);
		const csp = response.headers.get('content-security-policy');
		if (csp) response.headers.set('content-security-policy', extendCsp(csp, extras()));
		return response;
	};
}

export const gateHandle: Handle = async ({ event, resolve }) => {
	const decision = gateDecision(event.url, event.locals.user, wantsPage(event));
	if (decision.allow) return resolve(event);
	if ('redirectTo' in decision) redirect(303, decision.redirectTo);
	return new Response(decision.message, {
		status: decision.status,
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});
};
