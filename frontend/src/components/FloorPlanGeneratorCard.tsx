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
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4 w-full min-w-0 @container">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-50 text-sky-600 border border-sky-100">
              <Icon name="blueprint" size={18} />
            </div>
            <h3 className="text-sm font-bold text-slate-900 truncate">
              Generative Floor Plan Engine
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Algorithmic CSP backtracking layout resolving Vastu canons, wet plumbing adjacency, and structural circulation.
          </p>
        </div>

        {floorPlan && (
          <div className="shrink-0">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                floorPlan.status === 'optimal'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : floorPlan.status === 'compromise'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              <Icon
                name={
                  floorPlan.status === 'optimal'
                    ? 'check-circle'
                    : floorPlan.status === 'compromise'
                    ? 'info'
                    : 'alert-triangle'
                }
                size={13}
              />
              <span>{floorPlan.status}</span>
            </span>
          </div>
        )}
      </div>

      {/* Error Notice */}
      {errorMessage && (
        <div className="p-2.5 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <Icon name="alert-triangle" size={14} className="shrink-0 text-rose-500" />
          <span className="break-words">{errorMessage}</span>
        </div>
      )}

      {/* Controls Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* Plot Dimensions */}
        <div className="space-y-1.5">
          <label className="font-semibold text-slate-700 block">
            Plot Dimensions (Meters)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Width (m)</span>
              <input
                type="number"
                min="6"
                max="60"
                step="0.5"
                value={plotWidth}
                onChange={(e) => setUserWidth(parseFloat(e.target.value) || 10)}
                className="w-full mt-0.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Depth (m)</span>
              <input
                type="number"
                min="6"
                max="60"
                step="0.5"
                value={plotDepth}
                onChange={(e) => setUserDepth(parseFloat(e.target.value) || 12)}
                className="w-full mt-0.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>
        </div>

        {/* Vastu Strictness */}
        <div className="space-y-1.5">
          <label className="font-semibold text-slate-700 block">
            Vastu Strictness Level
          </label>
          <div className="grid grid-cols-3 gap-1.5 mt-0.5">
            {(['high', 'medium', 'low'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setStrictness(lvl)}
                className={`py-1.5 px-2 rounded-md font-medium capitalize text-center border transition-all ${
                  strictness === lvl
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-slate-500 block">
            {strictness === 'high'
              ? 'Strict canonical quadrants (Kitchen SE, Puja NE, Bed SW).'
              : strictness === 'medium'
              ? 'Permits canonical secondary zones to balance plumbing.'
              : 'Soft Vastu scoring prioritizing maximum plumbing clustering.'}
          </span>
        </div>
      </div>

      {/* Room Selection Checkboxes */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="font-semibold text-slate-700 text-xs">
            Required Rooms ({selectedRooms.length} selected)
          </label>
          <span className="text-[10px] text-slate-500">Min 3 rooms</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {AVAILABLE_ROOMS.map((room) => {
            const isChecked = selectedRooms.includes(room.id);
            return (
              <label
                key={room.id}
                className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer select-none text-xs transition-colors ${
                  isChecked
                    ? 'bg-sky-50/50 border-sky-200 text-slate-900 font-medium'
                    : 'bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleRoom(room.id)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 h-3.5 w-3.5 mt-0.5 shrink-0"
                />
                <span className="break-words leading-tight">{room.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Action Button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isGenerating}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
      >
        {isGenerating ? (
          <>
            <Icon name="loader" size={15} className="animate-spin text-sky-400" />
            <span>Solving Spatial CSP & Backtracking...</span>
          </>
        ) : (
          <>
            <Icon name="blueprint" size={15} className="text-sky-400" />
            <span>Generate Architectural Blueprint</span>
          </>
        )}
      </button>

      {/* Blueprint & Metrics Display */}
      {floorPlan && (
        <div className="space-y-3 pt-2">
          {/* Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Vastu Score</span>
              <span className="text-base font-bold text-slate-900 font-mono">
                {floorPlan.metrics.vastu_compliance_pct.toFixed(0)}%
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Plumbing Score</span>
              <span className="text-base font-bold text-slate-900 font-mono">
                {floorPlan.metrics.plumbing_adjacency_score.toFixed(0)}%
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Space Efficiency</span>
              <span className="text-base font-bold text-slate-900 font-mono">
                {floorPlan.metrics.space_utilization_pct.toFixed(0)}%
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Solver Latency</span>
              <span className="text-base font-bold text-slate-900 font-mono">
                {floorPlan.timing_ms.toFixed(0)} ms
              </span>
            </div>
          </div>

          {/* Warnings List */}
          {floorPlan.warnings && floorPlan.warnings.length > 0 && (
            <div className="p-2.5 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-amber-900">
                <Icon name="info" size={13} />
                <span>Layout Synthesis Diagnostics</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                {floorPlan.warnings.map((w, idx) => (
                  <li key={idx} className="break-words">{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Blueprint SVG Viewer */}
          <BlueprintViewer
            svgString={floorPlan.svg_blueprint}
            placements={floorPlan.placements}
            plotWidthM={plotWidth}
            plotDepthM={plotDepth}
          />
        </div>
      )}
    </div>
  );
};
