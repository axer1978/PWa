import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { contentStrings, findContent, scanBundle } from '../../scripts/lib/sfw';

const SESSIONS = resolve(import.meta.dirname, '../../sessions');
const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('SFW content check', () => {
	const content = contentStrings(SESSIONS);

	it('collects titles, summaries, labels and clip ids, but not generic short ids', () => {
		expect(content.strings).toContain('Demo session 1');
		expect(content.strings).toContain('demo-free-intro');
		expect(content.strings).toContain('Path A');
		expect(content.strings).not.toContain('hub');
		expect(content.origin.get('demo-free-intro')).toContain('demo-free.json');
	});

	it('flags a client bundle that embeds session data', () => {
		const dir = mkdtempSync(join(tmpdir(), 'sfw-'));
		dirs.push(dir);
		mkdirSync(join(dir, '_app'), { recursive: true });
		writeFileSync(join(dir, '_app', 'ok.js'), 'export const x = "Audio that listens back."');
		writeFileSync(join(dir, '_app', 'leak.js'), 'const s = {title:"Demo session 1"}');
		const hits = scanBundle(dir, content);
		expect(hits).toEqual([
			{ file: '_app/leak.js', string: 'Demo session 1', origin: 'demo-free.json title' }
		]);
	});

	it('finds content in page text', () => {
		expect(findContent('<h1>Demo session 2</h1>', content)).toEqual(['Demo session 2']);
		expect(findContent('<h1>Plans</h1>', content)).toEqual([]);
	});
});
