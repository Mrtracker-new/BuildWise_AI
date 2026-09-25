import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';
import type { RoomPlacement, MultiStoreyBuildingModel, SingleFloorPlanModel } from '../services/types';
import { Icon } from './Icon';

interface BlueprintViewerProps {
  svgString: string;
  svgPaperString?: string;
  placements?: RoomPlacement[];
  plotWidthM?: number;
  plotDepthM?: number;
  multiStorey?: MultiStoreyBuildingModel | null;
}

const ROOM_METADATA: Record<string, { dotColor: string; label: string; zone: string; isCore?: boolean }> = {
  // T1 Residence
  master_bed: { dotColor: '#0284C7', label: 'Master Bedroom', zone: 'SW' },
  living: { dotColor: '#10B981', label: 'Living Room', zone: 'N/NE' },
  kitchen: { dotColor: '#F59E0B', label: 'Kitchen', zone: 'SE' },
  puja: { dotColor: '#EAB308', label: 'Puja Room', zone: 'NE' },
  bath_1: { dotColor: '#06B6D4', label: 'Primary Bath', zone: 'W' },
  bath_2: { dotColor: '#14B8A6', label: 'Common Bath', zone: 'NW' },
  bed_2: { dotColor: '#3B82F6', label: 'Bedroom 2', zone: 'NW' },
  dining: { dotColor: '#F97316', label: 'Dining Area', zone: 'W' },
  stairs: { dotColor: '#8B5CF6', label: 'Staircase Core', zone: 'SW/W', isCore: true },
  balcony: { dotColor: '#10B981', label: 'Balcony', zone: 'N/E' },
  study: { dotColor: '#6366F1', label: 'Study / Office', zone: 'NE' },
  utility: { dotColor: '#EC4899', label: 'Utility / Store', zone: 'SE' },

  // T2 Apartment
  staircase_core: { dotColor: '#8B5CF6', label: 'Common Stair Core', zone: 'CORE', isCore: true },
  lift_core: { dotColor: '#A855F7', label: 'Passenger Lift Core', zone: 'CORE', isCore: true },
  lobby: { dotColor: '#64748B', label: 'Central Lobby', zone: 'CIRC' },
  apt_a_living: { dotColor: '#059669', label: 'Unit A Living', zone: 'NE' },
  apt_a_kitchen: { dotColor: '#D97706', label: 'Unit A Kitchen', zone: 'SE' },
  apt_a_bed: { dotColor: '#0284C7', label: 'Unit A Master Bed', zone: 'SW' },
  apt_a_bath: { dotColor: '#0891B2', label: 'Unit A Bath', zone: 'W' },
  apt_b_living: { dotColor: '#10B981', label: 'Unit B Living', zone: 'NW' },
  apt_b_kitchen: { dotColor: '#F59E0B', label: 'Unit B Kitchen', zone: 'SE' },
  apt_b_bed: { dotColor: '#2563EB', label: 'Unit B Bedroom', zone: 'NW' },
  apt_b_bath: { dotColor: '#06B6D4', label: 'Unit B Bath', zone: 'W' },
  apt_balcony: { dotColor: '#34D399', label: 'Apartment Balcony', zone: 'E' },

  // T3 Complex
  fire_stair_1: { dotColor: '#EF4444', label: 'Fire Stair Core 1', zone: 'CORE', isCore: true },
  fire_stair_2: { dotColor: '#DC2626', label: 'Fire Exit Stair 2', zone: 'CORE', isCore: true },
  lift_bank: { dotColor: '#9333EA', label: 'Dual Lift Bank & Lobby', zone: 'CORE', isCore: true },
  corridor: { dotColor: '#64748B', label: 'Spine Corridor', zone: 'CIRC' },
  commercial_suite_a: { dotColor: '#2563EB', label: 'Commercial Suite A', zone: 'N' },
  commercial_suite_b: { dotColor: '#3B82F6', label: 'Commercial Suite B', zone: 'E' },
  commercial_suite_c: { dotColor: '#60A5FA', label: 'Commercial Suite C', zone: 'S' },
  restroom_block: { dotColor: '#06B6D4', label: 'Public Restrooms', zone: 'W' },
  mep_room: { dotColor: '#F59E0B', label: 'MEP & Service Room', zone: 'NW' },

  // T4 Warehouse
  storage_bay: { dotColor: '#3B82F6', label: 'Clear-Span Storage Bay', zone: 'BAY' },
  loading_dock: { dotColor: '#F97316', label: 'Loading Dock Shutter', zone: 'DOCK' },
  dispatch_buffer: { dotColor: '#EAB308', label: 'Dispatch Buffer', zone: 'BUFFER' },
  staff_amenities: { dotColor: '#14B8A6', label: 'Staff Locker & WC', zone: 'AMENITY' },
  steel_stair: { dotColor: '#8B5CF6', label: 'Industrial Steel Stair', zone: 'CORE', isCore: true },
  mezzanine_office: { dotColor: '#6366F1', label: 'Mezzanine Office', zone: 'OFFICE' },
  conference_room: { dotColor: '#8B5CF6', label: 'Conference Room', zone: 'ADMIN' },
  catwalk: { dotColor: '#94A3B8', label: 'Inspection Catwalk', zone: 'ACCESS' },
};

export const BlueprintViewer: React.FC<BlueprintViewerProps> = ({
  svgString,
  svgPaperString,
  placements = [],
  plotWidthM,
  plotDepthM,
  multiStorey = null,
}) => {
  const [mode, setMode] = useState<'cad' | 'paper'>('cad');
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Multi-floor state
  const [activeFloorIndex, setActiveFloorIndex] = useState<number>(0);
  const [showGhostOverlay, setShowGhostOverlay] = useState<boolean>(true);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // Modal zoom and pan state
  const [modalZoom, setModalZoom] = useState<number>(1.0);
  const [modalPan, setModalPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isModalPanning, setIsModalPanning] = useState<boolean>(false);

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const modalDragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const modalPanStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const isMultiStorey = Boolean(multiStorey && multiStorey.floors && multiStorey.floors.length > 0);
  const currentFloor: SingleFloorPlanModel | null = isMultiStorey
    ? multiStorey!.floors[activeFloorIndex] || multiStorey!.floors[0]
    : null;

  // Ensure activeFloorIndex is within bounds if floors change
  useEffect(() => {
    if (multiStorey?.floors && activeFloorIndex >= multiStorey.floors.length) {
      setActiveFloorIndex(0);
    }
  }, [multiStorey, activeFloorIndex]);

  const activeSvg = useMemo(() => {
    if (currentFloor) {
      return mode === 'paper' && currentFloor.svg_blueprint_paper
        ? currentFloor.svg_blueprint_paper
        : currentFloor.svg_blueprint_cad;
    }
    return mode === 'paper' && svgPaperString ? svgPaperString : svgString;
  }, [currentFloor, mode, svgPaperString, svgString]);

  // Sanitize raw SVG and inject paint-order halo style + dynamic ghost overlay styling
  const sanitizedSvg = useMemo(() => {
    if (!activeSvg) return '';
    const cleaned = activeSvg
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

    const ghostOverlayCss = showGhostOverlay
      ? '.ghost-core-overlay { display: block !important; opacity: 1 !important; }'
      : '.ghost-core-overlay { display: none !important; opacity: 0 !important; visibility: hidden !important; }';

    const styleInjection = `
      <style>
        ${ghostOverlayCss}
        text {
          paint-order: stroke fill;
          stroke: var(--blueprint-bg, #0E1726);
          stroke-width: 2px;
          stroke-linecap: round;
          stroke-linejoin: round;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
      </style>
    `;

    if (cleaned.includes('<svg')) {
      return cleaned.replace(
        /<svg\b([^>]*)>/i,
        `<svg $1 data-ghost-overlay="${showGhostOverlay ? 'true' : 'false'}">${styleInjection}`
      );
    }
    return cleaned;
  }, [activeSvg, showGhostOverlay]);

  // Derive per-floor room placements for current floor legend
  const currentPlacements = useMemo(() => {
    if (currentFloor && currentFloor.rooms && currentFloor.rooms.length > 0) {
      return currentFloor.rooms.map((r) => ({
        room_id: r.room_id,
        room_name: r.room_name,
        zone: r.zone,
        is_core: Boolean(r.is_vertical_core),
        area_sqm: r.area_sqm,
      }));
    }
    return placements.map((p) => ({
      room_id: p.room_id,
      room_name: p.room_name,
      zone: p.zone,
      is_core: p.room_id === 'stairs' || p.room_id.includes('stair') || p.room_id.includes('lift'),
      area_sqm: p.area_sqm,
    }));
  }, [currentFloor, placements]);

  const handleZoomIn = () => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)));
  const handleZoomOut = () => setZoom((z) => Math.max(0.75, +(z - 0.25).toFixed(2)));
  const handleReset = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  const handleModalZoomIn = () => setModalZoom((z) => Math.min(3.5, +(z + 0.25).toFixed(2)));
  const handleModalZoomOut = () => setModalZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
  const handleModalReset = () => {
    setModalZoom(1.0);
    setModalPan({ x: 0, y: 0 });
  };

  const handleDownloadSvg = () => {
    if (!sanitizedSvg) return;
    const blob = new Blob([sanitizedSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const floorTag = currentFloor ? `_${currentFloor.floor_name.replace(/\s+/g, '_')}` : '';
    link.download = `BuildWise_Blueprint${floorTag}_${plotWidthM || 10}x${plotDepthM || 12}m.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      const payload: Record<string, any> = {
        plot_width_m: plotWidthM || (multiStorey?.plot_width_m ?? 12.0),
        plot_depth_m: plotDepthM || (multiStorey?.plot_depth_m ?? 15.0),
        floors: multiStorey ? multiStorey.total_storeys : 1,
        building_typology: multiStorey ? multiStorey.building_typology : 'residential_single',
      };
      if (multiStorey) {
        payload.multi_storey = multiStorey;
      }

      const response = await fetch('/api/generate-floorplan?format=pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to generate PDF dossier: ${response.status} ${errText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const typTag = multiStorey ? `_${multiStorey.building_typology}` : '';
      const floorsTag = multiStorey ? `_${multiStorey.total_storeys}F` : '';
      link.download = `BuildWise_Architectural_Dossier${typTag}${floorsTag}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Error exporting PDF dossier:', error);
      alert('Failed to export PDF dossier. Please try again.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Close modal on Escape
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  // Card pan listeners
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isPanning) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: panStartRef.current.x + dx,
        y: panStartRef.current.y + dy,
      });
    },
    [isPanning]
  );

  const handleMouseUp = () => setIsPanning(false);

  // Modal pan listeners
  const handleModalMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsModalPanning(true);
    modalDragStartRef.current = { x: e.clientX, y: e.clientY };
    modalPanStartRef.current = { ...modalPan };
  };

  const handleModalMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isModalPanning) return;
      const dx = e.clientX - modalDragStartRef.current.x;
      const dy = e.clientY - modalDragStartRef.current.y;
      setModalPan({
        x: modalPanStartRef.current.x + dx,
        y: modalPanStartRef.current.y + dy,
      });
    },
    [isModalPanning]
  );

  const handleModalMouseUp = () => setIsModalPanning(false);

  // Render floor switcher tab bar
  const renderFloorSwitcher = (isModal: boolean = false) => {
    if (!isMultiStorey || !multiStorey?.floors || multiStorey.floors.length <= 1) {
      return null;
    }

    return (
      <div
        className={`flex items-center gap-1.5 overflow-x-auto py-1.5 px-3.5 border-b border-[var(--hairline)] ${
          isModal ? 'bg-[var(--fill)]/40' : 'bg-[var(--fill)]/20'
        } scrollbar-none`}
      >
        <div className="flex items-center gap-1 mr-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] shrink-0 select-none">
          <Icon name="layers" size={13} className="text-[var(--accent)]" />
          <span>Levels:</span>
        </div>
        {multiStorey.floors.map((fl, idx) => {
          const isActive = activeFloorIndex === idx;
          const elevation = (fl.floor_index * 3.0).toFixed(1);
          const isGround = fl.floor_index === 0;
          return (
            <button
              key={fl.floor_index}
              type="button"
              onClick={() => setActiveFloorIndex(idx)}
              className={`px-3 py-1.5 rounded-[9px] text-[12px] transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-[var(--accent)] text-white shadow-sm font-semibold ring-1 ring-white/20'
                  : 'bg-[var(--fill)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--fill-hover)] font-medium'
              }`}
            >
              <span>{fl.floor_name || `Floor ${fl.floor_index}`}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive ? 'bg-white/20 text-white' : 'bg-black/5 dark:bg-white/10 text-[var(--text-3)]'
                }`}
              >
                +{elevation}m
              </span>
              {isGround && (
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ${
                    isActive ? 'bg-amber-400 text-amber-950' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  Anchor
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div
      id="blueprint-viewer-container"
      className="flex flex-col w-full min-w-0 rounded-[16px] vibrancy-panel border border-[var(--panel-border-color)] shadow-md overflow-hidden @container"
    >
      {/* 1. Header: title + dimension chip + CAD/Storey chip */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-[var(--hairline)]">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="blueprint" size={15} className="text-[var(--accent)] shrink-0" />
          <h3 className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight truncate">
            {currentFloor ? `${currentFloor.floor_name}` : 'Architectural Blueprint'}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {currentFloor && (
            <span className="font-mono text-[11px] font-semibold text-[var(--accent)] bg-[var(--accent-tint)] px-2 py-0.5 rounded-[6px] whitespace-nowrap">
              +{(currentFloor.floor_index * 3.0).toFixed(1)}m LVL
            </span>
          )}
          {plotWidthM && plotDepthM && (
            <span className="font-mono text-[11px] font-medium text-[var(--text-1)] bg-[var(--fill)] px-2 py-0.5 rounded-[6px] whitespace-nowrap">
              {plotWidthM.toFixed(1)}m × {plotDepthM.toFixed(1)}m
            </span>
          )}
          <span className="text-[10px] font-semibold text-[var(--accent)] bg-[var(--accent-tint)] px-1.5 py-0.5 rounded-[6px] uppercase tracking-wider whitespace-nowrap">
            {isMultiStorey ? `${multiStorey?.total_storeys}F CAD` : 'CAD 2D'}
          </span>
        </div>
      </div>

      {/* 2. Storey Switcher Tabs (Rendered when multi-floor) */}
      {renderFloorSwitcher(false)}

      {/* 3. Toolbar row below header */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-[var(--hairline)] bg-[var(--fill)]/30">
        <div className="flex items-center gap-2">
          {/* Mode Selector: CAD vs Paper */}
          <div className="flex items-center bg-[var(--fill)] rounded-[8px] p-0.5">
            <button
              type="button"
              onClick={() => setMode('cad')}
              className={`px-2 py-1 rounded-[6px] text-[11px] font-semibold transition-all cursor-pointer ${
                mode === 'cad'
                  ? 'bg-[var(--segmented-active-bg)] text-[var(--segmented-active-label)] shadow-[var(--segmented-active-shadow)]'
                  : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
              }`}
            >
              CAD
            </button>
            <button
              type="button"
              onClick={() => setMode('paper')}
              className={`px-2 py-1 rounded-[6px] text-[11px] font-semibold transition-all cursor-pointer ${
                mode === 'paper'
                  ? 'bg-[var(--segmented-active-bg)] text-[var(--segmented-active-label)] shadow-[var(--segmented-active-shadow)]'
                  : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
              }`}
            >
              Paper
            </button>
          </div>

          {/* Ghost Core Overlay Toggle (Multi-floor upper storeys) */}
          {isMultiStorey && multiStorey!.floors.length > 1 && (
            <button
              type="button"
              onClick={() => setShowGhostOverlay((v) => !v)}
              disabled={activeFloorIndex === 0}
              title={
                activeFloorIndex === 0
                  ? 'Ground Floor is the primary Anchor Core (Ghost overlay appears on upper floors)'
                  : showGhostOverlay
                  ? 'Hide F0 Core Ghost Overlay'
                  : 'Show F0 Core Ghost Overlay (Verifying vertical stacking alignment)'
              }
              className={`h-7 px-2.5 rounded-[8px] text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer select-none ${
                activeFloorIndex === 0
                  ? 'opacity-50 cursor-not-allowed bg-[var(--fill)] text-[var(--text-3)]'
                  : showGhostOverlay
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shadow-xs'
                  : 'bg-[var(--fill)] text-[var(--text-2)] hover:text-[var(--text-1)]'
              }`}
            >
              <Icon
                name="layers"
                size={13}
                className={showGhostOverlay && activeFloorIndex > 0 ? 'text-amber-500 animate-pulse' : ''}
              />
              <span>{activeFloorIndex === 0 ? 'F0 Anchor' : showGhostOverlay ? 'Ghost Core: ON' : 'Ghost Core: OFF'}</span>
            </button>
          )}
        </div>

        {/* Zoom Controls & Expand Action */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 0.75}
            title="Zoom Out"
            aria-label="Zoom Out"
            className="w-7 h-7 rounded-[8px] bg-[var(--fill)] hover:bg-[var(--fill-hover)] disabled:opacity-40 text-[var(--text-1)] flex items-center justify-center transition-colors cursor-pointer"
          >
            <Icon name="minus" size={14} />
          </button>
          <span className="font-mono text-[12px] text-[var(--text-2)] tabular-nums min-w-[36px] text-center font-medium select-none">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 2.5}
            title="Zoom In"
            aria-label="Zoom In"
            className="w-7 h-7 rounded-[8px] bg-[var(--fill)] hover:bg-[var(--fill-hover)] disabled:opacity-40 text-[var(--text-1)] flex items-center justify-center transition-colors cursor-pointer"
          >
            <Icon name="plus" size={14} />
          </button>
          <button
            type="button"
            onClick={handleReset}
            title="Reset Zoom & Pan"
            aria-label="Reset View"
            className="w-7 h-7 rounded-[8px] bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-1)] flex items-center justify-center transition-colors cursor-pointer"
          >
            <Icon name="refresh" size={14} />
          </button>

          {/* Quick-Download PDF Dossier Button */}
          <button
            type="button"
            id="blueprint-export-dossier-btn"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            title="Export Multi-Page Architectural PDF Dossier (Cover Sheet 10.0 + Floor Sheets 10.1-10.N)"
            aria-label="Export Dossier (PDF)"
            className="h-7 px-2.5 rounded-[8px] bg-red-600/10 hover:bg-red-600/20 active:bg-red-600/25 text-red-600 dark:text-red-400 border border-red-500/20 text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none shadow-xs"
          >
            {isExportingPdf ? (
              <>
                <Icon name="loader" size={13} className="animate-spin text-red-500" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <Icon name="file-text" size={13} />
                <span>Export Dossier (PDF)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            title="Open Fullscreen Blueprint Modal"
            aria-label="Open Fullscreen Blueprint"
            className="w-7 h-7 rounded-[8px] bg-[var(--accent-tint)] text-[var(--accent)] hover:brightness-95 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Icon name="maximize" size={14} />
          </button>
        </div>
      </div>

      {/* 4. Canvas Preview */}
      <div
        className="relative w-full min-h-[320px] h-[360px] overflow-hidden select-none cursor-pointer group"
        style={{ backgroundColor: 'var(--blueprint-bg)' }}
        onClick={() => setIsModalOpen(true)}
        title="Click to open full-size blueprint modal"
      >
        {/* Subtle grid pattern */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none opacity-20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="viewer-ambient-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#viewer-ambient-grid)" className="text-[var(--hairline)]" />
        </svg>

        {/* Pan & Zoom Transform Wrapper */}
        <div
          className="w-full h-full flex items-center justify-center p-3 transition-transform will-change-transform"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.15s ease-out',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <div
            key={`blueprint-svg-${activeFloorIndex}-${mode}-${sanitizedSvg.length}-${plotWidthM}-${plotDepthM}`}
            className="relative flex items-center justify-center max-w-full max-h-full drop-shadow-md"
            dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
          />
        </div>

        {/* Hover Sheet Overlay Cue */}
        <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full vibrancy-pill text-[11px] font-medium text-[var(--text-1)] border border-[var(--panel-border-color)] opacity-80 group-hover:opacity-100 transition-opacity flex items-center gap-1 shadow-sm pointer-events-none">
          <Icon name="maximize" size={12} className="text-[var(--accent)]" />
          <span>Expand Sheet</span>
        </div>
      </div>

      {/* 5. Per-Floor Room Legend */}
      {currentPlacements.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 border-t border-[var(--hairline)] bg-[var(--card-bg-subtle)]/30">
          <div className="flex items-center gap-1.5 mr-1 shrink-0">
            <span className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider">
              {currentFloor ? `${currentFloor.floor_name}:` : 'Legend:'}
            </span>
            {currentFloor && (
              <span className="text-[10px] text-[var(--text-3)] font-mono">
                ({currentFloor.rooms.length} zones)
              </span>
            )}
          </div>
          {currentPlacements.map((p, pIdx) => {
            const meta = ROOM_METADATA[p.room_id] || {
              dotColor: p.is_core ? '#8B5CF6' : '#64748B',
              label: p.room_name,
              zone: p.zone,
            };
            return (
              <div
                key={`${p.room_id}-${pIdx}`}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium whitespace-nowrap select-none border transition-colors ${
                  p.is_core
                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300'
                    : 'bg-[var(--fill)] border-transparent text-[var(--text-1)]'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                  style={{ backgroundColor: meta.dotColor }}
                />
                <span className="text-[12px] font-medium">{meta.label}</span>
                {p.area_sqm && (
                  <span className="text-[11px] font-mono opacity-75">{p.area_sqm.toFixed(1)}m²</span>
                )}
                <span className="text-[10px] text-[var(--text-3)] font-normal">({p.zone})</span>
                {p.is_core && (
                  <span className="text-[9px] px-1 py-0.2 rounded font-bold uppercase bg-purple-500/20 text-purple-600 dark:text-purple-300 tracking-wider">
                    Core
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 6. macOS-Style Fullscreen Sheet Modal */}
      {isModalOpen &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[2000] bg-black/50 backdrop-blur-[20px] flex items-center justify-center p-3 sm:p-6 animate-fade-in"
            onClick={() => setIsModalOpen(false)}
          >
            <div
              className="vibrancy-panel rounded-[20px] max-w-[92vw] max-h-[88vh] w-full h-full flex flex-col shadow-2xl border border-[var(--panel-border-color)] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hairline)]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-tint)] text-[var(--accent)] flex items-center justify-center shrink-0">
                    <Icon name="blueprint" size={16} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[16px] font-semibold text-[var(--text-1)] tracking-tight">
                      {currentFloor ? `${currentFloor.floor_name}` : 'Architectural Floor Plan'}
                    </h3>
                    <p className="text-[12px] text-[var(--text-2)] truncate">
                      CAD 2D Drafting &bull; {plotWidthM || 10}m × {plotDepthM || 12}m Grid
                      {currentFloor && ` • Elevation +${(currentFloor.floor_index * 3.0).toFixed(1)}m`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Mode switcher in modal */}
                  <div className="flex items-center bg-[var(--fill)] rounded-[8px] p-0.5 mr-1">
                    <button
                      type="button"
                      onClick={() => setMode('cad')}
                      className={`px-2.5 py-1 rounded-[6px] text-[12px] font-semibold transition-all cursor-pointer ${
                        mode === 'cad'
                          ? 'bg-[var(--segmented-active-bg)] text-[var(--segmented-active-label)] shadow-[var(--segmented-active-shadow)]'
                          : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                      }`}
                    >
                      CAD
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('paper')}
                      className={`px-2.5 py-1 rounded-[6px] text-[12px] font-semibold transition-all cursor-pointer ${
                        mode === 'paper'
                          ? 'bg-[var(--segmented-active-bg)] text-[var(--segmented-active-label)] shadow-[var(--segmented-active-shadow)]'
                          : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                      }`}
                    >
                      Paper
                    </button>
                  </div>

                  {/* Ghost Core Toggle in Modal */}
                  {isMultiStorey && multiStorey!.floors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setShowGhostOverlay((v) => !v)}
                      disabled={activeFloorIndex === 0}
                      title={
                        activeFloorIndex === 0
                          ? 'Ground Floor is the primary Anchor Core'
                          : showGhostOverlay
                          ? 'Hide F0 Core Ghost Overlay'
                          : 'Show F0 Core Ghost Overlay'
                      }
                      className={`h-8 px-2.5 rounded-[8px] text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer mr-1 select-none ${
                        activeFloorIndex === 0
                          ? 'opacity-50 cursor-not-allowed bg-[var(--fill)] text-[var(--text-3)]'
                          : showGhostOverlay
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                          : 'bg-[var(--fill)] text-[var(--text-2)] hover:text-[var(--text-1)]'
                      }`}
                    >
                      <Icon
                        name="layers"
                        size={13}
                        className={showGhostOverlay && activeFloorIndex > 0 ? 'text-amber-500 animate-pulse' : ''}
                      />
                      <span>{activeFloorIndex === 0 ? 'F0 Anchor' : showGhostOverlay ? 'Ghost: ON' : 'Ghost: OFF'}</span>
                    </button>
                  )}

                  {/* Modal Zoom Controls */}
                  <button
                    type="button"
                    onClick={handleModalZoomOut}
                    disabled={modalZoom <= 0.5}
                    title="Zoom Out"
                    aria-label="Zoom Out"
                    className="w-8 h-8 rounded-[8px] bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-1)] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Icon name="minus" size={14} />
                  </button>
                  <span className="font-mono text-[12px] text-[var(--text-2)] tabular-nums min-w-[40px] text-center font-medium select-none">
                    {Math.round(modalZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={handleModalZoomIn}
                    disabled={modalZoom >= 3.5}
                    title="Zoom In"
                    aria-label="Zoom In"
                    className="w-8 h-8 rounded-[8px] bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-1)] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Icon name="plus" size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={handleModalReset}
                    title="Reset View"
                    aria-label="Reset View"
                    className="w-8 h-8 rounded-[8px] bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-1)] flex items-center justify-center transition-colors cursor-pointer mr-2"
                  >
                    <Icon name="refresh" size={14} />
                  </button>

                  {/* Export Dossier (PDF) Button in Modal */}
                  <button
                    type="button"
                    onClick={handleExportPdf}
                    disabled={isExportingPdf}
                    title="Export Multi-Page Architectural PDF Dossier"
                    className="h-8 px-3 rounded-[8px] bg-red-600/15 hover:bg-red-600/25 active:bg-red-600/30 text-red-600 dark:text-red-400 border border-red-500/25 text-[12px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mr-2 select-none shadow-xs"
                  >
                    {isExportingPdf ? (
                      <>
                        <Icon name="loader" size={14} className="animate-spin text-red-500" />
                        <span>Exporting PDF...</span>
                      </>
                    ) : (
                      <>
                        <Icon name="file-text" size={14} />
                        <span>Export Dossier (PDF)</span>
                      </>
                    )}
                  </button>

                  {/* Export SVG Button */}
                  <button
                    type="button"
                    onClick={handleDownloadSvg}
                    className="px-3.5 py-1.5 rounded-[10px] bg-[var(--accent)] text-white text-[12px] font-semibold flex items-center gap-1.5 hover:brightness-95 transition-all cursor-pointer shadow-sm mr-2"
                  >
                    <Icon name="download" size={14} />
                    <span>Export SVG</span>
                  </button>

                  {/* Close Button */}
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="w-8 h-8 rounded-[10px] bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-2)] hover:text-[var(--text-1)] flex items-center justify-center transition-colors cursor-pointer"
                    aria-label="Close modal"
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
              </div>

              {/* Modal Storey Switcher Tabs */}
              {renderFloorSwitcher(true)}

              {/* Modal Body Canvas */}
              <div
                className="relative flex-1 w-full overflow-hidden select-none"
                style={{ backgroundColor: 'var(--blueprint-bg)' }}
                onMouseDown={handleModalMouseDown}
                onMouseMove={handleModalMouseMove}
                onMouseUp={handleModalMouseUp}
              >
                <div
                  className="w-full h-full flex items-center justify-center p-8 transition-transform will-change-transform"
                  style={{
                    transform: `translate(${modalPan.x}px, ${modalPan.y}px) scale(${modalZoom})`,
                    transformOrigin: 'center center',
                    transition: isModalPanning ? 'none' : 'transform 0.15s ease-out',
                    cursor: isModalPanning ? 'grabbing' : 'grab',
                  }}
                >
                  <div
                    key={`modal-blueprint-svg-${activeFloorIndex}-${mode}-${sanitizedSvg.length}-${plotWidthM}-${plotDepthM}`}
                    className="relative flex items-center justify-center max-w-full max-h-full drop-shadow-xl"
                    dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
                  />
                </div>
              </div>

              {/* Modal Footer Legend */}
              {currentPlacements.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 p-3 border-t border-[var(--hairline)] bg-[var(--fill)]/20">
                  <div className="flex items-center gap-1 mr-1">
                    <span className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider">
                      {currentFloor ? `${currentFloor.floor_name} Zones:` : 'Spatial Allocations:'}
                    </span>
                    {currentFloor && (
                      <span className="text-[10px] text-[var(--text-3)] font-mono">
                        ({currentFloor.rooms.length} spaces)
                      </span>
                    )}
                  </div>
                  {currentPlacements.map((p, pIdx) => {
                    const meta = ROOM_METADATA[p.room_id] || {
                      dotColor: p.is_core ? '#8B5CF6' : '#64748B',
                      label: p.room_name,
                      zone: p.zone,
                    };
                    return (
                      <div
                        key={`modal-legend-${p.room_id}-${pIdx}`}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium whitespace-nowrap select-none border ${
                          p.is_core
                            ? 'bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300'
                            : 'bg-[var(--fill)] border-transparent text-[var(--text-1)]'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: meta.dotColor }}
                        />
                        <span className="text-[12px] font-medium">{meta.label}</span>
                        {p.area_sqm && (
                          <span className="text-[11px] font-mono opacity-80">{p.area_sqm.toFixed(1)}m²</span>
                        )}
                        <span className="text-[11px] text-[var(--text-3)] font-normal">({p.zone})</span>
                        {p.is_core && (
                          <span className="text-[9px] px-1 py-0.2 rounded font-bold uppercase bg-purple-500/20 text-purple-600 dark:text-purple-300 tracking-wider">
                            Core
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

