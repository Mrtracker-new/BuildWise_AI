import React from 'react';

interface SkeletonProps {
  className?: string;
  /** Accessible description of what is loading (announced via role="status"). */
  label?: string;
}

/**
 * Placeholder block for async content. Tokenized shimmer (`.report-skeleton`);
 * under prefers-reduced-motion the global CSS rule freezes it to a static tint
 * so nothing animates. Sized entirely by the caller's className so it slots
 * into any card without imposing layout.
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '', label }) => (
  <div
    role="status"
    aria-busy="true"
    aria-label={label}
    className={`report-skeleton rounded-[8px] ${className}`}
  />
);
