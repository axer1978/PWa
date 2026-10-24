import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// These vendors' terms prohibit adult content, so the project must not depend on them.
// CI fails if any package, config file or source reference to them appears.

export interface Violation {
	vendor: string;
	where: string;
	match: string;
}

const BANNED_PACKAGES: { vendor: string; pattern: RegExp }[] = [
	{
		vendor: 'Vercel',
		// adapter-auto is banned too: it can resolve to the Vercel adapter at build time.
		pattern: /^(vercel|@vercel\/.+|@sveltejs\/adapter-vercel|@sveltejs\/adapter-auto)$/
	},
	{ vendor: 'Supabase', pattern: /^(supabase|@supabase\/.+)$/ },
	{ vendor: 'Stripe', pattern: /^(stripe|stripe-.+|@stripe\/.+)$/ },
	{ vendor: 'PayPal', pattern: /^(paypal-.+|.+-paypal|@paypal\/.+)$/ },
	{ vendor: 'Firebase', pattern: /^(firebase|firebase-.+|@firebase\/.+|reactfire)$/ },
	{
		vendor: 'Google Analytics',
		pattern:
			/^(react-ga|react-ga4|ga-4-react|vue-gtag|vue-gtag-next|svelte-gtag|ga-gtag|universal-analytics|@analytics\/google-analytics|@google-analytics\/.+|@types\/gtag\.js)$/
	},
	{
		vendor: 'Meta Pixel',
		pattern: /^(react-facebook-pixel|facebook-pixel|react-meta-pixel|meta-pixel|fb-pixel)$/
	}
];

const BANNED_REFERENCES: { vendor: string; pattern: RegExp }[] = [
	{ vendor: 'Vercel', pattern: /\bvercel\.(app|com)\b|@vercel\/|adapter-vercel/ },
	{ vendor: 'Supabase', pattern: /\bsupabase\.(co|com|in)\b|@supabase\// },
	{ vendor: 'Stripe', pattern: /\b(js|api|checkout|m)\.stripe\.com\b|@stripe\// },
	{ vendor: 'PayPal', pattern: /\bpaypal(objects)?\.com\b|@paypal\// },
	{
		vendor: 'Firebase',
		pattern: /\b(firebaseio|firebaseapp)\.com\b|\bfirebase\.google\.com\b|gstatic\.com\/firebasejs/
	},
	{
		vendor: 'Google Analytics',
		pattern: /\b(googletagmanager|google-analytics)\.com\b|\bgtag\s*\(/
	},
	{ vendor: 'Meta Pixel', pattern: /\bconnect\.facebook\.net\b|\bfbq\s*\(|facebook\.com\/tr\b/ }
];

const BANNED_FILES: { vendor: string; path: string }[] = [
	{ vendor: 'Vercel', path: 'vercel.json' },
	{ vendor: 'Vercel', path: '.vercel' },
	{ vendor: 'Supabase', path: 'supabase' },
	{ vendor: 'Firebase', path: 'firebase.json' },
	{ vendor: 'Firebase', path: '.firebaserc' }
];

/** Directories whose source is scanned for vendor references. Docs (*.md) are not scanned. */
const SCAN_DIRS = [
	'src',
	'static',
	'infra',
	'scripts',
	'e2e',
	'tests',
	'.github',
	'sessions',
	'config'
];
const SCAN_EXT =
	/\.(ts|js|mjs|cjs|svelte|html|json|ya?ml|sh|css|webmanifest)$|(^|\/)(Caddyfile|Dockerfile)$/;
const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', 'build']);
/** This checker and its test contain the patterns as data. */
const SELF_FILES = new Set(['scripts/lib/banned.ts', 'tests/unit/banned.test.ts']);

export function findBannedPackages(names: Iterable<string>, where: string): Violation[] {
	const out: Violation[] = [];
	for (const name of new Set(names)) {
		for (const { vendor, pattern } of BANNED_PACKAGES) {
			if (pattern.test(name)) out.push({ vendor, where, match: name });
		}
	}
	return out;
}

export function findBannedReferences(file: string, content: string): Violation[] {
	const out: Violation[] = [];
	const lines = content.split(/\r?\n/);
	lines.forEach((line, i) => {
		for (const { vendor, pattern } of BANNED_REFERENCES) {
			const m = pattern.exec(line);
			if (m) out.push({ vendor, where: `${file}:${i + 1}`, match: m[0] });
		}
	});
	return out;
}

/** Package names from an npm v2/v3 lockfile, including nested installs. */
export function packageNamesFromLockfile(lock: { packages?: Record<string, unknown> }): string[] {
	return Object.keys(lock.packages ?? {})
		.filter((k) => k.includes('node_modules/'))
		.map((k) => k.slice(k.lastIndexOf('node_modules/') + 'node_modules/'.length));
}

function walk(root: string, dir: string, files: string[]) {
	if (!existsSync(dir)) return;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) walk(root, full, files);
		else if (entry.isFile()) {
			const rel = relative(root, full).split(sep).join('/');
			if (SCAN_EXT.test(rel) && !SELF_FILES.has(rel)) files.push(rel);
		}
	}
}

export function scanRepo(root: string): Violation[] {
	const violations: Violation[] = [];

	const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<
		string,
		Record<string, string> | undefined
	>;
	const declared = [
		'dependencies',
		'devDependencies',
		'optionalDependencies',
		'peerDependencies'
	].flatMap((k) => Object.keys(pkg[k] ?? {}));
	violations.push(...findBannedPackages(declared, 'package.json'));

	const lockPath = join(root, 'package-lock.json');
	if (existsSync(lockPath)) {
		const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
			packages?: Record<string, unknown>;
		};
		violations.push(...findBannedPackages(packageNamesFromLockfile(lock), 'package-lock.json'));
	}

	for (const { vendor, path } of BANNED_FILES) {
		if (existsSync(join(root, path)))
			violations.push({ vendor, where: path, match: 'config file' });
	}

	const files: string[] = [];
	for (const d of SCAN_DIRS) walk(root, join(root, d), files);
	for (const entry of readdirSync(root)) {
		const full = join(root, entry);
		if (statSync(full).isFile() && SCAN_EXT.test(entry) && entry !== 'package-lock.json') {
			files.push(entry);
		}
	}
	for (const rel of files) {
		violations.push(...findBannedReferences(rel, readFileSync(join(root, rel), 'utf8')));
	}

	return violations;
}
