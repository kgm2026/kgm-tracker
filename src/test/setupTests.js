import '@testing-library/jest-dom/vitest';

// jsdom may not provide a working localStorage — polyfill if needed
if (typeof window !== 'undefined' && typeof window.localStorage?.getItem !== 'function') {
  const store = {};
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      clear: () => { for (const k in store) delete store[k]; },
    },
    writable: true,
  });
}
