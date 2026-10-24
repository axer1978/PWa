import type { ServerInit } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { geoPolicy } from '$lib/server/config/env-schema';
import { getDb } from '$lib/server/db';
import { getEnv } from '$lib/server/env';
import { DEFAULT_GEOIP_PATH, openCountryReader, type CountryReader } from '$lib/server/geo';
import { createGeoHandle, createSessionHandle, gateHandle } from '$lib/server/hooks';

let countryReader: CountryReader | undefined;

// Fail fast: invalid config (including mock providers in production) stops the
// server before it accepts a single request.
export const init: ServerInit = async () => {
	const env = getEnv();
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

export const handle = sequence(
	createGeoHandle({ policy: () => geoPolicy(getEnv()), reader: () => countryReader }),
	createSessionHandle({ db: getDb, ttlDays: () => getEnv().SESSION_TTL_DAYS }),
	gateHandle
);
