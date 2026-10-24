import { error } from '@sveltejs/kit';
import { LEGAL_DOCS } from '$lib/legal';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const doc = LEGAL_DOCS[params.doc as keyof typeof LEGAL_DOCS];
	if (!doc) error(404, 'Not found');
	return { doc };
};
