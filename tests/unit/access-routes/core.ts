import type { RouteExpectations } from './types';

export const routes: RouteExpectations = {
	'/': { access: 'public' },
	'/pricing': { access: 'public' },
	'/legal/[doc]': { access: 'public', paths: ['/legal/terms', '/legal/privacy', '/legal/age'] },
	'/login': { access: 'public' },
	'/logout': { access: 'public' },
	'/auth/verify': { access: 'public' },
	'/unavailable': { access: 'public' },
	'/healthz': { access: 'public' },
	'/account': { access: 'auth' },
	'/verify-age': { access: 'auth' },
	'/library': { access: 'verified' }
};
