// Fails (exit 1) if any content string (session titles, summaries, choice
// labels, clip ids) appears in the built client assets. Run after `npm run build`.
// Pre-gate pages load these assets, so content must never be bundled into them;
// it is only ever delivered as data from gated server routes.
import { contentStrings, scanBundle } from './lib/sfw';

const content = contentStrings('sessions');
if (content.strings.length === 0) {
	console.error('check-sfw: found no content strings in sessions/ (nothing to check against)');
	process.exit(1);
}

const hits = scanBundle('build/client', content);
if (hits.length) {
	console.error(`check-sfw: ${hits.length} content string(s) found in client assets:`);
	for (const h of hits) console.error(`  ${h.file}: "${h.string}" (from ${h.origin})`);
	process.exit(1);
}
console.log(
	`check-sfw: client assets contain none of the ${content.strings.length} content strings`
);
