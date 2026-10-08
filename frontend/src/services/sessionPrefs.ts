/**
 * sessionPrefs.ts — sessionStorage-backed session preferences.
 * =====================================================================
 * Session-scoped UI state (cleared when the browser session ends), unlike
 * the localStorage-persisted coach marks in design/primitives.tsx.
 * All access is fail-safe: private-mode or blocked storage degrades to
 * in-memory behavior only.
 */

const ASSISTED_NOTICE_KEY = 'bw.assisted.continue';

/** True while this browser session has dismissed the ASSISTED notice. */
export function isAssistedNoticeSessionDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(ASSISTED_NOTICE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Dismiss the ASSISTED notice for the rest of this browser session. */
export function dismissAssistedNoticeForSession(): void {
  try {
    window.sessionStorage.setItem(ASSISTED_NOTICE_KEY, '1');
  } catch {
    /* storage unavailable — in-memory dismissal only */
  }
}
