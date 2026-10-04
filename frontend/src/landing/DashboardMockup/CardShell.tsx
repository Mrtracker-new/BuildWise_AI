/**
 * CardShell.tsx — common glass card for the mockup's analysis rail.
 * Frosted panel, hairline border, edge-lit top highlight, hover lift,
 * dismissible via the header ×.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SPRING_SOFT } from '../motion';
import { LANDING } from '../theme';

export interface CardShellProps {
  title: string;
  /** Visual + accessible label for the close button */
  onClose?: () => void;
  className?: string;
  children: React.ReactNode;
  /** Content that renders top-right before the close button */
  accessory?: React.ReactNode;
  /** Bottom-right trailing arrow (as in the reference cards) */
  trailingArrow?: boolean;
}

export const CardShell: React.FC<CardShellProps> = ({
  title,
  onClose,
  className = '',
  children,
  accessory,
  trailingArrow = false,
}) => {
  const reduced = useReducedMotion();
  return (
    <motion.div
      whileHover={reduced ? undefined : { y: -4 }}
      transition={SPRING_SOFT}
      className={`group/card relative flex flex-col overflow-hidden rounded-[18px] ${className}`}
      style={{
        // No backdrop-filter here: the card sits on the mockup's near-white
        // panel, where blur is invisible — but each blurred surface re-blurs
        // on every scroll frame and the rail has six of them.
        background: 'rgba(255,255,255,0.82)',
        border: '1px solid rgba(255,255,255,0.6)',
        boxShadow: `${LANDING.glass.topLight}, 0 1px 2px rgba(11,18,32,0.05), 0 8px 20px -8px rgba(11,18,32,0.12)`,
        transition: 'box-shadow 300ms var(--bw-ease-apple)',
      }}
    >
      {/* Hover shadow bloom */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
        style={{ boxShadow: '0 14px 30px -10px rgba(11,18,32,0.22)', borderRadius: 'inherit' }}
      />
      <div className="relative flex items-center justify-between gap-2 px-3.5 pt-3">
        <h4 className="text-[13px] font-semibold tracking-[-0.01em] text-[#0b1220]">{title}</h4>
        <div className="flex items-center gap-1">
          {accessory}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={`Dismiss ${title} card`}
              className="flex h-5 w-5 items-center justify-center rounded-full text-[#98a1b0] transition-colors duration-150 hover:bg-[rgba(11,18,32,0.06)] hover:text-[#0b1220]"
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="relative flex-1 px-3.5 pb-3 pt-2">{children}</div>
      {trailingArrow && (
        <div aria-hidden className="pointer-events-none absolute bottom-2.5 right-3 text-[#a7b0bf] transition-colors duration-200 group-hover/card:text-[#2f6fed]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="19" x2="19" y2="5" />
            <polyline points="9 5 19 5 19 15" />
          </svg>
        </div>
      )}
    </motion.div>
  );
};

/** Small green check row used across the rail cards. */
export const CheckRow: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-2">
    <span className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-[#e3f6e9] text-[#1fa955]">
      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden>
        <path d="M1.8 5.2 4 7.4 8.2 2.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
    <span className="text-[11.5px] font-medium text-[#3c4757]">{label}</span>
  </div>
);
