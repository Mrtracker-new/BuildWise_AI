import React, { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';

export type MapStyleMode = 'standard' | 'satellite' | 'terrain';

interface MapStyleSelectorProps {
  currentStyle: MapStyleMode;
  onStyleChange: (style: MapStyleMode) => void;
  className?: string;
}

interface StyleOption {
  id: MapStyleMode;
  title: string;
  subtitle: string;
  icon: IconName;
}

const STYLE_OPTIONS: StyleOption[] = [
  {
    id: 'standard',
    title: 'Standard',
    subtitle: 'Streets & 3D',
    icon: 'map',
  },
  {
    id: 'satellite',
    title: 'Satellite',
    subtitle: 'Real imagery + labels + 3D',
    icon: 'satellite',
  },
  {
    id: 'terrain',
    title: 'Terrain',
    subtitle: 'Topographic + labels + 3D',
    icon: 'mountain',
  },
];

export const MapStyleSelector: React.FC<MapStyleSelectorProps> = ({
  currentStyle,
  onStyleChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger Button: Apple Maps Vibrancy Squircle */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-8 h-8 rounded-[10px] vibrancy-panel flex items-center justify-center transition-colors border border-[var(--panel-border-color)] shadow-md active:scale-95 ${
          isOpen || currentStyle !== 'standard'
            ? 'text-[var(--accent)] bg-[var(--accent-tint)]'
            : 'text-[var(--text-1)] hover:bg-[var(--fill)]'
        }`}
        title="Map Details (Standard / Satellite / Terrain)"
        aria-label="Map Details (Standard / Satellite / Terrain)"
        aria-expanded={isOpen}
      >
        <Icon name="layers" size={15} />
      </button>

      {/* iOS Popover Sheet */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Map Details"
          className="absolute bottom-full mb-2 left-0 z-[1100] w-[248px] vibrancy-panel rounded-[14px] p-1.5 border border-[var(--panel-border-color)] shadow-2xl animate-popover-open origin-bottom-left select-none"
        >
          <div className="px-2.5 pt-1.5 pb-1 flex items-center justify-between text-[10px] font-semibold tracking-wider uppercase text-[var(--text-3)]">
            <span>Map Details</span>
          </div>

          <div className="h-[1px] w-full bg-[var(--hairline)] my-1" />

          <div className="flex flex-col gap-0.5">
            {STYLE_OPTIONS.map((opt) => {
              const isSelected = currentStyle === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onStyleChange(opt.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--accent-tint)] text-[var(--accent)] font-medium'
                      : 'hover:bg-[var(--fill)] text-[var(--text-1)]'
                  }`}
                  role="radio"
                  aria-checked={isSelected}
                >
                  <div
                    className={`w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-[var(--accent)] text-white shadow-sm'
                        : 'bg-[var(--fill)] text-[var(--text-2)]'
                    }`}
                  >
                    <Icon name={opt.icon} size={15} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] leading-tight font-medium">
                      {opt.title}
                    </div>
                    <div className="text-[10px] text-[var(--text-2)] leading-tight truncate">
                      {opt.subtitle}
                    </div>
                  </div>

                  {isSelected && (
                    <Icon
                      name="check"
                      size={14}
                      className="text-[var(--accent)] shrink-0 ml-1"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
