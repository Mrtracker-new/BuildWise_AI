import React, { useEffect } from 'react';
import { Icon } from './Icon';

interface MethodologyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MethodologyModal: React.FC<MethodologyModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <Icon name="info" size={16} className="text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-900">
              Engineering Calculation Methodology & Standards
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-700 leading-relaxed">
          {/* Section 1: Suitability */}
          <div className="space-y-1.5">
            <h4 className="font-semibold text-slate-900 uppercase text-[11px] tracking-wider">
              1. Multi-Criteria Decision Analysis (MCDA) Scoring
            </h4>
            <p>
              Land suitability is evaluated using a weighted multi-factor formula normalized between 0 and 100:
            </p>
            <div id="mcda-formula" className="p-2.5 bg-slate-50 rounded border border-slate-200 font-mono text-[11px] text-slate-800 overflow-x-auto scrollbar-thin">
              Suitability =<wbr /> 0.25*<wbr />(<wbr />Slope)<wbr /> +<wbr /> 0.20*<wbr />(<wbr />FloodRisk)<wbr /> +<wbr /> 0.20*<wbr />(<wbr />RoadAccess)<wbr /> +<wbr /> 0.15*<wbr />(<wbr />EnvComfort)<wbr /> +<wbr /> 0.20*<wbr />(<wbr />Facilities)
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-600">
              <li><b>Slope (25%)</b>: Graded using digital elevation sampling across 33m offsets. Flat (&le;3%) = 100, Steep (&gt;15%) = 20-45.</li>
              <li><b>Flood Risk (20%)</b>: Inferred from absolute altitude above sea level, local depressions, and regional annual precipitation.</li>
              <li><b>Road Accessibility (20%)</b>: Evaluates distance to arterial, collector, or residential roadway infrastructure.</li>
              <li><b>Environmental Comfort (15%)</b>: Measures summer peak thermal heat index and ambient wind comfort.</li>
              <li><b>Facility Proximity (20%)</b>: Urban infrastructure proxy evaluating civic services density.</li>
            </ul>
          </div>

          {/* Section 2: Orientation */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <h4 className="font-semibold text-slate-900 uppercase text-[11px] tracking-wider">
              2. Passive Solar & Microclimate Orientation
            </h4>
            <p>
              In tropical and subtropical latitudes (e.g. India), high solar altitude angles produce severe east-west facade overheating.
              The system recommends orienting the building's principal longitudinal axis along East-West (90&deg;) to minimize peak afternoon solar radiation,
              deflected by up to &plusmn;15&deg; based on prevailing wind vectors to optimize cross-ventilation.
            </p>
          </div>

          {/* Section 3: Costing */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <h4 className="font-semibold text-slate-900 uppercase text-[11px] tracking-wider">
              3. Preliminary Construction Cost Estimation (CPWD Aligned)
            </h4>
            <p>
              Cost calculations are derived from Indian Central Public Works Department (CPWD) Plinth Area Rates (PAR):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] text-center my-1.5">
              <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500 text-[10px]">Basic</div>
                <div className="font-bold text-slate-900 break-words">INR 1,500 /sq ft</div>
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500 text-[10px]">Standard</div>
                <div className="font-bold text-slate-900 break-words">INR 2,200 /sq ft</div>
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500 text-[10px]">Premium</div>
                <div className="font-bold text-slate-900 break-words">INR 3,500 /sq ft</div>
              </div>
            </div>
            <p className="text-[11px] text-slate-600">
              A topographic terrain multiplier (1.0x for flat up to 1.25x for steep terrain) is applied to account for cut-and-fill, retaining structures, and stepped foundations.
            </p>
          </div>

          {/* Section 4: Data Sources */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <h4 className="font-semibold text-slate-900 uppercase text-[11px] tracking-wider">
              4. Open-Source Data Provenance
            </h4>
            <p className="text-[11px] text-slate-600">
              BuildWise AI operates without paid APIs, using OpenStreetMap Nominatim for geocoding, Open-Elevation / Open-Meteo for digital elevation models, and Open-Meteo for meteorological telemetry. If external networks time out, deterministic synthetic spatial harmonics engage automatically.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-medium transition-colors"
          >
            Close Reference
          </button>
        </div>
      </div>
    </div>
  );
};
