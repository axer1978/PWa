import { compile, edgeTargets, outgoingEdges } from './graph';
import {
	Session as SessionSchema,
	type Condition,
	type Edge,
	type NodeType,
	type Session,
	type StateValue
} from './schema';

// Static checks for a session graph. Pure; file access is injected (clipExists),
// so this runs the same in the CLI, in tests and on the server.

export const ISSUE_CODES = [
	'schema',
	'id-mismatch',
	'duplicate-node',
	'missing-start',
	'dangling-target',
	'unknown-state-key',
	'state-type-mismatch',
	'unreachable',
	'dead-end',
	'trapped-cycle',
	'missing-clip'
] as const;

export type IssueCode = (typeof ISSUE_CODES)[number];

export interface Issue {
	code: IssueCode;
	message: string;
	nodeId?: string;
}

/** Node types a listener interacts with; only they can provide a cycle's exit. */
const INTERACTIVE = new Set<NodeType>(['choice', 'loop', 'timer']);

export const CLIP_FORMATS = ['opus', 'm4a'] as const;
export type ClipFormat = (typeof CLIP_FORMATS)[number];

export interface ValidateOptions {
	/** Omit to skip the clip-file check (e.g. on the server when clips live on the CDN). */
	clipExists?: (clipId: string, format: ClipFormat) => boolean;
}

export interface ValidationResult {
	/** Present whenever the schema parsed, even if graph checks then failed. */
	session?: Session;
	issues: Issue[];
}

/** `nodes[2](pick).options` style paths; nodes are named by id so errors are findable. */
function formatPath(path: PropertyKey[], raw: unknown): string {
	let cursor: unknown = raw;
	const parts = path.map((key, i) => {
		cursor =
			cursor && typeof cursor === 'object'
				? (cursor as Record<PropertyKey, unknown>)[key]
				: undefined;
		let part = typeof key === 'number' ? `[${key}]` : i === 0 ? String(key) : `.${String(key)}`;
		if (i === 1 && path[0] === 'nodes') {
			const id = (cursor as { id?: unknown } | undefined)?.id;
			if (typeof id === 'string') part += `(${id})`;
		}
		return part;
	});
	return parts.join('') || '(root)';
}

function edgeConditions(edge: Edge): Condition[] {
	if (typeof edge === 'string') return [];
	return edge.flatMap((b) => (b.when ? (Array.isArray(b.when) ? b.when : [b.when]) : []));
}

function sameType(a: StateValue, b: StateValue): boolean {
	return typeof a === typeof b;
}

function checkState(session: Session, issues: Issue[]) {
	const declared = session.state;
	for (const node of session.nodes) {
		if (node.type === 'choice') {
			for (const option of node.options) {
				for (const [key, value] of Object.entries(option.set ?? {})) {
					const initial = declared[key];
					if (initial === undefined) {
						issues.push({
							code: 'unknown-state-key',
							nodeId: node.id,
							message: `option "${option.label}" sets undeclared state key "${key}"`
						});
					} else if (!sameType(initial, value)) {
						issues.push({
							code: 'state-type-mismatch',
							nodeId: node.id,
							message: `option "${option.label}" sets "${key}" to a ${typeof value}, but it is declared as a ${typeof initial}`
						});
					}
				}
			}
		}
		for (const out of outgoingEdges(node)) {
			for (const c of edgeConditions(out.edge)) {
				const initial = declared[c.key];
				if (initial === undefined) {
					issues.push({
						code: 'unknown-state-key',
						nodeId: node.id,
						message: `condition tests undeclared state key "${c.key}"`
					});
				} else if (['gt', 'gte', 'lt', 'lte'].includes(c.op) && typeof initial !== 'number') {
					issues.push({
						code: 'state-type-mismatch',
						nodeId: node.id,
						message: `"${c.op}" needs a number, but "${c.key}" is declared as a ${typeof initial}`
					});
				} else if (!sameType(initial, c.value)) {
					issues.push({
						code: 'state-type-mismatch',
						nodeId: node.id,
						message: `condition compares "${c.key}" (${typeof initial}) with a ${typeof c.value}`
					});
				}
			}
		}
	}
}

/** Tarjan's strongly connected components. Recursive: session graphs are small. */
function stronglyConnected(ids: string[], adj: ReadonlyMap<string, string[]>): string[][] {
	let index = 0;
	const indices = new Map<string, number>();
	const low = new Map<string, number>();
	const onStack = new Set<string>();
	const stack: string[] = [];
	const components: string[][] = [];

	const visit = (v: string) => {
		indices.set(v, index);
		low.set(v, index);
		index++;
		stack.push(v);
		onStack.add(v);
		for (const w of adj.get(v) ?? []) {
			if (!indices.has(w)) {
				visit(w);
				low.set(v, Math.min(low.get(v)!, low.get(w)!));
			} else if (onStack.has(w)) {
				low.set(v, Math.min(low.get(v)!, indices.get(w)!));
			}
		}
		if (low.get(v) === indices.get(v)) {
			const component: string[] = [];
			let w: string;
			do {
				w = stack.pop()!;
				onStack.delete(w);
				component.push(w);
			} while (w !== v);
			components.push(component);
		}
	};

	for (const id of ids) if (!indices.has(id)) visit(id);
	return components;
}

export function validateSession(raw: unknown, opts: ValidateOptions = {}): ValidationResult {
	const parsed = SessionSchema.safeParse(raw);
	if (!parsed.success) {
		return {
			issues: parsed.error.issues.map((i) => ({
				code: 'schema' as const,
				message: `${formatPath(i.path, raw)}: ${i.message}`
			}))
		};
	}

	const session = parsed.data;
	const issues: Issue[] = [];

	const counts = new Map<string, number>();
	for (const n of session.nodes) counts.set(n.id, (counts.get(n.id) ?? 0) + 1);
	for (const [id, count] of counts) {
		if (count > 1) {
			issues.push({
				code: 'duplicate-node',
				nodeId: id,
				message: `node id "${id}" is used ${count} times`
			});
		}
	}

	if (!counts.has(session.start)) {
		issues.push({
			code: 'missing-start',
			message: `start node "${session.start}" does not exist`
		});
	}

	// Structural graph: every edge, whatever its conditions, to targets that exist.
	const graph = compile(session);
	const adj = new Map<string, string[]>();
	for (const node of graph.nodes.values()) {
		const targets = new Set<string>();
		for (const out of outgoingEdges(node)) {
			for (const t of edgeTargets(out.edge)) {
				if (counts.has(t)) targets.add(t);
				else {
					issues.push({
						code: 'dangling-target',
						nodeId: node.id,
						message: `${out.via} points at "${t}", which does not exist`
					});
				}
			}
		}
		adj.set(node.id, [...targets]);
	}

	checkState(session, issues);

	if (counts.has(session.start)) {
		const seen = new Set([session.start]);
		const queue = [session.start];
		while (queue.length) {
			for (const t of adj.get(queue.shift()!) ?? []) {
				if (!seen.has(t)) {
					seen.add(t);
					queue.push(t);
				}
			}
		}
		for (const id of graph.nodes.keys()) {
			if (!seen.has(id)) {
				issues.push({
					code: 'unreachable',
					nodeId: id,
					message: `node "${id}" cannot be reached from start "${session.start}"`
				});
			}
		}
	}

	for (const node of graph.nodes.values()) {
		if (node.type !== 'end' && outgoingEdges(node).length === 0) {
			issues.push({
				code: 'dead-end',
				nodeId: node.id,
				message: `${node.type} node "${node.id}" has no way forward and is not an end node`
			});
		}
	}

	// Every cycle needs a way out from an interactive node (choice, loop or timer).
	// A cycle that can only be left through a play node's conditional `next` is
	// rejected: nothing guarantees the condition ever changes inside the cycle.
	for (const component of stronglyConnected([...graph.nodes.keys()], adj)) {
		const members = new Set(component);
		const first = component[0]!;
		const cyclic = component.length > 1 || (adj.get(first) ?? []).includes(first);
		if (!cyclic) continue;

		const hasExit = component.some((id) => {
			const node = graph.nodes.get(id)!;
			return (
				INTERACTIVE.has(node.type) &&
				outgoingEdges(node).some((out) => edgeTargets(out.edge).some((t) => !members.has(t)))
			);
		});
		if (!hasExit) {
			const ids = [...component].sort();
			issues.push({
				code: 'trapped-cycle',
				nodeId: ids[0],
				message: `cycle [${ids.join(', ')}] has no exit from a choice, loop or timer node; the listener can never leave it`
			});
		}
	}

	if (opts.clipExists) {
		const clipIds = new Set(session.nodes.map((n) => n.clipId));
		for (const clipId of clipIds) {
			const missing = CLIP_FORMATS.filter((f) => !opts.clipExists!(clipId, f));
			if (missing.length) {
				const users = session.nodes.filter((n) => n.clipId === clipId).map((n) => n.id);
				issues.push({
					code: 'missing-clip',
					nodeId: users[0],
					message: `clip "${clipId}" is missing ${missing.map((f) => `.${f}`).join(' and ')} (used by ${users.join(', ')})`
				});
			}
		}
	}

	return { session, issues };
}
