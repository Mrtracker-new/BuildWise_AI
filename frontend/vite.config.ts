import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** Directory holding MapLibre's prebuilt runtime files. */
function mapLibreDistDir(): string {
  const candidates = [
    () => path.dirname(require.resolve('maplibre-gl/dist/maplibre-gl-worker.mjs')),
    () => path.join(path.dirname(require.resolve('maplibre-gl/package.json')), 'dist'),
    () => path.join(process.cwd(), 'node_modules', 'maplibre-gl', 'dist'),
  ]
  for (const candidate of candidates) {
    try {
      const dir = candidate()
      if (fs.existsSync(path.join(dir, 'maplibre-gl-worker.mjs'))) return dir
    } catch {
      /* try the next strategy */
    }
  }
  return ''
}

/**
 * MapLibre GL resolves its web worker at RUNTIME:
 *
 *   new URL(`./maplibre-gl-worker.mjs`, import.meta.url)
 *
 * then `new Worker(url, { type: 'module' })`, and that worker imports
 * `./maplibre-gl-shared.mjs` beside it. Vite cannot see either reference — the
 * file name is computed from a template string — so a plain `vite build` emitted
 * only the app chunk. In production the worker 404'd ("Worker failed to load"),
 * the vector style never loaded and the map fell back to a raster style: no
 * basemap at all.
 *
 * This copies both files, unrenamed, into the build's assets directory so the
 * runtime-relative URL resolves next to whichever chunk references it. They are
 * worker-side files fetched on demand, not part of the initial JS payload.
 */
function mapLibreWorker(): Plugin {
  let outDir = 'dist'
  let assetsDir = 'assets'
  return {
    name: 'bw-maplibre-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
      assetsDir = config.build.assetsDir || 'assets'
    },
    closeBundle() {
      const dist = mapLibreDistDir()
      if (!dist) {
        this.warn('maplibre-gl dist directory not found; the production map would fall back to raster tiles.')
        return
      }
      const target = path.resolve(outDir, assetsDir)
      fs.mkdirSync(target, { recursive: true })
      const copied: string[] = []
      for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
        const from = path.join(dist, file)
        if (!fs.existsSync(from)) continue
        fs.copyFileSync(from, path.join(target, file))
        copied.push(file)
      }
      if (copied.length !== 2) {
        this.warn(
          `MapLibre worker assets were not all copied (got: ${copied.join(', ') || 'none'}); ` +
            'the production map will fall back to a raster style.'
        )
      }
    },
  }
}

/**
 * Preload the /app route chunk — on /app only.
 *
 * The route chunk is fetched only after the entry chunk has executed and React
 * renders the route, and its own static imports (design primitives, boundary
 * geometry) are discovered one round trip later still. Measured on the B6
 * build: the shell's first-view text (the LCP element) painted ~335 ms after it
 * otherwise would have on the desktop preset, and on mobile the same serial
 * chain sat inside the LCP render delay.
 *
 * So the route chunk is announced from the HTML. The inline script runs while
 * the head is still parsing, so the fetch starts as early as a static link would
 * let it, in parallel with the entry chunk — but only on /app, exactly like the
 * landing's hero-photograph preload in index.html: a landing visitor must not
 * pay for the app's route chunk, and vice versa.
 *
 * Note this is NOT the engine behind the app's back: the route chunk is the
 * shell the first view is made of.
 */
function appRoutePreload(): Plugin {
  return {
    name: 'bw-app-route-preload',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      const bundle = ctx.bundle as
        | Record<
            string,
            { type?: string; isDynamicEntry?: boolean; facadeModuleId?: string | null; fileName?: string }
          >
        | undefined;
      const chunk = bundle
        ? Object.values(bundle).find(
            (item) =>
              item.type === 'chunk' &&
              item.isDynamicEntry &&
              /src[\\/]App\.tsx$/.test(String(item.facadeModuleId || ''))
          )
        : undefined;
      if (!chunk || !chunk.fileName) {
        this.warn('the /app route chunk was not found in the bundle; /app will not preload it');
        return html;
      }
      const inline =
        `<script>(function(){if(location.pathname.indexOf('/app')!==0)return;` +
        `var l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='anonymous';` +
        `l.href='/${chunk.fileName}';document.head.appendChild(l);})();</script>`;
      return html.replace('</head>', `    ${inline}\n  </head>`);
    },
  };
}

export default defineConfig({
  plugins: [react(), mapLibreWorker(), appRoutePreload()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Describe chunk graph in manifest for route-level bundle tracking
    manifest: true,
  },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
