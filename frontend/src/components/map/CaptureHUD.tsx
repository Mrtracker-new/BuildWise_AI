/**
 * CaptureHUD.tsx — Contextual floating HUD + coach marks.
 * =====================================================================
 * A glass panel (top-left of the map area, clear of the header and the
 * capture sheet) with live tabular-nums stats: Area / Perimeter / Vertices
 * and a status row — green check when the ring is valid, red warning with
 * the statutory reason when it is not (invalid blocks Finish upstream).
 *
 * COACH MARKS: a 3-step persisted sequence (localStorage via useCoachMark)
 * for first-time users:
 *   1. "Click to place your first corner"
 *   2. "Hold Shift for orthogonal snapping" (after 2nd click)
 *   3. "Double-click to close the boundary" (after 4th click)
 * Reduced-motion safe (fade only via design tokens), dismissible, and each
 * step auto-advances on real user progress.
 */
import React from 'react';
import { Icon } from '../Icon';
import { Kbd, useCoachMark } from '../../design';

export interface CaptureHUDProps {
  visible: boolean;
  areaSqm: number;
  perimeterM: number;
  vertexCount: number;
  invalid: boolean;
  invalidReason?: string;
  /** Draw-mode cursor state (drives the coach-mark sequence). */
  drawPlacedCount: number;
  /** Which coach step the interaction has earned so far. */
  coachProgress: Set<'step1' | 'step2' | 'step3'>;
  onDismissCoach: (step: 'step1' | 'step2' | 'step3') => void;
}

const COACH_STEPS: {
  id: 'step1' | 'step2' | 'step3';
  title: string;
  body: string;
}[] = [
  {
    id: 'step1',
    title: 'Place your first corner',
    body: (
      'Click anywhere on the map to drop the first boundary vertex. ' +
      'Press D for Draw, E for Edit.'
    ),
  },
  {
    id: 'step2',
    title: 'Snap with precision',
    body: (
      'Hold Shift for orthogonal snapping, or press Tab to cycle ' +
      'Free / Ortho / Parallel snapping. A guide line appears when engaged.'
    ),
  },
  {
    id: 'step3',
    title: 'Close the boundary',
    body: (
      'Click the first vertex (or double-click anywhere) to close the ring. ' +
      'Enter also finishes once you have 3+ corners.'
    ),
  },
];

export const CaptureHUD: React.FC<CaptureHUDProps> = ({
  visible,
  areaSqm,
  perimeterM,
  vertexCount,
  invalid,
  invalidReason,
  drawPlacedCount,
  coachProgress,
  onDismissCoach,
}) => {
  const coach1 = useCoachMark('capture-step1');
  const coach2 = useCoachMark('capture-step2');
  const coach3 = useCoachMark('capture-step3');
  const coachState = { step1: coach1, step2: coach2, step3: coach3 } as const;

  // The sequence: show step N only when progress includes it, it is still
  // locally open (not dismissed), and earlier steps are resolved.
  const order: ('step1' | 'step2' | 'step3')[] = ['step1', 'step2', 'step3'];
  let activeStep: 'step1' | 'step2' | 'step3' | null = null;
  for (const s of order) {
    if (!coachProgress.has(s)) continue;
    if (!coachState[s].open) continue;
    activeStep = s;
    break;
  }

  if (!visible) return null;

  const invalidRow = invalid;
  const placedCount = drawPlacedCount;

  return (
    <div
      data-testid="capture-hud"
      role="status"
      aria-live="polite"
      className="absolute top-[168px] left-2 sm:left-3 lg:top-[186px] lg:left-[364px] z-[990] pointer-events-none animate-fade-in"
    >
      <div className="vibrancy-panel rounded-[14px] px-3 py-2.5 shadow-lg w-[232px] select-none">
        <div className="flex items-center gap-1.5 pb-1.5 mb-1.5 border-b border-[var(--hairline)]">
          <Icon name="crosshair" size={12} className="text-[var(--accent-ink)] shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">
            Boundary
          </span>
          <span className="ml-auto text-[10px] font-medium text-[var(--text-3)]">
            On trace
          </span>
        </div>

        <div className="space-y-1 text-[12px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--text-2)]">Area</span>
            <span
              data-testid="capture-hud-area"
              className="ui-font-tabular font-semibold text-[var(--text-1)]"
            >
              {areaSqm.toFixed(1)} m²
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--text-2)]">Perimeter</span>
            <span
              data-testid="capture-hud-perimeter"
              className="ui-font-tabular font-semibold text-[var(--text-1)]"
            >
              {perimeterM.toFixed(1)} m
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--text-2)]">Vertices</span>
            <span
              data-testid="capture-hud-vertices"
              className="ui-font-tabular font-semibold text-[var(--text-1)]"
            >
              {vertexCount}
            </span>
          </div>
        </div>

        {/* Validity row: green check, or red warning with the reason. */}
        <div
          data-testid="capture-hud-status"
          className="mt-2 pt-1.5 border-t border-[var(--hairline)] flex items-start gap-1.5"
          title={invalid ? invalidReason : 'Boundary is valid'}
        >
          {invalid ? (
            <>
              <Icon
                name="alert-triangle"
                size={13}
                className="text-[var(--semantic-red-ink)] shrink-0 mt-[1px]"
              />
              <span className="text-[11px] leading-snug text-[var(--semantic-red-ink)] font-medium">
                Self-intersecting — resolve to continue
              </span>
            </>
          ) : (
            <>
              <Icon
                name="check-circle"
                size={13}
                className="text-[var(--semantic-green-ink)] shrink-0 mt-[1px]"
              />
              <span className="text-[11px] leading-snug text-[var(--text-2)] font-medium">
                Valid
              </span>
            </>
          )}
        </div>

        {/* Coach marks: one at a time, earned by real progress.
            step1 retires the moment the first vertex lands (the top
            guidance pill owns that moment); step2/step3 retire via X. */}
        {activeStep === 'step1' && placedCount === 0 && (
          <div
            data-testid={`capture-coach-${activeStep}`}
            className="mt-2 pt-2 border-t border-[var(--hairline)] pointer-events-auto"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-[var(--text-1)] flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                    {order.indexOf(activeStep) + 1}
                  </span>
                  {COACH_STEPS.find((s) => s.id === activeStep)?.title}
                </div>
                <p className="mt-1 text-[11px] leading-[1.45] text-[var(--text-2)]">
                  {COACH_STEPS.find((s) => s.id === activeStep)?.body}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDismissCoach(activeStep!)}
                aria-label="Dismiss tip"
                title="Dismiss tip"
                className="shrink-0 rounded-[7px] p-1 text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--fill)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer"
              >
                <Icon name="x" size={11} />
              </button>
            </div>
            {activeStep !== 'step1' && placedCount > 0 && (
              <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--text-3)] ui-font-tabular">
                <Kbd>Backspace</Kbd>
                <span>undo · {placedCount} placed</span>
              </div>
            )}
          </div>
        )}
        {activeStep === 'step2' && placedCount > 0 && (
          <div
            data-testid="capture-coach-step2"
            className="mt-2 pt-2 border-t border-[var(--hairline)] pointer-events-auto"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-[var(--text-1)] flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[9px] font-bold flex items-center justify-center shrink-0">2</span>
                  {COACH_STEPS[1].title}
                </div>
                <p className="mt-1 text-[11px] leading-[1.45] text-[var(--text-2)]">{COACH_STEPS[1].body}</p>
              </div>
              <button
                type="button"
                onClick={() => onDismissCoach('step2')}
                aria-label="Dismiss tip"
                className="shrink-0 rounded-[7px] p-1 text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--fill)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer"
              >
                <Icon name="x" size={11} />
              </button>
            </div>
          </div>
        )}
        {activeStep === 'step3' && placedCount > 0 && (
          <div
            data-testid="capture-coach-step3"
            className="mt-2 pt-2 border-t border-[var(--hairline)] pointer-events-auto"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-[var(--text-1)] flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[9px] font-bold flex items-center justify-center shrink-0">3</span>
                  {COACH_STEPS[2].title}
                </div>
                <p className="mt-1 text-[11px] leading-[1.45] text-[var(--text-2)]">{COACH_STEPS[2].body}</p>
              </div>
              <button
                type="button"
                onClick={() => onDismissCoach('step3')}
                aria-label="Dismiss tip"
                className="shrink-0 rounded-[7px] p-1 text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--fill)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer"
              >
                <Icon name="x" size={11} />
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--text-3)] ui-font-tabular">
              <Kbd>Backspace</Kbd>
              <span>undo · {placedCount} placed</span>
            </div>
          </div>
        )}
      </div>
      {invalidRow && <span className="sr-only">{invalidReason}</span>}
    </div>
  );
};
