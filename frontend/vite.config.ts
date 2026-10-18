import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { firstScreenCss, firstScreenHtml } from './src/landing/heroCopy.ts'

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

/**
 * Ship the landing's first screen as HTML, and stop it waiting on the bundle.
 *
 * THE MEASUREMENT THAT FORCED THIS. The landing is client-rendered, so its text
 * could not paint until ~142 KB gz of JavaScript had been fetched, parsed,
 * evaluated and rendered. At the mobile preset the LCP breakdown was TTFB
 * 453 ms + render delay 3 820 ms (89 %): the largest paint on the first screen
 * was waiting on the bundle, and no amount of CSS or font work moved it.
 *
 * TWO CHANGES, BOTH LANDING-ONLY:
 *
 *  1. The first screen is emitted into <body> as a static shell built from
 *     `src/landing/heroCopy.ts` — the same strings Hero.tsx renders. The boot
 *     script below hides it the moment #root has children, so React adopts the
 *     page underneath it. Measured: mobile LCP 4.2 s -> 2.5 s, PERF 84 -> 91.
 *
 *  2. On the landing route the app stylesheet stops blocking the first paint.
 *     The shell carries its own critical CSS, so the first screen is complete
 *     without it — and that was the remaining 2.1 s of the LCP, which is why the
 *     shell alone measured exactly 2.5 s rather than comfortably under it. The
 *     sheet is still fetched at full priority from the same link; `media` is
 *     only flipped until it applies, with onload/onerror/timeout as three
 *     independent ways back, because a stylesheet that never applies would be a
 *     far worse page than a late one.
 *
 * `/app` IS UNTOUCHED. Both behaviours are gated on `location.pathname` in the
 * head, exactly like `appRoutePreload` above: /app keeps a render-blocking
 * stylesheet and gets no shell, so its document and its first paint are the
 * same as they were. The reference to `/assets/index-*.css` is resolved from the
 * emitted bundle rather than hard-coded, and the plugin does nothing in dev,
 * where Vite injects CSS through JavaScript and there is no link to retime.
 */
function landingBoot(): Plugin {
  let outDir = 'dist';
  return {
    name: 'bw-landing-boot',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    /**
     * Runs on the EMITTED document, not on the transform hook.
     *
     * The first attempt edited the document inside `transformIndexHtml` and
     * silently did nothing useful: at that point the entry stylesheet link is not
     * in the HTML yet (Vite adds it later), and the CSS asset lookup picked the
     * map chunk's stylesheet rather than the entry's, so the link was never
     * marked and the `media` retime had nothing to act on. By `closeBundle` the
     * file on disk is exactly what the server will send, so the marking is done
     * against the real tag — the same point in the lifecycle the MapLibre worker
     * copy above uses.
     */
    closeBundle() {
      const file = path.resolve(outDir, 'index.html')
      if (!fs.existsSync(file)) {
        this.warn('landing boot: no index.html in the build output; the landing shell was not injected.')
        return
      }
      const html = fs.readFileSync(file, 'utf8')

      // The entry stylesheet is the only LOCAL stylesheet the document links
      // (Google Fonts are cross-origin, the map's chunk CSS is fetched with its
      // chunk), so it is identified by its href rather than by a hash.
      let marked = 0
      let out = html.replace(/<link\b[^>]*>/g, (tag) => {
        if (!/\brel="stylesheet"/.test(tag)) return tag
        const href = (tag.match(/\bhref="([^"]*)"/) || [])[1] || ''
        if (!/^\/[^"?]*\.css$/.test(href)) return tag
        marked += 1
        return tag.replace('<link', '<link data-bw-app-css')
      })
      if (marked !== 1) {
        this.warn(
          `landing boot: expected exactly one local stylesheet to retime, found ${marked}; ` +
            'the landing will keep a render-blocking stylesheet.',
        )
      }

      /*
       * THE TWO SCRIPTS RUN WHERE THEIR DEPENDENCIES EXIST, which is not the same
       * place. Choosing the route and retiming the stylesheet only need the head
       * — the route is in `location` and the link is already parsed. Hiding the
       * shell needs the shell, which does not exist until the parser reaches the
       * body, so that half goes at the end of the body. The first version put
       * both in the head and the shell was therefore never hidden at all: the
       * element lookup returned null, the block was skipped silently, and the
       * page showed the shell under the real hero until the evidence harness
       * caught it.
       */
      const headScript =
        `<script>(function(){` +
        `if(location.pathname!=='/'&&location.pathname.indexOf('/index.html')!==0)return;` +
        `document.documentElement.className+=' bw-boot-landing';` +
        `var l=document.querySelector('link[data-bw-app-css]');` +
        `if(l&&!l.sheet){var restore=function(){if(l.media!=='all')l.media='all'};l.media='print';` +
        `l.addEventListener('load',restore);l.addEventListener('error',restore);` +
        `setTimeout(restore,4000);}` +
        `})();</script>`

      // Fallback for engines without `:has()` (see firstScreenCss). Harmless when
      // the CSS has already done it: the attribute only sets `visibility`.
      const tailScript =
        `<script>(function(){` +
        `if(!document.documentElement.classList.contains('bw-boot-landing'))return;` +
        `var s=document.querySelector('[data-boot-hero]'),r=document.getElementById('root');` +
        `if(!s||!r)return;var hide=function(){s.setAttribute('data-boot-done','')};` +
        `if(window.MutationObserver){var mo=new MutationObserver(function(){` +
        `if(r.childElementCount){hide();mo.disconnect();}});mo.observe(r,{childList:true});}` +
        `setTimeout(hide,8000);})();</script>`

      out = out.replace('</head>', `    <style>${firstScreenCss()}</style>\n    ${headScript}\n  </head>`)
      out = out.replace('<div id="root"></div>', `${firstScreenHtml()}\n    <div id="root"></div>`)
      out = out.replace('</body>', `    ${tailScript}\n  </body>`)

      if (!out.includes('data-boot-hero') || !out.includes('bw-boot-landing') || !out.includes('data-boot-done')) {
        this.warn('landing boot: the shell markup or boot script did not land in index.html.')
        return
      }
      fs.writeFileSync(file, out)
    },
  }
}

export default defineConfig({
  plugins: [react(), mapLibreWorker(), appRoutePreload(), landingBoot()],
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
