import React, { useEffect, useState } from 'react';
import { Icon } from './Icon';

export const LoadingSkeleton: React.FC = () => {
  const [stageIndex, setStageIndex] = useState(0);

  const stages = [
    'Sampling topographic contours and digital elevation model...',
    'Querying USGS seismic event catalogs and BIS IS 1893:2016 zoning...',
    'Analyzing GloFAS river discharge and ERA5 10-year storm climatology...',
    'Evaluating transportation accessibility and Overpass road approach...',
    'Executing multi-criteria decision analysis (MCDA) matrix...',
    'Optimizing bioclimatic orientation and Vastu Purusha spatial grid...',
    'Matching guidance circle rates and computing locality multipliers...',
    'Calculating CPWD plinth area cost allocations and terrain surcharge...',
    'Synthesizing structural engineering narrative and traceable action items...',
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setStageIndex((prev) => (prev + 1) % stages.length);
    }, 900);
    return () => clearInterval(interval);
  }, [stages.length]);

  return (
    <div className="space-y-4 animate-pulse w-full min-w-0">
      {/* Dynamic Staged Progress Banner */}
      <div className="vibrancy-panel rounded-[16px] p-4 text-[var(--text-1)] border border-[var(--panel-border-color)] flex items-center gap-3 shadow-sm">
        <Icon name="loader" size={18} className="text-[var(--accent)] shrink-0 animate-spin" />
        <div className="space-y-0.5 min-w-0">
          <span className="font-semibold block text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">
            Analysis in Progress
          </span>
          <p className="text-[12px] text-[var(--text-1)] transition-all font-mono truncate">
            {stages[stageIndex]}
          </p>
        </div>
      </div>

      {/* Skeleton Scorecard */}
      <div className="bg-[var(--fill)] rounded-[16px] p-4 space-y-3">
        <div className="flex items-center gap-4">
          <div className="w-16 h-14 bg-[var(--fill-hover)] rounded-[12px] shrink-0" />
          <div className="w-14 h-14 rounded-full bg-[var(--fill-hover)] shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-[var(--fill-hover)] rounded-[6px] w-1/3" />
            <div className="h-5 bg-[var(--fill-hover)] rounded-[6px] w-1/2" />
            <div className="h-3 bg-[var(--fill-hover)] rounded-[6px] w-2/3" />
          </div>
        </div>
      </div>

      {/* Skeleton Factor Breakdown */}
      <div className="bg-[var(--fill)] rounded-[16px] p-4 space-y-3">
        <div className="h-4 bg-[var(--fill-hover)] rounded-[6px] w-1/4" />
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <div className="h-3.5 bg-[var(--fill-hover)] rounded-[6px] w-1/4" />
                <div className="h-3.5 bg-[var(--fill-hover)] rounded-[6px] w-14" />
              </div>
              <div className="h-2 bg-[var(--fill-hover)] rounded-full w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Skeleton Cost Table */}
      <div className="bg-[var(--fill)] rounded-[16px] p-4 space-y-3">
        <div className="h-4 bg-[var(--fill-hover)] rounded-[6px] w-1/3" />
        <div className="grid grid-cols-3 gap-2.5">
          <div className="h-14 bg-[var(--fill-hover)] rounded-[10px]" />
          <div className="h-14 bg-[var(--fill-hover)] rounded-[10px]" />
          <div className="h-14 bg-[var(--fill-hover)] rounded-[10px]" />
        </div>
        <div className="h-24 bg-[var(--fill-hover)] rounded-[10px] w-full" />
      </div>
    </div>
  );
};
