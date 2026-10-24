import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ISSUE_CODES, validateSession, type IssueCode } from '../../src/lib/engine/validate';
import {
	listSessionFiles,
	validateSessionDir,
	validateSessionFile
} from '../../src/lib/server/content/session-files';

const ROOT = resolve(import.meta.dirname, '../..');
const FIXTURES = join(ROOT, 'tests/fixtures/sessions');
const SESSIONS = join(ROOT, 'sessions');

/** Fixtures treat every clip as present except those named "missing-*". */
const clipExists = (clipId: string) => !clipId.startsWith('missing-');

function fixture(name: string): unknown {
	return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));
}

function codes(raw: unknown, opts = { clipExists }): Set<IssueCode> {
	return new Set(validateSession(raw, opts).issues.map((i) => i.code));
}

/** A minimal valid session to mutate in focused tests. */
function base(nodes: unknown[], extra: Record<string, unknown> = {}) {
	return { id: 'x', version: 1, title: 'T', access: 'free', start: 'a', nodes, ...extra };
}

const tmpDirs: string[] = [];
function tmp(): string {
	const dir = mkdtempSync(join(tmpdir(), 'sessions-test-'));
	tmpDirs.push(dir);
	return dir;
}
afterEach(() => {
	for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('validator fixtures', () => {
	it('the valid fixture has no issues', () => {
		expect(validateSession(fixture('valid'), { clipExists }).issues).toEqual([]);
	});

	// id-mismatch is a file-level check, covered below.
	const graphCodes = ISSUE_CODES.filter((c) => c !== 'id-mismatch');

	it('there is exactly one fixture per error class', () => {
		const names = readdirSync(FIXTURES)
			.map((f) => basename(f, '.json'))
			.filter((n) => n !== 'valid')
			.sort();
		expect(names).toEqual([...graphCodes].sort());
	});

	it.each(graphCodes)('the %s fixture fails with exactly that error', (code) => {
		const { issues } = validateSession(fixture(code), { clipExists });
		expect(issues.length).toBeGreaterThan(0);
		expect(new Set(issues.map((i) => i.code))).toEqual(new Set([code]));
		for (const i of issues) expect(i.message.length).toBeGreaterThan(10);
	});
});

describe('schema rules', () => {
	const end = { id: 'z', type: 'end', clipId: 'z' };

	it('rejects unknown node types and extra fields', () => {
		expect(codes(base([{ id: 'a', type: 'jump', clipId: 'a' }]))).toEqual(new Set(['schema']));
		expect(codes(base([{ ...end, id: 'a', colour: 'red' }]))).toEqual(new Set(['schema']));
	});

	it('rejects clip ids that could escape the audio directory', () => {
		for (const clipId of ['../etc/passwd', 'a/b', 'A', 'x.opus', '']) {
			expect(codes(base([{ id: 'a', type: 'end', clipId }]))).toEqual(new Set(['schema']));
		}
	});

	it('requires the last conditional branch to be unconditional, and only the last', () => {
		const when = { key: 'k', op: 'eq', value: 1 };
		const play = (next: unknown) =>
			base([{ id: 'a', type: 'play', clipId: 'a', next }, end], { state: { k: 1 } });
		expect(codes(play([{ when, target: 'z' }, { target: 'z' }]))).toEqual(new Set());
		expect(codes(play([{ when, target: 'z' }]))).toEqual(new Set(['schema']));
		expect(codes(play([{ target: 'z' }, { target: 'z' }]))).toEqual(new Set(['schema']));
	});

	it('choices need 2-3 options, and timeoutMs only with defaultTarget', () => {
		const opt = { label: 'Path A', target: 'z' };
		const choice = (extra: object) =>
			base([{ id: 'a', type: 'choice', clipId: 'a', ...extra }, end]);
		expect(codes(choice({ options: [opt, opt, opt, opt] }))).toEqual(new Set(['schema']));
		expect(codes(choice({ options: [opt, opt], timeoutMs: 5000 }))).toEqual(new Set(['schema']));
		expect(codes(choice({ options: [opt, opt], timeoutMs: 5000, defaultTarget: 'z' }))).toEqual(
			new Set()
		);
	});

	it('reports schema errors with a path that names the node', () => {
		const { issues } = validateSession(fixture('schema'), { clipExists });
		expect(issues[0]?.message).toContain('nodes[0](pick).options');
	});
});

describe('cycle rules', () => {
	const end = { id: 'z', type: 'end', clipId: 'z' };

	it('accepts a cycle a timer can leave on its own (timeout)', () => {
		const s = base([
			{ id: 'a', type: 'play', clipId: 'a', next: 't' },
			{ id: 't', type: 'timer', clipId: 't', timeoutMs: 2000, defaultTarget: 'z', next: 'a' },
			end
		]);
		expect(codes(s)).toEqual(new Set());
	});

	it('rejects a play node that loops to itself', () => {
		const s = base([{ id: 'a', type: 'play', clipId: 'a', next: 'a' }]);
		expect(codes(s)).toEqual(new Set(['trapped-cycle']));
	});

	it('rejects a loop node whose tap leads back into the same cycle', () => {
		const s = base([
			{ id: 'a', type: 'loop', clipId: 'a', next: 'b' },
			{ id: 'b', type: 'play', clipId: 'b', next: 'a' }
		]);
		expect(codes(s)).toEqual(new Set(['trapped-cycle']));
	});

	it('rejects a cycle whose choices all lead back into it', () => {
		const s = base([
			{
				id: 'a',
				type: 'choice',
				clipId: 'a',
				options: [
					{ label: 'Path A', target: 'b' },
					{ label: 'Path B', target: 'b' }
				]
			},
			{ id: 'b', type: 'play', clipId: 'b', next: 'a' }
		]);
		expect(codes(s)).toEqual(new Set(['trapped-cycle']));
	});
});

describe('clip checks', () => {
	it('names the missing formats', () => {
		const s = base([{ id: 'a', type: 'end', clipId: 'a' }]);
		const { issues } = validateSession(s, { clipExists: (_id, fmt) => fmt === 'opus' });
		expect(issues).toHaveLength(1);
		expect(issues[0]?.message).toContain('.m4a');
		expect(issues[0]?.message).not.toContain('.opus');
	});

	it('are skipped when no checker is given', () => {
		expect(validateSession(fixture('missing-clip')).issues).toEqual([]);
	});
});

describe('session files', () => {
	it('requires the session id to match the file name', () => {
		const dir = tmp();
		const file = join(dir, 'other-name.json');
		writeFileSync(file, JSON.stringify(fixture('valid')));
		const result = validateSessionFile(file);
		expect(result.issues.map((i) => i.code)).toEqual(['id-mismatch']);
	});

	it('reports invalid JSON as a schema issue', () => {
		const dir = tmp();
		writeFileSync(join(dir, 'broken.json'), '{ "id": ');
		expect(validateSessionDir(dir)[0]?.issues.map((i) => i.code)).toEqual(['schema']);
	});

	it('ignores JSON Schema files', () => {
		const dir = tmp();
		writeFileSync(join(dir, 'session.schema.json'), '{}');
		expect(listSessionFiles(dir)).toEqual([]);
	});

	it('the demo sessions are valid when every clip file exists', () => {
		const clips = tmp();
		const ids = new Set<string>();
		for (const file of listSessionFiles(SESSIONS)) {
			const session = JSON.parse(readFileSync(file, 'utf8')) as { nodes: { clipId: string }[] };
			for (const n of session.nodes) ids.add(n.clipId);
		}
		for (const id of ids) {
			writeFileSync(join(clips, `${id}.opus`), 'x');
			writeFileSync(join(clips, `${id}.m4a`), 'x');
		}

		const results = validateSessionDir(SESSIONS, { clipsDir: clips });
		expect(results.map((r) => basename(r.file))).toEqual([
			'demo-free.json',
			'demo-pack.json',
			'demo-sub.json'
		]);
		for (const r of results) expect(r.issues, r.file).toEqual([]);

		// An empty or absent file counts as missing.
		const [first] = ids;
		writeFileSync(join(clips, `${first}.m4a`), '');
		const codesAfter = validateSessionDir(SESSIONS, { clipsDir: clips }).flatMap((r) =>
			r.issues.map((i) => i.code)
		);
		expect(codesAfter).toContain('missing-clip');
	});
});
