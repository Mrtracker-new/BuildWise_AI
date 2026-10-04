/**
 * RouterRoot.tsx — two BuildWise surfaces:
 *   "/"    → marketing landing page (scrolling, Lenis-smoothed)
 *   "/app" → the full-screen site-analysis tool
 */
import { useEffect } from 'react'
import App from './App'
import { LandingPage } from './landing/LandingPage'
import { APP_PATH, usePathname } from './landing/router'

const APP_TITLE = 'BuildWise AI - Geo-Based Intelligent Construction Planning';

export function RouterRoot() {
  const path = usePathname()
  const isApp = path === APP_PATH || path.startsWith(`${APP_PATH}/`)

  useEffect(() => {
    if (isApp) {
      document.title = APP_TITLE;
      window.scrollTo(0, 0);
    }
  }, [isApp])

  return isApp ? <App /> : <LandingPage />
}
