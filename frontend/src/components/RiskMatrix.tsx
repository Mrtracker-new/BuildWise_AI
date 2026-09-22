import React from 'react';
import type { RiskItem } from '../services/types';
import { Icon } from './Icon';

interface RiskMatrixProps {
  risks: RiskItem[];
}

export const RiskMatrix: React.FC<RiskMatrixProps> = ({ risks }) => {
  const getSeverityBadge = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'high':
        return {
          bg: 'bg-rose-50 text-rose-800 border-rose-200',
          icon: 'shield-alert' as const,
        };
      case 'medium':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          icon: 'alert-triangle' as const,
        };
      case 'low':
      default:
        return {
          bg: 'bg-slate-100 text-slate-700 border-slate-200',
          icon: 'shield-check' as const,
        };
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-3.5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Icon name="shield-alert" size={16} className="text-slate-700" />
          <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">
            Site Constraints & Risk Mitigation Matrix
          </h3>
        </div>
        <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 font-mono">
          {risks.length} Identified
        </span>
      </div>

      <div className="space-y-3">
        {risks.map((risk, idx) => {
          const badge = getSeverityBadge(risk.severity);

          return (
            <div
              key={idx}
              className="p-3.5 rounded-lg border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition-colors space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900 leading-snug">
                  {risk.title}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-mono font-semibold uppercase px-2.5 py-0.5 rounded border shrink-0 ${badge.bg}`}
                >
                  <Icon name={badge.icon} size={12} />
                  <span>{risk.severity} Risk</span>
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                {risk.description}
              </p>

              <div className="pt-2 mt-1 border-t border-slate-200/60 flex items-start gap-1.5 text-xs text-slate-700">
                <span className="font-semibold text-slate-900 shrink-0">
                  Prescribed Mitigation:
                </span>
                <span className="text-slate-600">{risk.mitigation_strategy}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
