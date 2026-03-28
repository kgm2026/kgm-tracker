import { useEffect } from 'react';
import { isTableDirty, clearTableDirty } from '../utils/cache';

/**
 * Checks if any of the given tables were invalidated while this component
 * was unmounted (e.g. user was on a different tab). If so, calls fetchData
 * on mount so the user always sees fresh data.
 */
export function useRefreshOnMount(tables, fetchData) {
  useEffect(() => {
    const needsRefresh = tables.some(t => isTableDirty(t));
    if (needsRefresh) {
      tables.forEach(t => clearTableDirty(t));
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount
}
