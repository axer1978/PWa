// Audio delivery contract. Implementations: local.ts (signed URLs served by the
// app itself from MEDIA_DIR) and bunny.ts (Bunny CDN token authentication).
// URLs are only ever issued by the clip API after the auth + age-verification +
// entitlement checks, and expire after MEDIA_URL_TTL_SECONDS (~10 minutes).

import type { ClipFormat } from '../../player/api-types';

export type { ClipFormat };
export type StorageDriverId = 'local' | 'bunny';

export interface SignInput {
	clipId: string;
	format: ClipFormat;
	/** Bound into local signatures so a URL can't be replayed for another user's checks. */
	userId: string;
	ttlSeconds: number;
	now?: Date;
}

export interface StorageAdapter {
	readonly id: StorageDriverId;
	/** Origins media is fetched from (added to CSP media-src and connect-src). */
	readonly mediaOrigins: readonly string[];
	/** An absolute or root-relative URL that stops working after ttlSeconds. */
	signedUrl(input: SignInput): string;
}

/** Path of a clip inside the storage zone / MEDIA_DIR, e.g. "demo-free-intro.opus". */
export function clipFileName(clipId: string, format: ClipFormat): string {
	if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(clipId)) throw new Error(`invalid clip id: ${clipId}`);
	return `${clipId}.${format}`;
}
