import React from 'react';
import { Icon } from './Icon';

interface TelemetryStripProps {
  warnings: string[];
  isDismissed: boolean;
  onDismiss: () => void;
}

export const TelemetryStrip: React.FC<TelemetryStripProps> = ({
  warnings,
  isDismissed,
  onDismiss,
}) => {
  if (isDismissed || !warnings || warnings.length === 0) {
    return null;
  }

  // Concatenate multiple warnings into a single sentence, truncated with ellipsis
  const combinedText = warnings.join(' • ');

  return (
    <div
      role="status"
      className="vibrancy-panel rounded-[12px] border border-[var(--panel-border-color)] text-[var(--semantic-amber-ink)] px-3.5 py-2 text-[12px] flex items-center justify-between gap-3 shrink-0 z-[1000]"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Icon name="alert-triangle" size={14} className="text-[var(--semantic-amber-ink)] shrink-0" />
        <span className="font-semibold shrink-0 uppercase tracking-[0.08em] text-[11px]">
          Notice:
        </span>
        <span
          className="text-[var(--text-1)] text-[12px] min-w-0 flex-1 whitespace-normal break-words lg:truncate"
          title={combinedText}
        >
          {combinedText}
        </span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-[var(--text-3)] hover:text-[var(--text-1)] p-1 rounded-[6px] transition-colors shrink-0"
        title="Dismiss telemetry notice"
        aria-label="Dismiss telemetry notice"
      >
        <Icon name="x" size={13} />
      </button>
    </div>
  );
};

interface ErrorBannerProps {
  errorMessage: string | null;
  onDismiss?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ errorMessage, onDismiss }) => {
  if (!errorMessage) return null;

  return (
    <div
      role="alert"
      className="bg-[var(--fill)] border border-[var(--hairline)] text-[var(--text-1)] p-3 rounded-[12px] text-[12px] flex items-start justify-between gap-3 shadow-sm"
    >
      <div className="flex items-start gap-2.5">
        <Icon name="shield-alert" size={15} className="text-[var(--semantic-red-ink)] mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <span className="font-semibold block text-[12px] text-[var(--semantic-red-ink)]">
            System Alert
          </span>
          <p className="text-[12px] text-[var(--text-2)] leading-normal">{errorMessage}</p>
        </div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-[var(--text-3)] hover:text-[var(--text-1)] p-1 rounded-[6px] transition-colors focus:outline-none"
          title="Dismiss error"
          aria-label="Dismiss error"
        >
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
};
