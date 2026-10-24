import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Small, shared crypto helpers. Every signature comparison in the app goes
// through safeEqual so it's constant-time.

export function hmacSha256(key: string | Buffer, data: string): Buffer {
	return createHmac('sha256', key).update(data).digest();
}

export function hmacHex(key: string | Buffer, data: string): string {
	return hmacSha256(key, data).toString('hex');
}

export function hmacBase64Url(key: string | Buffer, data: string): string {
	return hmacSha256(key, data).toString('base64url');
}

export function sha256Hex(data: string): string {
	return createHash('sha256').update(data).digest('hex');
}

/** Constant-time string comparison (false for different lengths, without leaking where). */
export function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) {
		// Still do a comparison so timing doesn't reveal the length check.
		timingSafeEqual(ab, ab);
		return false;
	}
	return timingSafeEqual(ab, bb);
}

/**
 * Derives a purpose-specific key from APP_SECRET, so one leaked derived key
 * (e.g. media URLs) can't forge another purpose's signatures (e.g. mock AV).
 */
export function deriveKey(appSecret: string, purpose: string): Buffer {
	return hmacSha256(appSecret, `pwa-audio:${purpose}`);
}
