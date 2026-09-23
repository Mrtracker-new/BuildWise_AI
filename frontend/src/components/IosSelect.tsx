import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import ReactDOM from 'react-dom';
import { Icon } from './Icon';

export interface IosSelectOption {
  id: string | number;
  label: string;
}

interface IosSelectProps {
  id?: string;
  value: string | number;
  onChange: (value: any) => void;
  options: IosSelectOption[];
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

export const IosSelect: React.FC<IosSelectProps> = ({
  id,
  value,
  onChange,
  options,
  ariaLabel,
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; placeAbove: boolean }>({
    top: 0,
    left: 0,
    width: 0,
    placeAbove: false,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const selectId = id || generatedId;
  const listboxId = `${selectId}-listbox`;

  const selectedOption = options.find((opt) => String(opt.id) === String(value)) || options[0];

  const updateCoordinates = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuMaxHeight = 260;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < menuMaxHeight && rect.top > menuMaxHeight;

    setCoords({
      top: placeAbove ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      placeAbove,
    });
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    updateCoordinates();
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (optionId: string | number) => {
    onChange(optionId);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIndex = options.findIndex((opt) => String(opt.id) === String(value));
        const nextIndex = (currentIndex + 1) % options.length;
        onChange(options[nextIndex].id);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex = options.findIndex((opt) => String(opt.id) === String(value));
        const prevIndex = (currentIndex - 1 + options.length) % options.length;
        onChange(options[prevIndex].id);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      updateCoordinates();
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, options, value, onChange, updateCoordinates]);

  return (
    <div className={`relative min-w-0 ${className}`}>
      {/* iOS Popover Trigger Button */}
      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={ariaLabel || selectedOption?.label}
        disabled={disabled}
        onClick={handleOpen}
        className="w-full h-10 px-3 rounded-[10px] bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[13px] font-medium text-[var(--text-1)] flex items-center justify-between outline-none focus:ring-[3px] focus:ring-[rgba(0,113,227,0.25)] transition-all cursor-pointer select-none border-0 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="truncate mr-2">{selectedOption?.label}</span>
        <Icon
          name="chevron-down"
          size={16}
          className={`text-[var(--text-2)] shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Popover Menu rendered via React Portal into document.body to prevent clipping by overflow-y: auto */}
      {isOpen &&
        ReactDOM.createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            style={{
              position: 'fixed',
              top: coords.placeAbove ? 'auto' : `${coords.top}px`,
              bottom: coords.placeAbove ? `${window.innerHeight - coords.top}px` : 'auto',
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              zIndex: 2500,
            }}
            className="vibrancy-panel rounded-[12px] shadow-2xl max-h-[260px] overflow-y-auto scrollbar-apple py-1 border border-[var(--panel-border-color)] animate-popover-open"
          >
            {options.map((option) => {
              const isSelected = String(option.id) === String(value);
              return (
                <div
                  key={option.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(option.id)}
                  className={`h-[36px] px-3 flex items-center justify-between text-[13px] font-medium cursor-pointer transition-colors select-none ${
                    isSelected
                      ? 'bg-[var(--fill-active)] text-[var(--text-1)]'
                      : 'text-[var(--text-1)] hover:bg-[var(--fill)]'
                  }`}
                >
                  <span className="truncate mr-2">{option.label}</span>
                  {isSelected && (
                    <Icon name="check" size={16} className="text-[var(--accent)] shrink-0" />
                  )}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
};
