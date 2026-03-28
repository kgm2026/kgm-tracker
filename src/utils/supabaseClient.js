import { createClient } from '@supabase/supabase-js';
import { SURL, SKEY } from './api';

const useLegacyAuth = !import.meta.env.VITE_ADMIN_EMAIL && import.meta.env.VITE_ADMIN_PASSWORD;

// In legacy auth mode, wipe any stale Supabase auth tokens from localStorage
if (useLegacyAuth) {
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('sb-')) localStorage.removeItem(key);
  });
}

export const supabase = createClient(SURL, SKEY, {
  auth: {
    persistSession: !useLegacyAuth,
    autoRefreshToken: !useLegacyAuth,
    detectSessionInUrl: !useLegacyAuth,
  },
});

