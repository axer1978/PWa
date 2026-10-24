// Applies Drizzle migrations before the server starts. Plain JS so the runtime
// image needs no TypeScript tooling. Usage: node [--env-file-if-exists=.env] infra/migrate.mjs
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

function databaseUrl() {
	const e = process.env;
	if (e.DATABASE_URL) return e.DATABASE_URL;
	if (!e.POSTGRES_USER || !e.POSTGRES_PASSWORD || !e.POSTGRES_DB) {
		throw new Error('Set DATABASE_URL, or all of POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB');
	}
	const user = encodeURIComponent(e.POSTGRES_USER);
	const pass = encodeURIComponent(e.POSTGRES_PASSWORD);
	return `postgres://${user}:${pass}@${e.POSTGRES_HOST ?? 'localhost'}:${e.POSTGRES_PORT ?? '5432'}/${e.POSTGRES_DB}`;
}

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const attempts = Number(process.env.MIGRATE_ATTEMPTS ?? 10);

// Connection-level failures worth retrying while Postgres starts up.
// 57P03 = cannot_connect_now (server starting / in recovery).
const RETRYABLE = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'CONNECT_TIMEOUT', '57P03']);

/** Drizzle wraps driver errors (DrizzleQueryError), so look through the cause chain. */
function isRetryable(err) {
	for (let e = err, depth = 0; e && typeof e === 'object' && depth < 5; e = e.cause, depth++) {
		if ('code' in e && RETRYABLE.has(String(e.code))) return true;
	}
	return false;
}

for (let attempt = 1; ; attempt++) {
	const client = postgres(databaseUrl(), { max: 1, connect_timeout: 5, onnotice: () => {} });
	try {
		await migrate(drizzle({ client }), { migrationsFolder });
		console.log('[migrate] database is up to date');
		await client.end();
		break;
	} catch (err) {
		await client.end({ timeout: 1 }).catch(() => {});
		if (!isRetryable(err) || attempt >= attempts) {
			console.error('[migrate] failed:', err);
			process.exit(1);
		}
		console.warn(`[migrate] database not ready (attempt ${attempt}/${attempts}), retrying in 2s`);
		await sleep(2000);
	}
}
