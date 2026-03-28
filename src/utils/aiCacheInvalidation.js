/**
 * Simple event bus for AI cache invalidation.
 * When data changes (material added, payment logged, contractor updated),
 * emit an event so AI caches can auto-invalidate.
 */

const listeners = new Set();

export function onDataChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function emitDataChange() {
  listeners.forEach(cb => {
    try { cb(); } catch (e) { console.error('Cache invalidation listener error:', e); }
  });
}
