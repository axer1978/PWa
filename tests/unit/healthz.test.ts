import { beforeEach, describe, expect, it, vi } from 'vitest';

const pingDb = vi.fn<() => Promise<void>>();
vi.mock('$lib/server/db', () => ({ pingDb }));

const { GET } = await import('../../src/routes/healthz/+server');

type Event = Parameters<typeof GET>[0];

describe('/healthz', () => {
	beforeEach(() => {
		pingDb.mockReset();
	});

	it('returns 200 when the database answers', async () => {
		pingDb.mockResolvedValue();
		const res = await GET({} as Event);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(await res.json()).toEqual({ status: 'ok' });
	});

	it('returns 503 without leaking error details when the database is down', async () => {
		pingDb.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secret'));
		const res = await GET({} as Event);
		expect(res.status).toBe(503);
		const body = await res.text();
		expect(body).not.toContain('secret');
		expect(body).not.toContain('10.0.0.5');
	});
});
