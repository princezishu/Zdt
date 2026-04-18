const CONNECTION_STRING_ENV_KEYS = [
  'SUPABASE_DB_POOLER_URL',
  'SUPABASE_DB_URL',
  'DATABASE_URL',
];

const HOST_ENV_KEYS = [
  'SUPABASE_DB_HOST',
  'DB_HOST',
];

const USER_ENV_KEYS = [
  'SUPABASE_DB_USER',
  'DB_USER',
];

const PASSWORD_ENV_KEYS = [
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_DB_PASS',
  'DB_PASS',
];

const DATABASE_NAME_ENV_KEYS = [
  'SUPABASE_DB_NAME',
  'DB_NAME',
];

const PORT_ENV_KEYS = [
  'SUPABASE_DB_PORT',
  'DB_PORT',
];

const SSL_ENABLED_ENV_KEYS = [
  'SUPABASE_DB_SSL',
  'DB_SSL',
];

const SSL_REJECT_UNAUTHORIZED_ENV_KEYS = [
  'SUPABASE_DB_SSL_REJECT_UNAUTHORIZED',
  'DB_SSL_REJECT_UNAUTHORIZED',
];

const SSL_CA_ENV_KEYS = [
  'SUPABASE_DB_SSL_CA',
  'DB_SSL_CA',
];

function readStringEnv(env, keys) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(env, key)) {
      continue;
    }

    const value = String(env[key] || '').trim();
    if (value) {
      return { key, value };
    }
  }

  return { key: '', value: '' };
}

function readBooleanEnv(env, keys, fallback = false) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(env, key)) {
      continue;
    }

    const value = String(env[key] || '').trim().toLowerCase();
    if (!value) {
      continue;
    }

    return value === '1' || value === 'true' || value === 'yes' || value === 'on';
  }

  return fallback;
}

function normalizeCaBundle(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return '';
  }

  return value.replace(/\\n/g, '\n');
}

function parsePort(entry) {
  const parsed = Number(entry.value);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
    return parsed;
  }

  throw new Error(`Invalid database port in ${entry.key || 'database port env'}.`);
}

function summarizeConnectionString(connectionString) {
  try {
    const parsed = new URL(connectionString);
    return {
      host: parsed.hostname || '',
      port: parsed.port ? Number(parsed.port) : null,
      database: decodeURIComponent(parsed.pathname.replace(/^\/+/, '')) || '',
    };
  } catch {
    return {
      host: '',
      port: null,
      database: '',
    };
  }
}

function isLikelySupabaseConnection({ host = '', sourceKey = '', env = process.env } = {}) {
  const normalizedHost = String(host || '').trim().toLowerCase();
  const normalizedSourceKey = String(sourceKey || '').trim().toUpperCase();
  if (normalizedSourceKey.startsWith('SUPABASE_')) {
    return true;
  }

  if (normalizedHost.includes('supabase')) {
    return true;
  }

  return false;
}

function buildSslConfig(env, { isSupabaseConnection = false } = {}) {
  const caEntry = readStringEnv(env, SSL_CA_ENV_KEYS);
  const defaultSslEnabled = isSupabaseConnection;
  const sslEnabled = readBooleanEnv(env, SSL_ENABLED_ENV_KEYS, defaultSslEnabled);
  if (!sslEnabled) {
    return null;
  }

  const rejectUnauthorized = readBooleanEnv(
    env,
    SSL_REJECT_UNAUTHORIZED_ENV_KEYS,
    caEntry.value ? true : !isSupabaseConnection
  );

  const ssl = {
    rejectUnauthorized,
  };

  if (caEntry.value) {
    ssl.ca = normalizeCaBundle(caEntry.value);
  }

  return ssl;
}

export function resolveDatabaseConnectionConfig({ env = process.env } = {}) {
  const connectionStringEntry = readStringEnv(env, CONNECTION_STRING_ENV_KEYS);
  if (connectionStringEntry.value) {
    const summary = summarizeConnectionString(connectionStringEntry.value);
    const isSupabaseConnection = isLikelySupabaseConnection({
      host: summary.host,
      sourceKey: connectionStringEntry.key,
      env,
    });
    const ssl = buildSslConfig(env, { isSupabaseConnection });

    return {
      provider: isSupabaseConnection ? 'supabase' : 'postgres',
      strategy: 'connection_string',
      source: connectionStringEntry.key,
      host: summary.host,
      port: summary.port,
      database: summary.database,
      ssl,
      pgConfig: {
        connectionString: connectionStringEntry.value,
        ...(ssl ? { ssl } : {}),
      },
    };
  }

  const hostEntry = readStringEnv(env, HOST_ENV_KEYS);
  const userEntry = readStringEnv(env, USER_ENV_KEYS);
  const passwordEntry = readStringEnv(env, PASSWORD_ENV_KEYS);
  const databaseEntry = readStringEnv(env, DATABASE_NAME_ENV_KEYS);
  const portEntry = readStringEnv(env, PORT_ENV_KEYS);

  const missing = [];
  if (!hostEntry.value) missing.push('SUPABASE_DB_HOST or DB_HOST');
  if (!userEntry.value) missing.push('SUPABASE_DB_USER or DB_USER');
  if (!passwordEntry.value) missing.push('SUPABASE_DB_PASSWORD or DB_PASS');
  if (!databaseEntry.value) missing.push('SUPABASE_DB_NAME or DB_NAME');
  if (!portEntry.value) missing.push('SUPABASE_DB_PORT or DB_PORT');

  if (missing.length > 0) {
    throw new Error(
      `Missing database connection env. Set ${CONNECTION_STRING_ENV_KEYS.join(', ')} or provide host-based vars: ${missing.join(', ')}.`
    );
  }

  const port = parsePort(portEntry);
  const isSupabaseConnection = isLikelySupabaseConnection({
    host: hostEntry.value,
    sourceKey: hostEntry.key,
    env,
  });
  const ssl = buildSslConfig(env, { isSupabaseConnection });

  return {
    provider: isSupabaseConnection ? 'supabase' : 'postgres',
    strategy: 'host_credentials',
    source: hostEntry.key,
    host: hostEntry.value,
    port,
    database: databaseEntry.value,
    ssl,
    pgConfig: {
      host: hostEntry.value,
      user: userEntry.value,
      password: passwordEntry.value,
      database: databaseEntry.value,
      port,
      ...(ssl ? { ssl } : {}),
    },
  };
}

export function describeDatabaseConnection(config = resolveDatabaseConnectionConfig()) {
  return {
    provider: config.provider,
    strategy: config.strategy,
    source: config.source,
    host: config.host || '',
    port: config.port ?? null,
    database: config.database || '',
    sslEnabled: Boolean(config.ssl),
    rejectUnauthorized: config.ssl ? Boolean(config.ssl.rejectUnauthorized) : null,
  };
}
