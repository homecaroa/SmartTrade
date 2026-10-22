export interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

export interface Loaded<T> {
  value: T;
  fetchedAt: number;
  ageMs: number;
  fromCache: boolean;
  /** true si la fuente falló y se sirve una entrada caducada. */
  stale: boolean;
  staleReason?: string;
}

const g = globalThis as unknown as { __tsCache?: Map<string, CacheEntry<unknown>> };
const store = (g.__tsCache ??= new Map());
const MAX_ENTRIES = 200;

export function clearCache() {
  store.clear();
}

/** Devuelve caché fresca; si no, carga. Si la carga falla y hay entrada caducada, la devuelve marcada como obsoleta. */
export async function getOrLoad<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  now: () => number = Date.now,
): Promise<Loaded<T>> {
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (hit && now() - hit.fetchedAt < ttlMs) {
    return { value: hit.value, fetchedAt: hit.fetchedAt, ageMs: now() - hit.fetchedAt, fromCache: true, stale: false };
  }
  try {
    const value = await loader();
    if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
    const fetchedAt = now();
    store.set(key, { value, fetchedAt });
    return { value, fetchedAt, ageMs: 0, fromCache: false, stale: false };
  } catch (err) {
    if (hit) {
      return {
        value: hit.value,
        fetchedAt: hit.fetchedAt,
        ageMs: now() - hit.fetchedAt,
        fromCache: true,
        stale: true,
        staleReason: err instanceof Error ? err.message : "Error desconocido",
      };
    }
    throw err;
  }
}
