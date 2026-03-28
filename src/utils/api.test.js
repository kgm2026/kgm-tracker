import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dbGet, dbInsert, dbPatch, dbDelete, setAuthToken } from './api';
import { cache } from './cache';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  cache.clear();
  setAuthToken(null);
});

describe('dbGet', () => {
  it('fetches data from Supabase REST', async () => {
    const data = [{ id: 1, name: 'Test' }];
    mockFetch.mockReturnValue(jsonResponse(data));

    const result = await dbGet('projects');
    expect(result).toEqual(data);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('/rest/v1/projects?select=*');
  });

  it('caches responses for subsequent calls', async () => {
    const data = [{ id: 1 }];
    mockFetch.mockReturnValue(jsonResponse(data));

    await dbGet('projects');
    const cached = await dbGet('projects');

    expect(cached).toEqual(data);
    // Second call should hit cache, not fetch
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns empty array on HTTP error', async () => {
    mockFetch.mockReturnValue(jsonResponse({ message: 'Not found' }, 404));

    const result = await dbGet('nonexistent');
    expect(result).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network failed'));

    const result = await dbGet('projects');
    expect(result).toEqual([]);
  });

  it('appends filters to query string', async () => {
    mockFetch.mockReturnValue(jsonResponse([]));

    await dbGet('materials', '&status=eq.Paid&order=num.asc');
    expect(mockFetch.mock.calls[0][0]).toContain('select=*&status=eq.Paid&order=num.asc');
  });

  it('normalizes filters without leading &', async () => {
    mockFetch.mockReturnValue(jsonResponse([]));

    await dbGet('materials', 'status=eq.Paid');
    expect(mockFetch.mock.calls[0][0]).toContain('select=*&status=eq.Paid');
  });

  it('deduplicates concurrent identical requests', async () => {
    const data = [{ id: 1 }];
    // Delay the fetch to keep it in-flight
    let resolve;
    mockFetch.mockReturnValue(new Promise(r => { resolve = r; }).then(() => ({ ok: true, status: 200, json: () => Promise.resolve(data) })));

    const p1 = dbGet('projects');
    const p2 = dbGet('projects');
    const p3 = dbGet('projects');

    resolve?.();

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toEqual(data);
    expect(r2).toEqual(data);
    expect(r3).toEqual(data);
    // Only one fetch despite 3 calls
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('uses different cache keys for different auth contexts', async () => {
    mockFetch.mockReturnValue(jsonResponse([{ id: 1 }]));

    await dbGet('projects');
    setAuthToken('fake-jwt');
    // Setting auth token clears cache
    await dbGet('projects');

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('dbInsert', () => {
  it('POSTs data and returns inserted row', async () => {
    const row = { id: 1, name: 'New' };
    mockFetch.mockReturnValue(jsonResponse([row]));

    const result = await dbInsert('projects', { name: 'New' });
    expect(result).toEqual(row);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/rest/v1/projects');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Prefer).toBe('return=representation');
    expect(JSON.parse(opts.body)).toEqual({ name: 'New' });
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockReturnValue(jsonResponse({ message: 'Duplicate key' }, 409));

    await expect(dbInsert('projects', { name: 'Dup' })).rejects.toThrow('Duplicate key');
  });

  it('invalidates cache for the table after insert', async () => {
    mockFetch.mockReturnValue(jsonResponse([{ id: 1 }]));

    // Populate cache
    await dbGet('projects');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Insert invalidates
    mockFetch.mockReturnValue(jsonResponse({ id: 2 }));
    await dbInsert('projects', { name: 'New' });

    // Next get should refetch
    mockFetch.mockReturnValue(jsonResponse([{ id: 1 }, { id: 2 }]));
    await dbGet('projects');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('dbPatch', () => {
  it('PATCHes by id', async () => {
    mockFetch.mockReturnValue(jsonResponse(null, 204));

    await dbPatch('projects', 42, { name: 'Updated' });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/rest/v1/projects?id=eq.42');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ name: 'Updated' });
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockReturnValue(jsonResponse({ message: 'Not found' }, 404));

    await expect(dbPatch('projects', 999, { name: 'x' })).rejects.toThrow();
  });

  it('invalidates cache for the table', async () => {
    mockFetch.mockReturnValue(jsonResponse([{ id: 1 }]));
    await dbGet('projects');

    mockFetch.mockReturnValue(jsonResponse(null, 204));
    await dbPatch('projects', 1, { name: 'x' });

    mockFetch.mockReturnValue(jsonResponse([{ id: 1 }]));
    await dbGet('projects');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('dbDelete', () => {
  it('DELETEs by id', async () => {
    mockFetch.mockReturnValue(jsonResponse(null, 204));

    await dbDelete('projects', 42);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/rest/v1/projects?id=eq.42');
    expect(opts.method).toBe('DELETE');
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockReturnValue(jsonResponse({ message: 'FK violation' }, 409));

    await expect(dbDelete('projects', 1)).rejects.toThrow();
  });
});

describe('setAuthToken', () => {
  it('sets token for subsequent requests', async () => {
    mockFetch.mockReturnValue(jsonResponse([]));

    setAuthToken('my-jwt');
    await dbGet('projects');

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer my-jwt');
  });

  it('falls back to anon when token is null', async () => {
    mockFetch.mockReturnValue(jsonResponse([]));

    setAuthToken(null);
    await dbGet('projects');

    const [, opts] = mockFetch.mock.calls[0];
    // Should use SKEY (anon) as fallback — just verify it's not 'Bearer null'
    expect(opts.headers.Authorization).not.toBe('Bearer null');
    expect(opts.headers.Authorization).toMatch(/^Bearer /);
  });

  it('clears cache on auth change', async () => {
    mockFetch.mockReturnValue(jsonResponse([{ id: 1 }]));
    await dbGet('projects');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    setAuthToken('new-token');

    // Cache should be cleared, next get refetches
    mockFetch.mockReturnValue(jsonResponse([{ id: 1 }]));
    await dbGet('projects');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
