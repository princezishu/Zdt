export type UserRole = 'user' | 'team_member' | 'admin' | 'owner' | 'agent' | 'builder';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isMainAdmin: boolean;
  phone?: string;
  forcePasswordReset?: boolean;
  authStrategy?: 'legacy' | 'managed';
  managedAuthProvider?: string | null;
  managedAuthOnly?: boolean;
}

const TOKEN_KEY = 'authToken';
const USER_KEY = 'authUser';
const DEVICE_KEY = 'deviceId';
let volatileToken = '';

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

// On module load: migrate any legacy persisted tokens into volatile memory,
// then immediately remove them from storage to eliminate XSS exposure.
if (typeof window !== 'undefined') {
  const sessionStorageRef = getSessionStorage();
  const sessionToken = sessionStorageRef?.getItem(TOKEN_KEY) || '';
  const legacyToken = window.localStorage.getItem(TOKEN_KEY) || '';

  // Hydrate volatile token from any available source (for the current tab)
  if (sessionToken) {
    volatileToken = sessionToken;
  } else if (legacyToken) {
    volatileToken = legacyToken;
  }

  // Purge tokens from all persistent storage — httpOnly cookie handles auth
  sessionStorageRef?.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TOKEN_KEY);

  // Migrate user profile to sessionStorage (non-sensitive display data)
  const legacyUser = window.localStorage.getItem(USER_KEY) || '';
  if (legacyUser && sessionStorageRef && !sessionStorageRef.getItem(USER_KEY)) {
    sessionStorageRef.setItem(USER_KEY, legacyUser);
    window.localStorage.removeItem(USER_KEY);
  }
}

function toUserRole(
  value: unknown,
  accountTypeValue?: unknown,
  companyRoleValue?: unknown
): UserRole {
  if (
    value === 'admin' ||
    value === 'team_member' ||
    value === 'owner' ||
    value === 'agent' ||
    value === 'builder'
  ) {
    return value;
  }

  const accountType =
    typeof accountTypeValue === 'string' ? accountTypeValue.trim().toLowerCase() : '';
  if (accountType === 'dealer' || accountType === 'builder') {
    return 'builder';
  }

  const companyRole =
    typeof companyRoleValue === 'string' ? companyRoleValue.trim().toLowerCase() : '';
  if (companyRole === 'owner' || companyRole === 'member') {
    return 'builder';
  }

  return 'user';
}

export function parseApiUser(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as Record<string, unknown>;
  const id = Number(data.id);
  const name = typeof data.name === 'string' ? data.name : '';
  const email = typeof data.email === 'string' ? data.email : '';

  if (!Number.isFinite(id) || !name || !email) {
    return null;
  }

  const isMainAdmin =
    data.isMainAdmin === true ||
    data.is_main_admin === true;

  return {
    id,
    name,
    email,
    role: toUserRole(
      data.role,
      data.accountType ?? data.account_type,
      data.companyRole ?? data.company_role
    ),
    isMainAdmin,
    phone: typeof data.phone === 'string' ? data.phone : undefined,
    forcePasswordReset:
      data.forcePasswordReset === true ||
      data.force_password_reset === true,
    authStrategy:
      data.authStrategy === 'managed' || data.auth_strategy === 'managed' ? 'managed' : 'legacy',
    managedAuthProvider:
      typeof data.managedAuthProvider === 'string'
        ? data.managedAuthProvider
        : typeof data.managed_auth_provider === 'string'
          ? data.managed_auth_provider
          : null,
    managedAuthOnly:
      data.managedAuthOnly === true ||
      data.managed_auth_only === true,
  };
}

export function saveSession(token: string, user: AuthUser) {
  volatileToken = String(token || '').trim();
  // Token is kept in volatile memory only — httpOnly cookie handles persistence
  // User profile (non-sensitive) stored in sessionStorage for UI display
  const sessionStorageRef = getSessionStorage();
  window.localStorage.removeItem(TOKEN_KEY);
  sessionStorageRef?.removeItem(TOKEN_KEY);
  sessionStorageRef?.setItem(USER_KEY, JSON.stringify(user));
  window.localStorage.removeItem(USER_KEY);
}

export function setSessionToken(token: string) {
  volatileToken = String(token || '').trim();
  // Token kept in volatile memory only — never persisted to storage
  const sessionStorageRef = getSessionStorage();
  sessionStorageRef?.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
}

export function clearSession() {
  volatileToken = '';
  const sessionStorageRef = getSessionStorage();
  sessionStorageRef?.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
  sessionStorageRef?.removeItem(USER_KEY);
  window.localStorage.removeItem(USER_KEY);

  // Also purge any Supabase-managed auth session data to prevent
  // the bootstrap flow from re-authenticating after logout.
  sessionStorageRef?.removeItem('zdt.supabase.auth');
  sessionStorageRef?.removeItem('zdt.supabase.link_hint');
  sessionStorageRef?.removeItem('zdt.supabase.signup_hint');
  window.localStorage.removeItem('zdt.supabase.auth');
  window.localStorage.removeItem('zdt.supabase.link_hint');
  window.localStorage.removeItem('zdt.supabase.signup_hint');
}

export function readToken(): string {
  if (!volatileToken) {
    volatileToken = getSessionStorage()?.getItem(TOKEN_KEY) || '';
  }
  return volatileToken;
}

export function readStoredUser(): AuthUser | null {
  const sessionStorageRef = getSessionStorage();
  const raw = sessionStorageRef?.getItem(USER_KEY) || window.localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return parseApiUser(JSON.parse(raw));
  } catch {
    return null;
  }
}

function createDeviceId(): string {
  const cryptoObj = window.crypto as Crypto & { randomUUID?: () => string };
  if (typeof cryptoObj.randomUUID === 'function') {
    return `web-${cryptoObj.randomUUID()}`;
  }
  const fallback = `${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
  return `web-${fallback}`;
}

export function readOrCreateDeviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing) {
    return existing;
  }
  const next = createDeviceId();
  window.localStorage.setItem(DEVICE_KEY, next);
  return next;
}
