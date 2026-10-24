import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes, base64url: 43 characters. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function newToken(): string {
	return randomBytes(32).toString('base64url');
}

/** Tokens are stored only as SHA-256 hashes, so a database leak can't be replayed. */
export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function isWellFormedToken(token: unknown): token is string {
	return typeof token === 'string' && TOKEN_PATTERN.test(token);
}
