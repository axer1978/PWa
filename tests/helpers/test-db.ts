import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Db } from '../../src/lib/server/db';
import * as schema from '../../src/lib/server/db/schema';

/**
 * A fresh in-memory Postgres (PGlite) with the real migrations applied. Unit
 * tests run without Docker; CI's e2e job still uses real Postgres 16.
 */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
	const client = new PGlite();
	const db = drizzle({ client, schema });
	await migrate(db, { migrationsFolder: resolve(import.meta.dirname, '../../drizzle') });
	return { db, close: () => client.close() };
}
