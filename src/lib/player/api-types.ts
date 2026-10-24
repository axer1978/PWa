// JSON contracts between the player (client) and the play API (server).
// Shared types only: no runtime code, nothing server-only.

import type { Session, StateValue } from '../engine/schema';

export type ClipFormat = 'opus' | 'm4a';
export const CLIP_FORMATS: readonly ClipFormat[] = ['opus', 'm4a'];

/** Signed, expiring URLs for one clip in both formats. */
export interface ClipUrls {
	opus: string;
	m4a: string;
}

/**
 * GET /api/play/[sessionId]/clips?node=<nodeId>
 * URLs for the node's clip and every clip one step away (structurally, so the
 * server never has to trust client state). All expire at `expiresAt`.
 */
export interface ClipUrlsResponse {
	/** Epoch seconds. Request a fresh set before this (the player refreshes at ~80%). */
	expiresAt: number;
	clips: Record<string, ClipUrls>;
}

/** GET/PUT /api/play/[sessionId]/progress */
export interface ProgressDto {
	nodeId: string;
	state: Record<string, StateValue>;
	done: boolean;
	/** ISO 8601. The newer of local and server progress wins when resuming. */
	updatedAt: string;
}

/** Errors from the play API: { error: PlayErrorCode } with a matching HTTP status. */
export type PlayErrorCode =
	| 'unauthenticated' // 401
	| 'age_verification_required' // 403
	| 'payment_required' // 402
	| 'not_found' // 404
	| 'bad_request'; // 400

/** What /play/[sessionId]/+page.server.ts gives the player page when access is granted. */
export interface PlayPageSession {
	id: string;
	title: string;
	summary: string | null;
	session: Session;
}
