import { expect, test, type Page } from '@playwright/test';
import { contentStrings, findContent } from '../scripts/lib/sfw';
import { signIn, testEmail } from './helpers';

// "No page before the age gate contains anything from the content directories."
// Crawls every page a visitor can reach before passing the age check (signed
// out, and signed in but unverified) and checks both the HTML and the network.

const content = contentStrings('sessions');

const PUBLIC = [
	'/',
	'/pricing',
	'/legal/terms',
	'/legal/privacy',
	'/legal/age',
	'/login',
	'/unavailable'
];
const SIGNED_IN_UNVERIFIED = ['/verify-age', '/account', ...PUBLIC];
/** Gated pages: an unverified visitor must be bounced before any content loads. */
const GATED = ['/library', '/play/demo-free', '/play/demo-sub'];

async function crawl(page: Page, paths: string[]) {
	const contentRequests: string[] = [];
	page.on('request', (req) => {
		const url = new URL(req.url());
		if (url.pathname.startsWith('/media/') || url.pathname.startsWith('/api/play/')) {
			contentRequests.push(url.pathname);
		}
	});
	for (const path of paths) {
		const res = await page.goto(path);
		expect(res?.status(), path).toBeLessThan(500);
		const html = await page.content();
		expect(findContent(html, content), `content on ${path} (landed on ${page.url()})`).toEqual([]);
	}
	expect(contentRequests, 'content/media requests before the age gate').toEqual([]);
}

test('there are content strings to check against', () => {
	expect(content.strings.length).toBeGreaterThan(10);
});

test('signed-out visitors see no content anywhere', async ({ page }) => {
	await crawl(page, [...PUBLIC, ...GATED]);
});

test('signed-in but unverified visitors see no content anywhere', async ({ page }, info) => {
	await signIn(page, testEmail(info));
	await crawl(page, [...SIGNED_IN_UNVERIFIED, ...GATED]);
});
