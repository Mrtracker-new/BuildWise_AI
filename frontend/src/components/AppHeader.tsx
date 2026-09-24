import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';

interface AppHeaderProps {
  backendConnected: boolean;
  activeAiProvider: string;
  serverStatus?: { groq: boolean; gemini: boolean } | null;
  onOpenMethodology: () => void;
  onReset: () => void;
  warnings?: string[];
  isWarningDismissed?: boolean;
  onRestoreWarning?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  isMobileControlOpen?: boolean;
  onToggleMobileControl?: () => void;
  isMobileResultsOpen?: boolean;
  onToggleMobileResults?: () => void;
  hasResults?: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  backendConnected,
  activeAiProvider,
  serverStatus,
  onOpenMethodology,
  onReset,
  warnings = [],
  isWarningDismissed = false,
  onRestoreWarning,
  theme = 'light',
  onToggleTheme,
  isMobileControlOpen = false,
  onToggleMobileControl,
  isMobileResultsOpen = false,
  onToggleMobileResults,
  hasResults = false,
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
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerBtnRef.current &&
        !triggerBtnRef.current.contains(e.target as Node)
      ) {
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
    <header
      className="fixed top-3 left-3 right-3 h-[52px] rounded-[16px] vibrancy-panel z-[1001] px-3 sm:px-4 flex items-center justify-between pointer-events-auto border border-[var(--panel-border-color)] shadow-md select-none"
      style={{ top: '12px', left: '12px', right: '12px', height: '52px', borderRadius: '16px' }}
    >
      {/* Brand identity: BuildWise AI Logo */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-[8px] bg-white dark:bg-white/10 flex items-center justify-center shrink-0 border border-slate-200/90 dark:border-white/10 overflow-hidden shadow-xs">
          <img
            src={theme === 'dark' ? '/brand/BuildWise_logo_square_white.png' : '/brand/BuildWise_logo_square.png'}
            alt="BuildWise AI Logo"
            className="w-[21px] h-[21px] object-contain select-none"
          />
        </div>
        <div className="min-w-0 flex items-center gap-2">
          <h1 className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight whitespace-nowrap">
            BuildWise AI
          </h1>
          <span className="text-[11px] font-medium bg-[var(--fill)] text-[var(--text-2)] px-2 py-0.5 rounded-full shrink-0">
            v1.0
          </span>
          <span className="text-[12px] text-[var(--text-2)] hidden xl:inline-block truncate max-w-xs">
            Geo-Based Feasibility & Site Planning
          </span>
        </div>
      </div>

      {/* Right controls: Theme toggle, Telemetry notice, Methodology, Reset, Engine Status */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Mobile Panel Toggles (hidden on desktop >=1024px) */}
        <div className="flex lg:hidden items-center gap-1.5 mr-1">
          {onToggleMobileControl && (
            <button
              type="button"
              onClick={onToggleMobileControl}
              className={`px-2.5 py-1 text-[12px] font-medium rounded-[10px] transition-colors flex items-center gap-1 ${
                isMobileControlOpen
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--fill)] text-[var(--text-1)] hover:bg-[var(--fill-hover)]'
              }`}
              title="Toggle Parameters Panel"
              aria-label="Toggle Parameters Panel"
            >
              <Icon name="sliders" size={13} />
              <span className="hidden xs:inline">Controls</span>
            </button>
          )}

          {onToggleMobileResults && (
            <button
              type="button"
              onClick={onToggleMobileResults}
              className={`px-2.5 py-1 text-[12px] font-medium rounded-[10px] transition-colors flex items-center gap-1 ${
                isMobileResultsOpen
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--fill)] text-[var(--text-1)] hover:bg-[var(--fill-hover)]'
              }`}
              title="Toggle Results Panel"
              aria-label="Toggle Results Panel"
            >
              <Icon name="layers" size={13} />
              <span className="hidden xs:inline">{hasResults ? 'Results' : 'Overview'}</span>
            </button>
          )}
        </div>

        {/* Warning Indicator Badge & Accessible Popover */}
        {warnings.length > 0 && (
          <div className="relative">
            <button
              ref={triggerBtnRef}
              type="button"
              onClick={() => setIsPopoverOpen(!isPopoverOpen)}
              aria-haspopup="dialog"
              aria-expanded={isPopoverOpen}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium text-[var(--semantic-amber)] bg-[var(--fill)] hover:bg-[var(--fill-hover)] rounded-[10px] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--semantic-amber)]/30"
              title={`Telemetry Notices (${warnings.length}): Click or press Enter to view details`}
              aria-label={`View ${warnings.length} telemetry notices`}
            >
              <Icon name="alert-triangle" size={13} className="text-[var(--semantic-amber)] shrink-0" />
              <span className="font-semibold">{warnings.length}</span>
              <span className="hidden sm:inline">Notice{warnings.length > 1 ? 's' : ''}</span>
            </button>

            {/* Keyboard & Mouse Accessible Telemetry Popover */}
            {isPopoverOpen && (
              <div
                ref={popoverRef}
                role="dialog"
                aria-label="Telemetry Warning Details"
                className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-32px)] vibrancy-panel rounded-[16px] shadow-2xl z-[1050] p-4 space-y-3 text-[12px] border border-[var(--panel-border-color)]"
              >
                <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2.5">
                  <div className="flex items-center gap-1.5 text-[var(--semantic-amber)] font-semibold">
                    <Icon name="alert-triangle" size={14} />
                    <span>Active Telemetry Notices ({warnings.length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPopoverOpen(false)}
                    className="text-[var(--text-3)] hover:text-[var(--text-1)] p-1 rounded transition-colors"
                    aria-label="Close telemetry details"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-apple pr-1">
                  {warnings.map((w, idx) => (
                    <div
                      key={idx}
                      className="bg-[var(--fill)] p-2.5 rounded-[10px] text-[var(--text-1)] leading-relaxed whitespace-normal break-words flex items-start gap-2"
                    >
                      <span className="font-bold text-[11px] text-[var(--semantic-amber)] mt-0.5 shrink-0">
                        {idx + 1}.
                      </span>
                      <p className="flex-1 text-[12px]">{w}</p>
                    </div>
                  ))}
                </div>

                {isWarningDismissed && onRestoreWarning && (
                  <div className="pt-2 border-t border-[var(--hairline)] flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        onRestoreWarning();
                        setIsPopoverOpen(false);
                      }}
                      className="px-3 py-1 bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-1)] font-medium rounded-[8px] transition-colors text-[12px]"
                    >
                      Restore Banner to Top
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Theme toggle icon button */}
        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-8 h-8 rounded-[10px] bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-1)] flex items-center justify-center transition-colors active:brightness-95"
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            aria-label={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
          </button>
        )}

        {/* Secondary action: Methodology button */}
        <button
          type="button"
          onClick={onOpenMethodology}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[var(--text-1)] bg-[var(--fill)] hover:bg-[var(--fill-hover)] rounded-[10px] transition-colors shrink-0 active:brightness-95"
          title="View engineering calculation methodology"
        >
          <Icon name="info" size={14} className="text-[var(--text-2)] shrink-0" />
          <span>Methodology</span>
        </button>

        {/* Secondary action: Reset button */}
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[var(--text-1)] bg-[var(--fill)] hover:bg-[var(--fill-hover)] rounded-[10px] transition-colors shrink-0 active:brightness-95"
          title="Reset site analysis"
        >
          <Icon name="refresh" size={14} className="text-[var(--text-2)] shrink-0" />
          <span className="hidden sm:inline">Reset</span>
        </button>

        {/* Dynamic Engine Status pill: green pulse dot when key active, amber when mock, red when disconnected */}
        {(() => {
          let statusLabel = 'Engine Offline';
          let dotColorClass = 'bg-[var(--semantic-red)]';

          if (backendConnected) {
            const isGroq = activeAiProvider === 'groq';
            const isGemini = activeAiProvider === 'gemini';

            if (isGroq && serverStatus?.groq) {
              statusLabel = 'Engine Online (Groq)';
              dotColorClass = 'bg-[var(--semantic-green)] animate-pulse';
            } else if (isGemini && serverStatus?.gemini) {
              statusLabel = 'Engine Online (Gemini)';
              dotColorClass = 'bg-[var(--semantic-green)] animate-pulse';
            } else {
              statusLabel = 'Engine Offline (Local Mock)';
              dotColorClass = 'bg-[var(--semantic-amber)]';
            }
          }

          return (
            <div
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-[10px] bg-[var(--fill)] text-[12px] font-medium text-[var(--text-2)] shrink-0"
              title={`AI Engine Status: ${statusLabel}`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${dotColorClass}`} />
              <span className="whitespace-nowrap">{statusLabel}</span>
            </div>
          );
        })()}
      </div>
    </header>
  );
};
