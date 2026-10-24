import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// "No page before the age gate contains anything from the content directories."
// Content strings are what identifies a session: titles, summaries, choice
// labels and clip ids. Two checks use them:
// - scanBundle(): nothing in the built client JS/CSS (pre-gate pages load it)
// - e2e/sfw.spec.ts: nothing in pre-gate HTML, and no media/API requests

export interface ContentStrings {
	strings: string[];
	/** Where each string came from, for useful failure messages. */
	origin: Map<string, string>;
}

/** Strings shorter than this are too generic to search for (e.g. node ids like "a"). */
const MIN_LENGTH = 6;

export function contentStrings(sessionsDir: string): ContentStrings {
	const origin = new Map<string, string>();
	const add = (s: unknown, where: string) => {
		if (typeof s === 'string' && s.trim().length >= MIN_LENGTH && !origin.has(s.trim())) {
			origin.set(s.trim(), where);
		}
	};
	for (const file of readdirSync(sessionsDir)) {
		if (!file.endsWith('.json') || file.endsWith('.schema.json')) continue;
		const session = JSON.parse(readFileSync(join(sessionsDir, file), 'utf8')) as {
			title?: string;
			summary?: string;
			nodes?: { id: string; clipId?: string; options?: { label?: string }[] }[];
		};
		add(session.title, `${file} title`);
		add(session.summary, `${file} summary`);
		for (const node of session.nodes ?? []) {
			add(node.clipId, `${file} node ${node.id} clipId`);
			for (const o of node.options ?? []) add(o.label, `${file} node ${node.id} option`);
		}
	}
	return { strings: [...origin.keys()], origin };
}

export interface Hit {
	file: string;
	string: string;
	origin: string;
}

function walk(dir: string, out: string[] = []): string[] {
	if (!existsSync(dir)) return out;
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.(js|mjs|css|html|json|webmanifest)$/.test(name)) out.push(full);
	}
	return out;
}

/** Scans built client assets (build/client) for content strings. */
export function scanBundle(clientDir: string, content: ContentStrings): Hit[] {
	const hits: Hit[] = [];
	for (const file of walk(clientDir)) {
		const text = readFileSync(file, 'utf8');
		for (const s of content.strings) {
			if (text.includes(s)) {
				hits.push({
					file: relative(clientDir, file).split(sep).join('/'),
					string: s,
					origin: content.origin.get(s) ?? '?'
				});
			}
		}
	}
	return hits;
}

/** Content strings found in a piece of HTML/text (used by the e2e crawl). */
export function findContent(text: string, content: ContentStrings): string[] {
	return content.strings.filter((s) => text.includes(s));
}
