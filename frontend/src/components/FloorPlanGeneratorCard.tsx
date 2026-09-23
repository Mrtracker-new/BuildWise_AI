import React, { useState } from 'react';
import type { FloorPlanRequest, FloorPlanResponse } from '../services/types';
import { generateFloorPlan } from '../services/api';
import { BlueprintViewer } from './BlueprintViewer';
import { Icon } from './Icon';

interface FloorPlanGeneratorCardProps {
  defaultWidthM?: number;
  defaultDepthM?: number;
  onFloorPlanGenerated?: (plan: FloorPlanResponse) => void;
  activeFloorPlan?: FloorPlanResponse | null;
}

const AVAILABLE_ROOMS = [
  { id: 'master_bed', label: 'Master Bedroom (SW)', required: true },
  { id: 'kitchen', label: 'Kitchen (SE)', required: true },
  { id: 'living', label: 'Living Room', required: true },
  { id: 'puja', label: 'Puja Room (NE)', required: false },
  { id: 'bath_1', label: 'Primary Bath', required: true },
  { id: 'bath_2', label: 'Common Bath', required: false },
  { id: 'bed_2', label: 'Bedroom 2', required: false },
  { id: 'dining', label: 'Dining Area', required: false },
  { id: 'stairs', label: 'Staircase (SW/W)', required: false },
];

export const FloorPlanGeneratorCard: React.FC<FloorPlanGeneratorCardProps> = ({
  defaultWidthM = 10.0,
  defaultDepthM = 12.0,
  onFloorPlanGenerated,
  activeFloorPlan = null,
}) => {
  const [userWidth, setUserWidth] = useState<number | null>(null);
  const [userDepth, setUserDepth] = useState<number | null>(null);
  const plotWidth = userWidth ?? defaultWidthM;
  const plotDepth = userDepth ?? defaultDepthM;

  const [selectedRooms, setSelectedRooms] = useState<string[]>([
    'master_bed',
    'kitchen',
    'living',
    'puja',
    'bath_1',
  ]);
  const [strictness, setStrictness] = useState<'high' | 'medium' | 'low'>('high');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [localFloorPlan, setLocalFloorPlan] = useState<FloorPlanResponse | null>(null);
  const floorPlan = localFloorPlan ?? activeFloorPlan;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toggleRoom = (roomId: string) => {
    setSelectedRooms((prev) =>
      prev.includes(roomId)
        ? prev.filter((r) => r !== roomId)
        : [...prev, roomId]
    );
  };

  const handleGenerate = async () => {
    if (selectedRooms.length < 3) {
      setErrorMessage('Please select at least 3 rooms to generate an architectural floor plan.');
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    const req: FloorPlanRequest = {
      plot_width_m: Math.max(6.0, Math.min(60.0, Number(plotWidth) || 10.0)),
      plot_depth_m: Math.max(6.0, Math.min(60.0, Number(plotDepth) || 12.0)),
      required_rooms: selectedRooms,
      vastu_strictness: strictness,
    };

    try {
      const resp = await generateFloorPlan(req);
      setLocalFloorPlan(resp);
      if (onFloorPlanGenerated) {
        onFloorPlanGenerated(resp);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate floor plan.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2.5 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="blueprint" size={15} className="text-[var(--text-2)] shrink-0" />
          <h2 className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight">
            Generative Floor Plan Engine
          </h2>
        </div>
        {floorPlan && (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--fill)] text-[var(--text-1)] capitalize shrink-0">
            {floorPlan.status}
          </span>
        )}
      </div>

      {/* Error Notice */}
      {errorMessage && (
        <div className="p-2.5 rounded-[10px] bg-[var(--fill)] text-[12px] text-[var(--semantic-red)] flex items-center gap-2">
          <Icon name="alert-triangle" size={14} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Dimensions & Strictness Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
        {/* Plot Dimensions */}
        <div className="space-y-1.5 min-w-0">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] block">
            Plot Dimensions (Meters)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-[var(--text-3)] block mb-0.5">Width (m)</span>
              <input
                type="number"
                min="6"
                max="60"
                step="0.5"
                value={plotWidth}
                onChange={(e) => setUserWidth(parseFloat(e.target.value) || 10)}
                className="w-full h-9 bg-[var(--fill)] border-0 rounded-[10px] px-2.5 text-[13px] font-mono text-[var(--text-1)] outline-none focus:ring-[3px] focus:ring-[var(--accent)]/25"
              />
            </div>
            <div>
              <span className="text-[10px] text-[var(--text-3)] block mb-0.5">Depth (m)</span>
              <input
                type="number"
                min="6"
                max="60"
                step="0.5"
                value={plotDepth}
                onChange={(e) => setUserDepth(parseFloat(e.target.value) || 12)}
                className="w-full h-9 bg-[var(--fill)] border-0 rounded-[10px] px-2.5 text-[13px] font-mono text-[var(--text-1)] outline-none focus:ring-[3px] focus:ring-[var(--accent)]/25"
              />
            </div>
          </div>
        </div>

        {/* Vastu Strictness: iOS Segmented Control */}
        <div className="space-y-1.5 min-w-0">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] block">
            Vastu Strictness
          </label>
          <div className="bg-[var(--fill)] rounded-[10px] p-[2px] grid grid-cols-3 gap-1">
            {(['high', 'medium', 'low'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setStrictness(lvl)}
                className={`py-1.5 px-2 rounded-[8px] text-[12px] font-semibold capitalize text-center transition-all ${
                  strictness === lvl
                    ? 'bg-[var(--segmented-active-bg)] shadow-[var(--segmented-active-shadow)]'
                    : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                }`}
                style={{
                  color: strictness === lvl ? 'var(--segmented-active-label)' : 'var(--text-2)',
                }}
              >
                {lvl}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-[var(--text-3)] block leading-tight">
            {strictness === 'high'
              ? 'Canonical zones (Kitchen SE, Puja NE, Bed SW).'
              : strictness === 'medium'
              ? 'Permits secondary zones to balance plumbing.'
              : 'Soft Vastu scoring for maximum compactness.'}
          </span>
        </div>
      </div>

      {/* Room Selection */}
      <div className="space-y-1.5 min-w-0">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-3)]">
          <span className="font-semibold uppercase tracking-[0.08em]">
            Rooms ({selectedRooms.length} selected)
          </span>
          <span>Min 3 required</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {AVAILABLE_ROOMS.map((room) => {
            const isChecked = selectedRooms.includes(room.id);
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => toggleRoom(room.id)}
                className={`p-2 rounded-[10px] text-left text-[12px] flex items-center gap-2 transition-all ${
                  isChecked
                    ? 'bg-[var(--accent-tint)] text-[var(--accent)] font-semibold'
                    : 'bg-[var(--fill)] text-[var(--text-2)] hover:text-[var(--text-1)]'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 ${
                    isChecked
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                      : 'border-[var(--hairline)] bg-transparent'
                  }`}
                >
                  {isChecked && <Icon name="check-circle" size={10} />}
                </div>
                <span className="leading-tight break-words">{room.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Button: Primary Accent Button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isGenerating}
        className="w-full h-10 px-4 rounded-[12px] bg-[var(--accent)] hover:brightness-[0.98] active:brightness-95 disabled:bg-[var(--fill)] disabled:text-[var(--text-3)] text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition-all select-none shadow-sm cursor-pointer disabled:cursor-not-allowed"
      >
        {isGenerating ? (
          <>
            <Icon name="loader" size={15} className="animate-spin" />
            <span>Solving Spatial Layout...</span>
          </>
        ) : (
          <>
            <Icon name="blueprint" size={15} />
            <span>Generate Architectural Blueprint</span>
          </>
        )}
      </button>

      {/* Blueprint & Metrics Display */}
      {floorPlan && (
        <div className="space-y-3 pt-1">
          {/* Horizontally Scrollable Snap Row of Fixed 104px Tiles */}
          <div className="flex gap-2 overflow-x-auto scrollbar-apple snap-x snap-mandatory pb-1 min-w-0">
            <div className="w-[104px] shrink-0 p-2.5 rounded-[12px] bg-[var(--fill)] snap-start">
              <span
                className="text-[11px] font-semibold text-[var(--text-3)] block truncate leading-tight whitespace-nowrap"
                style={{ wordBreak: 'keep-all' }}
              >
                Vastu
              </span>
              <span className="text-[18px] font-semibold text-[var(--text-1)] tabular-nums block mt-1">
                {floorPlan.metrics.vastu_compliance_pct.toFixed(0)}%
              </span>
            </div>
            <div className="w-[104px] shrink-0 p-2.5 rounded-[12px] bg-[var(--fill)] snap-start">
              <span
                className="text-[11px] font-semibold text-[var(--text-3)] block truncate leading-tight whitespace-nowrap"
                style={{ wordBreak: 'keep-all' }}
              >
                Plumbing
              </span>
              <span className="text-[18px] font-semibold text-[var(--text-1)] tabular-nums block mt-1">
                {floorPlan.metrics.plumbing_adjacency_score.toFixed(0)}%
              </span>
            </div>
            <div className="w-[104px] shrink-0 p-2.5 rounded-[12px] bg-[var(--fill)] snap-start">
              <span
                className="text-[11px] font-semibold text-[var(--text-3)] block truncate leading-tight whitespace-nowrap"
                style={{ wordBreak: 'keep-all' }}
              >
                Utilization
              </span>
              <span className="text-[18px] font-semibold text-[var(--text-1)] tabular-nums block mt-1">
                {floorPlan.metrics.space_utilization_pct.toFixed(0)}%
              </span>
            </div>
            <div className="w-[104px] shrink-0 p-2.5 rounded-[12px] bg-[var(--fill)] snap-start">
              <span
                className="text-[11px] font-semibold text-[var(--text-3)] block truncate leading-tight whitespace-nowrap"
                style={{ wordBreak: 'keep-all' }}
              >
                Coverage
              </span>
              <span className="text-[18px] font-semibold text-[var(--text-1)] tabular-nums block mt-1">
                {floorPlan.metrics.plot_coverage_pct ? `${floorPlan.metrics.plot_coverage_pct.toFixed(0)}%` : '—'}
              </span>
            </div>
            <div className="w-[104px] shrink-0 p-2.5 rounded-[12px] bg-[var(--fill)] snap-start">
              <span
                className="text-[11px] font-semibold text-[var(--text-3)] block truncate leading-tight whitespace-nowrap"
                style={{ wordBreak: 'keep-all' }}
              >
                Latency
              </span>
              <span className="text-[18px] font-semibold text-[var(--text-1)] tabular-nums block mt-1">
                {floorPlan.timing_ms.toFixed(0)}ms
              </span>
            </div>
          </div>

          {/* Blueprint SVG Viewer */}
          <BlueprintViewer
            svgString={floorPlan.svg_blueprint}
            svgPaperString={floorPlan.svg_blueprint_paper}
            placements={floorPlan.placements}
            plotWidthM={plotWidth}
            plotDepthM={plotDepth}
          />
        </div>
      )}
    </div>
  );
};
