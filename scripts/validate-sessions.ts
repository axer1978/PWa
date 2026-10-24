// Validates every session graph. Runs in CI and fails the build on any issue.
//
//   tsx scripts/validate-sessions.ts [--dir sessions] [--clips content/audio] [--no-clips]
import { parseArgs } from 'node:util';
import { relative } from 'node:path';
import { validateSessionDir } from '../src/lib/server/content/session-files';

const { values } = parseArgs({
	options: {
		dir: { type: 'string', default: 'sessions' },
		clips: { type: 'string', default: 'content/audio' },
		'no-clips': { type: 'boolean', default: false }
	}
});

const results = validateSessionDir(values.dir, {
	clipsDir: values['no-clips'] ? undefined : values.clips
});

if (results.length === 0) {
	console.error(`validate-sessions: no session files found in ${values.dir}/`);
	process.exit(1);
}

let failed = 0;
for (const r of results) {
	const name = relative(process.cwd(), r.file);
	if (r.issues.length === 0) {
		console.log(`  ok    ${name}`);
		continue;
	}
	failed++;
	console.error(`  FAIL  ${name}`);
	for (const i of r.issues) {
		console.error(`        [${i.code}]${i.nodeId ? ` ${i.nodeId}:` : ''} ${i.message}`);
	}
}

if (values['no-clips']) console.log('  (clip files not checked: --no-clips)');
if (failed) {
	console.error(`validate-sessions: ${failed} of ${results.length} session(s) invalid`);
	process.exit(1);
}
console.log(`validate-sessions: ${results.length} session(s) valid`);
