import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({ api: vi.fn() }));
const { api } = await import('../lib/api');
const outbox = await import('../lib/outbox');

describe('offline outbox (store-and-forward)', () => {
  beforeEach(() => {
    localStorage.clear();
    api.mockReset();
    outbox.setForcedOffline(false);
  });

  it('sends immediately when online, with an idempotency key', async () => {
    api.mockResolvedValue({ ok: true });
    const r = await outbox.send({ method: 'PATCH', path: '/allocation/dispatches/1', body: { status: 'on_scene' } });
    expect(r.queued).toBe(false);
    expect(api.mock.calls[0][1].headers['x-op-id']).toBeTruthy();
  });

  it('queues when there is no signal and replays in order later', async () => {
    outbox.setForcedOffline(true);
    await outbox.send({ method: 'PATCH', path: '/a', body: { n: 1 } });
    await outbox.send({ method: 'POST', path: '/b', body: { n: 2 } });
    expect(outbox.pending()).toHaveLength(2);
    expect(api).not.toHaveBeenCalled();

    api.mockResolvedValue({ ok: true });
    outbox.setForcedOffline(false); // triggers flush
    await new Promise((r) => setTimeout(r, 20));
    expect(api.mock.calls.map((c) => c[0])).toEqual(['/a', '/b']);
    expect(outbox.pending()).toHaveLength(0);
  });

  it('queues when the network request itself fails', async () => {
    api.mockRejectedValue(Object.assign(new Error('down'), { offline: true }));
    const r = await outbox.send({ method: 'POST', path: '/reports/field', body: { text: 'x' } });
    expect(r.queued).toBe(true);
    expect(outbox.pending()[0].path).toBe('/reports/field');
  });

  it('keeps the queue if the connection drops again mid-flush', async () => {
    outbox.setForcedOffline(true);
    await outbox.send({ method: 'POST', path: '/one' });
    await outbox.send({ method: 'POST', path: '/two' });
    api.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('down'), { offline: true }));
    outbox.setForcedOffline(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(outbox.pending().map((o) => o.path)).toEqual(['/two']);
  });
});
