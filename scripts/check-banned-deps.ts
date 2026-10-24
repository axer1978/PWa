// Fails (exit 1) if the repo depends on or references a banned vendor. Runs in CI.
import { scanRepo } from './lib/banned';

const violations = scanRepo(process.cwd());

if (violations.length === 0) {
	console.log('check-banned-deps: no banned vendors found');
} else {
	console.error(`check-banned-deps: ${violations.length} violation(s)`);
	for (const v of violations) console.error(`  [${v.vendor}] ${v.where}: ${v.match}`);
	process.exit(1);
}
