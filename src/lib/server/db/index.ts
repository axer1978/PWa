import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { databaseUrl } from '../config/env-schema';
import { getEnv } from '../env';
import * as schema from './schema';

/**
 * Driver-agnostic database type: postgres.js in the app, PGlite in unit tests.
 * Server code takes a `Db` and sticks to the query builder (no raw result shapes).
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let db: Db | undefined;

export function getDb(): Db {
	if (!db) {
		const client = postgres(databaseUrl(getEnv()), {
			max: 10,
			idle_timeout: 30,
			connect_timeout: 5
		});
		db = drizzle({ client, schema });
	}
	return db;
}

export async function pingDb(): Promise<void> {
	await getDb().execute(sql`select 1`);
}
