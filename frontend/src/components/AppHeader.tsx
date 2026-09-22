import React, { useState, useRef, useEffect } from 'react';
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
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerBtnRef = useRef<HTMLButtonElement>(null);

  // Close popover on outside click or Escape
  useEffect(() => {
    if (!isPopoverOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPopoverOpen(false);
        triggerBtnRef.current?.focus();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          triggerBtnRef.current && !triggerBtnRef.current.contains(e.target as Node)) {
        setIsPopoverOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPopoverOpen]);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-3 sm:px-6 h-16 shrink-0 flex items-center justify-between shadow-sm min-w-0 w-full">
      {/* Brand identity */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded bg-slate-900 text-white flex items-center justify-center font-bold text-xs sm:text-sm tracking-wider shadow-sm shrink-0">
          BW
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <h1 className="text-sm sm:text-base font-semibold text-slate-900 tracking-tight whitespace-nowrap">
              BuildWise AI
            </h1>
            <span className="text-[9px] sm:text-[10px] font-mono uppercase bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
              v1.0
            </span>
          </div>
          <p className="text-xs text-slate-500 hidden xl:block whitespace-nowrap">
            Geo-Based Intelligent Site Feasibility & Construction Planning
          </p>
        </div>
      </div>

      {/* System telemetry & actions */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 relative">
        {/* Warning Indicator Badge & Accessible Popover */}
        {warnings.length > 0 && (
          <div className="relative">
            <button
              ref={triggerBtnRef}
              type="button"
              onClick={() => setIsPopoverOpen(!isPopoverOpen)}
              aria-haspopup="dialog"
              aria-expanded={isPopoverOpen}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500"
              title={`Telemetry Notices (${warnings.length}): Click or press Enter to view details`}
              aria-label={`View ${warnings.length} telemetry notices`}
            >
              <Icon name="alert-triangle" size={13} className="text-amber-700 shrink-0" />
              <span className="font-mono font-semibold">{warnings.length}</span>
              <span className="hidden sm:inline">Notice{warnings.length > 1 ? 's' : ''}</span>
            </button>

            {/* Keyboard & Mouse Accessible Telemetry Popover */}
            {isPopoverOpen && (
              <div
                ref={popoverRef}
                role="dialog"
                aria-label="Telemetry Warning Details"
                className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-24px)] bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-4 space-y-3 text-xs animate-fade-in"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-1.5 text-amber-900 font-semibold">
                    <Icon name="alert-triangle" size={14} className="text-amber-700" />
                    <span>Active Telemetry Notices ({warnings.length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPopoverOpen(false)}
                    className="text-slate-400 hover:text-slate-700 p-1 rounded"
                    aria-label="Close telemetry details"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {warnings.map((w, idx) => (
                    <div key={idx} className="bg-amber-50/70 border border-amber-200/60 p-2.5 rounded text-amber-900 leading-relaxed whitespace-normal break-words flex items-start gap-2">
                      <span className="font-mono font-bold text-[10px] text-amber-700 mt-0.5 shrink-0">{idx + 1}.</span>
                      <p className="flex-1">{w}</p>
                    </div>
                  ))}
                </div>

                {isWarningDismissed && onRestoreWarning && (
                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        onRestoreWarning();
                        setIsPopoverOpen(false);
                      }}
                      className="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-medium rounded transition-colors text-xs"
                    >
                      Restore Banner to Top
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Engine Health indicator */}
        <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded bg-slate-50 border border-slate-200 text-xs shrink-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              backendConnected ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
          />
          <span className="text-slate-600 font-mono text-[11px] hidden sm:inline whitespace-nowrap">
            {backendConnected ? `Engine Online (${activeAiProvider})` : 'Engine Offline'}
          </span>
        </div>

        {/* Methodology modal trigger */}
        <button
          type="button"
          onClick={onOpenMethodology}
          className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded transition-colors shrink-0"
          title="View engineering calculation methodology"
        >
          <Icon name="info" size={14} className="text-slate-500 shrink-0" />
          <span className="hidden sm:inline">Methodology</span>
        </button>

        {/* Reset action */}
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors shrink-0"
          title="Reset site analysis"
        >
          <Icon name="refresh" size={14} className="shrink-0" />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>
    </header>
  );
};
