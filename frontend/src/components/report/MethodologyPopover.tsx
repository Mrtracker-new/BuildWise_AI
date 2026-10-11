import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
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

export interface MethodologySection {
  /** Short uppercase heading for one disclosed fact. */
  label: string;
  /** The fact itself, in plain language. */
  text: string;
}

interface MethodologyPopoverProps {
  /** Contents describing the factor (used as the accessible trigger label). */
  factorName: string;
  /** Provenance payload. Omit when using `sections` for a control disclosure. */
  payload?: MethodologyPayload;
  /** Panel heading override (defaults to the inferred "What this affects"). */
  title?: string;
  /**
   * Control-disclosure mode: replaces the provenance blocks with a list of
   * "what does this affect?" facts. Used by authoring controls whose value
   * changes downstream outputs (rate table, sheet schedules, programme sizing).
   */
  sections?: MethodologySection[];
  /** Accessible name for the trigger button (defaults to the factor name). */
  triggerLabel?: string;
}

const PANEL_WIDTH = 288;

/**
 * Disclosure popover pinned to a small "i" trigger. Keyboard contract:
 * Enter/Space open, Escape closes and returns focus to the trigger, the
 * content is linked via aria-describedby from the trigger, and an outside
 * click dismisses it.
 *
 * The panel is portalled to <body> and positioned in viewport coordinates so it
 * can never be clipped by an ancestor with overflow hidden (collapsible cards,
 * scrolling sidebars) — the bug class that cut off disclosures in the tile.
 * Both themes use the same token suite, so parity is automatic.
 */
export const MethodologyPopover: React.FC<MethodologyPopoverProps> = ({
  factorName,
  payload,
  title,
  sections,
  triggerLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Measure the trigger + the rendered panel height so the panel can flip above
  // the trigger when the viewport bottom would clip it.
  const updateCoords = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const height = panelRef.current?.offsetHeight ?? 200;
    const below = rect.bottom + 6;
    const flipsAbove = below + height > window.innerHeight - 8 && rect.top - height - 6 > 8;
    setCoords({ top: flipsAbove ? rect.top - height - 6 : below, left, width });
  }, []);

  useLayoutEffect(() => {
    if (open) updateCoords();
  }, [open, updateCoords]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const reposition = () => updateCoords();
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, close, updateCoords]);

  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  const panel =
    open && coords
      ? ReactDOM.createPortal(
          <div
            ref={panelRef}
            id={contentId}
            role="dialog"
            aria-label={`${factorName} methodology`}
            tabIndex={-1}
            data-testid={`methodology-popover-${factorName.replace(/\s+/g, '-').toLowerCase()}`}
            className="animate-popover-open fixed z-[var(--z-popover,1050)] rounded-[12px] border border-[var(--panel-border-color)] bg-[var(--sheet-bg)] shadow-xl p-3.5 space-y-2.5 text-left"
            style={{ top: coords.top, left: coords.left, width: coords.width }}
          >
            <div className="flex items-center justify-between gap-2">
              {payload ? (
                <StatusBadge status={payload.status} />
              ) : (
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">
                  {title ?? 'What this affects'}
                </span>
              )}
              <button
                type="button"
                onClick={close}
                aria-label="Close methodology"
                className="w-5 h-5 rounded-full bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-3)] flex items-center justify-center transition-colors cursor-pointer"
              >
                <Icon name="x" size={10} />
              </button>
            </div>

            {sections && sections.length > 0 ? (
              <>
                {sections.map((s) => (
                  <div key={s.label}>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] block mb-0.5">
                      {s.label}
                    </span>
                    <p className="text-[12px] text-[var(--text-2)] leading-snug">{s.text}</p>
                  </div>
                ))}
              </>
            ) : payload ? (
              <>
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
              </>
            ) : null}
          </div>,
          document.body
        )
      : null;

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-describedby={open ? contentId : undefined}
        title={triggerLabel ?? `What ${factorName} affects`}
        aria-label={triggerLabel ?? `Methodology for ${factorName}`}
        className="w-5 h-5 rounded-full bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-3)] hover:text-[var(--text-1)] flex items-center justify-center transition-colors duration-150 ease-apple cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
      >
        <Icon name="info" size={11} />
      </button>
      {panel}
    </span>
  );
};
