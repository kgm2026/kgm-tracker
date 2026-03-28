import { cache, makeCacheKey, getCached, setCached, invalidateTable, dispatchToast, getInflight, setInflight } from './cache';

export const SURL = import.meta.env.VITE_SUPABASE_URL;
export const SKEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let AUTH_TOKEN = null;

export function setAuthToken(token) {
  AUTH_TOKEN = token || null;
  // Avoid cross-user cache leaks when switching auth context.
  cache.clear();
}

function normalizeFilters(filters = "") {
  if (!filters) return "";
  return filters.startsWith("&") ? filters : `&${filters}`;
}

function getHeaders(extra = {}) {
  return {
    apikey: SKEY,
    // For RLS-enabled tables, this should be the user's JWT.
    // Fallback to anon token to keep existing behavior for unauthenticated reads.
    Authorization: `Bearer ${AUTH_TOKEN || SKEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function dbGet(table, filters = "") {
  const nf = normalizeFilters(filters);
  const authKey = AUTH_TOKEN ? "auth" : "anon";
  const key = makeCacheKey(table, nf, authKey, SURL);

  const cached = getCached(key);
  if (cached) return cached;

  // Deduplicate: if an identical request is already in flight, return its promise.
  const pending = getInflight(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const r = await fetch(`${SURL}/rest/v1/${table}?select=*${nf}`, { headers: getHeaders() });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        const msg = j?.message || `Fetch failed for ${table} (${r.status})`;
        console.error(msg, j);
        dispatchToast(msg, "error");
        return [];
      }
      const data = await r.json();
      setCached(key, data);
      return data;
    } catch {
      dispatchToast(`Network error while fetching ${table}`, "error");
      return [];
    }
  })();

  setInflight(key, promise);
  return promise;
}

export async function dbInsert(table, data) {
  const r = await fetch(`${SURL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...getHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(data)
  });
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    throw new Error(j?.message || `Insert failed for ${table} (${r.status})`);
  }
  const j = await r.json();
  invalidateTable(table);
  return Array.isArray(j) ? j[0] : j;
}

export async function dbDelete(table, id) {
  const r = await fetch(`${SURL}/rest/v1/${table}?id=eq.${id}`, { method: "DELETE", headers: getHeaders() });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.message || `Delete failed: ${r.status}`);
  }
  invalidateTable(table);
}

export async function dbPatch(table, id, data) {
  const r = await fetch(`${SURL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.message || `Patch failed: ${r.status}`);
  }
  invalidateTable(table);
}
