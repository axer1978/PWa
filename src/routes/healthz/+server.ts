import { json } from '@sveltejs/kit';
import { pingDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

const headers = { 'cache-control': 'no-store' };

export const GET: RequestHandler = async () => {
	try {
		await pingDb();
		return json({ status: 'ok' }, { headers });
	} catch {
		return json({ status: 'error', db: 'unreachable' }, { status: 503, headers });
	}
};
