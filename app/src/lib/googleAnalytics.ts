type GtagCommand = 'js' | 'config' | 'event'

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

const GA_MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim()
const GA_SCRIPT_SOURCE = GA_MEASUREMENT_ID
  ? `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`
  : ''

let gaInitialized = false
let gaScriptRequested = false
let lastTrackedPageLocation = ''

function isGoogleAnalyticsAvailable() {
  return Boolean(GA_MEASUREMENT_ID && typeof window !== 'undefined' && typeof document !== 'undefined')
}

function gtag(...args: unknown[]) {
  window.dataLayer.push(args)
}

function loadGoogleAnalyticsScript() {
  if (!isGoogleAnalyticsAvailable() || gaScriptRequested || !document.head) {
    return
  }

  gaScriptRequested = true

  const existingScript = document.querySelector<HTMLScriptElement>(
    `script[src="${GA_SCRIPT_SOURCE}"]`,
  )
  if (existingScript) {
    return
  }

  const script = document.createElement('script')
  script.async = true
  script.src = GA_SCRIPT_SOURCE
  document.head.appendChild(script)
}

function scheduleGoogleAnalyticsScriptLoad() {
  if (!isGoogleAnalyticsAvailable() || gaScriptRequested) {
    return
  }

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => {
      loadGoogleAnalyticsScript()
    }, { timeout: 2000 })
    return
  }

  window.setTimeout(() => {
    loadGoogleAnalyticsScript()
  }, 1200)
}

function getPageLocation() {
  if (typeof window === 'undefined') {
    return ''
  }

  return `${window.location.origin}${window.location.pathname}${window.location.search}`
}

function getPagePath() {
  if (typeof window === 'undefined') {
    return '/'
  }

  return `${window.location.pathname}${window.location.search}`
}

export function initializeGoogleAnalytics() {
  if (gaInitialized) {
    return isGoogleAnalyticsAvailable()
  }

  gaInitialized = true

  if (!isGoogleAnalyticsAvailable()) {
    return false
  }

  window.dataLayer = window.dataLayer || []
  window.gtag = window.gtag || gtag

  window.gtag('js' satisfies GtagCommand, new Date())
  window.gtag('config' satisfies GtagCommand, GA_MEASUREMENT_ID, {
    send_page_view: false,
  })

  scheduleGoogleAnalyticsScriptLoad()
  return true
}

export function trackGoogleAnalyticsPageView() {
  if (!initializeGoogleAnalytics() || !window.gtag) {
    return false
  }

  const pageLocation = getPageLocation()
  if (!pageLocation || pageLocation === lastTrackedPageLocation) {
    return false
  }

  lastTrackedPageLocation = pageLocation

  window.gtag('event' satisfies GtagCommand, 'page_view', {
    page_location: pageLocation,
    page_path: getPagePath(),
    page_title: typeof document.title === 'string' ? document.title : '',
  })

  return true
}

export function isGoogleAnalyticsEnabled() {
  return Boolean(GA_MEASUREMENT_ID)
}
