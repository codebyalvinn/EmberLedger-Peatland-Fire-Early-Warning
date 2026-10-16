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
  if (cached && (cached.expiresAt === Number.POSITIVE_INFINITY || cached.expiresAt > Date.now())) {
    return (await cached.value) as T;
  }

  const pending = Promise.resolve().then(loader);
  const entry: CacheEntry<Promise<T>> = {
    expiresAt: Number.POSITIVE_INFINITY,
    value: pending,
  };
  cache.set(key, entry);
  try {
    const value = await pending;
    if (cache.get(key) === entry) {
      cache.set(key, { expiresAt: Date.now() + ttlMs, value });
    }
    return value;
  } catch (error) {
    if (cache.get(key) === entry) cache.delete(key);
    throw error;
  }
}

export function clearTtlCache() {
  cache.clear();
}
