import type { LayoutServerLoad } from './$types';

// Only what the page frame needs. No content data ever goes through the root layout.
export const load: LayoutServerLoad = ({ locals }) => ({
	signedIn: locals.user !== null
});
