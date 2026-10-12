/**
 * AssistedBar.tsx — ASSISTED capability-tier affordances.
 * ==============================================================
 * Rendered only when precision authoring is assisted (viewport < 768px or a
 * coarse primary pointer). One fixed row that never blocks the map — no
 * scrim, no dialog, pointer events only on the two controls:
 *   • soft "desktop recommended" notice, dismissed for the browser session
 *     via Continue (sessionStorage, see services/sessionPrefs.ts);
 *   • copy-site-link FAB (Clipboard deep link: /app?lat=..&lon=..).
 *
 * Geometry: bottom-12 right-3 threads the existing bottom chrome — clear of
 * the map details group (bottom-3, 12-40px lane), the BoundaryChip corridor
 * (bottom-16, LEFT-anchored), the CaptureSheet (bottom-14, w-320 left) and
 * the SitePreviewHUD (bottom-[104px]). The app yields the bar while the
 * capture wizard is open (same precedent as chip/HUD). All state changes
 * announce politely (aria-live) without stealing focus.
 */
import React from 'react';
import { Icon } from './Icon';

export interface AssistedBarProps {
  /** Soft-notice state (session-dismissable; re-appears next session). */
  noticeVisible: boolean;
  onContinue: () => void;
  /** Copy the shareable site deep link to the clipboard. */
  onCopyLink: () => void;
}

export const AssistedBar: React.FC<AssistedBarProps> = ({
  noticeVisible,
  onContinue,
  onCopyLink,
}) => (
  <div
    data-testid="assisted-bar"
    className="fixed bottom-12 right-2 sm:right-3 z-[1002] pointer-events-none max-w-[calc(100vw-16px)] sm:max-w-[calc(100vw-24px)] animate-fade-in"
    style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
  >
    <div className="flex items-end justify-end gap-2">
      {noticeVisible && (
        <div
          data-testid="assisted-notice"
          role="status"
          aria-live="polite"
          className="pointer-events-auto vibrancy-panel rounded-[14px] border border-[var(--panel-border-color)] shadow-lg pl-2.5 sm:pl-3 pr-1.5 py-1.5 flex items-center gap-2 min-w-0"
        >
          <Icon name="info" size={15} className="text-[var(--accent-ink)] shrink-0" aria-hidden="true" />
          <p className="min-w-0 text-[11px] sm:text-[12px] leading-[1.45] text-[var(--text-1)]">
            <span className="font-semibold">Assisted mode.</span>{' '}
            <span className="text-[var(--text-2)]">
              A desktop is recommended for precise boundary tracing. All tools remain available.
            </span>
          </p>
          <button
            type="button"
            data-testid="assisted-continue"
            onClick={onContinue}
            className="relative shrink-0 h-11 min-h-[44px] px-3 rounded-[9px] bg-[var(--fill)] text-[12.5px] font-semibold text-[var(--text-1)] hover:bg-[var(--fill-hover)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-transform cursor-pointer select-none"
          >
            Continue
          </button>
        </div>
      )}
      <button
        type="button"
        data-testid="copy-link"
        aria-label="Copy site link"
        title="Copy a shareable link to this site"
        onClick={onCopyLink}
        className="bw-touch-target relative pointer-events-auto shrink-0 h-10 w-10 rounded-full vibrancy-pill border border-[var(--panel-border-color)] shadow-lg text-[var(--text-1)] flex items-center justify-center hover:bg-[var(--fill)] active:scale-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-transform cursor-pointer select-none"
      >
        <Icon name="copy" size={16} aria-hidden="true" />
      </button>
    </div>
  </div>
);
