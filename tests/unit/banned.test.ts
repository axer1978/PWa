import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	findBannedPackages,
	findBannedReferences,
	packageNamesFromLockfile,
	scanRepo
} from '../../scripts/lib/banned';

describe('banned vendor check', () => {
	it.each([
		['@sveltejs/adapter-vercel', 'Vercel'],
		['@sveltejs/adapter-auto', 'Vercel'],
		['@vercel/analytics', 'Vercel'],
		['@supabase/supabase-js', 'Supabase'],
		['stripe', 'Stripe'],
		['@stripe/stripe-js', 'Stripe'],
		['@paypal/paypal-js', 'PayPal'],
		['firebase', 'Firebase'],
		['@firebase/app', 'Firebase'],
		['react-ga4', 'Google Analytics'],
		['react-facebook-pixel', 'Meta Pixel']
	])('flags package %s as %s', (name, vendor) => {
		expect(findBannedPackages([name], 'package.json')).toEqual([
			{ vendor, where: 'package.json', match: name }
		]);
	});

	it('does not flag allowed packages', () => {
		expect(
			findBannedPackages(['svelte', '@sveltejs/adapter-node', 'drizzle-orm', 'zod'], 'x')
		).toEqual([]);
	});

	it('reads nested package names from a lockfile', () => {
		const names = packageNamesFromLockfile({
			packages: {
				'': {},
				'node_modules/zod': {},
				'node_modules/a/node_modules/@stripe/stripe-js': {}
			}
		});
		expect(names).toEqual(['zod', '@stripe/stripe-js']);
	});

	it.each([
		['<script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>', 'Google Analytics'],
		["gtag('config', 'G-1')", 'Google Analytics'],
		["fbq('init', '123')", 'Meta Pixel'],
		['<script src="https://connect.facebook.net/en_US/fbevents.js">', 'Meta Pixel'],
		['const s = "https://js.stripe.com/v3"', 'Stripe'],
		['url: https://abc.supabase.co', 'Supabase'],
		['https://myapp.vercel.app', 'Vercel'],
		['https://x.firebaseio.com', 'Firebase'],
		['https://www.paypal.com/sdk/js', 'PayPal']
	])('flags source reference %s', (line, vendor) => {
		const found = findBannedReferences('src/x.ts', `ok\n${line}`);
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({ vendor, where: 'src/x.ts:2' });
	});

	it('does not flag ordinary source', () => {
		expect(findBannedReferences('src/x.ts', 'const stripes = 3; // zebra')).toEqual([]);
	});

	it('the repository itself is clean', () => {
		expect(scanRepo(resolve(import.meta.dirname, '../..'))).toEqual([]);
	});
});
