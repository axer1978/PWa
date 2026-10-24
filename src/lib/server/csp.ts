import type { Env } from './config/env-schema';

// SvelteKit emits the base CSP (svelte.config.js, with script hashes). Origins
// that depend on runtime configuration are appended here, so the same build
// works with any CDN or provider:
// - form-action: hosted payment and age-check pages we redirect to after a POST
//   (Chrome applies form-action to the redirect target)
// - media-src / connect-src: the CDN serving signed audio (fetched with fetch())

export interface CspExtras {
	'form-action': string[];
	'media-src': string[];
	'connect-src': string[];
}

function origin(url: string | undefined): string | null {
	if (!url) return null;
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
}

export function cspExtras(env: Env): CspExtras {
	const extras: CspExtras = { 'form-action': [], 'media-src': [], 'connect-src': [] };
	if (env.AV_PROVIDER === 'yoti') {
		for (const o of [origin(env.YOTI_BASE_URL), origin(env.YOTI_HOSTED_URL)]) {
			if (o) extras['form-action'].push(o);
		}
	}
	if (env.PAYMENT_PROVIDER === 'verotel') {
		const o = origin(env.VEROTEL_BASE_URL);
		if (o) extras['form-action'].push(o);
	}
	if (env.STORAGE_DRIVER === 'bunny') {
		const o = origin(env.BUNNY_PULL_ZONE_URL);
		if (o) {
			extras['media-src'].push(o);
			extras['connect-src'].push(o);
		}
	}
	return extras;
}

/** Appends sources to directives in a CSP header value (adds the directive if absent). */
export function extendCsp(header: string, extras: CspExtras): string {
	const directives = header
		.split(';')
		.map((d) => d.trim())
		.filter(Boolean);
	for (const [name, sources] of Object.entries(extras) as [keyof CspExtras, string[]][]) {
		if (!sources.length) continue;
		const i = directives.findIndex((d) => d === name || d.startsWith(`${name} `));
		const unique = [...new Set(sources)];
		if (i === -1) directives.push(`${name} 'self' ${unique.join(' ')}`);
		else {
			const existing = new Set(directives[i]!.split(/\s+/).slice(1));
			const add = unique.filter((s) => !existing.has(s));
			if (add.length) directives[i] = `${directives[i]} ${add.join(' ')}`;
		}
	}
	return directives.join('; ');
}
