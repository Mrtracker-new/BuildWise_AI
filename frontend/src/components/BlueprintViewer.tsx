import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';
import type { RoomPlacement } from '../services/types';
import { Icon } from './Icon';

interface BlueprintViewerProps {
  svgString: string;
  svgPaperString?: string;
  placements?: RoomPlacement[];
  plotWidthM?: number;
  plotDepthM?: number;
}

const ROOM_METADATA: Record<string, { dotColor: string; label: string; zone: string }> = {
  master_bed: { dotColor: '#0284C7', label: 'Master Bedroom', zone: 'SW' },
  living: { dotColor: '#10B981', label: 'Living Room', zone: 'N/E' },
  kitchen: { dotColor: '#F59E0B', label: 'Kitchen', zone: 'SE' },
  puja: { dotColor: '#EAB308', label: 'Puja Room', zone: 'NE' },
  bath_1: { dotColor: '#06B6D4', label: 'Primary Bath', zone: 'W' },
  bath_2: { dotColor: '#14B8A6', label: 'Common Bath', zone: 'NW' },
  bed_2: { dotColor: '#3B82F6', label: 'Bedroom 2', zone: 'NW' },
  dining: { dotColor: '#F97316', label: 'Dining Area', zone: 'W' },
  stairs: { dotColor: '#64748B', label: 'Staircase', zone: 'SW/W' },
};

export const BlueprintViewer: React.FC<BlueprintViewerProps> = ({
  svgString,
  svgPaperString,
  placements = [],
  plotWidthM,
  plotDepthM,
}) => {
  const [mode, setMode] = useState<'cad' | 'paper'>('cad');
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Modal zoom and pan state
  const [modalZoom, setModalZoom] = useState<number>(1.0);
  const [modalPan, setModalPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isModalPanning, setIsModalPanning] = useState<boolean>(false);

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const modalDragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const modalPanStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const activeSvg = mode === 'paper' && svgPaperString ? svgPaperString : svgString;

  // Sanitize raw SVG and inject paint-order halo style for crisp room labels
  const sanitizedSvg = useMemo(() => {
    if (!activeSvg) return '';
    const cleaned = activeSvg
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

    // Inject paint-order stroke halo rule into SVG for legibility
    const styleInjection = `
      <style>
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
      return cleaned.replace(/<svg\b([^>]*)>/i, `<svg $1>${styleInjection}`);
    }
    return cleaned;
  }, [activeSvg]);

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
    link.download = `BuildWise_Blueprint_${plotWidthM || 10}x${plotDepthM || 12}m.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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

  return (
    <div
      id="blueprint-viewer-container"
      className="flex flex-col w-full min-w-0 rounded-[16px] vibrancy-panel border border-[var(--panel-border-color)] shadow-md overflow-hidden @container"
    >
      {/* 1. Header: title 15px/600 left; right = single nowrap dimension chip + CAD 2D chip */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-[var(--hairline)]">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="blueprint" size={15} className="text-[var(--accent)] shrink-0" />
          <h3 className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight truncate">
            Architectural Blueprint
          </h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {plotWidthM && plotDepthM && (
            <span className="font-mono text-[11px] font-medium text-[var(--text-1)] bg-[var(--fill)] px-2 py-0.5 rounded-[6px] whitespace-nowrap">
              {plotWidthM.toFixed(1)}m × {plotDepthM.toFixed(1)}m
            </span>
          )}
          <span className="text-[10px] font-semibold text-[var(--accent)] bg-[var(--accent-tint)] px-1.5 py-0.5 rounded-[6px] uppercase tracking-wider whitespace-nowrap">
            CAD 2D
          </span>
        </div>
      </div>

      {/* 2. Toolbar row below header: 28px square --fill buttons radius 8, 14px icons, gap 8, zoom % label 12px --text-2 */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-[var(--hairline)] bg-[var(--fill)]/30">
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

      {/* 3. Canvas Preview: SVG at 100% width, min-height 320px, bg token --blueprint-bg. Click to open modal */}
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

      {/* 4. Legend: flex-wrap gap 8; 10px dot + name 12px/500 --text-1 + zone 11px --text-3 in parens; bg --fill, radius full, padding 4px 10px, white-space: nowrap */}
      {placements.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 border-t border-[var(--hairline)]">
          <span className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider mr-1">
            Legend:
          </span>
          {placements.map((p) => {
            const meta = ROOM_METADATA[p.room_id] || {
              dotColor: '#64748B',
              label: p.room_name,
              zone: p.zone,
            };
            return (
              <div
                key={p.room_id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--fill)] text-[12px] font-medium text-[var(--text-1)] whitespace-nowrap select-none"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                  style={{ backgroundColor: meta.dotColor }}
                />
                <span className="text-[12px] font-medium text-[var(--text-1)]">{meta.label}</span>
                <span className="text-[11px] text-[var(--text-3)] font-normal">({p.zone})</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. macOS-Style Fullscreen Sheet Modal */}
      {isModalOpen &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[2000] bg-black/50 backdrop-blur-[20px] flex items-center justify-center p-3 sm:p-6 animate-fade-in"
            onClick={() => setIsModalOpen(false)}
          >
            <div
              className="vibrancy-panel rounded-[20px] max-w-[90vw] max-h-[85vh] w-full h-full flex flex-col shadow-2xl border border-[var(--panel-border-color)] overflow-hidden"
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
                      Architectural Floor Plan
                    </h3>
                    <p className="text-[12px] text-[var(--text-2)] truncate">
                      CAD 2D Drafting &bull; {plotWidthM || 10}m × {plotDepthM || 12}m Grid
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Mode switcher in modal */}
                  <div className="flex items-center bg-[var(--fill)] rounded-[8px] p-0.5 mr-2">
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
                    className="relative flex items-center justify-center max-w-full max-h-full drop-shadow-xl"
                    dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
                  />
                </div>
              </div>

              {/* Modal Footer Legend */}
              {placements.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 p-3 border-t border-[var(--hairline)] bg-[var(--fill)]/20">
                  <span className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider mr-1">
                    Spatial Zone Allocations:
                  </span>
                  {placements.map((p) => {
                    const meta = ROOM_METADATA[p.room_id] || {
                      dotColor: '#64748B',
                      label: p.room_name,
                      zone: p.zone,
                    };
                    return (
                      <div
                        key={p.room_id}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--fill)] text-[12px] font-medium text-[var(--text-1)] whitespace-nowrap select-none"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: meta.dotColor }}
                        />
                        <span className="text-[12px] font-medium text-[var(--text-1)]">{meta.label}</span>
                        <span className="text-[11px] text-[var(--text-3)] font-normal">({p.zone})</span>
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
