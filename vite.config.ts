import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import pagesAnalytics from 'pages-analytics/vite'

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/, so the deploy sets BASE_URL
  base: process.env.BASE_URL || '/',
  // Adds the analytics snippet at build time, and only when ANALYTICS_ID is set (never in dev, forks or local builds).
  // consent: Google Analytics collects nothing until the banner is accepted.
  plugins: [tailwindcss(), vue(), pagesAnalytics({ consent: true })],
})
