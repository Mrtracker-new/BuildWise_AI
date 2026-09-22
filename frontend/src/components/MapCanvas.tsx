import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from './Icon';

interface MapCanvasProps {
  latitude: number | null;
  longitude: number | null;
  orientationDegrees?: number;
  plinthAreaSqFt?: number;
  onLocationSelect: (lat: number, lon: number) => void;
  invalidateTrigger?: any;
  className?: string;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  latitude,
  longitude,
  orientationDegrees,
  plinthAreaSqFt,
  onLocationSelect,
  invalidateTrigger,
  className = 'h-full w-full',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const footprintPolygonRef = useRef<L.Polygon | null>(null);

  const onLocationSelectRef = useRef(onLocationSelect);
  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  // Default coordinate: Center of India (Nagpur / Central Plateau)
  const defaultLat = 20.5937;
  const defaultLon = 78.9629;
  const defaultZoom = 5;

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [latitude ?? defaultLat, longitude ?? defaultLon],
      zoom: latitude && longitude ? 14 : defaultZoom,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Click handler for location selection
    map.on('click', (e: L.LeafletMouseEvent) => {
      onLocationSelectRef.current(e.latlng.lat, e.latlng.lng);
    });

    mapInstanceRef.current = map;

    // Window and container resize observers
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    const handleWindowResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      resizeObserver.disconnect();
      if (markerRef.current) {
        try { map.removeLayer(markerRef.current); } catch {}
        markerRef.current = null;
      }
      if (footprintPolygonRef.current) {
        try { map.removeLayer(footprintPolygonRef.current); } catch {}
        footprintPolygonRef.current = null;
      }
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Trigger manual invalidateSize when external trigger changes (e.g. drawer toggle, tab change)
  useEffect(() => {
    if (mapInstanceRef.current) {
      // Invalidate immediately and after a short tick for CSS transitions
      mapInstanceRef.current.invalidateSize();
      const timer = setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [invalidateTrigger]);

  // Update marker position and building footprint when coordinates change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (latitude !== null && longitude !== null) {
      const latlng: L.LatLngExpression = [latitude, longitude];

      // Ensure marker exists and is attached to current map
      if (!markerRef.current || !map.hasLayer(markerRef.current)) {
        if (markerRef.current) {
          try { map.removeLayer(markerRef.current); } catch {}
          markerRef.current = null;
        }

        const customIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `
            <svg width="32" height="38" viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block;">
              <path d="M12 0C5.37 0 0 5.37 0 12C0 19.5 10.5 27.5 11.5 28C11.8 28.2 12.2 28.2 12.5 28C13.5 27.5 24 19.5 24 12C24 5.37 18.63 0 12 0Z" fill="#0F172A" stroke="#FFFFFF" stroke-width="1.5"/>
              <circle cx="12" cy="11" r="4.5" fill="#FFFFFF"/>
            </svg>
          `,
          iconSize: [32, 38],
          iconAnchor: [16, 38],
        });

        markerRef.current = L.marker(latlng, {
          icon: customIcon,
          draggable: true,
        }).addTo(map);

        markerRef.current.on('dragend', (e) => {
          const newPos = e.target.getLatLng();
          onLocationSelectRef.current(newPos.lat, newPos.lng);
        });
      } else {
        markerRef.current.setLatLng(latlng);
      }

      // Draw oriented building footprint polygon if orientation angle is provided
      if (orientationDegrees !== undefined) {
        // 1. Plinth area converted once from sq ft to sq meters with fixed aspect ratio (1.75:1)
        const plinthSqFt = plinthAreaSqFt ?? 2000;
        const areaM2 = plinthSqFt * 0.092903;
        const aspectRatio = 1.75;
        const widthM = Math.sqrt(areaM2 / aspectRatio);
        const lengthM = widthM * aspectRatio;
        const halfLength = lengthM / 2.0;
        const halfWidth = widthM / 2.0;

        // 2. Orientation value is the bearing of the LONG axis, clockwise from North
        const aRad = (orientationDegrees * Math.PI) / 180.0;
        // Long-axis unit vector: (east, north) = (sin a, cos a)
        const longUnitE = Math.sin(aRad);
        const longUnitN = Math.cos(aRad);

        // Short-axis unit vector: (sin(a+90), cos(a+90))
        const shortAngleRad = aRad + Math.PI / 2.0;
        const shortUnitE = Math.sin(shortAngleRad);
        const shortUnitN = Math.cos(shortAngleRad);

        // 3. Four corners in meters around center (0, 0)
        // x along long axis (+/- halfLength), y along short axis (+/- halfWidth)
        const corners = [
          { x: -halfLength, y: -halfWidth },
          { x: halfLength, y: -halfWidth },
          { x: halfLength, y: halfWidth },
          { x: -halfLength, y: halfWidth },
        ];

        // 4. Pure geographic math degree conversion:
        // dLat = metersNorth / 110540
        // dLng = metersEast / (111320 * cos(latitude in radians))
        const latRad = (latitude * Math.PI) / 180.0;
        const polygonPoints: [number, number][] = corners.map((c) => {
          const metersEast = c.x * longUnitE + c.y * shortUnitE;
          const metersNorth = c.x * longUnitN + c.y * shortUnitN;
          const dLat = metersNorth / 110540.0;
          const dLng = metersEast / (111320.0 * Math.cos(latRad));
          return [latitude + dLat, longitude + dLng];
        });

        if (footprintPolygonRef.current && map.hasLayer(footprintPolygonRef.current)) {
          footprintPolygonRef.current.setLatLngs(polygonPoints);
          footprintPolygonRef.current.setTooltipContent(
            `Proposed Layout Footprint (${orientationDegrees.toFixed(0)}° Long Axis)`
          );
        } else {
          if (footprintPolygonRef.current) {
            try { map.removeLayer(footprintPolygonRef.current); } catch {}
            footprintPolygonRef.current = null;
          }
          footprintPolygonRef.current = L.polygon(polygonPoints, {
            color: '#0F172A',
            weight: 1.5,
            fillColor: '#0284C7',
            fillOpacity: 0.35,
            dashArray: '4, 4',
          })
            .addTo(map)
            .bindTooltip(`Proposed Layout Footprint (${orientationDegrees.toFixed(0)}° Long Axis)`, {
              permanent: false,
              direction: 'top',
            });
        }
      } else if (footprintPolygonRef.current) {
        try { map.removeLayer(footprintPolygonRef.current); } catch {}
        footprintPolygonRef.current = null;
      }

      // Expose map, marker, and footprint for audit testing (prefer visible map instance)
      if (typeof window !== 'undefined') {
        const isVisible = mapContainerRef.current && mapContainerRef.current.offsetParent !== null;
        if (isVisible || !(window as any).__leafletMap) {
          (window as any).__leafletMap = map;
          (window as any).__leafletMarker = markerRef.current;
          (window as any).__leafletFootprint = footprintPolygonRef.current;
        }
      }

      map.panTo(latlng);
    } else {
      if (markerRef.current) {
        try { map.removeLayer(markerRef.current); } catch {}
        markerRef.current = null;
      }
      if (footprintPolygonRef.current) {
        try { map.removeLayer(footprintPolygonRef.current); } catch {}
        footprintPolygonRef.current = null;
      }
      if (typeof window !== 'undefined') {
        (window as any).__leafletMarker = null;
        (window as any).__leafletFootprint = null;
      }
    }
  }, [latitude, longitude, orientationDegrees, plinthAreaSqFt]);

  const handleResetView = () => {
    if (mapInstanceRef.current) {
      if (latitude !== null && longitude !== null) {
        mapInstanceRef.current.setView([latitude, longitude], 14);
      } else {
        mapInstanceRef.current.setView([defaultLat, defaultLon], defaultZoom);
      }
    }
  };

  return (
    <div className={`relative z-0 overflow-hidden bg-slate-100 ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Instructions Banner */}
      {!latitude && !longitude && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[90%] bg-slate-900/90 text-white backdrop-blur-sm px-3.5 py-1.5 rounded-full text-xs font-medium shadow-md flex items-center gap-2 pointer-events-none text-center">
          <Icon name="crosshair" size={14} className="text-sky-400 shrink-0" />
          <span className="whitespace-normal break-words">Click map to place site marker</span>
        </div>
      )}

      {/* Map Floating Status Pill (bottom-left, does not cover bottom-right OSM attribution) */}
      {latitude !== null && longitude !== null && (
        <div className="absolute bottom-3 left-3 z-20 max-w-[calc(100%-150px)] bg-white/95 backdrop-blur-sm border border-slate-200 px-2.5 py-1.5 rounded shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2.5 text-xs min-w-0">
          <div className="flex items-center gap-1.5 text-slate-700 font-mono text-[11px] sm:text-xs min-w-0 flex-wrap">
            <span className="font-semibold text-slate-900">LAT:</span>
            <span className="tabular-nums">{latitude.toFixed(5)}</span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold text-slate-900">LON:</span>
            <span className="tabular-nums">{longitude.toFixed(5)}</span>
          </div>
          {orientationDegrees !== undefined && (
            <div className="flex items-center gap-1 font-mono text-[10px] sm:text-[11px] text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 shrink-0">
              <Icon name="compass" size={12} className="shrink-0" />
              <span>Footprint: {orientationDegrees.toFixed(0)}°</span>
            </div>
          )}
        </div>
      )}

      {/* Floating Recenter Button */}
      <button
        type="button"
        onClick={handleResetView}
        className="absolute top-3 right-3 z-20 bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 p-2 rounded shadow-sm transition-colors"
        title="Recenter Map View"
        aria-label="Recenter Map View"
      >
        <Icon name="crosshair" size={16} />
      </button>
    </div>
  );
};
