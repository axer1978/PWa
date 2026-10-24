import { expect, test, type Page } from '@playwright/test';
import { latestMagicLink, testEmail } from './helpers';

// The whole listener journey from the spec, end to end, on mobile Safari and
// mobile Chrome emulation:
//   landing → magic link → age check (mock) → free session → paywall →
//   mock checkout → paid session
// Runs once the play API, player, age check and payments are all in place
// (JOURNEY_READY=1 or the compose stack in CI).

test.skip(
	!process.env.JOURNEY_READY && !process.env.E2E_BASE_URL,
	'needs every area merged (set JOURNEY_READY=1)'
);
test.setTimeout(180_000);

/** Waits until the player has reached a node of the given type (or any node). */
async function playerAt(page: Page, type?: string) {
	const root = page.locator('[data-player-state]');
	await expect(root).toBeVisible();
	if (type) await expect(root).toHaveAttribute('data-node-type', type, { timeout: 30_000 });
	return root;
}

test('landing → sign in → age check → free session → paywall → checkout → paid session', async ({
	page
}, info) => {
	const email = testEmail(info);

	// 1. Landing (SFW) → start the free session → sign-in page.
	await page.goto('/');
	await page.getByRole('link', { name: 'Start the free session' }).click();
	await expect(page).toHaveURL(/\/login/);

	// 2. Magic link.
	await page.getByLabel('Email').fill(email);
	await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
	await expect(page.getByText('Check your inbox')).toBeVisible();
	await page.goto(await latestMagicLink(email));
	await page.getByRole('button', { name: 'Continue' }).click();

	// 3. Age check with the mock provider.
	await expect(page).toHaveURL(/\/verify-age/);
	await page.getByRole('button', { name: /confirm my age/i }).click();
	await expect(page).toHaveURL(/\/av\/mock/);
	await page.getByRole('button', { name: /approve/i }).click();
	await expect(page).toHaveURL(/\/library/);

	// 4. The free session plays.
	await page.goto('/play/demo-free');
	await page.getByRole('button', { name: /tap to begin|begin|start/i }).click();
	const player = await playerAt(page);
	await expect(player).toHaveAttribute('data-node-id', /.+/);
	// The first choice node appears after the intro clip.
	await playerAt(page, 'choice');
	await expect(page.getByRole('button', { name: /Path A/ })).toBeVisible();

	// 5. A paid session shows the paywall.
	await page.goto('/play/demo-sub');
	await expect(page.locator('[data-player-state]')).toHaveCount(0);
	const choose = page.getByRole('button', { name: /monthly/i }).first();
	await expect(choose).toBeVisible();

	// 6. Mock checkout on the simulated hosted page.
	await choose.click();
	await expect(page).toHaveURL(/\/pay\/mock\//);
	await page.getByRole('button', { name: /pay/i }).click();
	await expect(page).toHaveURL(/\/pay\/return/);
	await expect(page.getByText(/payment received|unlocked|you're in/i)).toBeVisible({
		timeout: 60_000
	});

	// 7. The paid session now plays.
	await page.goto('/play/demo-sub');
	await page.getByRole('button', { name: /tap to begin|begin|start/i }).click();
	await playerAt(page);
	await playerAt(page, 'choice');
	await expect(page.getByRole('button', { name: /Path B/ })).toBeVisible();
});
