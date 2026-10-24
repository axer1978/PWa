import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
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

// ---------------------------------------------------------------------------
// Age verification (Phase 3)
// ---------------------------------------------------------------------------

export const AV_ATTEMPT_STATES = ['started', 'passed', 'failed', 'expired', 'error'] as const;
export type AvAttemptState = (typeof AV_ATTEMPT_STATES)[number];

/**
 * One row per age-check attempt with a provider. Holds only the provider's
 * session reference and the outcome: never documents, images or birth dates.
 * The callback is matched to the attempt (and so to the signed-in user who
 * started it) through `id`/`providerRef`, never through client-supplied data.
 */
export const avAttempts = pgTable(
	'av_attempts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		provider: text('provider').notNull(),
		providerRef: text('provider_ref'),
		state: text('state').$type<AvAttemptState>().notNull().default('started'),
		createdAt: timestamptz('created_at').notNull().defaultNow(),
		completedAt: timestamptz('completed_at')
	},
	(t) => [
		index('av_attempts_user_idx').on(t.userId),
		uniqueIndex('av_attempts_provider_ref_key')
			.on(t.provider, t.providerRef)
			.where(sql`${t.providerRef} is not null`),
		check(
			'av_attempts_state_valid',
			sql`${t.state} in ('started', 'passed', 'failed', 'expired', 'error')`
		)
	]
);

// ---------------------------------------------------------------------------
// Payments and entitlements (Phase 5)
// ---------------------------------------------------------------------------

/**
 * A checkout we started. Its id is the reference sent to the payment processor
 * and echoed back in postbacks, which is how a verified postback is tied to a
 * user and plan. Nothing about the card ever reaches us.
 */
export const checkouts = pgTable(
	'checkouts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		planId: text('plan_id').notNull(),
		provider: text('provider').notNull(),
		createdAt: timestamptz('created_at').notNull().defaultNow(),
		completedAt: timestamptz('completed_at')
	},
	(t) => [index('checkouts_user_idx').on(t.userId)]
);

export const PAYMENT_EVENT_TYPES = [
	'subscription_started',
	'renewed',
	'cancelled',
	'reactivated',
	'expired',
	'refunded',
	'chargeback',
	'pack_purchased'
] as const;
export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

/**
 * Every verified postback, exactly once: (provider, provider_event_id) is
 * unique, which is what makes postback handling idempotent. Kept after account
 * deletion (user_id is nulled) because financial records must be retained.
 */
export const paymentEvents = pgTable(
	'payment_events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		provider: text('provider').notNull(),
		providerEventId: text('provider_event_id').notNull(),
		type: text('type').$type<PaymentEventType>().notNull(),
		userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
		checkoutId: uuid('checkout_id').references(() => checkouts.id, { onDelete: 'set null' }),
		planId: text('plan_id'),
		providerRef: text('provider_ref').notNull(),
		amountMinor: integer('amount_minor'),
		currency: text('currency'),
		occurredAt: timestamptz('occurred_at').notNull(),
		receivedAt: timestamptz('received_at').notNull().defaultNow(),
		/** The verified postback parameters (processors send no card data). */
		raw: jsonb('raw').$type<Record<string, string>>().notNull()
	},
	(t) => [
		uniqueIndex('payment_events_provider_event_key').on(t.provider, t.providerEventId),
		index('payment_events_ref_idx').on(t.provider, t.providerRef),
		index('payment_events_user_idx').on(t.userId)
	]
);

export const ENTITLEMENT_KINDS = ['subscription', 'pack'] as const;
export type EntitlementKind = (typeof ENTITLEMENT_KINDS)[number];
export const ENTITLEMENT_STATUSES = ['active', 'cancelled', 'expired', 'revoked'] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

/**
 * What a user may play. Written ONLY from verified payment events (or the admin
 * CLI, which records why). Access rule (src/lib/server/entitlements.ts):
 * - subscription: status active|cancelled and current_period_end > now
 * - pack: status active (no end), for the sessions the plan lists
 * - revoked (refund/chargeback) and expired: no access
 */
export const entitlements = pgTable(
	'entitlements',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		kind: text('kind').$type<EntitlementKind>().notNull(),
		planId: text('plan_id').notNull(),
		provider: text('provider').notNull(),
		/** The processor's subscription/sale id. */
		providerRef: text('provider_ref').notNull(),
		status: text('status').$type<EntitlementStatus>().notNull(),
		/** End of the paid period (subscriptions); null for packs. */
		currentPeriodEnd: timestamptz('current_period_end'),
		/**
		 * Packs only: the sessions bought, snapshotted at purchase so later edits
		 * to config/plans.json never take away something a listener paid for.
		 */
		sessionIds: jsonb('session_ids').$type<string[]>(),
		createdAt: timestamptz('created_at').notNull().defaultNow(),
		updatedAt: timestamptz('updated_at').notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('entitlements_provider_ref_key').on(t.provider, t.providerRef),
		index('entitlements_user_idx').on(t.userId),
		check('entitlements_kind_valid', sql`${t.kind} in ('subscription', 'pack')`),
		check(
			'entitlements_status_valid',
			sql`${t.status} in ('active', 'cancelled', 'expired', 'revoked')`
		)
	]
);

// ---------------------------------------------------------------------------
// Playback progress (Phase 4): resume across reloads and devices
// ---------------------------------------------------------------------------

export const playbackProgress = pgTable(
	'playback_progress',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		sessionId: text('session_id').notNull(),
		nodeId: text('node_id').notNull(),
		state: jsonb('state').$type<Record<string, string | number | boolean>>().notNull(),
		done: boolean('done').notNull().default(false),
		updatedAt: timestamptz('updated_at').notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.userId, t.sessionId] })]
);

export type AvAttempt = typeof avAttempts.$inferSelect;
export type Checkout = typeof checkouts.$inferSelect;
export type PaymentEventRow = typeof paymentEvents.$inferSelect;
export type Entitlement = typeof entitlements.$inferSelect;
export type PlaybackProgress = typeof playbackProgress.$inferSelect;
