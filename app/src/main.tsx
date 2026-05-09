import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/app-utilities.css'
import './styles/portal-mobile.css'
import App from './App.tsx'
import { Toaster } from '@/components/ui/sonner'
import { initializeSentry, Sentry } from '@/lib/sentry'
import { initializeGoogleAnalytics } from '@/lib/googleAnalytics'

const isEdgeBrowser =
  typeof navigator !== 'undefined' &&
  ['Edg/', 'EdgA/', 'EdgiOS/'].some((token) => navigator.userAgent.includes(token))

if (isEdgeBrowser) {
  document.documentElement.classList.add('is-edge')
}

initializeSentry()
initializeGoogleAnalytics()

const root = createRoot(document.getElementById('root')!, {
  onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
    console.error('[APP] React root error:', {
      error,
      componentStack: errorInfo.componentStack,
    })
  }),
})

root.render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-6 text-center text-slate-900">
          <div className="max-w-md space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-red-100 to-red-200 text-2xl">⚠️</div>
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              An unexpected error occurred. This has been logged and our team will investigate.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-950 to-blue-800 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-90"
            >
              Reload Page
            </button>
          </div>
        </div>
      }
      onError={(error, componentStack) => {
        console.error('[APP] React error boundary caught an error:', {
          error,
          componentStack,
        })
      }}
    >
      <App />
    </Sentry.ErrorBoundary>
    <Toaster richColors position="top-right" />
  </StrictMode>,
)
