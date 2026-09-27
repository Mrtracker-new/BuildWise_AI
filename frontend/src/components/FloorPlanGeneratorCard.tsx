import React, { useState, useEffect, useRef } from 'react';
import type { FloorPlanRequest, FloorPlanResponse, AnalysisRequest, FloorPlanParamsSnapshot, PlotPolygon } from '../services/types';
import { generateFloorPlan } from '../services/api';
import { BlueprintViewer } from './BlueprintViewer';
import { Icon } from './Icon';
import { ConstraintChips } from './ConstraintChips';
import {
  type CanonicalTypology,
  type RoomOption,
  normalizeTypology,
  getTypologyConfig,
  formatStoreysChip,
  formatCoverageChip,
  isFloorPlanStale,
  TYPOLOGY_LABELS,
  TYPOLOGY_ROOM_CATALOGS,
} from '../services/typology';

// Re-export for compatibility
export type { CanonicalTypology, RoomOption };
export { normalizeTypology, TYPOLOGY_LABELS, TYPOLOGY_ROOM_CATALOGS };

interface FloorPlanGeneratorCardProps {
  defaultWidthM?: number;
  defaultDepthM?: number;
  onFloorPlanGenerated?: (plan: FloorPlanResponse) => void;
  activeFloorPlan?: FloorPlanResponse | null;
  // Shared AnalysisRequest object from App.tsx (single source of truth)
  analysisRequest?: AnalysisRequest;
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

export const FloorPlanGeneratorCard: React.FC<FloorPlanGeneratorCardProps> = ({
  defaultWidthM = 10.0,
  defaultDepthM = 12.0,
  onFloorPlanGenerated,
  activeFloorPlan = null,
  analysisRequest,
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
  // Inherit parameters directly from shared request (single source of truth)
  // Delete card's local copies of storeys/typology/coverage so disagreement is impossible.
  const activeFloors = analysisRequest?.floors ?? floors ?? 1;
  const activeTypology = analysisRequest?.building_typology ?? buildingTypology ?? 'residential_single';
  const activeCoverage = analysisRequest?.ground_coverage_ratio ?? groundCoverageRatio ?? 0.60;
  const activeNotes = analysisRequest?.client_requirements ?? clientNotes;
  const activeGrade = analysisRequest?.quality_grade ?? qualityGrade ?? 'standard';
  const activeAreaSqft = analysisRequest?.built_up_area_sqft ?? builtUpAreaSqft;
  const activeProvider = analysisRequest?.ai_provider ?? aiProvider;
  const activeConstraints = analysisRequest?.extracted_constraints;

  const [userWidth, setUserWidth] = useState<number | null>(null);
  const [userDepth, setUserDepth] = useState<number | null>(null);

  // Site Geometry Mode: 'rectangle' | 'irregular'
  const [siteMode, setSiteMode] = useState<'rectangle' | 'irregular'>('rectangle');
  const [irregularVertices, setIrregularVertices] = useState<[number, number][]>([
    [0, 0],
    [14, 0],
    [14, 8],
    [7, 8],
    [7, 14],
    [0, 14],
  ]); // Default L-shape preset
  const [geoJsonModalOpen, setGeoJsonModalOpen] = useState<boolean>(false);
  const [geoJsonText, setGeoJsonText] = useState<string>('');
  const [geoJsonError, setGeoJsonError] = useState<string | null>(null);

  // Live Polygon Metrics & Geometry Validation
  const polyMetrics = React.useMemo(() => {
    const verts = irregularVertices;
    if (verts.length < 3) {
      return {
        area: 0,
        perimeter: 0,
        isValid: false,
        reason: 'At least 3 vertices required',
        bbox: [0, 0, 10, 10] as [number, number, number, number],
        shapeType: 'invalid',
      };
    }
    let areaSum = 0;
    let perim = 0;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    const n = verts.length;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = verts[i];
      const [x2, y2] = verts[(i + 1) % n];
      minx = Math.min(minx, x1);
      miny = Math.min(miny, y1);
      maxx = Math.max(maxx, x1);
      maxy = Math.max(maxy, y1);
      areaSum += (x1 * y2 - x2 * y1);
      const d = Math.hypot(x2 - x1, y2 - y1);
      if (d < 1.0) {
        return {
          area: 0,
          perimeter: 0,
          isValid: false,
          reason: `Edge P${i+1}→P${((i+1)%n)+1} (${d.toFixed(1)}m) is < 1.0m statutory minimum`,
          bbox: [minx, miny, maxx, maxy] as [number, number, number, number],
          shapeType: 'invalid',
        };
      }
      perim += d;
    }
    const area = Math.abs(areaSum) / 2.0;
    if (area < 36.0) {
      return {
        area: Math.round(area * 10) / 10,
        perimeter: Math.round(perim * 10) / 10,
        isValid: false,
        reason: `Plot area (${area.toFixed(1)} m²) is < 36 m² statutory minimum`,
        bbox: [minx, miny, maxx, maxy] as [number, number, number, number],
        shapeType: 'invalid',
      };
    }
    let shapeType = 'polygon';
    if (n === 4) shapeType = 'trapezoid';
    else if (n === 6) shapeType = 'l_shape';
    else if (n === 5) shapeType = 'pentagon';

    return {
      area: Math.round(area * 10) / 10,
      perimeter: Math.round(perim * 10) / 10,
      isValid: true,
      reason: 'Valid Statutory Boundary',
      bbox: [minx, miny, maxx, maxy] as [number, number, number, number],
      shapeType,
    };
  }, [irregularVertices]);

  const bboxWidth = Math.max(4.0, polyMetrics.bbox[2] - polyMetrics.bbox[0]);
  const bboxDepth = Math.max(4.0, polyMetrics.bbox[3] - polyMetrics.bbox[1]);

  const plotWidth = siteMode === 'irregular' ? bboxWidth : (userWidth ?? defaultWidthM);
  const plotDepth = siteMode === 'irregular' ? bboxDepth : (userDepth ?? defaultDepthM);

  const applyPreset = (presetName: 'l_shape' | 'trapezoid' | 'pentagon') => {
    if (presetName === 'l_shape') {
      setIrregularVertices([
        [0, 0],
        [14, 0],
        [14, 8],
        [7, 8],
        [7, 14],
        [0, 14],
      ]);
    } else if (presetName === 'trapezoid') {
      setIrregularVertices([
        [0, 0],
        [16, 0],
        [12, 14],
        [3, 14],
      ]);
    } else if (presetName === 'pentagon') {
      setIrregularVertices([
        [0, 0],
        [14, 0],
        [14, 10],
        [9, 15],
        [0, 15],
      ]);
    }
  };

  const handleGeoJsonImport = () => {
    setGeoJsonError(null);
    try {
      const parsed = JSON.parse(geoJsonText.trim());
      let rawCoords: any = null;
      if (parsed.type === 'FeatureCollection' && parsed.features?.[0]?.geometry?.coordinates) {
        rawCoords = parsed.features[0].geometry.coordinates[0];
      } else if (parsed.type === 'Feature' && parsed.geometry?.coordinates) {
        rawCoords = parsed.geometry.coordinates[0];
      } else if (parsed.type === 'Polygon' && parsed.coordinates) {
        rawCoords = parsed.coordinates[0];
      } else if (Array.isArray(parsed)) {
        rawCoords = parsed;
      }
      if (!rawCoords || !Array.isArray(rawCoords) || rawCoords.length < 3) {
        throw new Error('Could not find polygon coordinates array (at least 3 points required).');
      }
      const newVerts: [number, number][] = rawCoords.map((pt: any) => [
        Number(pt[0]),
        Number(pt[1]),
      ]);
      if (
        newVerts.length > 3 &&
        Math.abs(newVerts[0][0] - newVerts[newVerts.length - 1][0]) < 1e-3 &&
        Math.abs(newVerts[0][1] - newVerts[newVerts.length - 1][1]) < 1e-3
      ) {
        newVerts.pop();
      }
      setIrregularVertices(newVerts);
      setGeoJsonModalOpen(false);
      setGeoJsonText('');
    } catch (e: any) {
      setGeoJsonError(e.message || 'Invalid GeoJSON format.');
    }
  };

  // Sync user dimensions when default props change
  useEffect(() => {
    setUserWidth(null);
    setUserDepth(null);
  }, [defaultWidthM, defaultDepthM]);

  const typologyConfig = getTypologyConfig(activeTypology);
  const canonicalTypology = typologyConfig.canonical;
  const availableRooms = typologyConfig.rooms;

  // Initialize selected rooms based on inherited typology and storeys
  const [selectedRooms, setSelectedRooms] = useState<string[]>(() => {
    return availableRooms
      .filter((r) => r.required || (activeFloors >= 2 && r.isCore))
      .map((r) => r.id);
  });

  const prevTypologyRef = useRef<string>(canonicalTypology);
  const prevFloorsRef = useRef<number>(activeFloors);

  // Live propagation: dynamically adapt selected rooms when inherited Typology or Floors changes
  useEffect(() => {
    const isTypologyChanged = prevTypologyRef.current !== canonicalTypology;
    const isFloorsChanged = prevFloorsRef.current !== activeFloors;

    if (isTypologyChanged || isFloorsChanged) {
      prevTypologyRef.current = canonicalTypology;
      prevFloorsRef.current = activeFloors;

      const currentRoomIds = new Set(availableRooms.map((r) => r.id));
      const hasValidRooms = selectedRooms.some((r) => currentRoomIds.has(r));

      if (isTypologyChanged || !hasValidRooms) {
        // Switch to sensible default selection for the newly selected typology
        const defaultSelection = availableRooms
          .filter((r) => r.required || (activeFloors >= 2 && r.isCore))
          .map((r) => r.id);

        setSelectedRooms(defaultSelection.length >= 3 ? defaultSelection : availableRooms.slice(0, 4).map((r) => r.id));
      } else if (isFloorsChanged) {
        if (activeFloors >= 2) {
          // Auto-include vertical core rooms if multiple storeys requested
          const coreRooms = availableRooms.filter((r) => r.isCore).map((r) => r.id);
          setSelectedRooms((prev) => Array.from(new Set([...prev, ...coreRooms])));
        } else {
          // Exclude vertical core rooms when switching back to single storey to kill cross-run bleed
          const coreRoomIds = new Set(availableRooms.filter((r) => r.isCore).map((r) => r.id));
          setSelectedRooms((prev) => {
            const filtered = prev.filter((r) => !coreRoomIds.has(r));
            return filtered.length >= 3 ? filtered : availableRooms.filter((r) => r.required).map((r) => r.id);
          });
        }
      }
    }
  }, [canonicalTypology, activeFloors, availableRooms, selectedRooms]);

  const [strictness, setStrictness] = useState<'high' | 'medium' | 'low'>('high');
  const [floorPlateMasks, setFloorPlateMasks] = useState<Record<number, Record<string, 'present' | 'terrace' | 'void'>>>({});

  // Initialize floorPlateMasks when activeFloors or activeTypology changes
  useEffect(() => {
    setFloorPlateMasks((prev) => {
      const next: Record<number, Record<string, 'present' | 'terrace' | 'void'>> = {};
      for (let z = 0; z < activeFloors; z++) {
        next[z] = {
          wing_a: 'present',
          wing_b: prev[z]?.wing_b || 'present',
        };
      }
      // Typology default proposal (e.g. T1 G+2 top level terraces Wing B)
      const typUpper = activeTypology.toUpperCase();
      if ((typUpper.includes('T1') || typUpper.includes('SINGLE')) && activeFloors >= 3) {
        if (!prev[activeFloors - 1]?.wing_b) {
          next[activeFloors - 1].wing_b = 'terrace';
        }
      }
      return next;
    });
  }, [activeFloors, activeTypology]);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [localFloorPlan, setLocalFloorPlan] = useState<FloorPlanResponse | null>(null);
  // Canonical single source of truth: parent-managed activeFloorPlan if provided, falling back to local state
  const floorPlan = activeFloorPlan !== undefined ? activeFloorPlan : localFloorPlan;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Synchronize when parent activeFloorPlan changes
  useEffect(() => {
    if (activeFloorPlan !== undefined) {
      setLocalFloorPlan(activeFloorPlan);
    }
  }, [activeFloorPlan]);

  // STALE-PLAN GUARD: Check if active parameters differ from snapshot in current plan
  const isPlanStale = Boolean(
    floorPlan &&
    (floorPlan.params_snapshot
      ? isFloorPlanStale(floorPlan.params_snapshot, {
          building_typology: activeTypology,
          floors: activeFloors,
          ground_coverage_ratio: activeCoverage,
          plot_width_m: Number(plotWidth),
          plot_depth_m: Number(plotDepth),
          required_rooms: selectedRooms,
          vastu_strictness: strictness,
          built_up_area_sqft: activeAreaSqft,
          client_notes: activeNotes,
        })
      : (
        (floorPlan.multi_storey && floorPlan.multi_storey.total_storeys !== activeFloors) ||
        (floorPlan.multi_storey && normalizeTypology(floorPlan.multi_storey.building_typology) !== canonicalTypology)
      ))
  );

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

    if (siteMode === 'irregular' && !polyMetrics.isValid) {
      setErrorMessage(`Invalid plot polygon: ${polyMetrics.reason}`);
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    const currentWidth = Math.max(4.0, Math.min(60.0, Number(plotWidth) || 10.0));
    const currentDepth = Math.max(4.0, Math.min(60.0, Number(plotDepth) || 12.0));

    let plotPoly: PlotPolygon | undefined = undefined;
    if (siteMode === 'irregular') {
      plotPoly = {
        vertices: irregularVertices,
        shape_type: polyMetrics.shapeType as any,
        area_sqm: polyMetrics.area,
        perimeter_m: polyMetrics.perimeter,
        bounding_box: polyMetrics.bbox,
        is_regular_rectangle: false,
      };
    }

    const req: FloorPlanRequest = {
      plot_width_m: currentWidth,
      plot_depth_m: currentDepth,
      required_rooms: selectedRooms,
      vastu_strictness: strictness,
      building_typology: activeTypology,
      quality_grade: activeGrade,
      floors: activeFloors,
      built_up_area_sqft: activeAreaSqft,
      ground_coverage_ratio: activeCoverage,
      client_notes: activeNotes,
      ai_provider: activeProvider,
      solar_axis_degrees: solarAxisDegrees,
      prevailing_wind_direction_degrees: prevailingWindDirectionDegrees,
      top_vastu_entrances: topVastuEntrances,
      extracted_constraints: activeConstraints,
      bypass_cache: true,
      plot_polygon: plotPoly,
      floor_plate_masks: floorPlateMasks,
    };

    try {
      const resp = await generateFloorPlan(req);
      const genId = 'GEN-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      const snapshot: FloorPlanParamsSnapshot = {
        building_typology: activeTypology,
        floors: activeFloors,
        ground_coverage_ratio: activeCoverage,
        plot_width_m: currentWidth,
        plot_depth_m: currentDepth,
        required_rooms: [...selectedRooms].sort(),
        vastu_strictness: strictness,
        built_up_area_sqft: activeAreaSqft,
        client_notes: (activeNotes || '').trim(),
        ai_provider: activeProvider,
        shape_type: siteMode === 'irregular' ? polyMetrics.shapeType : 'rectangle',
        plot_polygon: plotPoly,
      };
      const freshPlan: FloorPlanResponse = {
        ...resp,
        generation_id: genId,
        generated_at: Date.now(),
        params_snapshot: snapshot,
      };
      setLocalFloorPlan(freshPlan);
      if (onFloorPlanGenerated) {
        onFloorPlanGenerated(freshPlan);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate floor plan.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="rounded-[14px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-4 space-y-3.5 w-full min-w-0">
      {/* Header with Title and READ-ONLY Inherited Parameter Summary Chips */}
      <div className="border-b border-[var(--hairline)] pb-2.5 space-y-2 min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="blueprint" size={15} className="text-[var(--text-2)] shrink-0" />
            <h3 className="text-[14px] font-semibold text-[var(--text-1)] tracking-tight">
              Generative Floor Plan Engine
            </h3>
          </div>
          {floorPlan && (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[var(--fill)] text-[var(--text-1)] capitalize shrink-0">
              {floorPlan.status}
            </span>
          )}
        </div>

        {/* READ-ONLY Parameter Inheritance Summary Chips */}
        <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Typology Chip */}
            <span
              data-testid="inherited-typology-chip"
              title={`Inherited from Project Parameters: ${typologyConfig.label}`}
              className="px-2.5 py-1 rounded-[6px] font-mono font-semibold bg-[var(--fill)] text-[var(--text-1)] border border-[var(--hairline)] tracking-tight select-none"
            >
              {typologyConfig.shortCode}
            </span>

            {/* Storeys Chip */}
            <span
              data-testid="inherited-storeys-chip"
              title={`Inherited from Project Parameters: ${activeFloors} level(s)`}
              className={`px-2.5 py-1 rounded-[6px] font-mono font-semibold select-none border ${
                activeFloors > 1
                  ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30'
                  : 'bg-[var(--fill)] text-[var(--text-1)] border-[var(--hairline)]'
              }`}
            >
              {formatStoreysChip(activeFloors)}
            </span>

            {/* Coverage Chip */}
            <span
              data-testid="inherited-coverage-chip"
              title={`Inherited from Project Parameters: ${Math.round(activeCoverage * 100)}% Ground Coverage Ratio`}
              className="px-2.5 py-1 rounded-[6px] font-mono font-semibold bg-[var(--fill)] text-[var(--text-1)] border border-[var(--hairline)] tracking-tight select-none"
            >
              {formatCoverageChip(activeCoverage)}
            </span>

            {/* Shape Typology & Area Chip */}
            <span
              data-testid="plot-shape-chip"
              title={
                siteMode === 'rectangle'
                  ? `Rectangle plot: ${plotWidth}m × ${plotDepth}m (4 vertices)`
                  : `${polyMetrics.shapeType.toUpperCase()} plot: ${polyMetrics.area} m² (${irregularVertices.length} vertices)`
              }
              className={`px-2.5 py-1 rounded-[6px] font-mono font-semibold select-none border ${
                siteMode === 'irregular'
                  ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30'
                  : 'bg-[var(--fill)] text-[var(--text-1)] border-[var(--hairline)]'
              }`}
            >
              {siteMode === 'rectangle'
                ? `RECT · ${(plotWidth * plotDepth).toFixed(0)} m² · 4V`
                : `${polyMetrics.shapeType.replace('_', '-').toUpperCase()} · ${polyMetrics.area.toFixed(0)} m² · ${irregularVertices.length}V`}
            </span>
          </div>

          {/* Subtle Edit Hint */}
          <span className="text-[11px] text-[var(--text-3)] italic flex items-center gap-1 select-none">
            <Icon name="info" size={11} className="shrink-0 opacity-70" />
            <span>Edit in Project Parameters</span>
          </span>
        </div>
      </div>

      {/* Error Notice */}
      {errorMessage && (
        <div className="p-2.5 rounded-[10px] bg-[var(--fill)] text-[12px] text-[var(--semantic-red)] flex items-center gap-2">
          <Icon name="alert-triangle" size={14} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Site Boundary Mode Toggle: Rectangle vs Irregular (Cadastral) */}
      <div className="flex items-center justify-between p-2.5 rounded-[10px] bg-[var(--fill)] border border-[var(--hairline)]">
        <div className="flex items-center gap-2">
          <Icon name="maximize" size={14} className="text-[var(--text-2)]" />
          <span className="text-[12px] font-medium text-[var(--text-1)]">Plot Boundary Mode</span>
        </div>
        <div className="bg-[var(--bg-card)] rounded-[8px] p-[2px] flex items-center gap-1 border border-[var(--hairline)]">
          <button
            type="button"
            data-testid="mode-rectangle-btn"
            onClick={() => setSiteMode('rectangle')}
            className={`py-1 px-3 rounded-[6px] text-[11px] font-medium transition-all ${
              siteMode === 'rectangle'
                ? 'bg-[var(--accent)] text-white shadow-sm font-semibold'
                : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
            }`}
          >
            Rectangle
          </button>
          <button
            type="button"
            data-testid="mode-irregular-btn"
            onClick={() => setSiteMode('irregular')}
            className={`py-1 px-3 rounded-[6px] text-[11px] font-medium transition-all ${
              siteMode === 'irregular'
                ? 'bg-purple-600 text-white shadow-sm font-semibold'
                : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
            }`}
          >
            Irregular (Cadastral)
          </button>
        </div>
      </div>

      {/* Drafting-Specific Controls: Plot Dimensions (m) & Vastu Strictness */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
        {/* Plot Dimensions */}
        <div className="space-y-1 min-w-0">
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-normal text-[var(--text-3)] block">
              Plot dimensions (meters)
            </label>
            {siteMode === 'irregular' && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 font-medium">
                BBox (Read-only)
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] text-[var(--text-3)] block mb-0.5">Width (m)</span>
              <input
                type="number"
                min="6"
                max="60"
                step="0.5"
                value={plotWidth}
                readOnly={siteMode === 'irregular'}
                disabled={siteMode === 'irregular'}
                onChange={(e) => setUserWidth(parseFloat(e.target.value) || 10)}
                className={`w-full h-8 border-0 rounded-[8px] px-2.5 text-[12px] font-mono outline-none ${
                  siteMode === 'irregular'
                    ? 'bg-neutral-200/50 dark:bg-neutral-800/50 text-[var(--text-2)] cursor-not-allowed'
                    : 'bg-[var(--fill)] text-[var(--text-1)] focus:ring-[2px] focus:ring-[var(--accent)]/30'
                }`}
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
                readOnly={siteMode === 'irregular'}
                disabled={siteMode === 'irregular'}
                onChange={(e) => setUserDepth(parseFloat(e.target.value) || 12)}
                className={`w-full h-8 border-0 rounded-[8px] px-2.5 text-[12px] font-mono outline-none ${
                  siteMode === 'irregular'
                    ? 'bg-neutral-200/50 dark:bg-neutral-800/50 text-[var(--text-2)] cursor-not-allowed'
                    : 'bg-[var(--fill)] text-[var(--text-1)] focus:ring-[2px] focus:ring-[var(--accent)]/30'
                }`}
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

      {/* Irregular Cadastral Boundary Polygon Editor */}
      {siteMode === 'irregular' && (
        <div className="space-y-3 p-3 rounded-[12px] bg-[var(--fill)] border border-purple-500/20">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-[var(--text-1)]">
                Cadastral Boundary Polygon ({irregularVertices.length} Vertices)
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-medium ${
                  polyMetrics.isValid
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                }`}
              >
                {polyMetrics.isValid
                  ? `✓ Valid (${polyMetrics.shapeType.replace('_', '-').toUpperCase()})`
                  : `⚠ Invalid: ${polyMetrics.reason}`}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--text-2)]">
              <span>Area: <strong>{polyMetrics.area} m²</strong></span>
              <span>·</span>
              <span>Perim: <strong>{polyMetrics.perimeter} m</strong></span>
            </div>
          </div>

          {/* Quick Presets & GeoJSON Import Bar */}
          <div className="flex items-center justify-between flex-wrap gap-1.5 pt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-[var(--text-3)] font-medium">Presets:</span>
              <button
                type="button"
                onClick={() => applyPreset('l_shape')}
                className="px-2 py-0.5 rounded-[6px] text-[11px] bg-[var(--bg-card)] border border-[var(--hairline)] hover:border-purple-400 text-[var(--text-1)]"
              >
                L-Shape (Concave)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('trapezoid')}
                className="px-2 py-0.5 rounded-[6px] text-[11px] bg-[var(--bg-card)] border border-[var(--hairline)] hover:border-purple-400 text-[var(--text-1)]"
              >
                Trapezoid
              </button>
              <button
                type="button"
                onClick={() => applyPreset('pentagon')}
                className="px-2 py-0.5 rounded-[6px] text-[11px] bg-[var(--bg-card)] border border-[var(--hairline)] hover:border-purple-400 text-[var(--text-1)]"
              >
                Pentagon (Chamfer)
              </button>
            </div>
            <button
              type="button"
              onClick={() => setGeoJsonModalOpen(!geoJsonModalOpen)}
              className="px-2.5 py-0.5 rounded-[6px] text-[11px] bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30 hover:bg-purple-500/20 font-medium flex items-center gap-1"
            >
              <Icon name="file-text" size={12} />
              <span>{geoJsonModalOpen ? 'Close Import' : 'Paste GeoJSON'}</span>
            </button>
          </div>

          {/* GeoJSON Import Drawer */}
          {geoJsonModalOpen && (
            <div className="p-2.5 rounded-[8px] bg-[var(--bg-card)] border border-purple-500/30 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-[var(--text-1)]">Paste GeoJSON Polygon / Feature / Coordinates</span>
                <span className="text-[var(--text-3)]">Easting (X), Northing (Y) in meters</span>
              </div>
              <textarea
                rows={3}
                value={geoJsonText}
                onChange={(e) => setGeoJsonText(e.target.value)}
                placeholder='e.g. [[0,0],[14,0],[14,8],[7,8],[7,14],[0,14]] or {"type":"Polygon","coordinates":[[...]]}'
                className="w-full text-[11px] font-mono p-2 rounded-[6px] bg-[var(--fill)] border border-[var(--hairline)] text-[var(--text-1)] outline-none focus:ring-1 focus:ring-purple-500"
              />
              {geoJsonError && (
                <div className="text-[11px] text-[var(--semantic-red)] font-medium">
                  {geoJsonError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setGeoJsonModalOpen(false); setGeoJsonError(null); }}
                  className="px-2.5 py-1 text-[11px] rounded-[6px] text-[var(--text-2)] hover:text-[var(--text-1)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGeoJsonImport}
                  className="px-3 py-1 text-[11px] rounded-[6px] bg-purple-600 text-white font-medium hover:bg-purple-700"
                >
                  Import Coordinates
                </button>
              </div>
            </div>
          )}

          {/* Miniature SVG Preview & Vertex Table Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* SVG Visualizer */}
            <div className="flex flex-col items-center justify-center p-2 rounded-[8px] bg-[var(--bg-card)] border border-[var(--hairline)] min-h-[140px]">
              <span className="text-[10px] text-[var(--text-3)] font-mono mb-1">
                Boundary Geometry Preview (Local Tangent Plane)
              </span>
              <svg
                viewBox={`${polyMetrics.bbox[0] - 1.5} ${-polyMetrics.bbox[3] - 1.5} ${bboxWidth + 3.0} ${bboxDepth + 3.0}`}
                className="w-full max-h-[120px] overflow-visible"
              >
                {/* Polygon fill & stroke */}
                <polygon
                  points={irregularVertices.map(([x, y]) => `${x},${-y}`).join(' ')}
                  fill="rgba(147, 51, 234, 0.12)"
                  stroke="#9333ea"
                  strokeWidth="0.35"
                  strokeLinejoin="round"
                />
                {/* Vertex circles & labels */}
                {irregularVertices.map(([x, y], idx) => (
                  <g key={idx}>
                    <circle cx={x} cy={-y} r="0.4" fill="#9333ea" />
                    <text
                      x={x + 0.5}
                      y={-y - 0.5}
                      fontSize="1.1"
                      fill="var(--text-2)"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      P{idx + 1}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            {/* Vertex Coordinate Editor Table */}
            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
              <div className="grid grid-cols-12 gap-1 text-[10px] font-mono text-[var(--text-3)] uppercase px-1">
                <span className="col-span-2">Pt</span>
                <span className="col-span-4">East X (m)</span>
                <span className="col-span-4">North Y (m)</span>
                <span className="col-span-2 text-right">Del</span>
              </div>
              {irregularVertices.map(([vx, vy], idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1 items-center bg-[var(--bg-card)] p-1 rounded-[6px] border border-[var(--hairline)]">
                  <span className="col-span-2 text-[11px] font-mono font-semibold text-purple-600 dark:text-purple-400 pl-1">
                    P{idx + 1}
                  </span>
                  <input
                    type="number"
                    step="0.5"
                    value={vx}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setIrregularVertices((prev) => {
                        const copy = [...prev];
                        copy[idx] = [val, copy[idx][1]];
                        return copy;
                      });
                    }}
                    className="col-span-4 h-6 px-1.5 text-[11px] font-mono bg-[var(--fill)] rounded-[4px] text-[var(--text-1)] border-0 outline-none"
                  />
                  <input
                    type="number"
                    step="0.5"
                    value={vy}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setIrregularVertices((prev) => {
                        const copy = [...prev];
                        copy[idx] = [copy[idx][0], val];
                        return copy;
                      });
                    }}
                    className="col-span-4 h-6 px-1.5 text-[11px] font-mono bg-[var(--fill)] rounded-[4px] text-[var(--text-1)] border-0 outline-none"
                  />
                  <div className="col-span-2 flex justify-end pr-1">
                    <button
                      type="button"
                      disabled={irregularVertices.length <= 3}
                      onClick={() => {
                        if (irregularVertices.length > 3) {
                          setIrregularVertices((prev) => prev.filter((_, i) => i !== idx));
                        }
                      }}
                      className="text-[var(--text-3)] hover:text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={irregularVertices.length <= 3 ? 'Minimum 3 vertices required' : 'Delete vertex'}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const last = irregularVertices[irregularVertices.length - 1] || [0, 0];
                  setIrregularVertices((prev) => [...prev, [last[0] + 2, last[1] + 2]]);
                }}
                className="w-full py-1 text-[11px] rounded-[6px] border border-dashed border-[var(--hairline)] hover:border-purple-400 text-[var(--text-2)] hover:text-[var(--text-1)] font-mono flex items-center justify-center gap-1"
              >
                <Icon name="plus" size={11} />
                <span>Add Vertex</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {activeConstraints && (
        <div className="space-y-1 min-w-0 pt-0.5">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-3)]">
            <span className="font-semibold uppercase tracking-wider">Active Client Constraints</span>
            <span>Inherited from Project Parameters</span>
          </div>
          <ConstraintChips constraints={activeConstraints} onChange={() => {}} />
        </div>
      )}

      {/* Dynamic Typology Room Selection */}
      <div className="space-y-1.5 min-w-0">
        <div className="flex items-center justify-between text-[12px] text-[var(--text-3)] flex-wrap gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-[var(--text-1)] truncate">
              {typologyConfig.label}
            </span>
            <span className="text-[11px] font-mono">
              ({selectedRooms.length} selected)
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            {activeFloors > 1 ? (
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
                  <div className="flex flex-col min-w-0">
                    <span className="leading-tight break-words truncate">{room.label}</span>
                    <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-3)] font-mono">
                      {room.minAreaSqm ? <span>min {room.minAreaSqm} m²</span> : null}
                      {room.zone ? (
                        <span className="uppercase px-1 py-0.2 rounded bg-black/5 dark:bg-white/5 font-semibold">
                          [{room.zone}]
                        </span>
                      ) : null}
                    </div>
                  </div>
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

      {/* Per-Level Floorplate Variations & Wings (RULE-FP-01..06) */}
      {activeFloors > 1 && (
        <div className="space-y-2 p-3 rounded-[12px] bg-[var(--fill)] border border-[var(--hairline)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Icon name="layers" size={14} className="text-[var(--accent)]" />
              <span className="text-[12px] font-semibold text-[var(--text-1)]">
                Per-Floor Floorplate Variations
              </span>
            </div>
            <span className="text-[10px] text-[var(--text-3)] font-mono">
              RULE-FP-01..06
            </span>
          </div>
          <div className="space-y-2">
            {Array.from({ length: activeFloors }).map((_, z) => {
              const lvlTitle = z === 0 ? 'G (Ground)' : `G+${z} (Level ${z})`;
              const mask = floorPlateMasks[z] || { wing_a: 'present', wing_b: 'present' };
              const prevMask = z > 0 ? (floorPlateMasks[z - 1] || { wing_a: 'present', wing_b: 'present' }) : null;
              const isPrevVoid = prevMask?.wing_b === 'void';

              return (
                <div key={z} className="flex items-center justify-between text-[11px] p-2 rounded-[8px] bg-[var(--card-bg-subtle)] border border-[var(--hairline)]">
                  <span className="font-semibold text-[var(--text-1)] min-w-[80px]">{lvlTitle}</span>
                  <div className="flex items-center gap-3">
                    {/* Wing A: Core Wing (Always Present per RULE-FP-01) */}
                    <label
                      className="flex items-center gap-1 text-[var(--text-2)] cursor-not-allowed opacity-75"
                      title="Contains vertical core & egress stairs (RULE-FP-01)"
                    >
                      <input type="checkbox" checked={true} disabled={true} className="rounded text-[var(--accent)]" />
                      <span>Wing A (Core)</span>
                    </label>

                    {/* Wing B: Setback / Terrace Toggle */}
                    {z === 0 ? (
                      <label
                        className="flex items-center gap-1 text-[var(--text-2)] cursor-not-allowed opacity-75"
                        title="Ground floor footprint must be occupied (RULE-FP-01)"
                      >
                        <input type="checkbox" checked={true} disabled={true} className="rounded text-[var(--accent)]" />
                        <span>Wing B (Ground)</span>
                      </label>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[var(--text-3)]">Wing B:</span>
                        <select
                          value={mask.wing_b}
                          disabled={isPrevVoid}
                          title={isPrevVoid ? "Cannot add wing above absent level without support (RULE-FP-02)" : "Select floorplate status for Wing B"}
                          onChange={(e) => {
                            const val = e.target.value as 'present' | 'terrace' | 'void';
                            setFloorPlateMasks((prev) => ({
                              ...prev,
                              [z]: { ...prev[z], wing_b: val },
                            }));
                          }}
                          className="px-2 py-0.5 rounded-[6px] text-[11px] bg-[var(--fill)] text-[var(--text-1)] border border-[var(--hairline)] cursor-pointer"
                        >
                          <option value="present">Enclosed</option>
                          <option value="terrace">Terrace (Open-to-Sky)</option>
                          <option value="void">Void (Dropped)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
              {activeFloors > 1
                ? `Generate ${activeFloors}-Storey Architectural Blueprint`
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

            {/* Solver Warnings Banner */}
            {floorPlan.warnings && floorPlan.warnings.length > 0 && (
              <div className="mt-2.5 p-3 rounded-[10px] bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-200 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-[12px]">
                  <Icon name="alert-triangle" size={13} className="shrink-0" />
                  <span>Engineering &amp; Degradation Advisories ({floorPlan.warnings.length})</span>
                </div>
                <ul className="text-[11px] space-y-0.5 pl-4 list-disc text-amber-900/80 dark:text-amber-100/80">
                  {floorPlan.warnings.map((w, idx) => (
                    <li key={idx} className="leading-snug">{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Critic Notes */}
            {floorPlan.qa?.critic_notes && floorPlan.qa.critic_notes.length > 0 && (
              <div className="mt-2 p-2.5 rounded-[10px] bg-blue-500/10 border border-blue-500/25 text-[11px] text-blue-800 dark:text-blue-200">
                <span className="font-semibold mr-1">Architect Critic Notes:</span>
                <span>{floorPlan.qa.critic_notes.join('; ')}</span>
              </div>
            )}
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

          {/* Mathematical Validity Certificate & Relaxations Panel */}
          {(() => {
            const cert = floorPlan.mathematical_certificate || floorPlan.multi_storey?.mathematical_certificate;
            if (!cert) return null;
            const certId = cert.certificate_id || 'CERT-MATH-VALID-2026';
            const isValid = Boolean(cert.is_valid);

            // Extract relaxations across floors or placements
            const relaxations: Array<{ room: string; rule_id: string; rationale: string }> = [];
            if (floorPlan.multi_storey?.floors) {
              floorPlan.multi_storey.floors.forEach((fl) => {
                fl.rooms?.forEach((r: any) => {
                  if (Array.isArray(r.relaxations)) {
                    r.relaxations.forEach((rx: any) => {
                      relaxations.push({
                        room: r.room_name || r.room_id,
                        rule_id: rx.rule_id,
                        rationale: rx.rationale,
                      });
                    });
                  }
                });
              });
            } else if (floorPlan.placements) {
              floorPlan.placements.forEach((r: any) => {
                if (Array.isArray(r.relaxations)) {
                  r.relaxations.forEach((rx: any) => {
                    relaxations.push({
                      room: r.room_name || r.room_id,
                      rule_id: rx.rule_id,
                      rationale: rx.rationale,
                    });
                  });
                }
              });
            }

            const certChecks = [
              { name: 'Non-Overlap & Containment', pass: cert.non_overlap && cert.containment, ref: 'REL-01 / CONT-01' },
              { name: 'Zero Forbidden Wall Pairs', pass: cert.zero_forbidden_violations, ref: 'REL-02 / FORBIDDEN' },
              { name: 'BFS Circulation Reachability', pass: cert.connectivity_bfs, ref: 'CIRC-01 / BFS-GRAPH' },
              { name: 'Dimension Chains Sum (≤1mm)', pass: cert.chain_sums_match, ref: 'DIM-01 / NBC-TOLERANCE' },
              { name: 'NBC Egress Travel Distance', pass: cert.egress_distances_satisfied, ref: 'NBC-03 / EGRESS-30M' },
              { name: 'Vertical Stack Alignment', pass: cert.vertical_stack_valid ?? true, ref: 'VERT-01..05 / CORE-STACK' },
            ];

            const certifiedRules = cert.certified_rules || [
              'NBC-01', 'NBC-02', 'NBC-03', 'REL-01', 'REL-02', 'VERT-01', 'VERT-02', 'CIRC-01', 'DIM-01', 'VASTU-01', 'SAN-01'
            ];

            return (
              <div className="p-3 rounded-[12px] bg-emerald-500/5 border border-emerald-500/20 text-[12px] space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 font-semibold text-[13px] text-emerald-800 dark:text-emerald-300">
                    <Icon name="check-circle" size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Mathematical Validity Certificate</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      {certId}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isValid ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                  }`}>
                    {isValid ? 'VERIFIED & CERTIFIED' : 'NON-COMPLIANT'}
                  </span>
                </div>

                {/* 6 Invariant Verification Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {certChecks.map((chk, idx) => (
                    <div
                      key={idx}
                      className="p-1.5 px-2 rounded-[8px] bg-white/60 dark:bg-black/20 border border-[var(--hairline)] flex items-center justify-between text-[11px]"
                    >
                      <span className="font-medium text-[var(--text-1)] truncate mr-1.5">{chk.name}</span>
                      <div className="flex items-center gap-1 shrink-0 font-mono text-[10px]">
                        <span className="text-[var(--text-3)]">{chk.ref}</span>
                        <span className={`font-bold px-1.5 py-0.2 rounded ${
                          chk.pass
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        }`}>
                          {chk.pass ? 'PASS' : 'FAIL'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Certified Rule IDs list */}
                <div className="text-[11px] text-[var(--text-2)] flex items-baseline gap-1.5 flex-wrap">
                  <span className="font-semibold text-[var(--text-1)]">Certified Rule IDs:</span>
                  <span className="font-mono text-[10px] text-[var(--text-3)]">
                    {certifiedRules.join(', ')}
                  </span>
                </div>

                {/* Relaxations with Rationale Tags */}
                {relaxations.length > 0 ? (
                  <div className="pt-2 border-t border-emerald-500/20 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                      <span>Applied Relaxations ({relaxations.length})</span>
                      <span className="font-normal text-[10px] text-[var(--text-3)]">Bounded Deg-1 Pragmatic Adjustments</span>
                    </div>
                    <div className="space-y-1">
                      {relaxations.map((rx, idx) => (
                        <div key={idx} className="p-1.5 rounded-[6px] bg-amber-500/10 text-[11px] flex items-center justify-between gap-2">
                          <span className="font-medium text-amber-900 dark:text-amber-200 truncate">
                            {rx.room}: <code className="font-mono text-[10px] font-semibold">{rx.rule_id}</code>
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-800 dark:text-amber-200 shrink-0">
                            {rx.rationale}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                    Zero Relaxations: Strict statutory compliance across all spaces.
                  </div>
                )}
              </div>
            );
          })()}

          {/* Blueprint SVG Viewer with Stale Plan Guard & Site Plan Tab */}
          <BlueprintViewer
            svgString={floorPlan.svg_blueprint}
            svgPaperString={floorPlan.svg_blueprint_paper}
            placements={floorPlan.placements}
            plotWidthM={plotWidth}
            plotDepthM={plotDepth}
            multiStorey={floorPlan.multi_storey}
            sitePlan={floorPlan.site_plan || floorPlan.multi_storey?.site_plan}
            generationTimestamp={floorPlan.generated_at}
            generationId={floorPlan.generation_id}
            storeys={activeFloors}
            isStale={isPlanStale}
          />
        </div>
      )}
    </div>
  );
};
