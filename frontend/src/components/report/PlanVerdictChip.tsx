import React from 'react';
import { Icon } from '../Icon';

interface PlanVerdictChipProps {
  /** `mathematical_certificate.is_valid`; null/undefined means not reported. */
  isValid?: boolean | null;
  /** `validation_gate.overall_status`; only FAIL withholds certification. */
  gateStatus?: string | null;
}

/**
 * Refusal header fact: a withheld certificate or a FAILed gate is not a detail
 * to be buried in the QA panel. The plan is still drawn and exported, and this
 * chip keeps it from ever being mistaken for certified. A WARN gate never
 * receives the treatment — advisories are disclosed, not refused.
 */
export const PlanVerdictChip: React.FC<PlanVerdictChipProps> = ({ isValid, gateStatus }) => {
  const notCertified = isValid === false || String(gateStatus || '').toUpperCase() === 'FAIL';
  if (!notCertified) return null;
  return (
    <span
      data-testid="viewer-not-certified-chip"
      title="The mathematical certificate was withheld or the validation gate FAILed. The plan is drawn with a FAIL stamp; see the certificate and deficit banner below."
      className="font-mono text-[10px] sm:text-[11px] font-bold text-white bg-rose-600 px-2 py-0.5 rounded-[6px] whitespace-nowrap flex items-center gap-1.5 select-none"
    >
      <Icon name="alert-triangle" size={12} className="shrink-0" />
      <span>NOT CERTIFIED</span>
    </span>
  );
};
