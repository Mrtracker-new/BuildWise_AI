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
      className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs flex items-center justify-between gap-3 shrink-0 z-30"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Icon name="alert-triangle" size={15} className="text-amber-700 shrink-0" />
        <span className="font-semibold text-amber-900 shrink-0 uppercase tracking-wider text-[11px]">
          Telemetry Notice:
        </span>
        <span className="text-amber-800 truncate text-xs" title={combinedText}>
          {combinedText}
        </span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-amber-700 hover:text-amber-900 p-1 rounded transition-colors shrink-0 focus:outline-none focus:ring-1 focus:ring-amber-500"
        title="Dismiss telemetry notice"
        aria-label="Dismiss telemetry notice"
      >
        <Icon name="x" size={14} />
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
      className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-lg text-xs flex items-start justify-between gap-3 shadow-sm"
    >
      <div className="flex items-start gap-2.5">
        <Icon name="shield-alert" size={16} className="text-rose-600 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold block text-rose-900 text-xs">System Error</span>
          <p className="mt-0.5 text-rose-700 leading-normal">{errorMessage}</p>
        </div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-rose-500 hover:text-rose-800 p-1 rounded transition-colors focus:outline-none"
          title="Dismiss error"
          aria-label="Dismiss error"
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
};

export const StatusBanner: React.FC<{
  warnings: string[];
  errorMessage?: string | null;
  onDismissError?: () => void;
  onDismissWarnings?: () => void;
  isWarningDismissed?: boolean;
}> = ({
  warnings,
  errorMessage,
  onDismissError,
  onDismissWarnings,
  isWarningDismissed = false,
}) => {
  return (
    <div className="space-y-2">
      <ErrorBanner errorMessage={errorMessage || null} onDismiss={onDismissError} />
      {warnings && warnings.length > 0 && !isWarningDismissed && onDismissWarnings && (
        <TelemetryStrip
          warnings={warnings}
          isDismissed={isWarningDismissed}
          onDismiss={onDismissWarnings}
        />
      )}
    </div>
  );
};
