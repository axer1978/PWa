import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
	validateSession,
	type ClipFormat,
	type Issue,
	type ValidationResult
} from '../../engine/validate';

// File-system side of session validation. Used by scripts/validate-sessions.ts
// and, from Phase 3, by the server's session catalog.

export interface SessionFileResult extends ValidationResult {
	file: string;
}

/** `*.json` session files in `dir`, excluding JSON Schema files, sorted. */
export function listSessionFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith('.json') && !f.endsWith('.schema.json'))
		.sort()
		.map((f) => join(dir, f));
}

/** A clip exists if its file is present and non-empty. */
export function fileClipChecker(clipsDir: string): (clipId: string, format: ClipFormat) => boolean {
	return (clipId, format) => {
		const path = join(clipsDir, `${clipId}.${format}`);
		return existsSync(path) && statSync(path).size > 0;
	};
}

export function validateSessionFile(
	file: string,
	opts: { clipsDir?: string } = {}
): SessionFileResult {
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(file, 'utf8'));
	} catch (e) {
		return {
			file,
			issues: [{ code: 'schema', message: `not valid JSON: ${(e as Error).message}` }]
		};
	}

	const result = validateSession(raw, {
		clipExists: opts.clipsDir ? fileClipChecker(opts.clipsDir) : undefined
	});

	const expectedId = basename(file, '.json');
	const issues: Issue[] = [...result.issues];
	if (result.session && result.session.id !== expectedId) {
		issues.unshift({
			code: 'id-mismatch',
			message: `session id "${result.session.id}" must match its file name ("${expectedId}.json")`
		});
	}
	return { ...result, file, issues };
}

export function validateSessionDir(
	dir: string,
	opts: { clipsDir?: string } = {}
): SessionFileResult[] {
	return listSessionFiles(dir).map((f) => validateSessionFile(f, opts));
}
