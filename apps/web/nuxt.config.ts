import tailwindcss from '@tailwindcss/vite';

// The backend base URL is only ever read on the server (build-time config +
// Nitro's route-rule proxy below) — it never lands in runtimeConfig.public,
// so it never ships to the browser bundle. The frontend itself calls only
// relative `/api/v1/*` paths; Nitro forwards them to apps/api.
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint'],
  css: ['~/assets/css/tailwind.css'],
  components: {
    dirs: [
      // shadcn-vue's ui/* components are imported explicitly, e.g.
      // `import { Button } from '@/components/ui/button'`, per shadcn-vue
      // convention — each folder's index.ts and PascalCase .vue file resolve
      // to the same auto-import name (NUXT_B3011), so ui/** is excluded from
      // Nuxt's component auto-scan rather than fixed with a rename.
      { path: '~/components', ignore: ['ui/**'] }
    ]
  },
  vite: {
    plugins: [tailwindcss()],
    // maplibre-gl loads its worker via a relative `new URL(...)` import
    // (`maplibre-gl-worker.mjs`). Vite's dependency pre-bundling rewrites
    // maplibre-gl's entry into `node_modules/.cache/vite/client/deps/` but
    // does not emit that worker chunk alongside it, so the browser requests
    // a file that was never written and fails with `net::ERR_FAILED`. MapLibre
    // still renders raster tiles without it, but excluding the package from
    // pre-bundling serves it straight from `node_modules` (worker chunk
    // included) and removes the console/network error entirely.
    optimizeDeps: {
      exclude: ['maplibre-gl']
    }
  },
  routeRules: {
    '/api/v1/**': { proxy: `${apiBaseUrl}/api/v1/**` }
  },
  devServer: {
    port: Number(process.env.WEB_PORT) || 3001
  }
})
