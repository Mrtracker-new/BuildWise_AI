import React from 'react';
import { Icon } from './Icon';

export const EmptyState: React.FC = () => {
  const steps = [
    {
      number: '01',
      title: 'Geographic Site Selection',
      desc: 'Click on the interactive map canvas to drop a pin or enter coordinates manually.',
      icon: 'map-pin' as const,
    },
    {
      number: '02',
      title: 'Structural Specifications',
      desc: 'Set the target built-up plinth area (500 to 50,000 sq ft), specification tier, and levels.',
      icon: 'settings' as const,
    },
    {
      number: '03',
      title: 'Deterministic Engine Analysis',
      desc: 'Computes multi-factor slope, drainage, orientation, and preliminary CPWD cost models.',
      icon: 'layers' as const,
    },
    {
      number: '04',
      title: 'Engineering Synthesis & PDF',
      desc: 'Review bioclimatic solar-wind vectors, itemized budgets, and export official PDF reports.',
      icon: 'file-text' as const,
    },
  ];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-6">
      <div className="text-center max-w-md mx-auto space-y-2.5">
        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center mx-auto border border-slate-200">
          <Icon name="crosshair" size={22} />
        </div>
        <h3 className="text-base font-semibold text-slate-900">
          Preliminary Construction Planning System
        </h3>
        <p className="text-sm text-slate-500 leading-relaxed">
          Select any geographic coordinates to evaluate terrain slope, microclimate solar paths,
          hydrological drainage, and preliminary construction budgets.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-slate-100">
        {steps.map((step) => (
          <div
            key={step.number}
            className="p-3.5 rounded-lg bg-slate-50 border border-slate-100 flex items-start gap-3"
          >
            <div className="text-xs font-mono font-bold text-slate-400 mt-0.5">
              {step.number}
            </div>
            <div className="space-y-1">
              <span className="text-sm font-semibold text-slate-800 block">
                {step.title}
              </span>
              <p className="text-xs text-slate-500 leading-normal">
                {step.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-50/80 p-3.5 rounded-lg text-xs text-slate-600 border border-slate-200/60 flex items-center justify-between">
        <span className="font-mono text-slate-500">
          Indian Standard (IS) & CPWD Benchmarks
        </span>
        <span className="font-semibold text-slate-700">Zero Paid APIs Required</span>
      </div>
    </div>
  );
};
