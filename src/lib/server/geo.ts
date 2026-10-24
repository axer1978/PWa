import { existsSync } from 'node:fs';
import maxmind, { type CountryResponse } from 'maxmind';
import type { GeoPolicy } from './config/env-schema';

export interface CountryReader {
	lookup(ip: string): string | undefined;
}

/** Default location of the fallback database (scripts/fetch-geoip.sh puts it there). */
export const DEFAULT_GEOIP_PATH = 'data/geoip/dbip-country-lite.mmdb';

/** Opens a MaxMind-format country database (DB-IP Lite is compatible), if present. */
export async function openCountryReader(path: string): Promise<CountryReader | undefined> {
	if (!existsSync(path)) return undefined;
	const reader = await maxmind.open<CountryResponse>(path);
	return {
		lookup(ip) {
			try {
				return reader.get(ip)?.country?.iso_code ?? undefined;
			} catch {
				return undefined; // malformed address
			}
		}
	};
}

const COUNTRY = /^[A-Z]{2}$/;

/**
 * Country for a request: the trusted header first (set by infrastructure we
 * control; Caddy strips client copies), then the local database by client IP.
 * Codes that aren't two letters (e.g. "T1" for Tor, "XX" for unknown) count as unknown.
 */
export function resolveCountry(
	headers: Headers,
	ip: string | undefined,
	policy: GeoPolicy,
	reader: CountryReader | undefined
): string | undefined {
	const fromHeader = headers.get(policy.header)?.trim().toUpperCase();
	if (fromHeader && COUNTRY.test(fromHeader) && fromHeader !== 'XX') return fromHeader;
	if (ip && reader) return reader.lookup(ip);
	return undefined;
}

export function isBlocked(country: string | undefined, policy: GeoPolicy): boolean {
	return country ? policy.blocked.has(country) : policy.unknown === 'block';
}
