// Prints "<clipId> <nodeType>" for every clip referenced by sessions/*.json, one
// per line, de-duplicated. Used by make-placeholder-audio.sh. Plain Node, no deps.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'sessions';
const seen = new Map();

for (const file of readdirSync(dir).sort()) {
	if (!file.endsWith('.json') || file.endsWith('.schema.json')) continue;
	const session = JSON.parse(readFileSync(join(dir, file), 'utf8'));
	for (const node of session.nodes ?? []) {
		if (typeof node.clipId === 'string' && !seen.has(node.clipId)) {
			seen.set(node.clipId, node.type);
		}
	}
}

for (const [clipId, type] of seen) console.log(`${clipId} ${type}`);
