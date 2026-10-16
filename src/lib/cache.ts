type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const cache = new Map<string, CacheEntry<unknown>>();

export async function withTtlCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const value = await loader();
  cache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

export function clearTtlCache() {
  cache.clear();
}
