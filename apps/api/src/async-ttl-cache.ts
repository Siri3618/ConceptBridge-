export function createAsyncTtlCache<T>(load: () => Promise<T>, ttlMs: number, now: () => number = Date.now) {
  let value: T | undefined;
  let expiresAt = 0;
  let pending: Promise<T> | undefined;

  return async function get(): Promise<T> {
    if (value !== undefined && now() < expiresAt) return value;
    if (pending) return pending;
    pending = load();
    try {
      value = await pending;
      expiresAt = now() + ttlMs;
      return value;
    } finally {
      pending = undefined;
    }
  };
}
