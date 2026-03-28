import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { setAuthToken, SURL } from '../utils/api';

const AuthContext = createContext(null);

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;

export function AuthProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check initial session
    const checkSession = async () => {
      try {
        if (!ADMIN_EMAIL && ADMIN_PASSWORD) {
          // Legacy mode: clear any stale Supabase session from a previous config
          supabase.auth.signOut().catch(() => {});
          const localAdmin = localStorage.getItem('kgm_legacy_admin');
          if (localAdmin === 'true') {
            setIsAdmin(true);
          }
          setIsLoading(false);
          return;
        }

        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token || null;
        setAuthToken(token);
        setIsAdmin(Boolean(token));
      } catch (err) {
        console.error('Session check failed:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    // Listen for auth changes only if using Supabase Auth
    if (ADMIN_EMAIL) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        const token = session?.access_token || null;
        setAuthToken(token);
        setIsAdmin(Boolean(token));
      });
      return () => subscription.unsubscribe();
    }
  }, []);

  const login = useCallback(async (password) => {
    setError(null);
    console.log('[Auth] login attempt, ADMIN_EMAIL:', ADMIN_EMAIL, 'SURL:', SURL);

    if (!password) {
      const err = new Error('Password required');
      setError(err.message);
      throw err;
    }

    if (!ADMIN_EMAIL) {
      // Legacy mode
      if (password === ADMIN_PASSWORD) {
        setIsAdmin(true);
        localStorage.setItem('kgm_legacy_admin', 'true');
        return { success: true };
      } else {
        const err = new Error('Invalid password');
        setError(err.message);
        throw err;
      }
    }

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        throw signInError;
      }

      setAuthToken(data.session?.access_token || null);
      setIsAdmin(true);
      return { success: true };
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (ADMIN_EMAIL) {
        await supabase.auth.signOut();
      } else {
        localStorage.removeItem('kgm_legacy_admin');
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setAuthToken(null);
      setIsAdmin(false);
      setError(null);
    }
  }, []);

  const value = {
    isAdmin,
    isLoading,
    error,
    login,
    logout,
    isConfigured: Boolean(ADMIN_EMAIL || ADMIN_PASSWORD),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
