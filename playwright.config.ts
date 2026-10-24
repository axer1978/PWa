import { defineConfig, devices } from '@playwright/test';

// Two ways to run:
// - Against a running stack: E2E_BASE_URL=https://localhost npm run test:e2e
//   (docker compose; magic links read from Mailpit via MAILPIT_URL).
// - Self-contained (default): builds the app and starts scripts/e2e-server.ts
//   (PGlite + file outbox), so it works without Docker.
const external = process.env.E2E_BASE_URL;
// E2E_APP_PORT lets several worktrees run the self-contained stack side by side.
const port = process.env.E2E_APP_PORT ?? '4173';
const baseURL = external ?? `http://localhost:${port}`;

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL,
		// Caddy's local CA isn't trusted by the test browsers.
		ignoreHTTPSErrors: true,
		trace: 'retain-on-failure'
	},
	projects: [
		{ name: 'mobile-safari', use: { ...devices['iPhone 15'] } },
		{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }
	],
	webServer: external
		? undefined
		: {
				command: 'npm run build && npx tsx scripts/e2e-server.ts',
				url: `${baseURL}/healthz`,
				timeout: 240_000,
				reuseExistingServer: !process.env.CI,
				stdout: 'pipe'
			}
});
