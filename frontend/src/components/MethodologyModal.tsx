import React, { useEffect } from 'react';
import { Icon } from './Icon';
import { Kbd } from '../design';

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
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-md animate-fade-in select-none">
      <div className="vibrancy-panel rounded-[20px] border border-[var(--panel-border-color)] shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden select-text">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--hairline)]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[8px] bg-[var(--accent-tint)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <Icon name="info" size={15} />
            </div>
            <h3 className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight">
              Engineering Calculation Methodology & Standards
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-[10px] bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-2)] hover:text-[var(--text-1)] flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto scrollbar-apple space-y-4 text-[12px] text-[var(--text-2)] leading-relaxed">
          {/* Section 1: Suitability */}
          <div className="space-y-2">
            <h4 className="font-semibold text-[var(--text-1)] uppercase text-[11px] tracking-[0.08em]">
              1. Multi-Criteria Decision Analysis (MCDA) Scoring
            </h4>
            <p>
              Land suitability is evaluated using a weighted multi-factor formula normalized between 0 and 100:
            </p>
            <div
              id="mcda-formula"
              className="p-3 bg-[var(--fill)] rounded-[10px] font-mono text-[11px] text-[var(--text-1)] overflow-x-auto scrollbar-apple"
            >
              Suitability =<wbr /> 0.25*<wbr />(<wbr />Slope)<wbr /> +<wbr /> 0.20*<wbr />(<wbr />FloodRisk)<wbr /> +<wbr /> 0.20*<wbr />(<wbr />RoadAccess)<wbr /> +<wbr /> 0.15*<wbr />(<wbr />EnvComfort)<wbr /> +<wbr /> 0.20*<wbr />(<wbr />Facilities)
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[var(--text-2)]">
              <li><b>Slope (25%)</b>: Graded using digital elevation sampling across 33m offsets. Flat (≤3%) = 100, Steep (&gt;15%) = 20-45.</li>
              <li><b>Flood Risk (20%)</b>: Inferred from absolute altitude above sea level, local depressions, and regional annual precipitation.</li>
              <li><b>Road Accessibility (20%)</b>: Evaluates distance to arterial, collector, or residential roadway infrastructure.</li>
              <li><b>Environmental Comfort (15%)</b>: Measures summer peak thermal heat index and ambient wind comfort.</li>
              <li><b>Facility Proximity (20%)</b>: Urban infrastructure proxy evaluating civic services density.</li>
            </ul>
          </div>

          {/* Section 2: Hazard Aggregation */}
          <div className="space-y-2 pt-3 border-t border-[var(--hairline)]">
            <h4 className="font-semibold text-[var(--text-1)] uppercase text-[11px] tracking-[0.08em]">
              2. Hazard History & Climate Stress Aggregation Mapping
            </h4>
            <p>
              Telemetry across seismic, hydrological flood, and storm exposure is synthesized deterministically:
            </p>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-[var(--text-2)]">
              <li><b>Baseline Rating</b>: Begins at <code>max(flood pressure level, storm exposure level)</code>.</li>
              <li><b>Seismic Zone IV Upgrade</b>: Upgrades the overall hazard level by exactly one tier (e.g., low &rarr; moderate, moderate &rarr; high).</li>
              <li><b>Seismic Zone V Rule</b>: In Zone V with at least one historical event (M≥4.5 in past 50 yrs), the overall level is forced to at least <b>High</b>.</li>
              <li><b>Critical Severity Threshold</b>: The overall hazard reaches <b>Critical</b> only when Zone V combines with either <b>High Flood Pressure</b> or <b>High Storm Exposure</b>.</li>
            </ul>
            <p className="text-[11px] text-[var(--text-3)] italic mt-1">
              Seismic zones adhere to BIS IS 1893:2016. Historical earthquake events are sourced from USGS FDSN (250km radius, capped at 250). River discharge ratios from Open-Meteo GloFAS (365d) are guarded with a 0.1 m³/s threshold and capped at 20.0x. Extreme wind and precipitation climatology is derived from ECMWF ERA5 (10-year mean).
            </p>
          </div>

          {/* Section 3: Land Valuation */}
          <div className="space-y-2 pt-3 border-t border-[var(--hairline)]">
            <h4 className="font-semibold text-[var(--text-1)] uppercase text-[11px] tracking-[0.08em]">
              3. Indicative Land Value Engine & Multiplier Breakdown
            </h4>
            <p>
              Land circle rates are determined via spatial coordinate matching (haversine distance radius check first, reverse-geocoded locality second). A locality multiplier is applied based on four physical parameters:
            </p>
            <div className="p-3 bg-[var(--fill)] rounded-[10px] font-mono text-[11px] text-[var(--text-1)]">
              Multiplier = RoadWidth (0.90-1.15) &times; Zoning (1.00-1.10) &times; Frontage (0.95-1.05) &times; Corner (0.95-1.05)
            </div>
            <p className="text-[11px] text-[var(--text-2)]">
              The aggregate locality multiplier is strictly clamped to the range <b>[0.85, 1.25]</b>. Plot area is derived from built-up area and assumed Ground Coverage Ratio (default 60%, configurable 40-75%). Users may supply custom overrides which recompute totals instantly in the browser.
            </p>
          </div>

          {/* Section 4: Vastu Reconciliation */}
          <div className="space-y-2 pt-3 border-t border-[var(--hairline)]">
            <h4 className="font-semibold text-[var(--text-1)] uppercase text-[11px] tracking-[0.08em]">
              4. Vastu Shastra & Passive Solar Reconciliation
            </h4>
            <p>
              Traditional spatial planning principles (Vastu Purusha Mandala) are evaluated alongside modern building physics:
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[var(--text-2)]">
              <li><b>Entrance Portals</b>: 8-direction scoring combines canonical Vastu weights (NE=100, N=95, E=90, S=45), road approach proximity bonus (+35), and passive solar comfort adjustments.</li>
              <li><b>Approach Road Bearing</b>: Queried from OpenStreetMap Overpass API. When unavailable, it defaults to an explicit unknown state without synthesizing geometry.</li>
              <li><b>Mandala Room Grid</b>: 3&times;3 room placement matrix assigns microclimatic functions (e.g. Master Bedroom in SW for thermal stability, Kitchen in SE aligned with ventilation currents).</li>
            </ul>
          </div>

          {/* Section 5: Costing */}
          <div className="space-y-2 pt-3 border-t border-[var(--hairline)]">
            <h4 className="font-semibold text-[var(--text-1)] uppercase text-[11px] tracking-[0.08em]">
              5. Preliminary Construction Cost Estimation (CPWD Aligned)
            </h4>
            <p>
              Cost calculations are derived from Indian Central Public Works Department (CPWD) Plinth Area Rates (PAR):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] text-center my-1.5">
              <div className="p-2.5 bg-[var(--fill)] rounded-[10px]">
                <div className="text-[var(--text-3)] text-[10px]">Basic</div>
                <div className="font-bold text-[var(--text-1)] mt-0.5">INR 1,500 /sq ft</div>
              </div>
              <div className="p-2.5 bg-[var(--fill)] rounded-[10px]">
                <div className="text-[var(--text-3)] text-[10px]">Standard</div>
                <div className="font-bold text-[var(--text-1)] mt-0.5">INR 2,200 /sq ft</div>
              </div>
              <div className="p-2.5 bg-[var(--fill)] rounded-[10px]">
                <div className="text-[var(--text-3)] text-[10px]">Premium</div>
                <div className="font-bold text-[var(--text-1)] mt-0.5">INR 3,500 /sq ft</div>
              </div>
            </div>
            <p className="text-[11px] text-[var(--text-2)]">
              A topographic terrain multiplier (1.0x for flat up to 1.25x for steep terrain) is applied to account for cut-and-fill, retaining structures, and stepped foundations.
            </p>
          </div>

          {/* Section 6: Data Sources & Provenance */}
          <div className="space-y-2 pt-3 border-t border-[var(--hairline)]">
            <h4 className="font-semibold text-[var(--text-1)] uppercase text-[11px] tracking-[0.08em]">
              6. Open-Source Data Provenance & Offline Resilience
            </h4>
            <p className="text-[11px] text-[var(--text-2)]">
              BuildWise AI operates without paid APIs, using OpenStreetMap Nominatim for geocoding, Open-Elevation / Open-Meteo for digital elevation models, USGS FDSN for seismic event catalogs, ECMWF ERA5 for climate reanalysis, and Overpass for road network topology. Responses are cached with a 24-hour TTL on a 0.1° coordinate grid. If external services are unreachable, deterministic fallback models engage with transparent user warnings.
            </p>
          </div>

          {/* Section 7: Ecological Site Vision & Tree Preservation */}
          <div className="space-y-2 pt-3 border-t border-[var(--hairline)]">
            <h4 className="font-semibold text-[var(--text-1)] uppercase text-[11px] tracking-[0.08em]">
              7. Remote Sensing & Ecological Site Vision Pipeline
            </h4>
            <p className="text-[11px] text-[var(--text-2)]">
              The ecological vision module queries the keyless Copernicus Sentinel-2 L2A archive via the Element84 Earth Search STAC API, fetching cloud-screened multispectral Cloud-Optimized GeoTIFFs (COGs) across a 240m &times; 240m site window at 10m spatial resolution.
            </p>
            <div className="p-3 bg-[var(--fill)] rounded-[10px] font-mono text-[11px] text-[var(--text-1)] space-y-1 overflow-x-auto scrollbar-apple">
              <div>NDVI = (B08 - B04) / (B08 + B04) &rarr; Canopy Mask if NDVI &gt; 0.40</div>
              <div>NDWI = (B03 - B08) / (B03 + B08) &rarr; Water Mask if NDWI &gt; 0.05</div>
              <div>NDBI = (B11 - B08) / (B11 + B08) &rarr; Built-up Mask if NDBI &gt; 0.00</div>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-[var(--text-2)]">
              <li><b>Band Resolution Alignment</b>: B11 (SWIR 1610nm, 20m GSD) is upsampled to the 10m grid shape using bilinear spline interpolation prior to NDBI calculation.</li>
              <li><b>Cloud & Shadow Masking</b>: Sentinel-2 Scene Classification Layer (SCL) masks saturated, cloud, and cirrus pixels (classes 1, 8, 9, 10, 11).</li>
              <li><b>SegFormer B0 AI Refinement</b>: A CPU-optimized <code>nvidia/segformer-b0-finetuned-ade-512-512</code> model processes bilinearly upscaled 512&times;512 RGB tensors with percentile contrast enhancement, mapping ADE20K tree classes and downscaling back to 24&times;24. If unavailable, it falls back instantly to Index-only mode.</li>
              <li><b>Connected Component Vectorization</b>: Binary masks are segmented using 8-connectivity labeling, filtered to clusters &ge; 25 m², simplified via Douglas-Peucker (&epsilon;=0.0001°), and projected to WGS84 GeoJSON polygons.</li>
              <li><b>Tree Preservation Hierarchy</b>: Clusters &ge; 100 m² with NDVI &ge; 0.50 are marked <b>PRESERVE</b>. Clusters &ge; 50 m² overlapping the proposed building footprint are marked <b>COMPENSATE</b>. Small clusters &lt; 50 m² overlapping footprint are marked <b>REMOVABLE</b>, and others are marked <b>CONTEXT</b>.</li>
            </ul>
          </div>

          {/* Section 8: Keyboard Shortcuts */}
          <div className="space-y-2 pt-3 border-t border-[var(--hairline)]">
            <h4 className="font-semibold text-[var(--text-1)] uppercase text-[11px] tracking-[0.08em]">
              8. Keyboard Shortcuts
            </h4>
            <p className="text-[11px] text-[var(--text-2)]">
              Shortcuts are active whenever no text field has focus:
            </p>
            <div className="divide-y divide-[var(--hairline)] rounded-[10px] bg-[var(--fill)] overflow-hidden text-[11px]">
              <div className="flex items-center gap-2.5 px-3 py-2"><Kbd>T</Kbd><span className="text-[var(--text-2)]">Toggle light / dark theme</span></div>
              <div className="flex items-center gap-2.5 px-3 py-2"><Kbd>M</Kbd><span className="text-[var(--text-2)]">Open map details (standard / satellite / terrain)</span></div>
              <div className="flex items-center gap-2.5 px-3 py-2"><Kbd>R</Kbd><span className="text-[var(--text-2)]">Reset the site analysis</span></div>
              <div className="flex items-center gap-2.5 px-3 py-2"><Kbd>?</Kbd><span className="text-[var(--text-2)]">Show the shortcuts sheet</span></div>
              <div className="flex items-center gap-2.5 px-3 py-2"><Kbd>Esc</Kbd><span className="text-[var(--text-2)]">Close the active dialog or sheet</span></div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[var(--hairline)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[12px] text-[13px] font-semibold transition-colors cursor-pointer active:brightness-95 shadow-sm"
          >
            Close Reference
          </button>
        </div>
      </div>
    </div>
  );
};
