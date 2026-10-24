/**
 * Fixed-window, in-memory rate limiter. Per process: fine for a single-VPS app.
 * Used for per-IP limits, so IP addresses are never written to the database.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number; maxKeys?: number }) {
	const windows = new Map<string, { count: number; resetAt: number }>();
	const maxKeys = opts.maxKeys ?? 10_000;

	return {
		/** Records a hit; returns false if the key is over its limit. */
		hit(key: string, now = Date.now()): boolean {
			let w = windows.get(key);
			if (!w || w.resetAt <= now) {
				if (windows.size >= maxKeys) {
					for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
					// Still full: drop the oldest entry rather than grow without bound.
					if (windows.size >= maxKeys) windows.delete(windows.keys().next().value!);
				}
				w = { count: 0, resetAt: now + opts.windowMs };
				windows.set(key, w);
			}
			w.count++;
			return w.count <= opts.limit;
		},
		reset() {
			windows.clear();
		}
	};
}
