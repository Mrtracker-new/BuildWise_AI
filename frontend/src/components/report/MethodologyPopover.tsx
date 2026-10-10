import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { StatusBadge } from './StatusBadge';
import { type ProvenanceStatus, assumedFootnote } from './statusTaxonomy';

export interface MethodologyPayload {
  /** The deterministic scoring formula in plain language. */
  formula: string;
  /** Upstream data provider(s) actually consulted. */
  dataSource: string;
  /** ISO timestamp of the last successful fetch, when known. */
  fetchedAt?: string | null;
  /** Census status for this factor (renders a matched badge inside the popover). */
  status: ProvenanceStatus;
  /** Disclosure text for synthesized/modelled values. */
  fallbackNote?: string;
}

/** Render the real server fetch timestamp; disclose the absence honestly. */
function formatFetchedAt(iso: string | null | undefined): string {
  if (!iso) return 'Not fetched this session (derived value)';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface MethodologyPopoverProps {
  /** Contents describing the factor (used as the accessible trigger label). */
  factorName: string;
  payload: MethodologyPayload;
}

/**
 * Disclosure popover pinned to a small "i" trigger. Keyboard contract:
 * Enter/Space open, Escape closes and returns focus to the trigger, the
 * content is linked via aria-describedby from the trigger. Both themes use
 * the same token suite, so parity is automatic.
 */
export const MethodologyPopover: React.FC<MethodologyPopoverProps> = ({ factorName, payload }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-describedby={open ? contentId : undefined}
        aria-label={`Methodology for ${factorName}`}
        className="w-5 h-5 rounded-full bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-3)] hover:text-[var(--text-1)] flex items-center justify-center transition-colors duration-150 ease-apple cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
      >
        <Icon name="info" size={11} />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={contentId}
          role="dialog"
          aria-label={`${factorName} methodology`}
          tabIndex={-1}
          className="absolute right-0 top-full mt-1.5 z-[var(--z-popover,1050)] w-72 rounded-[12px] border border-[var(--panel-border-color)] bg-[var(--sheet-bg)] shadow-xl p-3.5 space-y-2.5 text-left"
        >
          <div className="flex items-center justify-between gap-2">
            <StatusBadge status={payload.status} />
            <button
              type="button"
              onClick={close}
              aria-label="Close methodology"
              className="w-5 h-5 rounded-full bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-3)] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Icon name="x" size={10} />
            </button>
          </div>

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] block mb-0.5">
              Scoring basis
            </span>
            <p className="text-[12px] text-[var(--text-1)] leading-snug">{payload.formula}</p>
          </div>

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] block mb-0.5">
              Data source
            </span>
            <p className="text-[12px] text-[var(--text-2)] leading-snug">{payload.dataSource}</p>
          </div>

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] block mb-0.5">
              Fetched at
            </span>
            <p className="text-[12px] text-[var(--text-2)] leading-snug tabular-nums font-mono">
              {formatFetchedAt(payload.fetchedAt)}
            </p>
          </div>

          <div className="pt-1 border-t border-[var(--hairline)]">
            <p className="text-[11px] text-[var(--text-2)] leading-snug">
              {payload.status === 'ASSUMED'
                ? payload.fallbackNote ?? assumedFootnote('')
                : payload.status === 'UNKNOWN'
                ? 'Telemetry unavailable — the neutral placeholder shown is disclosed, never fabricated.'
                : payload.status === 'CALCULATED'
                ? 'Derived deterministically server-side; not a live telemetry reading.'
                : 'Measured from live telemetry during this analysis.'}
            </p>
          </div>
        </div>
      )}
    </span>
  );
};
