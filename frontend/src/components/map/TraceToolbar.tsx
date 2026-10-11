/**
 * TraceToolbar.tsx — floating glass mode toolbar for the capture session.
 * ======================================================================
 * Replaces the flat "click-to-place" form controls with a
 * professional-tool surface: [Draw] [Edit] [Import] [Presets] then
 * [Undo] [Redo] [Finish]. Icons + text labels; the active mode is highlighted
 * with the accent token; the toolbar fades in/out with a 150ms ease-out
 * (MOTION tokens), honors prefers-reduced-motion and keeps a constant height
 * (no layout jumps). Focus rings are visible on every control (a11y gate).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../Icon';
import { MOTION } from '../../design/tokens';

export type TraceMode = 'draw' | 'edit';

export interface TraceToolbarProps {
  visible: boolean;
  mode: TraceMode;
  onModeChange: (mode: TraceMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Finish: close the ring (draw) or continue to frontage (edit). */
  onFinish: () => void;
  finishDisabled: boolean;
  finishDisabledReason?: string;
  /** Vertices placed so far (drives Finish enablement in draw mode). */
  vertexCount: number;
  /** Import/presets stay in the step sheet; these open their disclosure. */
  onImport: () => void;
  onPresets: () => void;
  /** Controlled presets dropdown: open state so the button reflects it. */
  presetsOpen?: boolean;
  /** The PresetMenu popover, rendered INSIDE the toolbar surface (anchors to it). */
  presetsMenu?: React.ReactNode;
}

interface ToolButton {
  id: string;
  icon: IconName;
  label: string;
  keyHint?: string;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  active?: boolean;
  variant?: 'default' | 'accent';
}

export const TraceToolbar: React.FC<TraceToolbarProps> = ({
  visible,
  mode,
  onModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onFinish,
  finishDisabled,
  finishDisabledReason,
  vertexCount,
  onImport,
  onPresets,
  presetsOpen = false,
  presetsMenu,
}) => {
  // Fade in/out via opacity+scale on mount/unmount; 150ms ease-out per contract.
  const [mounted, setMounted] = useState(visible);
  const fadeTimer = useRef<number | null>(null);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    if (fadeTimer.current !== null) window.clearTimeout(fadeTimer.current);
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    fadeTimer.current = window.setTimeout(
      () => setMounted(false),
      reduced ? 0 : MOTION.duration.base
    );
    return () => {
      if (fadeTimer.current !== null) window.clearTimeout(fadeTimer.current);
    };
  }, [visible]);

  if (!mounted) return null;

  const tools: ToolButton[] = [
    {
      id: 'draw',
      icon: 'crosshair',
      label: 'Draw',
      keyHint: 'D',
      onClick: () => onModeChange('draw'),
      active: mode === 'draw',
    },
    {
      id: 'edit',
      icon: 'edit',
      label: 'Edit',
      keyHint: 'E',
      onClick: () => onModeChange('edit'),
      active: mode === 'edit',
      disabled: vertexCount < 3,
      disabledReason: 'Place at least 3 vertices to edit',
    },
    { id: 'import', icon: 'upload', label: 'Import', onClick: onImport },
    { id: 'presets', icon: 'layout-grid', label: 'Presets', onClick: onPresets, active: presetsOpen },
    {
      id: 'undo',
      icon: 'undo2',
      label: 'Undo',
      keyHint: 'Ctrl+Z',
      onClick: onUndo,
      disabled: !canUndo,
    },
    {
      id: 'redo',
      icon: 'redo2',
      label: 'Redo',
      keyHint: 'Ctrl+Shift+Z',
      onClick: onRedo,
      disabled: !canRedo,
    },
    {
      id: 'finish',
      icon: 'check',
      label: 'Finish',
      keyHint: 'Enter',
      onClick: onFinish,
      disabled: finishDisabled,
      disabledReason: finishDisabledReason,
      variant: 'accent',
    },
  ];

  return (
    <div
      role="toolbar"
      aria-label="Boundary tracing tools"
      data-testid="trace-toolbar"
      className="relative flex items-center justify-center"
    >
      <div
        className="vibrancy-panel rounded-[14px] px-1 py-1 flex flex-col items-stretch gap-0.5 shadow-lg sm:flex-row sm:w-auto"
        style={{
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(4px)',
          opacity: visible ? 1 : 0,
          transition: `opacity ${MOTION.duration.base}ms ${MOTION.ease.out}, transform ${MOTION.duration.base}ms ${MOTION.ease.out}`,
        }}
      >
        {tools.map((t) => (
          <React.Fragment key={t.id}>
            {(t.id === 'undo' || t.id === 'finish') && (
              <div className="h-[1px] w-6 sm:h-6 sm:w-[1px] bg-[var(--hairline)] sm:mx-1 mx-auto" aria-hidden="true" />
            )}
            <button
              type="button"
              onClick={t.onClick}
              disabled={t.disabled}
              title={
                t.disabled && t.disabledReason
                  ? t.disabledReason
                  : `${t.label}${t.keyHint ? ` (${t.keyHint})` : ''}`
              }
              data-testid={`trace-toolbar-${t.id}`}
              aria-pressed={t.active ? true : undefined}
              className={`group flex items-center gap-1 h-8 px-2 rounded-[10px] text-[11px] sm:text-[12px] font-medium select-none justify-center transition-[color,background-color,box-shadow] duration-150 ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                t.variant === 'accent'
                  ? 'bg-[var(--accent)] text-white shadow-sm hover:brightness-[0.98] active:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed'
                  :                t.active
                  ? 'bg-[var(--accent-tint)] text-[var(--accent)]'
                  : 'text-[var(--text-1)] hover:bg-[var(--fill)] active:bg-[var(--fill-hover)] disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              <Icon
                name={t.icon}
                size={13}
                className={t.active && t.variant !== 'accent' ? 'text-[var(--accent)]' : t.variant === 'accent' ? 'text-white' : 'text-[var(--text-2)] group-hover:text-[var(--text-1)]'}
              />
              {t.id === 'presets' && (
                <Icon name="chevron-down" size={10} className={`text-[var(--text-3)] ${presetsOpen ? 'rotate-180' : ''} transition-transform`} />
              )}
              <span className="hidden sm:inline">{t.label}</span>
              {/* No key badge inside the button: a single letter pinned to a
                  control reads as clutter. The binding stays in the tooltip
                  (see title above) and in the Methodology reference. */}
            </button>
            {t.id === 'presets' && (
              <div className="h-[1px] w-6 sm:h-6 sm:w-[1px] bg-[var(--hairline)] sm:mx-1 mx-auto" aria-hidden="true" />
            )}
          </React.Fragment>
        ))}
      </div>
      {presetsMenu}
    </div>
  );
};
