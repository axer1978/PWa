import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { Id } from '../../engine/schema';

// Plans and prices come from config/plans.json (path overridable with
// PLANS_CONFIG), never from code. Payment wiring arrives in Phase 5.

const base = {
	id: Id,
	name: z.string().min(1).max(40),
	/** Price in minor units (e.g. cents). */
	priceMinor: z.int().positive(),
	description: z.string().max(140)
};

export const Plan = z.discriminatedUnion('kind', [
	z.strictObject({ ...base, kind: z.literal('subscription'), interval: z.enum(['month', 'year']) }),
	z.strictObject({ ...base, kind: z.literal('pack'), sessions: z.array(Id).min(1) })
]);

export const PlansConfig = z
	.strictObject({
		$comment: z.string().optional(),
		currency: z.string().regex(/^[A-Z]{3}$/),
		plans: z.array(Plan).min(1)
	})
	.superRefine((cfg, ctx) => {
		const seen = new Set<string>();
		cfg.plans.forEach((p, i) => {
			if (seen.has(p.id)) {
				ctx.addIssue({
					code: 'custom',
					path: ['plans', i, 'id'],
					message: `duplicate plan id "${p.id}"`
				});
			}
			seen.add(p.id);
		});
	});

export type Plan = z.infer<typeof Plan>;
export type PlansConfig = z.infer<typeof PlansConfig>;

export function loadPlans(path = process.env.PLANS_CONFIG ?? 'config/plans.json'): PlansConfig {
	return PlansConfig.parse(JSON.parse(readFileSync(path, 'utf8')));
}

let cached: PlansConfig | undefined;
export function getPlans(): PlansConfig {
	cached ??= loadPlans();
	return cached;
}

/** Display price, e.g. "€9.99". Locale-neutral formatting for now. */
export function formatPrice(minor: number, currency: string): string {
	return new Intl.NumberFormat('en', { style: 'currency', currency }).format(minor / 100);
}
