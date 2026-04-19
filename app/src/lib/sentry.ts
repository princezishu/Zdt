import * as Sentry from '@sentry/react'

const SENTRY_DSN = String(import.meta.env.VITE_SENTRY_DSN || '').trim()
const SENTRY_ENVIRONMENT = String(
  import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || 'development',
).trim()
const SENTRY_RELEASE = String(import.meta.env.VITE_SENTRY_RELEASE || '').trim()

let sentryInitialized = false

export function initializeSentry() {
  if (sentryInitialized) {
    return Boolean(SENTRY_DSN)
  }

  sentryInitialized = true

  if (!SENTRY_DSN) {
    return false
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: SENTRY_RELEASE || undefined,
  })

  return true
}

export { Sentry }
