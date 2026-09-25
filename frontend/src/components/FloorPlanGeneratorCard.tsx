import React, { useState, useEffect, useRef } from 'react';
import type { FloorPlanRequest, FloorPlanResponse } from '../services/types';
import { generateFloorPlan } from '../services/api';
import { BlueprintViewer } from './BlueprintViewer';
import { Icon } from './Icon';

interface FloorPlanGeneratorCardProps {
  defaultWidthM?: number;
  defaultDepthM?: number;
  onFloorPlanGenerated?: (plan: FloorPlanResponse) => void;
  activeFloorPlan?: FloorPlanResponse | null;
  buildingTypology?: string;
  qualityGrade?: string;
  floors?: number;
  builtUpAreaSqft?: number;
  groundCoverageRatio?: number;
  clientNotes?: string;
  aiProvider?: string;
  solarAxisDegrees?: number;
  prevailingWindDirectionDegrees?: number;
  topVastuEntrances?: string[];
}

interface RoomOption {
  id: string;
  label: string;
  required: boolean;
  isCore?: boolean;
}

export type CanonicalTypology = 'T1_SINGLE_FAMILY' | 'T2_FAMILY_APARTMENT' | 'T3_LARGE_COMPLEX' | 'T4_WAREHOUSE';

export const TYPOLOGY_LABELS: Record<CanonicalTypology, string> = {
  T1_SINGLE_FAMILY: 'Single-Family Residence (T1)',
  T2_FAMILY_APARTMENT: 'Family Apartment (T2)',
  T3_LARGE_COMPLEX: 'Large Commercial Complex (T3)',
  T4_WAREHOUSE: 'Warehouse & Logistics (T4)',
};

export const TYPOLOGY_ROOM_CATALOGS: Record<CanonicalTypology, RoomOption[]> = {
  T1_SINGLE_FAMILY: [
    { id: 'master_bed', label: 'Master Bedroom (SW)', required: true },
    { id: 'kitchen', label: 'Kitchen (SE)', required: true },
    { id: 'living', label: 'Living Room (N/NE)', required: true },
    { id: 'puja', label: 'Puja Room (NE)', required: false },
    { id: 'bath_1', label: 'Primary Bath (W)', required: true },
    { id: 'bath_2', label: 'Common Bath (NW)', required: false },
    { id: 'bed_2', label: 'Bedroom 2 (NW)', required: false },
    { id: 'dining', label: 'Dining Area (W)', required: false },
    { id: 'stairs', label: 'Staircase Core (SW/W)', required: false, isCore: true },
    { id: 'balcony', label: 'Balcony (N/E)', required: false },
    { id: 'study', label: 'Study / Office (NE)', required: false },
    { id: 'utility', label: 'Utility / Store (SE)', required: false },
  ],
  T2_FAMILY_APARTMENT: [
    { id: 'staircase_core', label: 'Common Stair Core', required: true, isCore: true },
    { id: 'lift_core', label: 'Passenger Lift Core', required: false, isCore: true },
    { id: 'lobby', label: 'Central Floor Lobby', required: true },
    { id: 'apt_a_living', label: 'Unit A Living Room', required: true },
    { id: 'apt_a_kitchen', label: 'Unit A Kitchen (SE)', required: true },
    { id: 'apt_a_bed', label: 'Unit A Master Bed (SW)', required: true },
    { id: 'apt_a_bath', label: 'Unit A Bathroom (W)', required: true },
    { id: 'apt_b_living', label: 'Unit B Living Room', required: false },
    { id: 'apt_b_kitchen', label: 'Unit B Kitchen', required: false },
    { id: 'apt_b_bed', label: 'Unit B Bedroom', required: false },
    { id: 'apt_b_bath', label: 'Unit B Bathroom', required: false },
    { id: 'apt_balcony', label: 'Apartment Balcony', required: false },
  ],
  T3_LARGE_COMPLEX: [
    { id: 'fire_stair_1', label: 'Fire Stair Core 1', required: true, isCore: true },
    { id: 'fire_stair_2', label: 'Fire Exit Stair 2', required: false, isCore: true },
    { id: 'lift_bank', label: 'Dual Lift Bank & Lobby', required: true, isCore: true },
    { id: 'corridor', label: '1.5m Spine Corridor', required: true },
    { id: 'commercial_suite_a', label: 'Commercial Suite A', required: true },
    { id: 'commercial_suite_b', label: 'Commercial Suite B', required: false },
    { id: 'commercial_suite_c', label: 'Commercial Suite C', required: false },
    { id: 'restroom_block', label: 'Public Restrooms (M/F)', required: true },
    { id: 'mep_room', label: 'MEP & Service Room', required: false },
  ],
  T4_WAREHOUSE: [
    { id: 'storage_bay', label: 'Clear-Span Storage Bay', required: true },
    { id: 'loading_dock', label: 'Loading Dock Shutter', required: true },
    { id: 'dispatch_buffer', label: 'Dispatch Buffer Area', required: true },
    { id: 'staff_amenities', label: 'Staff Locker & WC', required: false },
    { id: 'steel_stair', label: 'Industrial Steel Stair', required: false, isCore: true },
    { id: 'mezzanine_office', label: 'Mezzanine Admin Office', required: false },
    { id: 'conference_room', label: 'Conference Room', required: false },
    { id: 'catwalk', label: 'Inspection Catwalk', required: false },
  ],
};

export function normalizeTypology(raw?: string): CanonicalTypology {
  if (!raw) return 'T1_SINGLE_FAMILY';
  const t = raw.toLowerCase().trim();
  if (t.includes('t2') || t.includes('apartment') || t.includes('multi') || t.includes('duplex') || t.includes('builder_floor')) {
    return 'T2_FAMILY_APARTMENT';
  }
  if (t.includes('t3') || t.includes('complex') || t.includes('commercial') || t.includes('office') || t.includes('mixed')) {
    return 'T3_LARGE_COMPLEX';
  }
  if (t.includes('t4') || t.includes('warehouse') || t.includes('industrial') || t.includes('logistics') || t.includes('shed') || t.includes('factory')) {
    return 'T4_WAREHOUSE';
  }
  return 'T1_SINGLE_FAMILY';
}

export const FloorPlanGeneratorCard: React.FC<FloorPlanGeneratorCardProps> = ({
  defaultWidthM = 10.0,
  defaultDepthM = 12.0,
  onFloorPlanGenerated,
  activeFloorPlan = null,
  buildingTypology,
  qualityGrade,
  floors = 1,
  builtUpAreaSqft,
  groundCoverageRatio,
  clientNotes,
  aiProvider,
  solarAxisDegrees,
  prevailingWindDirectionDegrees,
  topVastuEntrances,
}) => {
  const [userWidth, setUserWidth] = useState<number | null>(null);
  const [userDepth, setUserDepth] = useState<number | null>(null);
  const plotWidth = userWidth ?? defaultWidthM;
  const plotDepth = userDepth ?? defaultDepthM;

  const canonicalTypology = normalizeTypology(buildingTypology);
  const availableRooms = TYPOLOGY_ROOM_CATALOGS[canonicalTypology] || TYPOLOGY_ROOM_CATALOGS.T1_SINGLE_FAMILY;

  // Initialize selected rooms
  const [selectedRooms, setSelectedRooms] = useState<string[]>(() => {
    return availableRooms
      .filter((r) => r.required || ((floors || 1) >= 2 && r.isCore))
      .map((r) => r.id);
  });

  const prevTypologyRef = useRef<string>(canonicalTypology);
  const prevFloorsRef = useRef<number>(floors || 1);

  // Dynamically adapt selected rooms when Typology or Floors changes
  useEffect(() => {
    const isTypologyChanged = prevTypologyRef.current !== canonicalTypology;
    const isFloorsChanged = prevFloorsRef.current !== (floors || 1);

    if (isTypologyChanged || isFloorsChanged) {
      prevTypologyRef.current = canonicalTypology;
      prevFloorsRef.current = floors || 1;

      const currentRoomIds = new Set(availableRooms.map((r) => r.id));
      const hasValidRooms = selectedRooms.some((r) => currentRoomIds.has(r));

      if (isTypologyChanged || !hasValidRooms) {
        // Switch to sensible default selection for the newly selected typology
        const defaultSelection = availableRooms
          .filter((r) => r.required || ((floors || 1) >= 2 && r.isCore))
          .map((r) => r.id);

        setSelectedRooms(defaultSelection.length >= 3 ? defaultSelection : availableRooms.slice(0, 4).map((r) => r.id));
      } else if (isFloorsChanged && (floors || 1) >= 2) {
        // Auto-include vertical core rooms if multiple storeys requested
        const coreRooms = availableRooms.filter((r) => r.isCore).map((r) => r.id);
        setSelectedRooms((prev) => Array.from(new Set([...prev, ...coreRooms])));
      }
    }
  }, [canonicalTypology, floors, availableRooms, selectedRooms]);

  const [strictness, setStrictness] = useState<'high' | 'medium' | 'low'>('high');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [localFloorPlan, setLocalFloorPlan] = useState<FloorPlanResponse | null>(null);
  const floorPlan = localFloorPlan ?? activeFloorPlan;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Synchronize when parent activeFloorPlan changes
  useEffect(() => {
    if (activeFloorPlan !== undefined) {
      setLocalFloorPlan(activeFloorPlan);
    }
  }, [activeFloorPlan]);

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
      building_typology: buildingTypology,
      quality_grade: qualityGrade,
      floors: floors,
      built_up_area_sqft: builtUpAreaSqft,
      ground_coverage_ratio: groundCoverageRatio,
      client_notes: clientNotes,
      ai_provider: aiProvider,
      solar_axis_degrees: solarAxisDegrees,
      prevailing_wind_direction_degrees: prevailingWindDirectionDegrees,
      top_vastu_entrances: topVastuEntrances,
      bypass_cache: true,
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
    <div className="rounded-[14px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-4 space-y-3.5 w-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="blueprint" size={15} className="text-[var(--text-2)] shrink-0" />
          <h3 className="text-[14px] font-semibold text-[var(--text-1)] tracking-tight">
            Generative Floor Plan Engine
          </h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {floors && floors > 1 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
              {floors} STOREYS
            </span>
          )}
          {floorPlan && (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[var(--fill)] text-[var(--text-1)] capitalize shrink-0">
              {floorPlan.status}
            </span>
          )}
        </div>
      </div>

      {/* Error Notice */}
      {errorMessage && (
        <div className="p-2.5 rounded-[10px] bg-[var(--fill)] text-[12px] text-[var(--semantic-red)] flex items-center gap-2">
          <Icon name="alert-triangle" size={14} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Dimensions & Strictness */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
        {/* Plot Dimensions */}
        <div className="space-y-1 min-w-0">
          <label className="text-[12px] font-normal text-[var(--text-3)] block">
            Plot dimensions (meters)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] text-[var(--text-3)] block mb-0.5">Width (m)</span>
              <input
                type="number"
                min="6"
                max="60"
                step="0.5"
                value={plotWidth}
                onChange={(e) => setUserWidth(parseFloat(e.target.value) || 10)}
                className="w-full h-8 bg-[var(--fill)] border-0 rounded-[8px] px-2.5 text-[12px] font-mono text-[var(--text-1)] outline-none focus:ring-[2px] focus:ring-[var(--accent)]/30"
              />
            </div>
            <div>
              <span className="text-[11px] text-[var(--text-3)] block mb-0.5">Depth (m)</span>
              <input
                type="number"
                min="6"
                max="60"
                step="0.5"
                value={plotDepth}
                onChange={(e) => setUserDepth(parseFloat(e.target.value) || 12)}
                className="w-full h-8 bg-[var(--fill)] border-0 rounded-[8px] px-2.5 text-[12px] font-mono text-[var(--text-1)] outline-none focus:ring-[2px] focus:ring-[var(--accent)]/30"
              />
            </div>
          </div>
        </div>

        {/* Vastu Strictness: iOS Segmented Control */}
        <div className="space-y-1 min-w-0">
          <label className="text-[12px] font-normal text-[var(--text-3)] block">
            Vastu strictness
          </label>
          <div className="bg-[var(--fill)] rounded-[10px] p-[2px] grid grid-cols-3 gap-1">
            {(['high', 'medium', 'low'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setStrictness(lvl)}
                className={`py-1 px-2 rounded-[8px] text-[12px] font-medium capitalize text-center transition-all ${
                  strictness === lvl
                    ? 'bg-[var(--segmented-active-bg)] shadow-[var(--segmented-active-shadow)] font-semibold'
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
              ? 'Balanced plumbing and secondary zones.'
              : 'Soft Vastu scoring for compact footprints.'}
          </span>
        </div>
      </div>

      {/* Dynamic Typology Room Selection */}
      <div className="space-y-1.5 min-w-0">
        <div className="flex items-center justify-between text-[12px] text-[var(--text-3)] flex-wrap gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-[var(--text-1)] truncate">
              {TYPOLOGY_LABELS[canonicalTypology]}
            </span>
            <span className="text-[11px] font-mono">
              ({selectedRooms.length} selected)
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            {floors && floors > 1 ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                Vertical cores anchor-locked
              </span>
            ) : (
              <span>Min 3 required</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {availableRooms.map((room) => {
            const isChecked = selectedRooms.includes(room.id);
            const isVerticalCore = Boolean(room.isCore);
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => toggleRoom(room.id)}
                className={`p-2 rounded-[8px] text-left text-[12px] flex items-center justify-between gap-1.5 transition-all cursor-pointer ${
                  isChecked
                    ? isVerticalCore
                      ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 font-semibold ring-1 ring-purple-500/30'
                      : 'bg-[var(--accent-tint)] text-[var(--accent)] font-semibold'
                    : 'bg-[var(--fill)] text-[var(--text-2)] hover:text-[var(--text-1)]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 ${
                      isChecked
                        ? isVerticalCore
                          ? 'border-purple-600 bg-purple-600 text-white'
                          : 'border-[var(--accent)] bg-[var(--accent)] text-white'
                        : 'border-[var(--hairline)] bg-transparent'
                    }`}
                  >
                    {isChecked && <Icon name="check" size={10} />}
                  </div>
                  <span className="leading-tight break-words truncate">{room.label}</span>
                </div>
                {isVerticalCore && (
                  <span
                    className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase shrink-0 ${
                      isChecked
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                    }`}
                  >
                    Core
                  </span>
                )}
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
        className="w-full h-9 px-4 rounded-full bg-[var(--accent)] hover:brightness-[0.98] active:brightness-95 disabled:bg-[var(--fill)] disabled:text-[var(--text-3)] text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition-all select-none shadow-sm cursor-pointer disabled:cursor-not-allowed"
      >
        {isGenerating ? (
          <>
            <Icon name="loader" size={14} className="animate-spin" />
            <span>Solving Spatial Layout...</span>
          </>
        ) : (
          <>
            <Icon name="blueprint" size={14} />
            <span>
              {floors && floors > 1
                ? `Generate ${floors}-Storey Architectural Blueprint`
                : 'Generate Architectural Blueprint'}
            </span>
          </>
        )}
      </button>

      {/* Blueprint & Metrics Display */}
      {floorPlan && (
        <div className="space-y-3 pt-1">
          {/* Multi-Storey Stacking Verification Callout */}
          {floorPlan.multi_storey && (
            <div className="rounded-[10px] bg-purple-500/10 border border-purple-500/25 p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Icon name="layers" size={14} className="text-purple-600 dark:text-purple-400" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                    CF-HSA Multi-Storey Core Alignment
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-600 text-white select-none">
                  {floorPlan.multi_storey.total_storeys} STOREYS VERIFIED
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="bg-[var(--fill)]/50 rounded-[6px] p-1.5 text-center">
                  <span className="text-[var(--text-3)] block text-[10px]">Anchor Cores</span>
                  <span className="font-semibold font-mono text-[var(--text-1)]">
                    {floorPlan.multi_storey.vertical_cores.length} locked (X,Y)
                  </span>
                </div>
                <div className="bg-[var(--fill)]/50 rounded-[6px] p-1.5 text-center">
                  <span className="text-[var(--text-3)] block text-[10px]">Wet Stacks</span>
                  <span className="font-semibold font-mono text-[var(--text-1)]">
                    {floorPlan.multi_storey.duct_shafts.length} MEP shafts
                  </span>
                </div>
                <div className="bg-[var(--fill)]/50 rounded-[6px] p-1.5 text-center">
                  <span className="text-[var(--text-3)] block text-[10px]">Total Built-Up</span>
                  <span className="font-semibold font-mono text-[var(--text-1)]">
                    {floorPlan.multi_storey.total_built_up_area_sqm.toFixed(1)} m²
                  </span>
                </div>
                <div className="bg-[var(--fill)]/50 rounded-[6px] p-1.5 text-center">
                  <span className="text-[var(--text-3)] block text-[10px]">Ghost Overlay</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Active on F1+
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Design Brief Accent-tinted Callout */}
          <div className="rounded-[10px] bg-[var(--accent-tint)] border border-[var(--accent)]/20 p-3 space-y-1.5">
            <div className="flex items-center justify-between flex-wrap gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--accent)]">
                Design Brief
              </span>
              <div className="flex items-center gap-1.5">
                {floorPlan.qa?.critic && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold select-none ${
                      floorPlan.qa.critic === 'pass'
                        ? 'bg-emerald-600 text-white'
                        : floorPlan.qa.critic === 'skipped'
                        ? 'bg-[var(--fill)] text-[var(--text-2)] border border-[var(--hairline)]'
                        : 'bg-rose-600 text-white'
                    }`}
                  >
                    {floorPlan.qa.critic === 'pass'
                      ? 'Architect review: passed'
                      : floorPlan.qa.critic === 'skipped'
                      ? 'Architect review: skipped'
                      : 'Architect review: flagged'}
                  </span>
                )}
                {floorPlan.placement_source && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold select-none ${
                      floorPlan.placement_source.includes('ai') || floorPlan.placement_source.includes('llm')
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--fill)] text-[var(--text-2)] border border-[var(--hairline)]'
                    }`}
                  >
                    {floorPlan.placement_source.includes('ai') || floorPlan.placement_source.includes('llm')
                      ? 'Placement: AI-reasoned + KB-validated'
                      : 'Placement: KB-standard'}
                  </span>
                )}
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold select-none ${
                    floorPlan.program_source === 'llm' || floorPlan.program_source === 'cache'
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--fill)] text-[var(--text-2)] border border-[var(--hairline)]'
                  }`}
                >
                  {floorPlan.program_source === 'llm' || floorPlan.program_source === 'cache'
                    ? 'Program: AI-generated'
                    : 'Program: Standard'}
                </span>
              </div>
            </div>
            <p className="text-[12px] italic text-[var(--text-1)] leading-relaxed">
              {floorPlan.design_intent ||
                'Space plan optimized for functional circulation, Vastu compliance, and plumbing consolidation.'}
            </p>
            {(() => {
              const logicList: { room?: string; text: string }[] = [];
              if (Array.isArray(floorPlan.placement_logic)) {
                floorPlan.placement_logic.forEach((item: any) => {
                  logicList.push({ text: String(item) });
                });
              } else if (floorPlan.placement_logic && typeof floorPlan.placement_logic === 'object') {
                Object.entries(floorPlan.placement_logic).forEach(([room, text]) => {
                  logicList.push({ room, text: String(text) });
                });
              }
              if (logicList.length === 0) return null;
              return (
                <details className="mt-2 text-[12px] group">
                  <summary className="cursor-pointer text-[11px] font-medium text-[var(--accent)] hover:underline select-none flex items-center gap-1">
                    <span>Placement Logic ({logicList.length} rules applied)</span>
                  </summary>
                  <ul className="mt-1.5 space-y-1 pl-4 list-disc text-[11px] text-[var(--text-1)]">
                    {logicList.map((item, idx) => (
                      <li key={idx} className="leading-snug">
                        {item.room && <span className="font-semibold capitalize mr-1">{item.room.replace('_', ' ')}:</span>}
                        {item.text}
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })()}
          </div>

          {/* Key-Value Metrics Rows */}
          <div className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
            <div className="h-10 flex items-center justify-between px-0.5">
              <span className="text-[13px] font-normal text-[var(--text-2)]">Vastu compliance</span>
              <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
                {floorPlan.metrics.vastu_compliance_pct.toFixed(0)}%
              </span>
            </div>
            <div className="h-10 flex items-center justify-between px-0.5">
              <span className="text-[13px] font-normal text-[var(--text-2)]">Plumbing adjacency efficiency</span>
              <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
                {floorPlan.metrics.plumbing_adjacency_score.toFixed(0)}%
              </span>
            </div>
            <div className="h-10 flex items-center justify-between px-0.5">
              <span className="text-[13px] font-normal text-[var(--text-2)]">Space utilization</span>
              <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
                {floorPlan.metrics.space_utilization_pct.toFixed(0)}%
              </span>
            </div>
            <div className="h-10 flex items-center justify-between px-0.5">
              <span className="text-[13px] font-normal text-[var(--text-2)]">Plot coverage ratio</span>
              <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
                {floorPlan.metrics.plot_coverage_pct ? `${floorPlan.metrics.plot_coverage_pct.toFixed(0)}%` : '—'}
              </span>
            </div>
            <div className="h-10 flex items-center justify-between px-0.5">
              <span className="text-[13px] font-normal text-[var(--text-2)]">Circulation</span>
              <span className="text-[13px] font-semibold text-emerald-600 dark:text-emerald-400 capitalize tabular-nums whitespace-nowrap">
                {floorPlan.metrics.circulation_status || floorPlan.qa?.circulation || 'Connected'}
              </span>
            </div>
            {floorPlan.qa && (
              <>
                <div className="h-10 flex items-center justify-between px-0.5">
                  <span className="text-[13px] font-normal text-[var(--text-2)]">Solver QA gate</span>
                  <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
                    {floorPlan.qa.violations === 0 ? 'Passed (0 violations)' : `${floorPlan.qa.violations} violations`}
                  </span>
                </div>
                {floorPlan.qa.critic && (
                  <div className="h-10 flex items-center justify-between px-0.5">
                    <span className="text-[13px] font-normal text-[var(--text-2)]">Architect review</span>
                    <span className={`text-[13px] font-semibold tabular-nums whitespace-nowrap capitalize ${
                      floorPlan.qa.critic === 'pass'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : floorPlan.qa.critic === 'skipped'
                        ? 'text-[var(--text-2)]'
                        : 'text-rose-600'
                    }`}>
                      {floorPlan.qa.critic === 'pass' ? 'Passed' : floorPlan.qa.critic}
                    </span>
                  </div>
                )}
              </>
            )}
            <div className="h-10 flex items-center justify-between px-0.5">
              <span className="text-[13px] font-normal text-[var(--text-2)]">Engine latency</span>
              <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
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
            multiStorey={floorPlan.multi_storey}
          />
        </div>
      )}
    </div>
  );
};

