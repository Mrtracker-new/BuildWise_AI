import React, { useCallback, useState } from 'react';
import { Icon } from '../Icon';
import { useToast } from '../../design/primitives';

interface CopyValueButtonProps {
  /** The literal value string placed on the clipboard. */
  value: string;
  /** Accessible label announced to screen readers. */
  label: string;
  className?: string;
}

/**
 * Small inline copy affordance for key report metrics: copies the raw value,
 * flips to a check glyph and fires a design-system toast for confirmation.
 * Hidden from print output.
 */
export const CopyValueButton: React.FC<CopyValueButtonProps> = ({ value, label, className = '' }) => {
  const pushToast = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      pushToast({ message: `${label} copied`, tone: 'success' });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      pushToast({ message: 'Copy failed — clipboard unavailable', tone: 'critical' });
    }
  }, [value, label, pushToast]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      className={`print-hide inline-flex w-5 h-5 rounded-[5px] items-center justify-center shrink-0 text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--fill-hover)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${className}`}
    >
      <Icon name={copied ? 'check' : 'copy'} size={11} className={copied ? 'text-[var(--semantic-green)]' : ''} />
    </button>
  );
};
