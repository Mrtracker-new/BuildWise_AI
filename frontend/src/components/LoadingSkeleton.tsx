import React, { useEffect, useState } from 'react';
import { Icon } from './Icon';

export const LoadingSkeleton: React.FC = () => {
  const [stageIndex, setStageIndex] = useState(0);

  const stages = [
    'Sampling topographic contours and digital elevation model...',
    'Querying microclimate meteorological indices and prevailing wind vectors...',
    'Evaluating transportation accessibility and civic infrastructure...',
    'Executing multi-criteria decision analysis (MCDA) matrix...',
    'Optimizing bioclimatic building longitudinal orientation...',
    'Calculating CPWD plinth area cost allocations and terrain surcharge...',
    'Synthesizing structural engineering narrative...',
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setStageIndex((prev) => (prev + 1) % stages.length);
    }, 900);
    return () => clearInterval(interval);
  }, [stages.length]);

  return (
    <div className="space-y-4 animate-pulse">
      {/* Dynamic Staged Progress Banner */}
      <div className="bg-slate-900 text-white p-4 rounded-lg text-sm flex items-center gap-3 shadow-sm">
        <Icon name="loader" size={18} className="text-sky-400 shrink-0" />
        <div className="space-y-0.5">
          <span className="font-semibold block text-xs uppercase tracking-wider text-slate-400">
            Analysis in Progress
          </span>
          <p className="text-xs text-slate-200 transition-all font-mono">
            {stages[stageIndex]}
          </p>
        </div>
      </div>

      {/* Skeleton Scorecard */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
        <div className="flex items-center gap-4">
          <div className="w-16 h-14 bg-slate-100 rounded shrink-0" />
          <div className="w-14 h-14 rounded-full bg-slate-100 shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-slate-100 rounded w-1/3" />
            <div className="h-5 bg-slate-100 rounded w-1/2" />
            <div className="h-3 bg-slate-100 rounded w-2/3" />
          </div>
        </div>
      </div>

      {/* Skeleton Factor Breakdown */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
        <div className="h-4 bg-slate-100 rounded w-1/4" />
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <div className="h-3.5 bg-slate-100 rounded w-1/4" />
                <div className="h-3.5 bg-slate-100 rounded w-14" />
              </div>
              <div className="h-2 bg-slate-100 rounded w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Skeleton Cost Table */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
        <div className="h-4 bg-slate-100 rounded w-1/3" />
        <div className="grid grid-cols-3 gap-2.5">
          <div className="h-14 bg-slate-100 rounded" />
          <div className="h-14 bg-slate-100 rounded" />
          <div className="h-14 bg-slate-100 rounded" />
        </div>
        <div className="h-24 bg-slate-100 rounded w-full" />
      </div>
    </div>
  );
};
