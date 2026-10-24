// Default-deny route policy. Every path is `verified` (signed in + age
// verified) unless a rule below says otherwise, so a new route is gated until
// someone deliberately opens it. tests/unit/access.test.ts checks that every
// route in src/routes has the level it's meant to have.

export type Access =
	/** SFW, anyone (still subject to geo-blocking). */
	| 'public'
	/** Authorised by its own signature, not by the session (see storage/local.ts). */
	| 'signed'
	/** Signed in; age verification not required (account, the age-check flow). */
	| 'auth'
	/** Signed in and age-verified: everything that can reach content. */
	| 'verified';

const RULES: ReadonlyArray<readonly [RegExp, Access]> = [
	[/^\/$/, 'public'],
	[/^\/(pricing|login|logout|unavailable|healthz|offline)\/?$/, 'public'],
	[/^\/legal\/(terms|privacy|age)\/?$/, 'public'],
	[/^\/auth\/verify\/?$/, 'public'],
	// Build assets are hashed JS/CSS/fonts. adapter-node serves them before the
	// hooks run anyway; the SFW check proves they hold no content.
	[/^\/_app\//, 'public'],
	[/^\/(favicon\.svg|robots\.txt|manifest\.webmanifest|service-worker\.js)$/, 'public'],
	[/^\/icons\/[a-z0-9._-]+$/, 'public'],
	// Server-to-server: authenticated by the processor's/provider's signature.
	[/^\/pay\/postback\/[a-z]+\/?$/, 'public'],
	[/^\/av\/webhook\/[a-z]+\/?$/, 'public'],
	// Development stand-in for the processor's hosted page; 404 unless PAYMENT_PROVIDER=mock.
	[/^\/pay\/mock\/[0-9a-f-]{36}\/?$/, 'public'],

	// Signed media URLs: the route checks signature, expiry and the user's age check.
	[/^\/media\/[a-z0-9][a-z0-9_-]{0,63}\.(opus|m4a)$/, 'signed'],

	[/^\/account(\/(export|delete))?\/?$/, 'auth'],
	[/^\/verify-age\/?$/, 'auth'],
	[/^\/av\/(callback\/[a-z]+|mock)\/?$/, 'auth'],
	[/^\/pay\/return\/?$/, 'auth']
];

export function accessFor(pathname: string): Access {
	for (const [pattern, access] of RULES) if (pattern.test(pathname)) return access;
	return 'verified';
}

/**
 * A same-origin path to return to after sign-in, or undefined. Rejects
 * absolute and protocol-relative URLs ("//evil", "/\\evil") to prevent open redirects.
 */
export function safeNext(value: string | null | undefined): string | undefined {
	if (!value || value.length > 512) return undefined;
	if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return undefined;
	try {
		const url = new URL(value, 'http://x.invalid');
		if (url.origin !== 'http://x.invalid') return undefined;
		return url.pathname + url.search;
	} catch {
		return undefined;
	}
}
