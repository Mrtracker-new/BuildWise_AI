import React, { useState } from 'react';
import type { VastuAdvisory, RoomGridZone } from '../services/types';
import { Icon } from './Icon';

interface VastuAdvisoryCardProps {
  advisory: VastuAdvisory;
}

export const VastuAdvisoryCard: React.FC<VastuAdvisoryCardProps> = ({ advisory }) => {
  const { ranked_entrances, room_grid, slope_reading, reconciliation_notes, road_approach } = advisory;
  const [selectedZone, setSelectedZone] = useState<RoomGridZone | null>(null);

  // 3x3 layout in standard Vastu orientation:
  // Top: NW, N, NE | Middle: W, Center, E | Bottom: SW, S, SE
  const quadrantOrder = ['NW', 'N', 'NE', 'W', 'Center', 'E', 'SW', 'S', 'SE'];
  const gridMap = new Map((room_grid || []).map((z) => [z.zone, z]));

  return (
    <div className="space-y-4 w-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2.5 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="layout-grid" size={15} className="text-[var(--text-2)] shrink-0" />
          <h2 className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight">
            Vastu & Functional Planning Advisory
          </h2>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)] shrink-0">
          {road_approach.is_fallback ? (
            <span className="px-2 py-0.5 rounded-[6px] bg-[var(--fill)] text-[var(--text-2)]">
              Approach Road: Auto
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-[6px] bg-[var(--fill)] text-[var(--text-2)]">
              Approach: {road_approach.approach_side}
            </span>
          )}
        </div>
      </div>

      {/* Ranked Entrances */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] block">
          Ranked Entrance Portals
        </span>
        <div className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
          {(ranked_entrances || []).slice(0, 3).map((ent, idx) => (
            <div key={ent.direction} className="py-2.5 space-y-1 min-w-0">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[var(--fill)] text-[var(--text-1)] text-[11px] flex items-center justify-center font-bold">
                    {idx + 1}
                  </span>
                  <span className="text-[13px] font-semibold text-[var(--text-1)]">
                    {ent.direction} Facing
                  </span>
                  {ent.is_approach_side && (
                    <span className="text-[10px] font-medium bg-[var(--accent-tint)] text-[var(--accent)] px-1.5 py-0.2 rounded">
                      Road Facade
                    </span>
                  )}
                </div>
                <span className="text-[12px] font-semibold text-[var(--text-1)] tabular-nums">
                  Score {ent.score.toFixed(0)}
                </span>
              </div>
              <p className="text-[12px] text-[var(--text-2)] leading-normal pl-7">
                {ent.vastu_rationale}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 3x3 Mandala Grid */}
      <div className="space-y-2 pt-1">
        <div className="flex justify-between items-center text-[11px] text-[var(--text-3)]">
          <span className="font-semibold uppercase tracking-[0.08em]">
            3×3 Spatial Placement Grid
          </span>
          <span>Click cell for details</span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 bg-[var(--fill)] p-1.5 rounded-[12px]">
          {quadrantOrder.map((quad) => {
            const zone = gridMap.get(quad);
            const isSelected = selectedZone?.zone === quad;

            return (
              <button
                key={quad}
                type="button"
                onClick={() => zone && setSelectedZone(zone)}
                className={`p-2 rounded-[8px] text-left transition-all min-h-[64px] flex flex-col justify-between select-none cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'bg-[var(--card-bg-subtle)] hover:bg-[var(--fill)] border border-[var(--panel-border-color)] text-[var(--text-1)]'
                }`}
              >
                <div className="flex justify-between items-center w-full min-w-0">
                  <span className="font-bold text-[11px] opacity-80 shrink-0">{quad}</span>
                  {zone?.zone_name && (
                    <span className="text-[8px] uppercase opacity-60 break-words leading-none text-right">
                      {zone.zone === 'Center' ? 'Brahma' : zone.zone_name}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium leading-[1.2] break-words mt-1 block">
                  {zone?.primary_room ?? quad}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Zone Details */}
        {selectedZone && (
          <div className="p-3 bg-[var(--fill)] rounded-[10px] space-y-1.5 text-[12px] text-[var(--text-1)]">
            <div className="flex justify-between items-center font-semibold text-[13px]">
              <span>{selectedZone.zone} ({selectedZone.zone_name})</span>
              <button
                type="button"
                onClick={() => setSelectedZone(null)}
                className="text-[var(--text-3)] hover:text-[var(--text-1)] p-0.5 cursor-pointer"
                aria-label="Close zone details"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
            <p className="text-[12px] text-[var(--text-2)]">
              <strong className="text-[var(--text-1)]">Primary:</strong> {selectedZone.primary_room}
              {selectedZone.alternative_room && (
                <span> • <strong className="text-[var(--text-1)]">Alt:</strong> {selectedZone.alternative_room}</span>
              )}
            </p>
            {selectedZone.prohibited && selectedZone.prohibited.length > 0 && (
              <p className="text-[12px] text-[var(--text-2)]">
                <strong className="text-[var(--semantic-red)]">Avoid:</strong> {selectedZone.prohibited.join(', ')}
              </p>
            )}
            <p className="text-[11px] text-[var(--text-3)] leading-relaxed pt-0.5">
              {selectedZone.civil_engineering_rationale || selectedZone.vastu_rationale}
            </p>
          </div>
        )}
      </div>

      {/* Slope Drainage Aspect */}
      <div className="p-3 bg-[var(--fill)] rounded-[10px] text-[12px] text-[var(--text-2)] space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">
            Drainage Aspect
          </span>
          <span className="font-medium text-[var(--text-1)]">
            {slope_reading.drainage_direction} ({slope_reading.auspiciousness})
          </span>
        </div>
        <p className="text-[12px] leading-relaxed">{slope_reading.rationale}</p>
      </div>

      {/* Reconciliation Notes */}
      {reconciliation_notes && reconciliation_notes.length > 0 && (
        <div className="space-y-2 pt-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] block">
            Vastu & Building Physics Reconciliation
          </span>
          <div className="space-y-2">
            {reconciliation_notes.map((item, idx) => (
              <div key={idx} className="p-2.5 bg-[var(--fill)] rounded-[8px] space-y-1 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--text-1)] text-[12px]">{item.topic}</span>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
                      item.status === 'concordant'
                        ? 'bg-[var(--semantic-green)]/15 text-[var(--semantic-green)]'
                        : 'bg-[var(--semantic-amber)]/15 text-[var(--semantic-amber)]'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-2)] leading-relaxed">
                  {item.recommended_synthesis}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
