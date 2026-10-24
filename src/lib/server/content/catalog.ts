import { basename } from 'node:path';
import { compile, type Graph } from '../../engine/graph';
import type { Session } from '../../engine/schema';
import { listSessionFiles, validateSessionFile } from './session-files';

// The session catalog: every session graph in sessions/, validated once at
// startup. Server-only and served only behind the gate. Titles, labels and clip
// ids are content and must never reach a pre-gate page or the client bundle.

export interface CatalogEntry {
	id: string;
	title: string;
	summary: string | undefined;
	access: 'free' | 'paid';
	session: Session;
	graph: Graph;
	clipIds: string[];
}

export interface Catalog {
	entries: CatalogEntry[];
	byId: ReadonlyMap<string, CatalogEntry>;
}

export class CatalogError extends Error {
	override name = 'CatalogError';
}

/**
 * Loads and validates every session (schema + graph rules; clip files are not
 * checked here because in production they live on the CDN). Throws if any
 * session is invalid, so a broken graph can never be served.
 */
export function loadCatalog(dir: string): Catalog {
	const entries: CatalogEntry[] = [];
	const problems: string[] = [];
	for (const file of listSessionFiles(dir)) {
		const result = validateSessionFile(file);
		if (result.issues.length || !result.session) {
			problems.push(
				`${basename(file)}: ${result.issues.map((i) => `[${i.code}] ${i.message}`).join('; ')}`
			);
			continue;
		}
		const s = result.session;
		entries.push({
			id: s.id,
			title: s.title,
			summary: s.summary,
			access: s.access,
			session: s,
			graph: compile(s),
			clipIds: [...new Set(s.nodes.map((n) => n.clipId))]
		});
	}
	if (problems.length) {
		throw new CatalogError(`Invalid session(s) in ${dir}:\n  - ${problems.join('\n  - ')}`);
	}
	return { entries, byId: new Map(entries.map((e) => [e.id, e])) };
}

let cached: Catalog | undefined;

export function getCatalog(): Catalog {
	cached ??= loadCatalog(process.env.SESSIONS_DIR ?? 'sessions');
	return cached;
}

/** Test hook: replace the catalog. */
export function setCatalogForTests(catalog: Catalog | undefined): void {
	cached = catalog;
}
