import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` only diffs the schema, so no database connection is needed.
export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	strict: true,
	verbose: true
});
