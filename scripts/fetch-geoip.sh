#!/usr/bin/env bash
# Downloads the free DB-IP "IP to Country Lite" database (MMDB, CC BY 4.0,
# updated monthly) to data/geoip/dbip-country-lite.mmdb. The app reads it at
# startup, so restart the app after refreshing:
#
#   scripts/fetch-geoip.sh && docker compose restart app
#
# Licence: attribution "IP Geolocation by DB-IP" with a link to https://db-ip.com
# is required. It's in the footer of every public page.
set -euo pipefail

OUT_DIR=${1:-data/geoip}
OUT="$OUT_DIR/dbip-country-lite.mmdb"
BASE=https://download.db-ip.com/free
mkdir -p "$OUT_DIR"
tmp=$(mktemp "$OUT_DIR/.dbip.XXXXXX")
trap 'rm -f "$tmp" "$tmp.mmdb"' EXIT

this_month=$(date -u +%Y-%m)
# Early in a month the new file may not be published yet: fall back to last month.
last_month=$(date -u -d "$(date -u +%Y-%m-01) -1 month" +%Y-%m 2>/dev/null || date -u -v-1m +%Y-%m)

for month in "$this_month" "$last_month"; do
	url="$BASE/dbip-country-lite-$month.mmdb.gz"
	if curl -sSfL --retry 3 -o "$tmp" "$url"; then
		gunzip -c "$tmp" >"$tmp.mmdb"
		# Sanity check: MMDB files end with a metadata section containing this marker.
		if ! LC_ALL=C grep -aq 'MaxMind.com' "$tmp.mmdb"; then
			echo "downloaded file doesn't look like an MMDB database" >&2
			exit 1
		fi
		mv "$tmp.mmdb" "$OUT"
		echo "GeoIP database updated: $OUT ($month)"
		exit 0
	fi
	echo "not available yet: $url" >&2
done

echo "could not download the DB-IP Lite database" >&2
exit 1
