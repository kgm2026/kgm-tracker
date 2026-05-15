import { cache, makeCacheKey, getCached, setCached, invalidateTable, dispatchToast, getInflight, setInflight } from './cache';

export const SURL = import.meta.env.VITE_SUPABASE_URL;
export const SKEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const AUTH_REQUIRED_MESSAGE = "Please log in to continue.";

let AUTH_TOKEN = null;

export function setAuthToken(token) {
  AUTH_TOKEN = token || null;
  // Avoid cross-user cache leaks when switching auth context.
  cache.clear();
}

export function getAuthToken() {
  return AUTH_TOKEN;
}

export function requireAuthToken() {
  if (!AUTH_TOKEN) throw new Error(AUTH_REQUIRED_MESSAGE);
  return AUTH_TOKEN;
}

function normalizeFilters(filters = "") {
  if (!filters) return "";
  return filters.startsWith("&") ? filters : `&${filters}`;
}

function getHeaders(extra = {}, { requireAuth = false } = {}) {
  const token = requireAuth ? requireAuthToken() : AUTH_TOKEN;
  const headers = {
    apikey: SKEY,
    "Content-Type": "application/json",
    ...extra,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
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
      const r = await fetch(`${SURL}/rest/v1/${table}?select=*${nf}`, {
        headers: getHeaders({}, { requireAuth: true })
      });
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
    } catch (error) {
      if (error?.message === AUTH_REQUIRED_MESSAGE) {
        dispatchToast(error.message, "error");
        return [];
      }
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
    headers: { ...getHeaders({}, { requireAuth: true }), Prefer: "return=representation" },
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
  const r = await fetch(`${SURL}/rest/v1/${table}?id=eq.${id}`, {
    method: "DELETE",
    headers: getHeaders({}, { requireAuth: true })
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.message || `Delete failed: ${r.status}`);
  }
  invalidateTable(table);
}

export async function dbPatch(table, id, data) {
  const r = await fetch(`${SURL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: getHeaders({}, { requireAuth: true }),
    body: JSON.stringify(data)
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.message || `Patch failed: ${r.status}`);
  }
  invalidateTable(table);
}
