import React from 'react';
import type { AnalysisResponse } from '../../services/types';
import { Icon } from '../Icon';

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

  return (
    <section
      data-testid="warnings-banner"
      aria-label="Degradation warnings"
      aria-live="polite"
      className="report-warnings-banner rounded-[12px] p-3.5 bg-[var(--semantic-amber)]/10 border-l-2 border-[var(--semantic-amber)] space-y-2"
    >
      <div className="flex items-center gap-2">
        <Icon name="alert-triangle" size={15} className="text-[var(--semantic-amber)] shrink-0" />
        <span className="text-[13px] font-semibold text-[var(--text-1)]">
          Data degradation notice
        </span>
        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold text-[var(--semantic-amber)] bg-[var(--semantic-amber)]/15 tabular-nums min-w-[1.4rem]">
          {warnings.length}
        </span>
      </div>
      <ul className="space-y-1.5 pl-6">
        {warnings.map((w, idx) => (
          <li key={idx} className="flex items-start gap-2 text-[12px] text-[var(--text-2)] leading-snug">
            <span aria-hidden="true" className="mt-1.5 w-1 h-1 rounded-full bg-[var(--semantic-amber)] shrink-0" />
            <span>{w}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
