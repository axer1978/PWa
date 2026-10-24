import type { HandleServerError, ServerInit } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { geoPolicy } from '$lib/server/config/env-schema';
import { getPlans } from '$lib/server/config/plans';
import { getCatalog } from '$lib/server/content/catalog';
import { cspExtras, type CspExtras } from '$lib/server/csp';
import { getDb } from '$lib/server/db';
import { getEnv } from '$lib/server/env';
import { DEFAULT_GEOIP_PATH, openCountryReader, type CountryReader } from '$lib/server/geo';
import {
	createCspHandle,
	createGeoHandle,
	createSessionHandle,
	gateHandle
} from '$lib/server/hooks';

let countryReader: CountryReader | undefined;
let extras: CspExtras = { 'form-action': [], 'media-src': [], 'connect-src': [] };

// Fail fast: invalid config (including mock providers in production), an
// invalid session graph or a broken plans file stops the server before it
// accepts a single request.
export const init: ServerInit = async () => {
	const env = getEnv();
	getCatalog();
	getPlans();
	extras = cspExtras(env);

	const path = env.GEOIP_DB_PATH ?? DEFAULT_GEOIP_PATH;
	countryReader = await openCountryReader(path);
	const policy = geoPolicy(env);
	if (!countryReader && (policy.blocked.size > 0 || policy.unknown === 'block')) {
		console.warn(
			`[geo] no GeoIP database at ${path}: without a trusted ${env.GEO_COUNTRY_HEADER} header, ` +
				`every visitor's country is unknown (policy: ${policy.unknown}). Run scripts/fetch-geoip.sh.`
		);
	}
};

/**
 * Unexpected errors: log them with a reference id (path only: query strings can
 * carry tokens) and show visitors a generic message plus the id, so support can
 * find the log line without exposing internals.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const id = crypto.randomUUID().slice(0, 8);
	if (status >= 500) {
		console.error(`[error ${id}] ${event.request.method} ${event.url.pathname}`, error);
		return { message: 'Something went wrong', id };
	}
	return { message, id };
};

export const handle = sequence(
	createGeoHandle({ policy: () => geoPolicy(getEnv()), reader: () => countryReader }),
	createSessionHandle({ db: getDb, ttlDays: () => getEnv().SESSION_TTL_DAYS }),
	gateHandle,
	createCspHandle(() => extras)
);
