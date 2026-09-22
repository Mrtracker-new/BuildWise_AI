import React from 'react';
import { Icon } from './Icon';

interface AppHeaderProps {
  backendConnected: boolean;
  activeAiProvider: string;
  onOpenMethodology: () => void;
  onReset: () => void;
  warnings?: string[];
  isWarningDismissed?: boolean;
  onRestoreWarning?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  backendConnected,
  activeAiProvider,
  onOpenMethodology,
  onReset,
  warnings = [],
  isWarningDismissed = false,
  onRestoreWarning,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-6 h-16 shrink-0 flex items-center justify-between shadow-sm">
      {/* Brand identity */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded bg-slate-900 text-white flex items-center justify-center font-bold text-sm tracking-wider shadow-sm">
          BW
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] sm:text-base font-semibold text-slate-900 tracking-tight">
              BuildWise AI
            </h1>
            <span className="text-[10px] font-mono uppercase bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
              v1.0 Engineering
            </span>
          </div>
          <p className="text-xs text-slate-500 hidden md:block">
            Geo-Based Intelligent Site Feasibility & Construction Planning
          </p>
        </div>
      </div>

      {/* System telemetry & actions */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Warning Indicator Badge (shows when telemetry notice is dismissed) */}
        {warnings.length > 0 && isWarningDismissed && onRestoreWarning && (
          <button
            type="button"
            onClick={onRestoreWarning}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded transition-colors"
            title={`Telemetry Notice (${warnings.length}):\n${warnings.join('\n')}`}
            aria-label={`View ${warnings.length} telemetry notices`}
          >
            <Icon name="alert-triangle" size={14} className="text-amber-700" />
            <span className="font-mono font-semibold">{warnings.length}</span>
            <span className="hidden sm:inline">Notice{warnings.length > 1 ? 's' : ''}</span>
          </button>
        )}

        {/* Engine Health indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-50 border border-slate-200 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              backendConnected ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
          />
          <span className="text-slate-600 font-mono text-[11px] hidden sm:inline">
            {backendConnected ? `Engine Online (${activeAiProvider})` : 'Engine Offline'}
          </span>
        </div>

        {/* Methodology modal trigger */}
        <button
          type="button"
          onClick={onOpenMethodology}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded transition-colors"
          title="View engineering calculation methodology"
        >
          <Icon name="info" size={14} className="text-slate-500" />
          <span className="hidden sm:inline">Methodology</span>
        </button>

        {/* Reset action */}
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
          title="Reset site analysis"
        >
          <Icon name="refresh" size={14} />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>
    </header>
  );
};
