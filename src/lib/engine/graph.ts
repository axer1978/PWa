import type { Condition, Edge, Session, SessionNode, State, When } from './schema';

// Pure session-graph runtime, shared by the player (client) and the server.
// It assumes a session that has passed validateSession().

export class EngineError extends Error {
	override name = 'EngineError';
}

/** Where the listener is: a node, the state so far, and whether the end clip has finished. */
export interface Cursor {
	nodeId: string;
	state: State;
	done: boolean;
}

export type Action =
	| { type: 'clipEnded' }
	| { type: 'choose'; option: number }
	| { type: 'tap' }
	| { type: 'timeout' };

/** How an edge is taken: `user` edges need a listener action; `auto` edges follow on their own. */
export type EdgeKind = 'auto' | 'user';

export interface OutgoingEdge {
	edge: Edge;
	kind: EdgeKind;
	via: 'next' | 'option' | 'defaultTarget';
	optionIndex?: number;
}

export interface Graph {
	session: Session;
	nodes: ReadonlyMap<string, SessionNode>;
}

export function compile(session: Session): Graph {
	return { session, nodes: new Map(session.nodes.map((n) => [n.id, n])) };
}

export function getNode(graph: Graph, id: string): SessionNode {
	const node = graph.nodes.get(id);
	if (!node) throw new EngineError(`unknown node "${id}"`);
	return node;
}

export function start(graph: Graph): Cursor {
	return { nodeId: graph.session.start, state: { ...graph.session.state }, done: false };
}

export function evaluateCondition(c: Condition, state: State): boolean {
	const v = state[c.key];
	switch (c.op) {
		case 'eq':
			return v === c.value;
		case 'neq':
			return v !== c.value;
		case 'gt':
		case 'gte':
		case 'lt':
		case 'lte': {
			if (typeof v !== 'number' || typeof c.value !== 'number') return false;
			if (c.op === 'gt') return v > c.value;
			if (c.op === 'gte') return v >= c.value;
			if (c.op === 'lt') return v < c.value;
			return v <= c.value;
		}
	}
}

export function conditionsHold(when: When | undefined, state: State): boolean {
	if (!when) return true;
	const list = Array.isArray(when) ? when : [when];
	return list.every((c) => evaluateCondition(c, state));
}

export function resolveEdge(edge: Edge, state: State): string {
	if (typeof edge === 'string') return edge;
	for (const branch of edge) {
		if (conditionsHold(branch.when, state)) return branch.target;
	}
	throw new EngineError('no branch matched (the last branch must be unconditional)');
}

/** Every node an edge could lead to, whatever the state. */
export function edgeTargets(edge: Edge): string[] {
	return typeof edge === 'string' ? [edge] : edge.map((b) => b.target);
}

export function outgoingEdges(node: SessionNode): OutgoingEdge[] {
	switch (node.type) {
		case 'play':
			return node.next ? [{ edge: node.next, kind: 'auto', via: 'next' }] : [];
		case 'choice': {
			const out: OutgoingEdge[] = node.options.map((o, i) => ({
				edge: o.target,
				kind: 'user',
				via: 'option',
				optionIndex: i
			}));
			if (node.defaultTarget) {
				out.push({ edge: node.defaultTarget, kind: 'auto', via: 'defaultTarget' });
			}
			return out;
		}
		case 'timer': {
			const out: OutgoingEdge[] = [
				{ edge: node.defaultTarget, kind: 'auto', via: 'defaultTarget' }
			];
			if (node.next) out.push({ edge: node.next, kind: 'user', via: 'next' });
			return out;
		}
		case 'loop':
			return node.next ? [{ edge: node.next, kind: 'user', via: 'next' }] : [];
		case 'end':
			return [];
	}
}

function invalid(node: SessionNode, action: Action): never {
	throw new EngineError(`action "${action.type}" is not valid on ${node.type} node "${node.id}"`);
}

function moveTo(edge: Edge | undefined, state: State, node: SessionNode, action: Action): Cursor {
	if (!edge) invalid(node, action);
	return { nodeId: resolveEdge(edge, state), state, done: false };
}

/** Applies a listener or playback action and returns the new cursor. Never mutates its input. */
export function step(graph: Graph, cursor: Cursor, action: Action): Cursor {
	if (cursor.done) throw new EngineError('session is already complete');
	const node = getNode(graph, cursor.nodeId);

	switch (node.type) {
		case 'play':
			if (action.type !== 'clipEnded') invalid(node, action);
			return moveTo(node.next, cursor.state, node, action);

		case 'choice': {
			if (action.type === 'choose') {
				const option = node.options[action.option];
				if (!option) throw new EngineError(`choice "${node.id}" has no option ${action.option}`);
				const state = option.set ? { ...cursor.state, ...option.set } : cursor.state;
				return moveTo(option.target, state, node, action);
			}
			if (action.type === 'timeout') return moveTo(node.defaultTarget, cursor.state, node, action);
			return invalid(node, action);
		}

		case 'timer':
			if (action.type === 'timeout') return moveTo(node.defaultTarget, cursor.state, node, action);
			if (action.type === 'tap') {
				return moveTo(node.next ?? node.defaultTarget, cursor.state, node, action);
			}
			return invalid(node, action);

		case 'loop':
			if (action.type !== 'tap') invalid(node, action);
			return moveTo(node.next, cursor.state, node, action);

		case 'end':
			if (action.type !== 'clipEnded') invalid(node, action);
			return { ...cursor, done: true };
	}
}

/** The actions `step` accepts at the cursor. The player uses this to decide which controls to show. */
export function availableActions(graph: Graph, cursor: Cursor): Action[] {
	if (cursor.done) return [];
	const node = getNode(graph, cursor.nodeId);
	switch (node.type) {
		case 'play':
			return node.next ? [{ type: 'clipEnded' }] : [];
		case 'choice': {
			const actions: Action[] = node.options.map((_, option) => ({ type: 'choose', option }));
			if (node.defaultTarget) actions.push({ type: 'timeout' });
			return actions;
		}
		case 'timer':
			return [{ type: 'tap' }, { type: 'timeout' }];
		case 'loop':
			return node.next ? [{ type: 'tap' }] : [];
		case 'end':
			return [{ type: 'clipEnded' }];
	}
}

/**
 * The nodes the listener could reach with one action from here, given the
 * current state (options' `set` is applied first). The player preloads their clips.
 */
export function nextCandidates(graph: Graph, cursor: Cursor): string[] {
	if (cursor.done) return [];
	const node = getNode(graph, cursor.nodeId);
	const ids = new Set<string>();
	for (const out of outgoingEdges(node)) {
		let state = cursor.state;
		if (out.via === 'option' && node.type === 'choice') {
			const set = node.options[out.optionIndex ?? -1]?.set;
			if (set) state = { ...state, ...set };
		}
		ids.add(resolveEdge(out.edge, state));
	}
	return [...ids];
}

/** Clip ids to have ready for gapless transitions from the cursor. */
export function clipsToPreload(graph: Graph, cursor: Cursor): string[] {
	return [...new Set(nextCandidates(graph, cursor).map((id) => getNode(graph, id).clipId))];
}

/**
 * Every node adjacent to `nodeId` under any state. The server uses this
 * superset to decide which clip URLs to issue, without trusting client state.
 */
export function adjacentNodeIds(graph: Graph, nodeId: string): string[] {
	const node = getNode(graph, nodeId);
	return [...new Set(outgoingEdges(node).flatMap((o) => edgeTargets(o.edge)))];
}
