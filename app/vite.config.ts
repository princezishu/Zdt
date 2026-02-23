import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [inspectAttr(), react()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
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
});
