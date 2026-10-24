import { z } from 'zod';

const EmailAddress = z.email().max(254);

/** Trimmed and lower-cased, or null if it isn't a plausible address. */
export function normalizeEmail(input: unknown): string | null {
	if (typeof input !== 'string') return null;
	const email = input.trim().toLowerCase();
	return EmailAddress.safeParse(email).success ? email : null;
}

/** For logs: keeps the domain, hides the local part ("a***@example.com"). */
export function maskEmail(email: string): string {
	const at = email.lastIndexOf('@');
	if (at < 1) return '***';
	return `${email[0]}***${email.slice(at)}`;
}
