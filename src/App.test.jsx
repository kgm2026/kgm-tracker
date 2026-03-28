import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import App from './App';

// Mock supabase client
vi.mock('./utils/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock pdfjs-dist (requires DOMMatrix not in jsdom)
vi.mock('./components/progressFileUtils.js', () => ({
  MAX_IMAGES: 10,
  MAX_VIDEO_FRAMES: 6,
  MAX_FILE_SIZE: 50 * 1024 * 1024,
  MAX_IMAGE_SIZE: 10 * 1024 * 1024,
  readFileAsDataUrl: vi.fn(),
  extractVideoFrames: vi.fn(),
  pdfToImage: vi.fn(),
  formatDuration: vi.fn(),
  QUALITY_COLORS: {},
  dropZoneStyle: vi.fn(),
}));

// Mock fetch for dbGet calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
}

beforeEach(() => {
  mockFetch.mockReset();
  // App requires at least one project to render the main UI
  mockFetch.mockImplementation((url) => {
    if (url.includes('/rest/v1/projects')) {
      return jsonResponse([{ id: 'test-1', name: 'Test Project' }]);
    }
    return jsonResponse([]);
  });
});

describe('App', () => {
  it('renders without crashing', async () => {
    render(<App />);
    await waitFor(() => {
      expect(document.querySelector('.kgm-body')).toBeTruthy();
    });
  });

  it('renders the main body container after loading', async () => {
    render(<App />);
    await waitFor(() => {
      expect(document.querySelector('.kgm-body')).toBeTruthy();
    });
  });

  it('mounts all tab panels (hidden tabs stay in DOM)', async () => {
    render(<App />);
    await waitFor(() => {
      const body = document.querySelector('.kgm-body');
      expect(body).toBeTruthy();
      // All 11 tab wrappers should be present (display:none tabs stay mounted)
      expect(body.children.length).toBe(11);
    });
  });
});
