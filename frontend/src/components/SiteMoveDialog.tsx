/**
 * SiteMoveDialog.tsx — confirm what happens to a captured plot when the site moves.
 * ================================================================================
 * The captured boundary is anchored to the pin, so moving the site changes what
 * the plot means. Nothing is decided silently: this dialog asks whether to take
 * the traced plot to the new location, drop it and re-capture, or keep both as
 * they were. ESC and a scrim click both mean "keep current plot" (no change).
 */
import React, { useEffect, useRef } from 'react';
import { Icon } from './Icon';

export interface SiteMoveDialogProps {
  open: boolean;
  /** Coordinates the user tried to move to (displayed only). */
  target: { lat: number; lon: number } | null;
  onMove: () => void;
  onRecapture: () => void;
  onCancel: () => void;
}

export const SiteMoveDialog: React.FC<SiteMoveDialogProps> = ({
  open,
  target,
  onMove,
  onRecapture,
  onCancel,
}) => {
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-md animate-fade-in"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-move-title"
        data-testid="site-move-dialog"
        className="vibrancy-panel rounded-[20px] border border-[var(--panel-border-color)] shadow-2xl max-w-md w-full flex flex-col overflow-hidden select-text"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="w-9 h-9 rounded-full bg-[var(--accent-tint)] flex items-center justify-center text-[var(--accent-ink)] shrink-0">
            <Icon name="map-pin" size={18} />
          </div>
          <div className="min-w-0">
            <h2
              id="site-move-title"
              className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight"
            >
              Move the captured plot?
            </h2>
            <p className="text-[13px] text-[var(--text-2)] leading-[1.5] mt-1">
              You already captured a plot boundary. Moving the site changes what it
              describes, so choose how to apply the new location
              {target ? (
                <span className="ui-font-tabular">
                  {' '}
                  ({target.lat.toFixed(5)}, {target.lon.toFixed(5)})
                </span>
              ) : null}
              .
            </p>
          </div>
        </div>

        <div className="px-5 py-4 space-y-2">
          <button
            ref={primaryRef}
            type="button"
            data-testid="site-move-apply"
            onClick={onMove}
            className="w-full h-10 rounded-[12px] bg-[var(--accent)] text-white text-[13px] font-semibold flex items-center justify-center gap-2 shadow-sm hover:bg-[var(--accent-hover)] active:bg-[var(--accent-press)] transition-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <Icon name="map-pin" size={15} className="shrink-0" />
            <span>Take the plot to the new site</span>
          </button>
          <button
            type="button"
            data-testid="site-move-recapture"
            onClick={onRecapture}
            className="w-full h-10 rounded-[12px] bg-[var(--fill)] text-[var(--text-1)] text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-[var(--fill-hover)] transition-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <Icon name="crosshair" size={15} className="shrink-0" />
            <span>Drop it and re-capture here</span>
          </button>
          <button
            type="button"
            data-testid="site-move-cancel"
            onClick={onCancel}
            className="w-full h-9 rounded-[12px] text-[var(--text-2)] text-[13px] font-medium hover:text-[var(--text-1)] transition-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Keep the current plot
          </button>
        </div>

        <p className="px-5 pb-4 text-[11px] text-[var(--text-3)] leading-normal">
          Site-scoped results (feasibility, blueprint) are invalidated either way,
          because they describe the previous location.
        </p>
      </div>
    </div>
  );
};
