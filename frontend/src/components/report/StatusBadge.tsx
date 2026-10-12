import React from 'react';
import { Icon, type IconName } from '../Icon';
import type { ProvenanceStatus } from './statusTaxonomy';
import { STATUS_LEGEND } from './statusTaxonomy';

interface StatusBadgeProps {
  status: ProvenanceStatus;
  className?: string;
}

/** Visual contract: impossible to confuse the four states at a glance. */
const STYLES: Record<
  ProvenanceStatus,
  { icon: IconName; className: string; dashed: boolean }
> = {
  VERIFIED: {
    icon: 'badge-check',
    className: 'bg-[var(--semantic-green)]/10 text-[var(--semantic-green-ink)] border border-[var(--semantic-green)]/30',
    dashed: false,
  },
  CALCULATED: {
    icon: 'info',
    className: 'bg-[var(--accent-tint)] text-[var(--accent-ink)] border border-[var(--accent)]/30',
    dashed: false,
  },
  ASSUMED: {
    icon: 'alert-triangle',
    className: 'bg-[var(--semantic-amber)]/10 text-[var(--semantic-amber-ink)] border border-[var(--semantic-amber)]/30',
    dashed: false,
  },
  UNKNOWN: {
    icon: 'info',
    className: 'bg-[var(--fill)] text-[var(--text-2)]',
    dashed: true,
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const style = STYLES[status];
  return (
    <span
      data-provenance-status={status}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide shrink-0 ${style.className} ${
        style.dashed ? 'border border-dashed border-[var(--hairline)]' : ''
      } ${className}`}
    >
      <Icon name={style.icon} size={11} className="shrink-0" />
      <span>{status}</span>
    </span>
  );
};

export { STATUS_LEGEND };
