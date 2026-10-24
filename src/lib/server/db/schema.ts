import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable(
	'users',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		/** Always stored lower-cased; enforced by the check constraint below. */
		email: text('email').notNull(),
		createdAt: timestamptz('created_at').notNull().defaultNow(),
		// Age verification: only the outcome and the provider's reference are stored.
		// No documents, images, dates of birth or other identity data, ever.
		avVerified: boolean('av_verified').notNull().default(false),
		avVerifiedAt: timestamptz('av_verified_at'),
		avProvider: text('av_provider'),
		avProviderRef: text('av_provider_ref')
	},
	(t) => [
		uniqueIndex('users_email_key').on(t.email),
		check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
		check(
			'users_av_consistent',
			sql`(${t.avVerified} = false) or (${t.avVerifiedAt} is not null and ${t.avProvider} is not null and ${t.avProviderRef} is not null)`
		)
	]
);

/**
 * One-time sign-in links. Only a SHA-256 of the token is stored, so a database
 * leak can't be replayed into sign-ins. No user row exists until a link is used.
 */
export const magicLinks = pgTable(
	'magic_links',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		email: text('email').notNull(),
		tokenHash: text('token_hash').notNull(),
		createdAt: timestamptz('created_at').notNull().defaultNow(),
		expiresAt: timestamptz('expires_at').notNull(),
		consumedAt: timestamptz('consumed_at')
	},
	(t) => [
		uniqueIndex('magic_links_token_hash_key').on(t.tokenHash),
		index('magic_links_email_created_idx').on(t.email, t.createdAt),
		check('magic_links_email_lowercase', sql`${t.email} = lower(${t.email})`)
	]
);

/** Browser sessions. The cookie holds a random token; only its SHA-256 is stored. */
export const sessions = pgTable(
	'sessions',
	{
		idHash: text('id_hash').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamptz('created_at').notNull().defaultNow(),
		expiresAt: timestamptz('expires_at').notNull()
	},
	(t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)]
);

export type User = typeof users.$inferSelect;
