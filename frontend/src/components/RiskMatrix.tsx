import React from 'react';
import type { RiskItem } from '../services/types';
import { Icon } from './Icon';

interface RiskMatrixProps {
  risks: RiskItem[];
}

export const RiskMatrix: React.FC<RiskMatrixProps> = ({ risks }) => {
  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'high':
        return 'var(--semantic-red)';
      case 'medium':
        return 'var(--semantic-amber)';
      default:
        return 'var(--semantic-green)';
    }
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2.5 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="shield-alert" size={15} className="text-[var(--text-2)] shrink-0" />
          <h3 className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight">
            Site Constraints & Risk Matrix
          </h3>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] shrink-0">
          {risks.length} Identified
        </span>
      </div>

      {/* Grouped list with hairline dividers */}
      <div className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
        {risks.map((risk, idx) => {
          const color = getSeverityColor(risk.severity);

          return (
            <div key={idx} className="py-3 space-y-1.5 min-w-0">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-[13px] font-semibold text-[var(--text-1)] leading-snug break-words">
                  {risk.title}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--fill)] text-[var(--text-1)] shrink-0 capitalize">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span>{risk.severity} Risk</span>
                </span>
              </div>

              <p className="text-[12px] text-[var(--text-2)] leading-normal">
                {risk.description}
              </p>

              <div className="text-[12px] text-[var(--text-2)] leading-normal pt-0.5">
                <span className="font-medium text-[var(--text-1)]">Mitigation: </span>
                <span>{risk.mitigation_strategy}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
