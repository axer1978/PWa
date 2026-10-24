import { and, eq, gt, isNull, lt, ne } from 'drizzle-orm';
import type { Db } from '../db';
import { magicLinks } from '../db/schema';
import { hashToken, isWellFormedToken, newToken } from './tokens';

/** At most this many links per address per window, whatever the IP. */
export const PER_EMAIL_LIMIT = 3;
export const PER_EMAIL_WINDOW_MS = 15 * 60_000;

export type CreateLinkResult =
	{ ok: true; token: string; expiresAt: Date } | { ok: false; reason: 'rate_limited' };

/**
 * Issues a one-time sign-in token for an already-normalised email address.
 * No user row is created here; that only happens when a link is used.
 */
export async function createMagicLink(
	db: Db,
	email: string,
	opts: { ttlMinutes: number; now?: Date }
): Promise<CreateLinkResult> {
	const now = opts.now ?? new Date();

	// Opportunistic cleanup of links that expired more than a day ago.
	await db.delete(magicLinks).where(lt(magicLinks.expiresAt, new Date(now.getTime() - 86_400_000)));

	const recent = await db.$count(
		magicLinks,
		and(
			eq(magicLinks.email, email),
			gt(magicLinks.createdAt, new Date(now.getTime() - PER_EMAIL_WINDOW_MS))
		)
	);
	if (recent >= PER_EMAIL_LIMIT) return { ok: false, reason: 'rate_limited' };

	const token = newToken();
	const expiresAt = new Date(now.getTime() + opts.ttlMinutes * 60_000);
	await db
		.insert(magicLinks)
		.values({ email, tokenHash: hashToken(token), createdAt: now, expiresAt });
	return { ok: true, token, expiresAt };
}

/**
 * Atomically marks the link used and returns its email, or null if the token
 * is unknown, expired or already used. Other outstanding links for the same
 * address are retired at the same time.
 */
export async function consumeMagicLink(
	db: Db,
	token: unknown,
	opts: { now?: Date } = {}
): Promise<string | null> {
	if (!isWellFormedToken(token)) return null;
	const now = opts.now ?? new Date();
	const tokenHash = hashToken(token);

	const [row] = await db
		.update(magicLinks)
		.set({ consumedAt: now })
		.where(
			and(
				eq(magicLinks.tokenHash, tokenHash),
				isNull(magicLinks.consumedAt),
				gt(magicLinks.expiresAt, now)
			)
		)
		.returning({ email: magicLinks.email });
	if (!row) return null;

	await db
		.update(magicLinks)
		.set({ consumedAt: now })
		.where(
			and(
				eq(magicLinks.email, row.email),
				isNull(magicLinks.consumedAt),
				ne(magicLinks.tokenHash, tokenHash)
			)
		);
	return row.email;
}
