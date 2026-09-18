import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';

// The backend base URL is only ever read on the server (build-time config +
// Nitro's route-rule proxy below) — it never lands in runtimeConfig.public,
// so it never ships to the browser bundle. The frontend itself calls only
// relative `/api/v1/*` paths; Nitro forwards them to apps/api.
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000';

// maplibre-gl's worker script (`maplibre-gl-worker.mjs`) is a plain ES module
// that itself does `import ... from './maplibre-gl-shared.mjs'` — a sibling
// chunk with the runtime code shared between the main thread and the worker.
// maplibre-gl resolves the *worker's own* URL internally via
// `new URL(`./${isDev ? '...-dev.mjs' : '...worker.mjs'}`, import.meta.url)`,
// a template literal (not a static string), which Vite's asset-URL analysis
// can't statically resolve — so in a `vite build` neither file is ever
// emitted, and the runtime fallback resolves against the *bundled app
// chunk's* import.meta.url, producing a 404 for a worker script that was
// never written to `.output`/`dist`. This only shows up in a genuine
// production build (any Nitro preset — it's a client bundling issue, not
// preset-specific); dev mode has a separate, already-handled worker issue,
// see `optimizeDeps.exclude` below.
//
// A single static `?url` import of just the worker file isn't enough either:
// Vite would copy that one file as an opaque asset (correct), but it doesn't
// follow that raw file's own un-rewritten `import './maplibre-gl-shared.mjs'`
// statement, so the sibling chunk it depends on still never gets copied and
// the same 404 just moves one file over.
//
// The reliable fix is to copy both files together into `public/`, preserving
// them as siblings so the worker's relative import between them keeps
// resolving, and point maplibre-gl at that stable, unbundled path via
// `setWorkerUrl()` (see `RouteMap.client.vue`) — sidestepping Vite's
// bundling of this pair entirely rather than fighting it. Doing this in a
// `ready` hook (fires for `nuxt dev`, `nuxt build`, and `nuxt generate`
// alike) keeps it in sync with whatever maplibre-gl version is installed,
// rather than relying on a separately-run script someone could forget.
function copyMaplibreWorkerAssets(): void {
  const maplibreDistDir = dirname(
    fileURLToPath(import.meta.resolve('maplibre-gl/dist/maplibre-gl-worker.mjs'))
  );
  const targetDir = fileURLToPath(new URL('./public/vendor/maplibre-gl/', import.meta.url));
  mkdirSync(targetDir, { recursive: true });
  for (const file of [
    'maplibre-gl-worker.mjs',
    'maplibre-gl-worker.mjs.map',
    'maplibre-gl-shared.mjs',
    'maplibre-gl-shared.mjs.map'
  ]) {
    cpSync(join(maplibreDistDir, file), join(targetDir, file));
  }
}

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
  },
  hooks: {
    ready: copyMaplibreWorkerAssets
  }
})
