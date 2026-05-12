import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function resolveApiProxyTarget(rawValue: string | undefined): string {
  const normalizedValue = trimTrailingSlash(String(rawValue || "").trim())
  if (!normalizedValue) {
    return "http://127.0.0.1:5000"
  }
  return normalizedValue
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "")
  const apiProxyTarget = resolveApiProxyTarget(env.VITE_API_URL)
  const proxyPrefixes = [
    "/api",
    "/auth",
    "/builder",
    "/workflow",
    "/chat",
    "/realty",
    "/uploads",
    "/socket.io",
  ]

  const proxy = Object.fromEntries(
    proxyPrefixes.map((prefix) => [
      prefix,
      {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false,
        ws: prefix === "/socket.io",
      },
    ])
  )

  return {
    base: '/',
    plugins: [inspectAttr(), react()],
    server: {
      host: true,
      port: 5173,
      strictPort: false,
      proxy,
    },
    preview: {
      host: true,
      port: 4173,
      strictPort: false,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      target: 'es2020',
      cssMinify: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return;
            }

            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/')
            ) {
              return 'react-vendor';
            }

            if (id.includes('/@supabase/')) {
              return 'supabase';
            }

            if (id.includes('/lucide-react/')) {
              return 'icons';
            }

            if (
              id.includes('/recharts/') ||
              id.includes('/d3-')
            ) {
              return 'charts';
            }

            if (
              id.includes('/@radix-ui/') ||
              id.includes('/cmdk/') ||
              id.includes('/class-variance-authority/') ||
              id.includes('/tailwind-merge/')
            ) {
              return 'ui-kit';
            }

            if (id.includes('/@react-google-maps/')) {
              return 'maps';
            }

            if (id.includes('/gsap/') || id.includes('/@gsap/')) {
              return 'animations';
            }
          },
        },
      },
    },
  }
})
