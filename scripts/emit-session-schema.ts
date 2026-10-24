// Writes sessions/session.schema.json from the zod schema, for editor autocomplete
// and validation. With --check, fails if the committed file is out of date (CI).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { z } from 'zod';
import { Session } from '../src/lib/engine/schema';

const OUT = 'sessions/session.schema.json';

const schema = {
	...z.toJSONSchema(Session, { target: 'draft-2020-12', io: 'input' }),
	$id: 'session.schema.json',
	title: 'Interactive audio session',
	description:
		'Generated from src/lib/engine/schema.ts by scripts/emit-session-schema.ts. Do not edit. Graph rules (reachability, dead ends, cycles, clips) are checked by scripts/validate-sessions.ts.'
};
const json = `${JSON.stringify(schema, null, '\t')}\n`;

if (process.argv.includes('--check')) {
	const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
	if (current !== json) {
		console.error(`${OUT} is out of date. Run: npm run sessions:schema`);
		process.exit(1);
	}
	console.log(`${OUT} is up to date`);
} else {
	writeFileSync(OUT, json);
	console.log(`wrote ${OUT}`);
}
