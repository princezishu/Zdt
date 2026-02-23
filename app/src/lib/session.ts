export type UserRole = 'user' | 'team_member' | 'admin';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isMainAdmin: boolean;
  phone?: string;
  forcePasswordReset?: boolean;
}

const TOKEN_KEY = 'authToken';
const USER_KEY = 'authUser';
const DEVICE_KEY = 'deviceId';

function toUserRole(value: unknown): UserRole {
  if (value === 'admin' || value === 'team_member') {
    return value;
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
    role: toUserRole(data.role),
    isMainAdmin,
    phone: typeof data.phone === 'string' ? data.phone : undefined,
    forcePasswordReset:
      data.forcePasswordReset === true ||
      data.force_password_reset === true,
  };
}

export function saveSession(token: string, user: AuthUser) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function readToken(): string {
  return window.localStorage.getItem(TOKEN_KEY) || '';
}

export function readStoredUser(): AuthUser | null {
  const raw = window.localStorage.getItem(USER_KEY);
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
