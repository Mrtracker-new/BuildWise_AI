import React, { useState } from 'react';
import type { VastuAdvisory, RoomGridZone } from '../services/types';
import { Icon } from './Icon';

interface VastuAdvisoryCardProps {
  advisory: VastuAdvisory;
}

export const VastuAdvisoryCard: React.FC<VastuAdvisoryCardProps> = ({ advisory }) => {
  const { ranked_entrances, room_grid, slope_reading, reconciliation_notes, road_approach } = advisory;
  const [selectedZone, setSelectedZone] = useState<RoomGridZone | null>(null);

  // Map 3x3 layout in standard Vastu orientation:
  // Top row: NW, N, NE
  // Middle row: W, Center, E
  // Bottom row: SW, S, SE
  const quadrantOrder = ['NW', 'N', 'NE', 'W', 'Center', 'E', 'SW', 'S', 'SE'];
  const gridMap = new Map((room_grid || []).map((z) => [z.zone, z]));

  const getSlopeBadge = (ausp: string) => {
    switch (ausp) {
      case 'favourable':
        return {
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          label: 'Favourable Natural Drainage',
        };
      case 'requires_remedy':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          label: 'Requires Civil Drainage Remedy',
        };
      default:
        return {
          bg: 'bg-slate-100 text-slate-700 border-slate-200',
          label: 'Neutral Slope Aspect',
        };
    }
  };

  const slopeBadge = getSlopeBadge(slope_reading.auspiciousness);

  return (
    <div className="@container bg-white rounded-lg border border-slate-200 p-4 @sm:p-5 shadow-sm space-y-4 min-w-0 w-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="layout-grid" size={16} className="text-slate-700 shrink-0" />
          <h2 className="text-[15px] font-semibold text-slate-900 tracking-tight whitespace-normal break-words">
            Vastu & Functional Planning Advisory
          </h2>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
          {road_approach.is_fallback ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              <Icon name="alert-triangle" size={12} className="text-amber-500" />
              Approach Road: Unknown
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              <Icon name="navigation" size={12} className="text-slate-600" />
              Road Approach: {road_approach.approach_side} ({road_approach.bearing_degrees?.toFixed(0)}°)
            </span>
          )}
        </div>
      </div>

      {/* Top 3 Ranked Entrances */}
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
          Top-Ranked Entrance Portals (Harmonized Vastu & Road Access)
        </span>
        <div className="grid grid-cols-1 @md:grid-cols-3 gap-3 min-w-0">
          {(ranked_entrances || []).map((ent, idx) => (
            <div
              key={ent.direction}
              className={`rounded-md border p-3 flex flex-col justify-between space-y-2 min-w-0 ${
                idx === 0
                  ? 'border-indigo-200 bg-indigo-50/30'
                  : 'border-slate-200 bg-slate-50/50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-white font-mono text-xs flex items-center justify-center font-bold">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-slate-900 text-sm">{ent.direction} Facing</span>
                  </div>
                  <span className="font-mono text-xs font-semibold text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    Score: {ent.score.toFixed(0)}
                  </span>
                </div>

                {ent.is_approach_side && (
                  <span className="inline-block text-[10px] font-semibold text-blue-700 bg-blue-100/70 border border-blue-200 px-1.5 py-0.5 rounded mb-1.5">
                    Road Access Facade (+35 Bonus)
                  </span>
                )}

                <p className="text-xs text-slate-700 whitespace-normal break-words leading-relaxed mb-1">
                  <span className="font-medium text-slate-900">Vastu:</span> {ent.vastu_rationale}
                </p>
                <p className="text-xs text-slate-600 whitespace-normal break-words leading-relaxed">
                  <span className="font-medium text-slate-800">Practical:</span> {ent.practical_rationale}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3x3 Mandala Grid & Selected Zone Detail */}
      <div className="space-y-2 pt-2 border-t border-slate-100">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            3×3 Spatial Placement Grid (Vastu Purusha Mandala)
          </span>
          <span className="text-[11px] text-slate-400">Click a quadrant for details</span>
        </div>

        <div className="grid grid-cols-1 @md:grid-cols-5 gap-4 min-w-0 items-start">
          {/* 3x3 Grid Display */}
          <div className="@md:col-span-3 grid grid-cols-3 gap-1.5 bg-slate-200 p-1.5 rounded-lg min-w-0">
            {quadrantOrder.map((quad) => {
              const zone = gridMap.get(quad);
              const isSelected = selectedZone?.zone === quad;
              const isCenter = quad === 'Center';

              return (
                <button
                  key={quad}
                  type="button"
                  onClick={() => zone && setSelectedZone(zone)}
                  className={`p-2 rounded text-left transition-colors flex flex-col justify-between min-h-[72px] min-w-0 ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400'
                      : isCenter
                      ? 'bg-amber-50 hover:bg-amber-100/80 text-slate-800'
                      : 'bg-white hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className={`font-bold text-xs ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                      {quad}
                    </span>
                    {isCenter && (
                      <span className={`text-[9px] uppercase font-mono px-1 rounded ${isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-amber-200/80 text-amber-900'}`}>
                        Brahma
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] leading-tight break-words whitespace-normal w-full mt-1">
                    {zone?.primary_room || 'Open'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quadrant Detail Panel */}
          <div className="@md:col-span-2 rounded-lg border border-slate-200 p-3 bg-slate-50/60 min-w-0 space-y-2">
            {selectedZone ? (
              <>
                <div className="flex justify-between items-center border-b border-slate-200/60 pb-1.5">
                  <span className="font-bold text-sm text-slate-900">
                    Quadrant: {selectedZone.zone} ({selectedZone.zone_name})
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">Zone Profile</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium block">Recommended Use:</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                        {selectedZone.primary_room}
                      </span>
                      {selectedZone.alternative_room && (
                        <span className="text-[10px] bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded">
                          Alt: {selectedZone.alternative_room}
                        </span>
                      )}
                    </div>
                  </div>
                  {selectedZone.prohibited && selectedZone.prohibited.length > 0 && (
                    <div>
                      <span className="text-slate-500 font-medium block mt-1">Prohibited:</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {selectedZone.prohibited.map((u, i) => (
                          <span key={i} className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded">
                            {u}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-600 pt-1.5 border-t border-slate-200/60">
                    <span className="font-medium text-slate-800">Vastu:</span> {selectedZone.vastu_rationale}
                  </p>
                  <p className="text-[11px] text-slate-600">
                    <span className="font-medium text-slate-800">Engineering:</span> {selectedZone.civil_engineering_rationale}
                  </p>
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-500 py-6 text-center italic">
                Select any quadrant on the left to inspect auspicious placements and environmental rationales.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Slope & Natural Drainage Reading */}
      <div className="rounded-md border border-slate-200 p-3 bg-slate-50/40 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Natural Drainage & Topographic Aspect
          </span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${slopeBadge.bg}`}>
            {slopeBadge.label}
          </span>
        </div>
        <p className="text-xs text-slate-700">
          Topographic drainage directs stormwater toward the{' '}
          <span className="font-bold text-slate-900">{slope_reading.drainage_direction}</span> boundary ({slope_reading.azimuth_degrees.toFixed(0)}°).
        </p>
        {slope_reading.rationale && (
          <p className="text-[11px] text-slate-600 italic">
            {slope_reading.rationale}
          </p>
        )}
        {slope_reading.remedy_notes && (
          <div className="text-xs text-amber-800 bg-amber-50 p-2 rounded border border-amber-200 flex items-start gap-1.5">
            <Icon name="alert-triangle" size={13} className="text-amber-600 shrink-0 mt-0.5" />
            <span>{slope_reading.remedy_notes}</span>
          </div>
        )}
      </div>

      {/* Scientific Reconciliation Accordion/List */}
      <div className="space-y-2 pt-2 border-t border-slate-100">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
          Scientific Reconciliation (Traditional Rule vs. Civil Engineering)
        </span>
        <div className="grid grid-cols-1 @sm:grid-cols-2 gap-2.5 min-w-0">
          {(reconciliation_notes || []).map((item, idx) => (
            <div key={idx} className="rounded border border-slate-200 p-2.5 bg-slate-50/30 text-xs space-y-1 min-w-0">
              <span className="font-semibold text-slate-900 block">{item.topic}</span>
              <p className="text-[11px] text-slate-500">
                <span className="font-medium text-slate-700">Tradition:</span> {item.vastu_position}
              </p>
              <p className="text-[11px] text-slate-600">
                <span className="font-medium text-slate-700">Science:</span> {item.scientific_passive_position}
              </p>
              <p className="text-[11px] text-indigo-900 bg-indigo-50/60 p-1.5 rounded border border-indigo-100 font-medium">
                Synthesis: {item.recommended_synthesis}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
