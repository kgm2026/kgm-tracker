const CACHE_TTL_MS = 60000; // 1 minute — balances freshness with reduced re-fetching
export const cache = new Map();

// Tracks tables that were invalidated while no component listener was mounted.
// Components check this on mount to know if they need to refetch.
const dirtyTables = new Set();

export function isTableDirty(table) { return dirtyTables.has(table); }
export function clearTableDirty(table) { dirtyTables.delete(table); }

export function dispatchToast(message, type = "error") {
  if (typeof window === "undefined") return;
  const id = Date.now() + Math.floor(Math.random() * 1000);
  window.dispatchEvent(new CustomEvent("kgm-toast", { detail: { id, message, type } }));
}

export function makeCacheKey(table, filters, authKey, surl) {
  return `${authKey}:${surl}:${table}:select=*${filters}`;
}

export function invalidateTable(table) {
  for (const key of cache.keys()) {
    if (key.includes(`:${table}:`)) cache.delete(key);
  }

  dirtyTables.add(table);

  // Notify UI to refresh any dependent views.
  // This avoids manually dispatching per-feature events like `materialsRefresh`.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("kgm-db-changed", { detail: { table } }));
  }
}

export function getCached(key) {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  return null;
}

export function setCached(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Request deduplication: track in-flight promises so identical concurrent
// calls (e.g. all tabs mounting at once) share a single network request.
const inflight = new Map();

export function getInflight(key) {
  return inflight.get(key) || null;
}

export function setInflight(key, promise) {
  inflight.set(key, promise);
  promise.finally(() => inflight.delete(key));
}
