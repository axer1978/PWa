import type { PageServerLoad } from './$types';

// SFW: needs sign-in but not age verification, so anyone can always reach their
// account (and, from Phase 5, its one-click cancel link).
export const load: PageServerLoad = ({ locals }) => {
	// The gate guarantees a user here.
	const user = locals.user!;
	return { email: user.email, avVerified: user.avVerified };
};
