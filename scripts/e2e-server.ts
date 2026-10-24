// Starts a self-contained stack for Playwright when Docker isn't available:
// PGlite behind its Postgres wire-protocol server, migrations, then the built
// app (`node build`). Email goes to a file outbox. CI runs e2e against the real
// compose stack (Postgres 16 + Mailpit) instead; see playwright.config.ts.
//
//   npm run build && tsx scripts/e2e-server.ts
import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

export const E2E = {
	appPort: Number(process.env.E2E_APP_PORT ?? 4173),
	dbPort: Number(process.env.E2E_DB_PORT ?? 54329),
	outbox: '.outbox-e2e',
	/** Reserved ISO "user-assigned" code, so no real visitor is ever affected. */
	blockedCountry: 'ZZ'
};

const env = {
	...process.env,
	APP_ENV: 'test',
	ORIGIN: `http://localhost:${E2E.appPort}`,
	PORT: String(E2E.appPort),
	// "localhost", not 127.0.0.1: on Windows it may resolve to ::1 first, and the
	// server and Playwright's readiness probe must agree.
	HOST: 'localhost',
	DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${E2E.dbPort}/postgres?sslmode=disable`,
	APP_SECRET: 'dev-only-e2e-secret-0123456789abcdef0123456789',
	EMAIL_TRANSPORT: 'outbox',
	// Every test signs in from the same IP; the real limit is unit-tested.
	AUTH_LINKS_PER_IP: '1000',
	OUTBOX_DIR: E2E.outbox,
	BLOCKED_COUNTRIES: E2E.blockedCountry,
	GEO_UNKNOWN_POLICY: 'allow',
	GEO_COUNTRY_HEADER: 'X-Country-Code',
	GEOIP_DB_PATH: 'data/geoip/none.mmdb',
	AV_PROVIDER: 'mock',
	PAYMENT_PROVIDER: 'mock',
	STORAGE_DRIVER: 'local'
};

function run(cmd: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const p = spawn(cmd, args, { env, stdio: 'inherit' });
		p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
	});
}

rmSync(E2E.outbox, { recursive: true, force: true });

const db = new PGlite();
const server = new PGLiteSocketServer({
	db,
	port: E2E.dbPort,
	host: '127.0.0.1',
	maxConnections: 20
});
await server.start();
console.log(`[e2e] PGlite listening on 127.0.0.1:${E2E.dbPort}`);

await run(process.execPath, ['infra/migrate.mjs']);

const app: ChildProcess = spawn(process.execPath, ['build'], { env, stdio: 'inherit' });

async function shutdown(code = 0) {
	app.kill();
	await server.stop().catch(() => {});
	await db.close().catch(() => {});
	process.exit(code);
}
app.on('exit', (code) => void shutdown(code ?? 1));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => void shutdown(0));
