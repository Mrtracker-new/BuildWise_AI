import React from 'react';
import { Icon } from './Icon';

export const EmptyState: React.FC = () => {
  const steps = [
    {
      title: 'Geographic Site Selection',
      desc: 'Click on the interactive map canvas to drop a pin or enter coordinates manually.',
      icon: 'map-pin' as const,
    },
    {
      title: 'Structural Specifications',
      desc: 'Set the target built-up plinth area, specification grade tier, and level storeys.',
      icon: 'sliders' as const,
    },
    {
      title: 'Deterministic Engine Analysis',
      desc: 'Computes multi-factor terrain slope, drainage, bioclimatic orientation, and CPWD costs.',
      icon: 'layers' as const,
    },
    {
      title: 'Engineering Synthesis & PDF',
      desc: 'Review solar-wind vectors, hazard telemetry, and export official vector PDF reports.',
      icon: 'file-text' as const,
    },
  ];

  return (
    <div className="space-y-6 w-full min-w-0 py-2">
      {/* 40px circle --fill with Compass icon 20 --text-2 (no glow) */}
      <div className="text-center space-y-2">
        <div className="w-10 h-10 rounded-full bg-[var(--fill)] flex items-center justify-center mx-auto text-[var(--text-2)] mb-3">
          <Icon name="compass" size={20} />
        </div>
        <h3 className="text-[17px] font-semibold text-[var(--text-1)] tracking-tight">
          Site Feasibility & Planning
        </h3>
        <p className="text-[13px] text-[var(--text-2)] leading-[1.5] max-w-xs mx-auto">
          Drop a pin anywhere on the map or input coordinates to evaluate terrain, passive orientation, and preliminary budgets.
        </p>
      </div>

      {/* Grouped list of 4 rows: 24px radius-6 accent-tint square with 14px --accent icon, title 13px/600, description 12px --text-2 */}
      <div className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
        {steps.map((step, idx) => (
          <div key={idx} className="py-3 flex items-start gap-3 min-w-0">
            <div className="w-6 h-6 rounded-[6px] bg-[var(--accent-tint)] flex items-center justify-center text-[var(--accent)] shrink-0 mt-0.5">
              <Icon name={step.icon} size={14} />
            </div>
            <div className="space-y-0.5 min-w-0 flex-1">
              <span className="text-[13px] font-semibold text-[var(--text-1)] block leading-tight">
                {step.title}
              </span>
              <p className="text-[12px] text-[var(--text-2)] leading-normal">
                {step.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer notes: 12px --text-3 with ShieldCheck/BadgeCheck 14px icons, hairline top border */}
      <div className="pt-3 border-t border-[var(--hairline)] flex items-center justify-between gap-2 text-[12px] text-[var(--text-3)]">
        <div className="flex items-center gap-1.5">
          <Icon name="shield-check" size={14} className="text-[var(--text-3)] shrink-0" />
          <span>CPWD & IS 1893 Benchmarks</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon name="badge-check" size={14} className="text-[var(--text-3)] shrink-0" />
          <span>Zero Paid APIs</span>
        </div>
      </div>
    </div>
  );
};
