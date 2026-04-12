export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_MIN_LENGTH = 12;
export const ADMIN_PASSWORD_MIN_LENGTH = 14;

const commonWeakPasswords = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password123',
  'qwerty123',
  'admin123',
  'letmein123',
  'welcome123',
  'iloveyou123',
]);

export function isPrivilegedAccount(role, isMainAdmin = false) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  return Boolean(isMainAdmin) || normalizedRole === 'admin' || normalizedRole === 'team_member';
}

export function passwordMinLengthForAccount({ role, isMainAdmin } = {}) {
  return isPrivilegedAccount(role, isMainAdmin) ? ADMIN_PASSWORD_MIN_LENGTH : PASSWORD_MIN_LENGTH;
}

export function getPasswordPolicyError(
  password,
  { minLength = PASSWORD_MIN_LENGTH } = {}
) {
  const value = String(password || '');
  const effectiveMinLength = Number.isFinite(Number(minLength))
    ? Math.max(8, Math.round(Number(minLength)))
    : PASSWORD_MIN_LENGTH;

  if (value.length < effectiveMinLength) {
    return `Password must be at least ${effectiveMinLength} characters long.`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters long.`;
  }
  if (/\s/.test(value)) {
    return 'Password must not contain spaces.';
  }
  if (!/[A-Z]/.test(value)) {
    return 'Password must include at least one uppercase letter.';
  }
  if (!/[a-z]/.test(value)) {
    return 'Password must include at least one lowercase letter.';
  }
  if (!/\d/.test(value)) {
    return 'Password must include at least one number.';
  }
  if (!/[^A-Za-z0-9]/.test(value)) {
    return 'Password must include at least one special character.';
  }
  if (commonWeakPasswords.has(value.toLowerCase())) {
    return 'Password is too common. Please choose a less predictable password.';
  }

  return '';
}

