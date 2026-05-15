import { createClient } from '@supabase/supabase-js';
import { SURL, SKEY } from './api';

export const supabase = createClient(SURL, SKEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
