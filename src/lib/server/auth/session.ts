import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { sessions, users, type User } from '../db/schema';
import { hashToken, isWellFormedToken, newToken } from './tokens';

export const SESSION_COOKIE = 'sid';

/** What request handlers get to know about the signed-in user. */
export interface SessionUser {
	id: string;
	email: string;
	avVerified: boolean;
}

const DAY_MS = 86_400_000;

export async function upsertUserByEmail(db: Db, email: string): Promise<User> {
	const [user] = await db
		.insert(users)
		.values({ email })
		// No-op update so RETURNING yields the existing row too.
		.onConflictDoUpdate({ target: users.email, set: { email } })
		.returning();
	return user!;
}

export async function createSession(
	db: Db,
	userId: string,
	opts: { ttlDays: number; now?: Date }
): Promise<{ token: string; expiresAt: Date }> {
	const now = opts.now ?? new Date();
	const token = newToken();
	const expiresAt = new Date(now.getTime() + opts.ttlDays * DAY_MS);
	await db.insert(sessions).values({ idHash: hashToken(token), userId, createdAt: now, expiresAt });
	return { token, expiresAt };
}

/**
 * Resolves a session cookie to its user. Expired sessions are deleted. Sessions
 * past half their lifetime slide forward (`renewed`), so the caller re-sets the cookie.
 */
export async function validateSession(
	db: Db,
	token: unknown,
	opts: { ttlDays: number; now?: Date }
): Promise<{ user: SessionUser; expiresAt: Date; renewed: boolean } | null> {
	if (!isWellFormedToken(token)) return null;
	const now = opts.now ?? new Date();
	const idHash = hashToken(token);

	const [row] = await db
		.select({
			expiresAt: sessions.expiresAt,
			id: users.id,
			email: users.email,
			avVerified: users.avVerified
		})
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.idHash, idHash));
	if (!row) return null;

	if (row.expiresAt <= now) {
		await db.delete(sessions).where(eq(sessions.idHash, idHash));
		return null;
	}

	const ttlMs = opts.ttlDays * DAY_MS;
	let expiresAt = row.expiresAt;
	let renewed = false;
	if (expiresAt.getTime() - now.getTime() < ttlMs / 2) {
		expiresAt = new Date(now.getTime() + ttlMs);
		await db.update(sessions).set({ expiresAt }).where(eq(sessions.idHash, idHash));
		renewed = true;
	}

	return {
		user: { id: row.id, email: row.email, avVerified: row.avVerified },
		expiresAt,
		renewed
	};
}

export async function deleteSession(db: Db, token: unknown): Promise<void> {
	if (!isWellFormedToken(token)) return;
	await db.delete(sessions).where(eq(sessions.idHash, hashToken(token)));
}
