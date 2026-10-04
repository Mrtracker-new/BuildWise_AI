/**
 * landing/router.ts — minimal pathname routing for the two BuildWise
 * surfaces: the marketing landing ("/") and the analysis tool ("/app").
 * History-API based; Vite's SPA fallback serves index.html for /app.
 */
import { useEffect, useState } from 'react';

export const APP_PATH = '/app';
export const LANDING_PATH = '/';

export function currentPath(): string {
  if (typeof window === 'undefined') return LANDING_PATH;
  return window.location.pathname;
}

/** Programmatic navigation that also notifies same-tab listeners. */
export function navigate(to: string): void {
  if (currentPath() === to) return;
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Subscribe to pathname changes (back/forward + programmatic nav). */
export function usePathname(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onNav = () => setPath(currentPath());
    window.addEventListener('popstate', onNav);
    return () => window.removeEventListener('popstate', onNav);
  }, []);
  return path;
}
