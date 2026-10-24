import postgres from 'postgres';

// Direct database access for e2e test SETUP only (e.g. "an age-verified user",
// "a user with a subscription"), so each area's browser tests don't depend on
// another area's UI. The app itself only ever changes these rows through its
// verified flows. Points at the self-contained harness (scripts/e2e-server.ts)
// by default, or at E2E_DATABASE_URL (e.g. the compose stack's Postgres).

const url =
	process.env.E2E_DATABASE_URL ??
	`postgres://postgres:postgres@127.0.0.1:${process.env.E2E_DB_PORT ?? '54329'}/postgres?sslmode=disable`;

export const sql = postgres(url, { max: 2, onnotice: () => {} });

const norm = (email: string) => email.trim().toLowerCase();

/** Marks a signed-up user as age-verified, as a passed age check would. */
export async function markVerified(email: string): Promise<void> {
	const rows = await sql`
		update users
		set av_verified = true, av_verified_at = now(), av_provider = 'mock',
			av_provider_ref = ${`e2e-${norm(email)}`}
		where email = ${norm(email)}
		returning id`;
	if (!rows.length) throw new Error(`no user ${email} (sign in first)`);
}

export async function grantSubscription(
	email: string,
	opts: {
		planId?: string;
		days?: number;
		status?: 'active' | 'cancelled' | 'expired' | 'revoked';
	} = {}
): Promise<string> {
	const ref = `e2e-sub-${crypto.randomUUID()}`;
	const rows = await sql`
		insert into entitlements (user_id, kind, plan_id, provider, provider_ref, status, current_period_end)
		select id, 'subscription', ${opts.planId ?? 'monthly'}, 'mock', ${ref},
			${opts.status ?? 'active'}, now() + make_interval(days => ${opts.days ?? 30})
		from users where email = ${norm(email)}
		returning id`;
	if (!rows.length) throw new Error(`no user ${email}`);
	return ref;
}

export async function grantPack(
	email: string,
	planId: string,
	sessionIds: string[]
): Promise<string> {
	const ref = `e2e-pack-${crypto.randomUUID()}`;
	const rows = await sql`
		insert into entitlements (user_id, kind, plan_id, provider, provider_ref, status, current_period_end, session_ids)
		select id, 'pack', ${planId}, 'mock', ${ref}, 'active', null, ${sql.json(sessionIds)}
		from users where email = ${norm(email)}
		returning id`;
	if (!rows.length) throw new Error(`no user ${email}`);
	return ref;
}

export async function userRow(email: string) {
	const [row] = await sql`select * from users where email = ${norm(email)}`;
	return row;
}
