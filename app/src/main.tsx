import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/app-utilities.css'
import './styles/portal-mobile.css'
import App from './App.tsx'
import { Toaster } from '@/components/ui/sonner'
import { initializeSentry, Sentry } from '@/lib/sentry'
import { initializeGoogleAnalytics } from '@/lib/googleAnalytics'
import { SpeedInsights } from '@vercel/speed-insights/react'

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
        <div className="flex min-h-screen items-center justify-center bg-white px-6 text-center text-slate-900">
          <div className="max-w-md space-y-3">
            <h1 className="text-2xl font-semibold">Something went wrong.</h1>
            <p className="text-sm text-slate-600">
              Please refresh the page and try again.
            </p>
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
    <SpeedInsights />
  </StrictMode>,
)
