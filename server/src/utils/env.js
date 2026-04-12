export function requireNonEmptyEnv(name) {
  const key = String(name || '').trim();
  if (!key) {
    throw new Error('[CONFIG] Environment variable name is required.');
  }

  const value = String(process.env[key] || '').trim();
  if (!value) {
    throw new Error(`[CONFIG] Missing required environment variable: ${key}`);
  }

  return value;
}

export function readStringEnv(name, fallback = '') {
  const key = String(name || '').trim();
  if (!key) {
    return String(fallback || '');
  }

  const value = String(process.env[key] || '').trim();
  return value || String(fallback || '');
}

export function readBooleanEnv(name, fallback = false) {
  const key = String(name || '').trim();
  if (!key) {
    return Boolean(fallback);
  }

  const value = String(process.env[key] || '').trim().toLowerCase();
  if (!value) {
    return Boolean(fallback);
  }

  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function readIntegerEnv(name, fallback, { min, max } = {}) {
  const key = String(name || '').trim();
  const fallbackValue = Number(fallback);
  const rawValue = key ? String(process.env[key] || '').trim() : '';
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;
  let finalValue = Number.isFinite(parsedValue) ? parsedValue : fallbackValue;

  if (!Number.isFinite(finalValue)) {
    return fallbackValue;
  }
  if (Number.isFinite(min)) {
    finalValue = Math.max(Number(min), finalValue);
  }
  if (Number.isFinite(max)) {
    finalValue = Math.min(Number(max), finalValue);
  }
  return finalValue;
}

export function readListEnv(names, fallback = []) {
  const keys = Array.isArray(names) ? names : [names];
  const values = keys.flatMap((name) => {
    const key = String(name || '').trim();
    if (!key) {
      return [];
    }

    return String(process.env[key] || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  });

  if (values.length > 0) {
    return Array.from(new Set(values));
  }

  return Array.isArray(fallback) ? Array.from(new Set(fallback.map((value) => String(value).trim()).filter(Boolean))) : [];
}
