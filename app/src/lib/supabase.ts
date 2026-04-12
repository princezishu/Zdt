import {
  createClient,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_AUTH_REDIRECT_URL = String(import.meta.env.VITE_SUPABASE_AUTH_REDIRECT_URL || '').trim();
const SUPABASE_STORAGE_KEY = 'zdt.supabase.auth';
const SUPABASE_LINK_HINT_KEY = 'zdt.supabase.link_hint';
const SUPABASE_SIGNUP_HINT_KEY = 'zdt.supabase.signup_hint';

let browserClient: SupabaseClient | null = null;

export interface ManagedLinkHint {
  email: string;
  provider: string | null;
}

export type ManagedOAuthProvider = 'google' | 'github';

export class ManagedAuthError extends Error {
  code: string;
  cause: unknown;

  constructor(
    message: string,
    {
      code = 'managed_auth_error',
      cause = null,
    }: {
      code?: string;
      cause?: unknown;
    } = {}
  ) {
    super(message);
    this.name = 'ManagedAuthError';
    this.code = code;
    this.cause = cause;
  }
}

function buildManagedAuthNetworkErrorMessage(actionLabel: string) {
  const configuredUrl = SUPABASE_URL || '(missing VITE_SUPABASE_URL)';
  return `Unable to reach ${actionLabel} at ${configuredUrl}. Check the Supabase project URL in app/.env and server/.env.`;
}

function wrapManagedAuthError(error: unknown, actionLabel: string): never {
  if (error instanceof ManagedAuthError) {
    throw error;
  }

  const message = error instanceof Error ? error.message : String(error || '');
  if (/failed to fetch|fetch failed|networkerror|network request failed/i.test(message)) {
    throw new ManagedAuthError(buildManagedAuthNetworkErrorMessage(actionLabel), {
      code: 'managed_auth_network_error',
      cause: error,
    });
  }

  if (error instanceof Error) {
    throw error;
  }

  throw new ManagedAuthError(`${actionLabel} failed.`, {
    cause: error,
  });
}

function getSessionStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const sessionStorageAdapter = {
  getItem(key: string) {
    return getSessionStorage()?.getItem(key) ?? null;
  },
  setItem(key: string, value: string) {
    getSessionStorage()?.setItem(key, value);
  },
  removeItem(key: string) {
    getSessionStorage()?.removeItem(key);
  },
};

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getManagedOAuthProviderLabel(provider: ManagedOAuthProvider) {
  return provider === 'github' ? 'GitHub' : 'Google';
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: sessionStorageAdapter,
        storageKey: SUPABASE_STORAGE_KEY,
      },
    });
  }

  return browserClient;
}

export function readManagedLinkHint(): ManagedLinkHint | null {
  const storage = getSessionStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(SUPABASE_LINK_HINT_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { email?: unknown; provider?: unknown };
    return {
      email: typeof parsed.email === 'string' ? parsed.email.trim().toLowerCase() : '',
      provider: typeof parsed.provider === 'string' ? parsed.provider.trim().toLowerCase() : null,
    };
  } catch {
    return null;
  }
}

export function setManagedLinkHint(hint: Partial<ManagedLinkHint>) {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  storage.setItem(
    SUPABASE_LINK_HINT_KEY,
    JSON.stringify({
      email: typeof hint.email === 'string' ? hint.email.trim().toLowerCase() : '',
      provider: typeof hint.provider === 'string' ? hint.provider.trim().toLowerCase() : null,
    })
  );
}

export function clearManagedLinkHint() {
  getSessionStorage()?.removeItem(SUPABASE_LINK_HINT_KEY);
}

export function readManagedSignupHint() {
  const raw = getSessionStorage()?.getItem(SUPABASE_SIGNUP_HINT_KEY) || '';
  return raw.trim().toLowerCase();
}

export function setManagedSignupHint(email: string) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  if (!normalizedEmail) {
    storage.removeItem(SUPABASE_SIGNUP_HINT_KEY);
    return;
  }

  storage.setItem(SUPABASE_SIGNUP_HINT_KEY, normalizedEmail);
}

export function clearManagedSignupHint() {
  getSessionStorage()?.removeItem(SUPABASE_SIGNUP_HINT_KEY);
}

export async function getManagedSession() {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  try {
    const { data, error } = await client.auth.getSession();
    if (error) {
      throw error;
    }

    return data.session;
  } catch (error) {
    wrapManagedAuthError(error, 'managed session');
  }
}

export async function getManagedAccessToken() {
  const session = await getManagedSession();
  return session?.access_token || '';
}

export function subscribeToManagedAuthChanges(
  callback: (event: AuthChangeEvent, session: Session | null) => void
) {
  const client = getSupabaseClient();
  if (!client) {
    return () => {};
  }

  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });

  return () => {
    subscription.unsubscribe();
  };
}

export async function signInWithManagedPassword({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase Auth is not configured in this app.');
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    wrapManagedAuthError(error, 'managed sign-in');
  }
}

export async function signUpWithManagedPassword({
  email,
  password,
  name,
  phone,
}: {
  email: string;
  password: string;
  name: string;
  phone?: string;
}) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase Auth is not configured in this app.');
  }

  try {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          phone: phone || '',
        },
      },
    });
    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    wrapManagedAuthError(error, 'managed sign-up');
  }
}

export async function signInWithManagedOAuth(provider: ManagedOAuthProvider) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase Auth is not configured in this app.');
  }

  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: getManagedAuthRedirectUrl(),
      },
    });
    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    wrapManagedAuthError(error, `managed ${getManagedOAuthProviderLabel(provider)} sign-in`);
  }
}

function getManagedAuthRedirectUrl() {
  if (SUPABASE_AUTH_REDIRECT_URL) {
    return SUPABASE_AUTH_REDIRECT_URL;
  }

  if (typeof window === 'undefined') {
    return undefined;
  }

  return `${window.location.origin}/login`;
}

export async function requestManagedSignInLink(email: string) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase Auth is not configured in this app.');
  }

  try {
    const { data, error } = await client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: getManagedAuthRedirectUrl(),
      },
    });
    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    wrapManagedAuthError(error, 'managed sign-in link');
  }
}

function getPasswordRecoveryRedirectUrl() {
  const configured = String(import.meta.env.VITE_SUPABASE_PASSWORD_RESET_REDIRECT_URL || '').trim();
  if (configured) {
    return configured;
  }

  if (typeof window === 'undefined') {
    return undefined;
  }

  return `${window.location.origin}/forgot-password?recovery=1`;
}

export async function requestManagedPasswordReset(email: string) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase Auth is not configured in this app.');
  }

  try {
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: getPasswordRecoveryRedirectUrl(),
    });
    if (error) {
      throw error;
    }
  } catch (error) {
    wrapManagedAuthError(error, 'managed password reset');
  }
}

export async function updateManagedPassword(password: string) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase Auth is not configured in this app.');
  }

  try {
    const { data, error } = await client.auth.updateUser({ password });
    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    wrapManagedAuthError(error, 'managed password update');
  }
}

export async function signOutManagedAuth() {
  const client = getSupabaseClient();
  if (!client) {
    return;
  }

  try {
    const { error } = await client.auth.signOut();
    if (error) {
      throw error;
    }
  } catch (error) {
    wrapManagedAuthError(error, 'managed sign-out');
  }
}

export function isManagedRecoveryHintPresent() {
  if (typeof window === 'undefined') {
    return false;
  }

  const query = new URLSearchParams(window.location.search);
  if (query.get('recovery') === '1') {
    return true;
  }

  const hash = String(window.location.hash || '');
  return /(?:^|[#&])type=recovery(?:&|$)/i.test(hash);
}

export function clearManagedRecoveryHint() {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('recovery');
  url.hash = '';
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
}
