import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/app-utilities.css'
import './styles/portal-mobile.css'
import App from './App.tsx'
import { Toaster } from '@/components/ui/sonner'

const isEdgeBrowser =
  typeof navigator !== 'undefined' &&
  ['Edg/', 'EdgA/', 'EdgiOS/'].some((token) => navigator.userAgent.includes(token))

if (isEdgeBrowser) {
  document.documentElement.classList.add('is-edge')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster richColors position="top-right" />
  </StrictMode>,
)
