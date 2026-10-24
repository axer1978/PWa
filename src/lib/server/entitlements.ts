import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import type { Db } from './db';
import { entitlements, type Entitlement } from './db/schema';

// Read side of entitlements: who may play what, right now. The write side
// (applying verified payment events) lives in src/lib/server/payments/.
//
// Rules (also documented on the entitlements table):
// - free sessions: anyone signed in and age-verified (the gate checks those).
// - subscription: status active or cancelled, and current_period_end > now.
//   Cancelling keeps access until the paid period ends.
// - pack: status active; unlocks only the session ids snapshotted at purchase.
// - expired / revoked (refund, chargeback): nothing.

export interface PlayableSession {
	id: string;
	access: 'free' | 'paid';
}

/** Entitlement rows that grant access at `now`. */
export async function liveEntitlements(
	db: Db,
	userId: string,
	now: Date = new Date()
): Promise<Entitlement[]> {
	return db
		.select()
		.from(entitlements)
		.where(
			and(
				eq(entitlements.userId, userId),
				or(
					and(
						eq(entitlements.kind, 'subscription'),
						inArray(entitlements.status, ['active', 'cancelled']),
						gt(entitlements.currentPeriodEnd, now)
					),
					and(
						eq(entitlements.kind, 'pack'),
						eq(entitlements.status, 'active'),
						isNull(entitlements.currentPeriodEnd)
					)
				)
			)
		);
}

/** Pure: does this set of live entitlements unlock the session? */
export function unlocks(live: Entitlement[], session: PlayableSession): boolean {
	if (session.access === 'free') return true;
	return live.some(
		(e) =>
			e.kind === 'subscription' || (e.kind === 'pack' && (e.sessionIds ?? []).includes(session.id))
	);
}

export async function canPlay(
	db: Db,
	userId: string,
	session: PlayableSession,
	now: Date = new Date()
): Promise<boolean> {
	if (session.access === 'free') return true;
	return unlocks(await liveEntitlements(db, userId, now), session);
}

/** Access for many sessions with one query (library page). */
export async function accessMap(
	db: Db,
	userId: string,
	sessions: PlayableSession[],
	now: Date = new Date()
): Promise<Map<string, boolean>> {
	const live = sessions.some((s) => s.access === 'paid')
		? await liveEntitlements(db, userId, now)
		: [];
	return new Map(sessions.map((s) => [s.id, unlocks(live, s)]));
}

export interface PlanSummary {
	subscription: {
		planId: string;
		status: 'active' | 'cancelled';
		currentPeriodEnd: Date;
		provider: string;
		providerRef: string;
	} | null;
	packs: { planId: string; sessionIds: string[] }[];
}

/** What the account page shows: the current subscription (if any) and owned packs. */
export async function planSummary(
	db: Db,
	userId: string,
	now: Date = new Date()
): Promise<PlanSummary> {
	const live = await liveEntitlements(db, userId, now);
	const sub = live
		.filter((e) => e.kind === 'subscription')
		.sort((a, b) => b.currentPeriodEnd!.getTime() - a.currentPeriodEnd!.getTime())[0];
	return {
		subscription: sub
			? {
					planId: sub.planId,
					status: sub.status as 'active' | 'cancelled',
					currentPeriodEnd: sub.currentPeriodEnd!,
					provider: sub.provider,
					providerRef: sub.providerRef
				}
			: null,
		packs: live
			.filter((e) => e.kind === 'pack')
			.map((e) => ({ planId: e.planId, sessionIds: e.sessionIds ?? [] }))
	};
}
