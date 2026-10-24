import React from 'react';
import type { AnalysisResponse } from '../../services/types';
import { Icon } from '../Icon';
import { isCriticalPlanWarning } from '../../services/planWarnings';

interface WarningsBannerProps {
  data: AnalysisResponse;
}

/**
 * Persistent amber banner listing every degradation caveat. Reads the SAME
 * warnings array the backend PDF banner renders, so the two surfaces always
 * show an identical list.
 */
export const WarningsBanner: React.FC<WarningsBannerProps> = ({ data }) => {
  const warnings = data.warnings ?? [];
  if (warnings.length === 0) return null;

  // Refusal: a proportion/programme FAIL is drawn, not refused - so the banner
  // must be the loudest thing on the sheet when one is present.  It switches to
  // the red treatment and never hides the list behind a count.
  // ROOM-MIN / PLATE-SHORT are the named squeezed-room lines: a deficit with
  // only those (no PROP-HARD) still has to read as a FAIL, not an advisory.
  const critical = warnings.some((w) => isCriticalPlanWarning(String(w)));
  const tone = critical
    ? {
        section: 'bg-[var(--semantic-red)]/10 border-[var(--semantic-red)]',
        icon: 'text-[var(--semantic-red-ink)]',
        badge: 'text-[var(--semantic-red-ink)] bg-[var(--semantic-red)]/15',
        bullet: 'bg-[var(--semantic-red)]',
      }
    : {
        section: 'bg-[var(--semantic-amber)]/10 border-[var(--semantic-amber)]',
        icon: 'text-[var(--semantic-amber-ink)]',
        badge: 'text-[var(--semantic-amber-ink)] bg-[var(--semantic-amber)]/15',
        bullet: 'bg-[var(--semantic-amber)]',
      };

  return (
    <section
      data-testid="warnings-banner"
      data-critical={critical ? 'true' : 'false'}
      aria-label="Degradation warnings"
      aria-live="polite"
      className={`report-warnings-banner rounded-[12px] p-3.5 border-l-2 space-y-2 ${tone.section}`}
    >
      <div className="flex items-center gap-2">
        <Icon name="alert-triangle" size={15} className={`${tone.icon} shrink-0`} />
        <span className="text-[13px] font-semibold text-[var(--text-1)]">
          {critical ? 'Proportion / programme non-compliance' : 'Data degradation notice'}
        </span>
        <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums min-w-[1.4rem] ${tone.badge}`}>
          {warnings.length}
        </span>
        {critical && (
          <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--semantic-red)] text-white">
            FAIL stamp
          </span>
        )}
        {critical && (
          <p className="text-[11px] text-[var(--semantic-red-ink)] leading-snug pl-6">
            The plan is still drawn and exported with a FAIL stamp. The squeezed rooms are named
            individually below; refusal is reserved for statutory, egress and stacking failures.
          </p>
        )}
      </div>
      <ul className="space-y-1.5 pl-6">
        {warnings.map((w, idx) => (
          <li key={idx} className="flex items-start gap-2 text-[12px] text-[var(--text-2)] leading-snug">
            <span aria-hidden="true" className={`mt-1.5 w-1 h-1 rounded-full shrink-0 ${tone.bullet}`} />
            <span>{w}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
