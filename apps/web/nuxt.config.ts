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
    plugins: [tailwindcss()]
  },
  routeRules: {
    '/api/v1/**': { proxy: `${apiBaseUrl}/api/v1/**` }
  },
  devServer: {
    port: Number(process.env.WEB_PORT) || 3001
  },
  runtimeConfig: {
    public: {
      // Deliberately public: this key only loads the Google Maps JavaScript
      // SDK in the browser and is restricted by HTTP referrer in Google
      // Cloud Console (see CLAUDE.md non-negotiable 1 and RouteMap.client.vue).
      // It must never be reused server-side — apps/api has its own separate
      // GOOGLE_MAPS_SERVER_API_KEY for Directions/Geocoding calls.
      googleMapsApiKey: process.env.NUXT_PUBLIC_GOOGLE_MAPS_API_KEY
    }
  }
})
