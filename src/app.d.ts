// See https://svelte.dev/docs/kit/types#app.d.ts
import type { SessionUser } from '$lib/server/auth/session';

declare global {
	namespace App {
		interface Locals {
			/** Set by the session hook; null when signed out. */
			user: SessionUser | null;
			/** ISO 3166-1 alpha-2, when known. Set by the geo hook. */
			country?: string;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
