import React, { useEffect, useState } from 'react';
import { Icon } from './Icon';

export interface AnalysisHUDProps {
  stageText: string;
  stageIndex: number;
  totalStages: number;
  fallbackMessage?: string | null;
  onCancel: () => void;
  isExiting?: boolean;
}

export const AnalysisHUD: React.FC<AnalysisHUDProps> = ({
  stageText,
  stageIndex,
  totalStages,
  fallbackMessage = null,
  onCancel,
  isExiting = false,
}) => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const stageNumber = Math.min(stageIndex + 1, totalStages);
  const progressPct = Math.min(100, Math.max(14, (stageNumber / totalStages) * 100));

  return (
    <div
      role="status"
      aria-live="polite"
      className={`relative w-[320px] sm:w-[360px] max-w-[calc(100vw-32px)] rounded-[20px] vibrancy-hud p-[20px_24px] pointer-events-auto select-none ${
        isExiting ? 'animate-hud-exit' : 'animate-hud-enter'
      }`}
      style={{
        boxShadow: 'var(--shadow)',
      }}
    >
      {/* Top-Right: 24px circular --fill button with Lucide X 12 */}
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel analysis"
        title="Cancel analysis"
        className="absolute top-4 right-4 w-6 h-6 rounded-full bg-[var(--fill)] hover:bg-[var(--fill-hover)] active:bg-[var(--fill-active)] text-[var(--text-2)] hover:text-[var(--text-1)] flex items-center justify-center transition-colors cursor-pointer"
      >
        <Icon name="x" size={12} />
      </button>

      {/* Content Row: iOS Activity Spinner + Title & Stage Column */}
      <div className="flex items-center gap-3 pr-7 min-w-0">
        {prefersReducedMotion ? (
          <div
            className="w-5 h-5 rounded-full border-2 border-[var(--accent)] shrink-0 flex items-center justify-center"
            title={`${Math.round(progressPct)}% complete`}
          >
            <span className="text-[8px] font-bold text-[var(--accent)] tabular-nums leading-none">
              {Math.round(progressPct)}%
            </span>
          </div>
        ) : (
          <div className="ios-hud-spinner shrink-0" aria-hidden="true" />
        )}

        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-[var(--text-1)] leading-tight tracking-tight">
            Analyzing Site Feasibility
          </h3>
          <p className="text-[13px] text-[var(--text-2)] truncate mt-0.5 font-normal leading-snug">
            {stageText}
          </p>
        </div>
      </div>

      {/* Fallback Amber Notice Row if triggered */}
      {fallbackMessage && (
        <div
          role="alert"
          className="mt-3.5 px-3 py-1.5 rounded-[10px] bg-[var(--semantic-amber)]/10 border border-[var(--semantic-amber)]/30 flex items-center gap-2 text-[12px] text-[var(--semantic-amber)] font-medium animate-fade-in"
        >
          <Icon name="alert-triangle" size={13} className="shrink-0 text-[var(--semantic-amber)]" />
          <span className="truncate">{fallbackMessage}</span>
        </div>
      )}

      {/* Determinate Progress Bar (4px) + Counter */}
      <div className="mt-4 space-y-1.5 min-w-0">
        <div className="w-full h-1 bg-[var(--fill)] rounded-full overflow-hidden">
          <div
            className={`h-full bg-[var(--accent)] rounded-full ${
              prefersReducedMotion ? '' : 'transition-all duration-300 ease-out'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-end items-center">
          <span className="text-[11px] font-mono text-[var(--text-3)] font-medium">
            {stageNumber}/{totalStages}
          </span>
        </div>
      </div>
    </div>
  );
};
