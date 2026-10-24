import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';

const OUTBOX = process.env.E2E_OUTBOX ?? '.outbox-e2e';
const MAILPIT = process.env.MAILPIT_URL; // e.g. http://127.0.0.1:8025 with the compose stack

/** A unique address per test and browser project, so runs never collide. */
export function testEmail(info: TestInfo): string {
	const slug = `${info.project.name}-${info.title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
	return `e2e-${slug.slice(0, 40)}-${Date.now()}@example.com`;
}

const LINK = /https?:\/\/[^\s"<>]+\/auth\/verify\?[^\s"<>]+/;

async function fromMailpit(email: string): Promise<string | undefined> {
	// Mailpit API (verified from its swagger spec): GET /api/v1/search?query=…, GET /api/v1/message/{ID}
	const search = await fetch(
		`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`
	);
	const { messages } = (await search.json()) as { messages: { ID: string }[] };
	if (!messages?.length) return undefined;
	const msg = await fetch(`${MAILPIT}/api/v1/message/${messages[0]!.ID}`);
	const { Text } = (await msg.json()) as { Text: string };
	return Text.match(LINK)?.[0];
}

function fromOutbox(email: string): string | undefined {
	if (!existsSync(OUTBOX)) return undefined;
	const files = readdirSync(OUTBOX).sort().reverse();
	for (const f of files) {
		const m = JSON.parse(readFileSync(join(OUTBOX, f), 'utf8')) as { to: string; text: string };
		if (m.to === email) return m.text.match(LINK)?.[0];
	}
	return undefined;
}

/** The most recent sign-in link sent to `email` (polls for up to 10s). */
export async function latestMagicLink(email: string): Promise<string> {
	let link: string | undefined;
	await expect
		.poll(async () => (link = MAILPIT ? await fromMailpit(email) : fromOutbox(email)), {
			timeout: 10_000,
			message: `no sign-in email for ${email}`
		})
		.toBeTruthy();
	return link!;
}

/** Requests a link on /login and returns it. */
export async function requestLink(page: Page, email: string, next?: string): Promise<string> {
	await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
	await page.getByLabel('Email').fill(email);
	await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
	await expect(page.getByText('Check your inbox')).toBeVisible();
	return latestMagicLink(email);
}

/** Full magic-link sign-in; ends wherever the app redirects after "Continue". */
export async function signIn(page: Page, email: string, next?: string): Promise<void> {
	const link = await requestLink(page, email, next);
	await page.goto(link);
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.waitForURL((url) => !url.pathname.startsWith('/auth/verify'));
}
