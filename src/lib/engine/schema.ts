import { z } from 'zod';

// Session graph schema. Shared by the server, the player and the validator, so
// this module must stay free of Node APIs.

/** Node and session ids. Lowercase only, so they're safe in URLs and file names. */
export const Id = z
	.string()
	.regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'use lowercase letters, digits, "-" or "_" (max 64)');

/**
 * Clip ids map to files (`<clipId>.opus` / `<clipId>.m4a`). The strict charset
 * rules out path traversal and odd CDN paths.
 */
export const ClipId = Id;

export const StateKey = z
	.string()
	.regex(/^[a-z][a-zA-Z0-9_]{0,31}$/, 'state keys are camelCase identifiers (max 32)');

export const StateValue = z.union([z.string().max(64), z.number(), z.boolean()]);

export const Condition = z.strictObject({
	key: StateKey,
	op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
	value: StateValue
});

/** One condition, or a list that must all hold. */
export const When = z.union([Condition, z.array(Condition).min(1)]);

export const ConditionalTarget = z.strictObject({
	when: When.optional(),
	target: Id
});

/**
 * An edge is a node id, or an ordered list of conditional targets: the first
 * match wins. Every entry except the last must have `when`, and the last must
 * not, so resolution always succeeds.
 */
export const Edge = z.union([
	Id,
	z
		.array(ConditionalTarget)
		.min(1)
		.superRefine((list, ctx) => {
			list.forEach((entry, i) => {
				const last = i === list.length - 1;
				if (last && entry.when) {
					ctx.addIssue({
						code: 'custom',
						path: [i, 'when'],
						message: 'the last branch must be unconditional (no "when")'
					});
				}
				if (!last && !entry.when) {
					ctx.addIssue({
						code: 'custom',
						path: [i],
						message: 'only the last branch may omit "when"'
					});
				}
			});
		})
]);

export const StateSet = z.record(StateKey, StateValue);

export const Option = z.strictObject({
	/** Neutral label shown on the choice button. */
	label: z.string().min(1).max(40),
	target: Edge,
	set: StateSet.optional()
});

const TimeoutMs = z.int().min(1000).max(600_000);

/** Plays its clip once, then follows `next`. */
export const PlayNode = z.strictObject({
	id: Id,
	type: z.literal('play'),
	clipId: ClipId,
	next: Edge.optional()
});

/**
 * Plays its clip as a looping bed until the listener picks an option. With
 * `timeoutMs`, it follows `defaultTarget` if nothing is picked in time.
 */
export const ChoiceNode = z
	.strictObject({
		id: Id,
		type: z.literal('choice'),
		clipId: ClipId,
		options: z.array(Option).min(2).max(3),
		timeoutMs: TimeoutMs.optional(),
		defaultTarget: Edge.optional()
	})
	.superRefine((node, ctx) => {
		if ((node.timeoutMs === undefined) !== (node.defaultTarget === undefined)) {
			ctx.addIssue({
				code: 'custom',
				path: ['timeoutMs'],
				message: 'choice nodes need both timeoutMs and defaultTarget, or neither'
			});
		}
	});

/**
 * Loops its clip for `timeoutMs`, then auto-advances to `defaultTarget`. A tap
 * before then goes to `next` (or straight to `defaultTarget` if there's no `next`).
 */
export const TimerNode = z.strictObject({
	id: Id,
	type: z.literal('timer'),
	clipId: ClipId,
	timeoutMs: TimeoutMs,
	defaultTarget: Edge,
	next: Edge.optional()
});

/** Repeats its clip until the listener taps, then follows `next`. */
export const LoopNode = z.strictObject({
	id: Id,
	type: z.literal('loop'),
	clipId: ClipId,
	next: Edge.optional()
});

/** Plays its clip once; the session is then complete. */
export const EndNode = z.strictObject({
	id: Id,
	type: z.literal('end'),
	clipId: ClipId
});

export const SessionNode = z.discriminatedUnion('type', [
	PlayNode,
	ChoiceNode,
	TimerNode,
	LoopNode,
	EndNode
]);

export const Session = z.strictObject({
	$schema: z.string().optional(),
	id: Id,
	version: z.int().min(1),
	title: z.string().min(1).max(80),
	summary: z.string().max(280).optional(),
	/** `paid` sessions are unlocked by a subscription, or by a pack that lists them (config/plans.json). */
	access: z.enum(['free', 'paid']),
	start: Id,
	/** Initial state. Options can only `set`, and conditions only test, keys declared here. */
	state: z.record(StateKey, StateValue).default({}),
	nodes: z.array(SessionNode).min(1)
});

export type Condition = z.infer<typeof Condition>;
export type When = z.infer<typeof When>;
export type Edge = z.infer<typeof Edge>;
export type StateValue = z.infer<typeof StateValue>;
export type State = Record<string, StateValue>;
export type Option = z.infer<typeof Option>;
export type SessionNode = z.infer<typeof SessionNode>;
export type NodeType = SessionNode['type'];
export type Session = z.infer<typeof Session>;
