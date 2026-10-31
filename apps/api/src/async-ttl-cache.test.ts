import { describe, expect, it, vi } from 'vitest';
import { createAsyncTtlCache } from './async-ttl-cache.js';

describe('async TTL cache', () => {
  it('shares concurrent loads and reuses the value only until expiry', async () => {
    let now = 100;
    const load = vi.fn(async () => ({ version: load.mock.calls.length }));
    const get = createAsyncTtlCache(load, 50, () => now);

    const [first, concurrent] = await Promise.all([get(), get()]);
    expect(first).toBe(concurrent);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await get()).toBe(first);
    now = 151;
    expect(await get()).not.toBe(first);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not cache a rejected load', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue('ready');
    const get = createAsyncTtlCache(load, 100);
    await expect(get()).rejects.toThrow('temporary');
    await expect(get()).resolves.toBe('ready');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
