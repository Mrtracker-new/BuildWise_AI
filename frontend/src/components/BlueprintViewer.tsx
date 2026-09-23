import React, { useState, useRef, useCallback, useMemo } from 'react';
import type { RoomPlacement } from '../services/types';
import { Icon } from './Icon';

interface BlueprintViewerProps {
  svgString: string;
  placements?: RoomPlacement[];
  plotWidthM?: number;
  plotDepthM?: number;
}

const ROOM_COLOR_MAP: Record<string, { bg: string; border: string; label: string }> = {
  master_bed: { bg: 'bg-slate-100', border: 'border-slate-300', label: 'Master Bed' },
  living: { bg: 'bg-emerald-50', border: 'border-emerald-300', label: 'Living' },
  kitchen: { bg: 'bg-amber-100', border: 'border-amber-300', label: 'Kitchen (SE)' },
  puja: { bg: 'bg-yellow-100', border: 'border-yellow-300', label: 'Puja (NE)' },
  bath_1: { bg: 'bg-sky-100', border: 'border-sky-300', label: 'Bath 1' },
  bath_2: { bg: 'bg-sky-100', border: 'border-sky-300', label: 'Bath 2' },
  bed_2: { bg: 'bg-slate-50', border: 'border-slate-300', label: 'Bed 2' },
  dining: { bg: 'bg-pink-50', border: 'border-pink-300', label: 'Dining' },
  stairs: { bg: 'bg-purple-50', border: 'border-purple-300', label: 'Stairs' },
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
    // Only left click triggers panning
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
    <div className="flex flex-col w-full min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden @container">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50/80 border-b border-slate-200 text-xs text-slate-700">
        <div className="flex items-center gap-1.5 font-medium text-slate-900">
          <Icon name="blueprint" size={15} className="text-sky-600" />
          <span>Architectural Blueprint</span>
          {plotWidthM && plotDepthM && (
            <span className="font-mono text-[11px] text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded">
              {plotWidthM}m × {plotDepthM}m
            </span>
          )}
        </div>

        {/* Zoom & Action Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 0.75}
            title="Zoom Out"
            aria-label="Zoom Out"
            className="p-1 rounded bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-200 text-slate-700 transition-colors shadow-2xs"
          >
            <Icon name="zoom-out" size={14} />
          </button>
          <span className="font-mono text-[11px] px-1.5 py-0.5 text-slate-600 select-none min-w-[36px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 2.5}
            title="Zoom In"
            aria-label="Zoom In"
            className="p-1 rounded bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-200 text-slate-700 transition-colors shadow-2xs"
          >
            <Icon name="zoom-in" size={14} />
          </button>
          <button
            type="button"
            onClick={handleReset}
            title="Reset View"
            aria-label="Reset View"
            className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors shadow-2xs ml-0.5"
          >
            <Icon name="refresh" size={14} />
          </button>
          <button
            type="button"
            onClick={handleDownloadSvg}
            title="Download SVG Blueprint"
            aria-label="Download SVG Blueprint"
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium text-[11px] transition-colors shadow-2xs ml-1"
          >
            <Icon name="download" size={12} />
            <span>SVG</span>
          </button>
        </div>
      </div>

      {/* SVG Canvas Container with CSS Pan & Zoom Transform */}
      <div
        className={`relative w-full h-[360px] sm:h-[420px] bg-slate-50/50 overflow-hidden select-none ${
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="w-full h-full flex items-center justify-center p-4 transition-transform will-change-transform"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.15s ease-out',
          }}
          dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
        />
      </div>

      {/* Room Legend Chips */}
      {placements.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 bg-slate-50/70 border-t border-slate-200 text-[11px] text-slate-600">
          <span className="font-semibold text-slate-700 uppercase tracking-wider text-[10px] mr-1">
            Legend:
          </span>
          {placements.map((p) => {
            const conf = ROOM_COLOR_MAP[p.room_id] || {
              bg: 'bg-slate-100',
              border: 'border-slate-300',
              label: p.room_name,
            };
            return (
              <div
                key={p.room_id}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 shadow-2xs"
              >
                <span className={`w-2.5 h-2.5 rounded-full ${conf.bg} border ${conf.border}`} />
                <span className="font-medium text-slate-800">{conf.label}</span>
                <span className="text-slate-400 text-[10px]">({p.zone})</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
