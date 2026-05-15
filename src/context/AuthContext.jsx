import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { setAuthToken } from '../utils/api';

const AuthContext = createContext(null);

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL?.trim();
const ACCESS_TABLE = 'app_user_roles';
const SESSION_TIMEOUT_MS = 3500;
const ACCESS_TIMEOUT_MS = 2500;
const UNAUTHORIZED_ACCOUNT_MESSAGE = ADMIN_EMAIL
  ? `This account has not been granted access. Ask ${ADMIN_EMAIL} to add it.`
  : 'This app is not configured yet.';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isMissingAccessTable(error) {
  return ['42P01', 'PGRST205'].includes(error?.code) || /app_user_roles|relation .* does not exist|schema cache/i.test(error?.message || '');
}

function withTimeout(promise, ms, fallback) {
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = globalThis.setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => globalThis.clearTimeout(timeoutId));
}

export function AuthProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    let active = true;

    const syncSession = async (session) => {
      const token = session?.access_token || null;
      const nextUser = session?.user || null;
      const email = normalizeEmail(nextUser?.email);
      const adminEmail = normalizeEmail(ADMIN_EMAIL);
      const isEnvAdmin = Boolean(adminEmail && email === adminEmail);
      let accessRow = null;

      if (token && email && typeof supabase.from === 'function') {
        const { data, error: accessError, timedOut } = await withTimeout(
          supabase
            .from(ACCESS_TABLE)
            .select('id,email,role,is_active')
            .ilike('email', email)
            .maybeSingle(),
          ACCESS_TIMEOUT_MS,
          { data: null, error: null, timedOut: true }
        );

        if (timedOut) {
          console.warn('Access check timed out; falling back to admin email gate.');
        } else if (accessError && !isMissingAccessTable(accessError)) {
          console.error('Access check failed:', accessError);
        } else {
          accessRow = data || null;
        }
      }

      const isListed = Boolean(accessRow?.is_active);
      const nextRole = isEnvAdmin ? 'admin' : (isListed ? accessRow.role : null);
      const isAllowed = !token || isEnvAdmin || isListed;

      if (token && !isAllowed) {
        await supabase.auth.signOut().catch(() => {});
        if (!active) return;
        setAuthToken(null);
        setUser(null);
        setIsAdmin(false);
        setRole(null);
        setError(UNAUTHORIZED_ACCOUNT_MESSAGE);
        return;
      }

      if (!active) return;
      setAuthToken(token);
      setUser(nextUser);
      setRole(nextRole);
      setIsAdmin(nextRole === 'admin');
      if (token) setError(null);
    };

    const checkSession = async () => {
      try {
        const { data, timedOut } = await withTimeout(
          supabase.auth.getSession(),
          SESSION_TIMEOUT_MS,
          { data: { session: null }, timedOut: true }
        );
        if (timedOut) {
          console.warn('Session check timed out; showing sign-in screen.');
        }
        await syncSession(data.session);
      } catch (err) {
        console.error('Session check failed:', err);
        if (active) setError(err.message);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      await syncSession(session);
      if (active) setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email, password) => {
    setError(null);
    const loginEmail = normalizeEmail(email || ADMIN_EMAIL);

    if (!loginEmail) {
      const err = new Error('Email required');
      setError(err.message);
      throw err;
    }

    if (!password) {
      const err = new Error('Password required');
      setError(err.message);
      throw err;
    }

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        throw signInError;
      }

      setAuthToken(data.session?.access_token || null);
      setUser(data.user || null);
      return { success: true };
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const resetPassword = useCallback(async (email) => {
    setError(null);
    const resetEmail = normalizeEmail(email || ADMIN_EMAIL);
    if (!resetEmail) {
      const err = new Error('Email required');
      setError(err.message);
      throw err;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: window.location.origin,
    });
    if (resetError) {
      setError(resetError.message);
      throw resetError;
    }
    return { success: true };
  }, []);

  const updatePassword = useCallback(async (password) => {
    setError(null);
    if (!password || password.length < 8) {
      const err = new Error('Use at least 8 characters for the new password.');
      setError(err.message);
      throw err;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      throw updateError;
    }
    setPasswordRecovery(false);
    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setAuthToken(null);
      setUser(null);
      setIsAdmin(false);
      setRole(null);
      setError(null);
    }
  }, []);

  const value = {
    isAdmin,
    isLoading,
    error,
    user,
    role,
    login,
    logout,
    resetPassword,
    updatePassword,
    passwordRecovery,
    isConfigured: true,
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
