import React, { useState, useRef, useCallback, useMemo } from 'react';
import type { RoomPlacement } from '../services/types';
import { Icon } from './Icon';

interface BlueprintViewerProps {
  svgString: string;
  placements?: RoomPlacement[];
  plotWidthM?: number;
  plotDepthM?: number;
}

const ROOM_COLOR_MAP: Record<string, { bg: string; border: string; text: string; label: string }> = {
  master_bed: { bg: 'bg-sky-500/20', border: 'border-sky-500/60', text: 'text-sky-300', label: 'Master Bed' },
  living: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/60', text: 'text-emerald-300', label: 'Living Room' },
  kitchen: { bg: 'bg-amber-500/20', border: 'border-amber-500/60', text: 'text-amber-300', label: 'Kitchen (SE)' },
  puja: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/60', text: 'text-yellow-300', label: 'Puja (NE)' },
  bath_1: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/60', text: 'text-cyan-300', label: 'Primary Bath' },
  bath_2: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/60', text: 'text-cyan-300', label: 'Common Bath' },
  bed_2: { bg: 'bg-indigo-500/20', border: 'border-indigo-500/60', text: 'text-indigo-300', label: 'Bedroom 2' },
  dining: { bg: 'bg-pink-500/20', border: 'border-pink-500/60', text: 'text-pink-300', label: 'Dining Area' },
  stairs: { bg: 'bg-purple-500/20', border: 'border-purple-500/60', text: 'text-purple-300', label: 'Stairs' },
};

export const BlueprintViewer: React.FC<BlueprintViewerProps> = ({
  svgString,
  placements = [],
  plotWidthM,
  plotDepthM,
}) => {
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Sanitize raw SVG string to eliminate any potential script tags or inline events
  const sanitizedSvg = useMemo(() => {
    if (!svgString) return '';
    return svgString
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  }, [svgString]);

  const handleZoomIn = () => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)));
  const handleZoomOut = () => setZoom((z) => Math.max(0.75, +(z - 0.25).toFixed(2)));
  const handleReset = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

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

  return (
    <div className="flex flex-col w-full min-w-0 rounded-xl border border-slate-800 bg-slate-900 shadow-xl overflow-hidden @container">
      {/* Dark CAD Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-950/90 border-b border-slate-800 text-xs text-slate-300">
        <div className="flex items-center gap-2 font-medium text-slate-200">
          <div className="p-1 rounded bg-cyan-950/80 border border-cyan-800/60 text-cyan-400">
            <Icon name="blueprint" size={15} />
          </div>
          <span className="font-semibold tracking-wide text-slate-100">Architectural Blueprint</span>
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-cyan-400 font-mono bg-cyan-950/50 border border-cyan-800/40 px-1.5 py-0.5 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
            CAD 2D DRAFTING
          </span>
          {plotWidthM && plotDepthM && (
            <span className="font-mono text-[11px] text-cyan-300 bg-cyan-950/70 border border-cyan-800/60 px-2 py-0.5 rounded">
              {plotWidthM}m × {plotDepthM}m
            </span>
          )}
        </div>

        {/* Zoom & Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 0.75}
            title="Zoom Out"
            aria-label="Zoom Out"
            className="p-1.5 rounded-md bg-slate-800/90 hover:bg-slate-700/90 disabled:opacity-30 border border-slate-700/80 text-slate-200 transition-colors shadow-2xs cursor-pointer"
          >
            <Icon name="zoom-out" size={13} />
          </button>
          <span className="font-mono text-[11px] px-2 py-0.5 text-cyan-400 select-none min-w-[42px] text-center font-semibold">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 2.5}
            title="Zoom In"
            aria-label="Zoom In"
            className="p-1.5 rounded-md bg-slate-800/90 hover:bg-slate-700/90 disabled:opacity-30 border border-slate-700/80 text-slate-200 transition-colors shadow-2xs cursor-pointer"
          >
            <Icon name="zoom-in" size={13} />
          </button>
          <button
            type="button"
            onClick={handleReset}
            title="Reset View"
            aria-label="Reset View"
            className="p-1.5 rounded-md bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 text-slate-200 transition-colors shadow-2xs ml-0.5 cursor-pointer"
          >
            <Icon name="refresh" size={13} />
          </button>
          <button
            type="button"
            onClick={handleDownloadSvg}
            title="Download CAD SVG Blueprint"
            aria-label="Download CAD SVG Blueprint"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-[11px] transition-colors shadow-xs ml-1 cursor-pointer"
          >
            <Icon name="download" size={12} />
            <span>EXPORT SVG</span>
          </button>
        </div>
      </div>

      {/* SVG Canvas Container with CSS Pan & Zoom Transform (no viewBox modification) */}
      <div
        className={`relative w-full h-[380px] sm:h-[460px] bg-slate-900 overflow-hidden select-none ${
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Ambient 1m SVG Drafting Grid Pattern for CAD workspace */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none opacity-40"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="viewer-ambient-grid" width="52" height="52" patternUnits="userSpaceOnUse">
              <path d="M 52 0 L 0 0 0 52" fill="none" stroke="#1E293B" strokeWidth="0.75" />
              <path d="M 26 0 L 26 52 M 0 26 L 52 26" fill="none" stroke="#1E293B" strokeWidth="0.3" strokeDasharray="2 2" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#viewer-ambient-grid)" />
        </svg>

        {/* Pan & Zoom Transform Wrapper */}
        <div
          className="w-full h-full flex items-center justify-center p-4 transition-transform will-change-transform"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.15s ease-out',
          }}
        >
          <div
            className="relative flex items-center justify-center max-w-full max-h-full drop-shadow-[0_8px_32px_rgba(0,0,0,0.8)]"
            dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
          />
        </div>
      </div>

      {/* Dark CAD Room Legend Chips */}
      {placements.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 bg-slate-950/90 border-t border-slate-800 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px] mr-1">
            Legend:
          </span>
          {placements.map((p) => {
            const conf = ROOM_COLOR_MAP[p.room_id] || {
              bg: 'bg-slate-800/40',
              border: 'border-slate-700',
              text: 'text-slate-300',
              label: p.room_name,
            };
            return (
              <div
                key={p.room_id}
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 shadow-2xs"
              >
                <span className={`w-2.5 h-2.5 rounded-full ${conf.bg} border ${conf.border}`} />
                <span className={`font-medium ${conf.text}`}>{conf.label}</span>
                <span className="text-slate-500 text-[10px] font-mono">({p.zone})</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
