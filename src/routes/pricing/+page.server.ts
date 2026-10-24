import { formatPrice, getPlans } from '$lib/server/config/plans';
import type { PageServerLoad } from './$types';

// Only plan names, prices and descriptions: no session titles or content, as this page is pre-gate.
export const load: PageServerLoad = () => {
	const { currency, plans } = getPlans();
	return {
		plans: plans.map((p) => ({
			id: p.id,
			name: p.name,
			description: p.description,
			price: formatPrice(p.priceMinor, currency),
			per: p.kind === 'subscription' ? (p.interval === 'month' ? 'per month' : 'per year') : 'once'
		})),
		freePrice: formatPrice(0, currency)
	};
};
