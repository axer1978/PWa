// Payment provider contract. Implementations: mock.ts (development only; refused
// at boot in production) and verotel.ts (FlexPay). Card data never reaches us:
// createCheckout returns the processor's hosted payment page URL.

import type { PaymentEventType } from '../db/schema';
import type { Plan } from '../config/plans';

export type { PaymentEventType };
export type PaymentProviderId = 'mock' | 'verotel';

export interface CheckoutInput {
	/** Our checkouts.id. Sent to the processor as the reference it echoes back in postbacks. */
	checkoutId: string;
	user: { id: string; email: string };
	plan: Plan;
	currency: string;
	/** Absolute URL the processor sends the browser back to after paying. */
	returnUrl: string;
	/** Absolute URL for "cancelled/declined" (may equal returnUrl). */
	cancelUrl: string;
}

/** A verified, normalised event from the processor. */
export interface PaymentEvent {
	provider: PaymentProviderId;
	/** Unique per real-world event at the processor: the idempotency key. */
	providerEventId: string;
	type: PaymentEventType;
	/** Our checkout reference, when the processor echoes it (always on the first event). */
	checkoutId: string | null;
	/** The processor's subscription/sale id: identifies the entitlement across events. */
	providerRef: string;
	planId: string | null;
	/** New end of the paid period, when the event carries one (subscriptions). */
	periodEnd: Date | null;
	amountMinor: number | null;
	currency: string | null;
	occurredAt: Date;
	/** The verified parameters as received, for the audit trail. */
	raw: Record<string, string>;
}

export interface PostbackResult {
	/** Zero or more events (some postbacks carry nothing actionable). */
	events: PaymentEvent[];
	/** The exact acknowledgement the processor expects (e.g. 200 "OK"). */
	ack: () => Response;
}

export interface PaymentProvider {
	readonly id: PaymentProviderId;
	/** Origins the browser is redirected to after a form POST (CSP form-action). */
	readonly formActionOrigins: readonly string[];

	createCheckout(input: CheckoutInput): Promise<{ hostedUrl: string }>;

	/**
	 * Parses and verifies a postback. Throws PostbackSignatureError if the
	 * signature is missing or wrong (the route answers 403 and stores nothing).
	 */
	handlePostback(request: Request): Promise<PostbackResult>;

	/** One-click cancel link for an active subscription, or null if not applicable. */
	cancelUrl(input: { providerRef: string }): string | null;
}

export class PostbackSignatureError extends Error {
	override name = 'PostbackSignatureError';
}
