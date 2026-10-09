import React from 'react';

interface SkeletonProps {
  className?: string;
  /** Accessible description of what is loading (announced via role="status"). */
  label?: string;
}

/**
 * Placeholder block for async content. Tokenized shimmer; under
 * prefers-reduced-motion the global CSS rule freezes it to a static tint so
 * nothing animates.
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '', label }) => (
  <div
    role="status"
    aria-busy="true"
    aria-label={label}
    className={`report-skeleton rounded-[8px] ${className}`}
  />
);
