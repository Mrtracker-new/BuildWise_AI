/**
 * RouterRoot.tsx — two BuildWise surfaces:
 *   "/"    → marketing landing page (scrolling, Lenis-smoothed)
 *   "/app" → the full-screen site-analysis tool
 *
 * Both routes are code-split so neither pays for the other's graph:
 *   - the landing (framer-motion + Lenis) is never parsed on /app
 *   - MapLibre + the whole analysis tool is never parsed on /
 * The shared React runtime lives in its own chunk and is reused once the user
 * crosses routes, so switching surfaces costs one chunk fetch, not a re-parse.
 */
import { Suspense, lazy, useEffect } from 'react'
import { APP_PATH, usePathname } from './landing/router'

const App = lazy(() => import('./App'))
const LandingPage = lazy(() =>
  import('./landing/LandingPage').then((m) => ({ default: m.LandingPage })),
)

const APP_TITLE = 'BuildWise AI - Geo-Based Intelligent Construction Planning';

/**
 * Route-level loading placeholder. Deliberately static (no animation, no image,
 * no web font dependency) so it costs nothing while the route chunk arrives, and
 * fixed-positioned so it cannot shift the layout it is about to hand over.
 *
 * It is deliberately NOT the app's map placeholder: that was measured (mobile
 * preset, dist-b5) and did not help — Chrome re-candidates the largest paint when
 * the route tree swaps in, so the LCP stayed on the app's own placeholder while
 * the first paint got ~0.7 s later and CLS appeared (0.0005) from the hand-off.
 * The first view of /app is the app shell's placeholder; this splash is only the
 * bridge while the route chunk parses.
 */
const RouteFallback: React.FC = () => (
  <div
    className="fixed inset-0 flex items-center justify-center bg-slate-50"
    aria-busy="true"
    aria-live="polite"
  >
    <span className="text-[13px] font-semibold tracking-wide text-slate-400 select-none">
      BuildWise AI
    </span>
  </div>
);

export function RouterRoot() {
  const path = usePathname()
  const isApp = path === APP_PATH || path.startsWith(`${APP_PATH}/`)

  useEffect(() => {
    if (isApp) {
      document.title = APP_TITLE;
      window.scrollTo(0, 0);
    }
  }, [isApp])

  return (
    <Suspense fallback={<RouteFallback />}>
      {isApp ? <App /> : <LandingPage />}
    </Suspense>
  )
}
