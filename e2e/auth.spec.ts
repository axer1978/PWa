import { expect, test } from '@playwright/test';
import { latestMagicLink, requestLink, signIn, testEmail } from './helpers';

test.describe('magic-link sign-in', () => {
	test('landing → sign in → age check → account → sign out', async ({ page }, info) => {
		const email = testEmail(info);

		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Audio that listens back.');
		await page.getByRole('link', { name: 'Start the free session' }).click();
		await expect(page).toHaveURL(/\/login\?next=(%2F|\/)library$/);

		await page.getByLabel('Email').fill(email);
		await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
		await expect(page.getByText('Check your inbox')).toBeVisible();

		await page.goto(await latestMagicLink(email));
		await expect(page.getByRole('heading', { name: 'Continue signing in' })).toBeVisible();
		await page.getByRole('button', { name: 'Continue' }).click();

		// Not age-verified yet, so the destination is the age check, carrying next.
		await expect(page).toHaveURL(/\/verify-age\?next=%2Flibrary$/);

		await page.getByRole('link', { name: 'Account' }).click();
		await expect(page.getByText(email)).toBeVisible();
		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
	});

	test('a sign-in link works only once', async ({ page }, info) => {
		const email = testEmail(info);
		const link = await requestLink(page, email);
		await page.goto(link);
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page).toHaveURL(/\/verify-age/);

		await page.context().clearCookies();
		await page.goto(link);
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByRole('heading', { name: 'Link not valid' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Send a new link' })).toBeVisible();
	});

	test('opening the link does not use it up (scanner-safe)', async ({ page, request }, info) => {
		const email = testEmail(info);
		const link = await requestLink(page, email);
		// A mail scanner pre-fetching the link with GET…
		expect((await request.get(link)).status()).toBe(200);
		// …leaves it usable for the person.
		await page.goto(link);
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page).toHaveURL(/\/verify-age/);
	});

	test('shows a field error for an invalid address', async ({ page }) => {
		await page.goto('/login');
		await page.getByLabel('Email').fill('not-an-email');
		await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
		await expect(page.getByText('Enter a valid email address')).toBeVisible();
		await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
	});
});

test.describe('without JavaScript (or before hydration)', () => {
	test.use({ javaScriptEnabled: false });

	// Native form posts must pass SvelteKit's CSRF origin check. They didn't with
	// Referrer-Policy: no-referrer (browsers then send "Origin: null").
	test('sign-in and sign-out work as plain form posts', async ({ page }, info) => {
		const email = testEmail(info);
		const link = await requestLink(page, email);
		await page.goto(link);
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page).toHaveURL(/\/verify-age/);
		await page.goto('/account');
		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page).toHaveURL(/\/$/);
	});
});

test.describe('default-deny gate', () => {
	test('signed-out visitors are sent to sign-in, keeping where they were going', async ({
		page
	}) => {
		for (const path of ['/library', '/account', '/verify-age', '/play/demo-free']) {
			await page.goto(path);
			await expect(page, path).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
		}
	});

	test('signed-in but unverified visitors are sent to the age check', async ({ page }, info) => {
		await signIn(page, testEmail(info));
		for (const path of ['/library', '/play/demo-free']) {
			await page.goto(path);
			await expect(page, path).toHaveURL(
				new RegExp(`/verify-age\\?next=${encodeURIComponent(path)}$`)
			);
		}
		// …but can always reach their account.
		await page.goto('/account');
		await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
	});

	test('API and media requests get a status, not a page', async ({ request }) => {
		expect((await request.get('/api/play/demo-free/clips')).status()).toBe(401);
		expect((await request.get('/media/demo-free-intro.opus')).status()).toBe(401);
	});
});
