// Age verification provider contract. Implementations: mock.ts (development
// only; refused at boot in production) and yoti.ts. The service layer (service.ts)
// owns the av_attempts rows and the users.av_* update; providers only talk to
// the outside world.

export type AvProviderId = 'mock' | 'yoti';

export interface AvStartInput {
	/** Our av_attempts.id; providers echo it back or we look it up by providerRef. */
	attemptId: string;
	userId: string;
	/** Absolute URL the provider sends the browser back to (our callback route). */
	returnUrl: string;
}

export interface AvStartResult {
	/** Where to send the browser (the provider's hosted flow). */
	redirectUrl: string;
	/** The provider's own session/reference id, when known at start. */
	providerRef: string | null;
}

export interface AvOutcome {
	verified: boolean;
	/** The provider's reference for this check (stored on the user when verified). */
	providerRef: string;
}

export interface AgeVerificationProvider {
	readonly id: AvProviderId;
	/**
	 * Origins the browser is redirected to after a form POST. Added to the CSP
	 * form-action directive at runtime (Chrome applies form-action to redirects).
	 */
	readonly formActionOrigins: readonly string[];

	startVerification(input: AvStartInput): Promise<AvStartResult>;

	/**
	 * Decides the outcome of a returning browser. MUST NOT trust client-supplied
	 * outcome data: either verify a signature over it, or fetch the result from
	 * the provider server-to-server. Throws AvCallbackError on anything invalid.
	 */
	handleCallback(input: {
		url: URL;
		request: Request;
		attempt: { id: string; userId: string; providerRef: string | null };
	}): Promise<AvOutcome>;
}

export class AvCallbackError extends Error {
	override name = 'AvCallbackError';
}
