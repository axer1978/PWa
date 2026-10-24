// Default-deny route policy. Every path is `verified` (signed in + age
// verified) unless a rule below says otherwise, so a new route is gated until
// someone deliberately opens it. tests/unit/access.test.ts checks that every
// route in src/routes has the level it's meant to have.

export type Access =
	/** SFW, anyone (still subject to geo-blocking). */
	| 'public'
	/** Signed in; age verification not required (account, the age-check flow). */
	| 'auth'
	/** Signed in and age-verified: everything that can reach content. */
	| 'verified';

const RULES: ReadonlyArray<readonly [RegExp, Access]> = [
	[/^\/$/, 'public'],
	[/^\/(pricing|login|logout|unavailable|healthz)\/?$/, 'public'],
	[/^\/legal\/(terms|privacy|age)\/?$/, 'public'],
	[/^\/auth\/verify\/?$/, 'public'],
	// Build assets are hashed JS/CSS/fonts. adapter-node serves them before the
	// hooks run anyway; the SFW check (Phase 6) proves they hold no content.
	[/^\/_app\//, 'public'],
	[/^\/(favicon\.svg|robots\.txt)$/, 'public'],

	[/^\/account\/?$/, 'auth'],
	[/^\/verify-age(\/[a-z-]+)?\/?$/, 'auth']
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
