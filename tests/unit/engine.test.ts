import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	adjacentNodeIds,
	availableActions,
	clipsToPreload,
	compile,
	EngineError,
	evaluateCondition,
	nextCandidates,
	start,
	step,
	type Action,
	type Cursor
} from '../../src/lib/engine/graph';
import { Session } from '../../src/lib/engine/schema';

const SESSIONS = resolve(import.meta.dirname, '../../sessions');

function load(id: string) {
	return compile(Session.parse(JSON.parse(readFileSync(join(SESSIONS, `${id}.json`), 'utf8'))));
}

const free = load('demo-free');
const ended: Action = { type: 'clipEnded' };
const tap: Action = { type: 'tap' };
const timeout: Action = { type: 'timeout' };
const choose = (option: number): Action => ({ type: 'choose', option });

function run(from: Cursor, ...actions: Action[]): Cursor {
	return actions.reduce((c, a) => step(free, c, a), from);
}

describe('engine traversal (demo-free)', () => {
	const begin = start(free);

	it('starts at the start node with a copy of the initial state', () => {
		expect(begin).toEqual({ nodeId: 'intro', state: { pace: 'slow', intensity: 1 }, done: false });
		begin.state.pace = 'mutated';
		expect(start(free).state.pace).toBe('slow');
		begin.state.pace = 'slow';
	});

	it('play advances when its clip ends', () => {
		expect(run(begin, ended).nodeId).toBe('hub');
	});

	it('choice applies the option state, then follows its target', () => {
		const c = run(begin, ended, choose(1));
		expect(c).toEqual({ nodeId: 'b-loop', state: { pace: 'fast', intensity: 2 }, done: false });
	});

	it('conditional edges branch on state', () => {
		// Path B sets intensity 2, so b-after goes to b-high.
		expect(run(begin, ended, choose(1), tap, ended).nodeId).toBe('b-high');
		// The fallback branch is taken when the condition fails.
		const low: Cursor = { nodeId: 'b-after', state: { pace: 'fast', intensity: 1 }, done: false };
		expect(step(free, low, ended).nodeId).toBe('hub');
	});

	it('timer: tap goes to next, timeout to defaultTarget', () => {
		const atTimer = run(begin, ended, choose(0));
		expect(atTimer.nodeId).toBe('a-timer');
		expect(step(free, atTimer, tap).nodeId).toBe('a-tapped');
		expect(step(free, atTimer, timeout).nodeId).toBe('a-waited');
	});

	it('choice timeout follows defaultTarget with unchanged state', () => {
		const c = run(begin, ended, timeout);
		expect(c.nodeId).toBe('wrap');
		expect(c.state).toEqual(begin.state);
	});

	it('reaches a different end depending on state', () => {
		expect(run(begin, ended, choose(2), ended).nodeId).toBe('outro');
		const fast = run(begin, ended, choose(1), tap, ended, ended, choose(2), ended);
		expect(fast.nodeId).toBe('outro-fast');
	});

	it('end completes the session; no further actions are accepted', () => {
		const done = run(begin, ended, choose(2), ended, ended);
		expect(done).toMatchObject({ nodeId: 'outro', done: true });
		expect(availableActions(free, done)).toEqual([]);
		expect(() => step(free, done, ended)).toThrow(EngineError);
	});

	it('rejects actions that do not apply to the node', () => {
		expect(() => step(free, begin, tap)).toThrow(/not valid on play node "intro"/);
		const atHub = run(begin, ended);
		expect(() => step(free, atHub, ended)).toThrow(EngineError);
		expect(() => step(free, atHub, choose(3))).toThrow(/no option 3/);
		const atTimer = run(atHub, choose(0));
		expect(() => step(free, atTimer, choose(0))).toThrow(EngineError);
	});

	it('never mutates the cursor it is given', () => {
		const atHub = run(begin, ended);
		const snapshot = structuredClone(atHub);
		step(free, atHub, choose(1));
		expect(atHub).toEqual(snapshot);
	});
});

describe('preloading', () => {
	const atHub: Cursor = { nodeId: 'hub', state: { pace: 'slow', intensity: 1 }, done: false };

	it('lists every node one action away, applying option state first', () => {
		expect(nextCandidates(free, atHub)).toEqual(['a-timer', 'b-loop', 'wrap']);
		const afterLow: Cursor = {
			nodeId: 'b-after',
			state: { pace: 'fast', intensity: 1 },
			done: false
		};
		expect(nextCandidates(free, afterLow)).toEqual(['hub']);
		const afterHigh = { ...afterLow, state: { pace: 'fast', intensity: 2 } };
		expect(nextCandidates(free, afterHigh)).toEqual(['b-high']);
	});

	it('maps candidates to unique clip ids', () => {
		expect(clipsToPreload(free, atHub)).toEqual([
			'demo-free-a-timer',
			'demo-free-b-loop',
			'demo-free-wrap'
		]);
	});

	it('adjacentNodeIds is state-independent (used server-side to issue clip URLs)', () => {
		expect(adjacentNodeIds(free, 'b-after').sort()).toEqual(['b-high', 'hub']);
		expect(adjacentNodeIds(free, 'outro')).toEqual([]);
	});
});

describe('conditions', () => {
	it('compares numbers and refuses mixed types for ordering', () => {
		const s = { n: 2, s: 'x' };
		expect(evaluateCondition({ key: 'n', op: 'gt', value: 1 }, s)).toBe(true);
		expect(evaluateCondition({ key: 'n', op: 'lte', value: 1 }, s)).toBe(false);
		expect(evaluateCondition({ key: 's', op: 'gt', value: 1 }, s)).toBe(false);
		expect(evaluateCondition({ key: 's', op: 'neq', value: 'y' }, s)).toBe(true);
		expect(evaluateCondition({ key: 'missing', op: 'eq', value: 1 }, s)).toBe(false);
	});
});

describe('random walks over every demo session', () => {
	// Deterministic PRNG so failures are reproducible.
	function mulberry32(seed: number) {
		return () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	it.each(['demo-free', 'demo-sub', 'demo-pack'])(
		'%s: random listeners always reach an end',
		(id) => {
			const graph = load(id);
			const rand = mulberry32(42);
			for (let walk = 0; walk < 200; walk++) {
				let cursor = start(graph);
				let steps = 0;
				while (!cursor.done) {
					const actions = availableActions(graph, cursor);
					expect(actions.length, `stuck at ${cursor.nodeId}`).toBeGreaterThan(0);
					// Lean towards leaving cycles so walks finish: prefer the last option ("Finish").
					const pick = rand() < 0.3 ? actions.length - 1 : Math.floor(rand() * actions.length);
					cursor = step(graph, cursor, actions[pick]!);
					expect(++steps, 'walk too long').toBeLessThan(500);
				}
			}
		}
	);
});
