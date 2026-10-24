import { eq } from 'drizzle-orm';
import type { Db } from '../../src/lib/server/db';
import { users, type User } from '../../src/lib/server/db/schema';

let seq = 0;

/** Inserts a user; `verified` marks the age check done (as the AV service would). */
export async function createUser(
	db: Db,
	opts: { email?: string; verified?: boolean } = {}
): Promise<User> {
	const email = opts.email ?? `user${++seq}-${Math.random().toString(36).slice(2, 8)}@example.com`;
	const [user] = await db.insert(users).values({ email }).returning();
	if (opts.verified) {
		const [v] = await db
			.update(users)
			.set({
				avVerified: true,
				avVerifiedAt: new Date(),
				avProvider: 'mock',
				avProviderRef: `test-${user!.id}`
			})
			.where(eq(users.id, user!.id))
			.returning();
		return v!;
	}
	return user!;
}
