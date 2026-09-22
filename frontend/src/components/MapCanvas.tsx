import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from './Icon';

interface MapCanvasProps {
  latitude: number | null;
  longitude: number | null;
  orientationDegrees?: number;
  onLocationSelect: (lat: number, lon: number) => void;
  invalidateTrigger?: any;
  className?: string;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  latitude,
  longitude,
  orientationDegrees,
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

      if (!markerRef.current) {
        const customIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `
            <div style="transform: translate(-50%, -100%);">
              <svg width="32" height="38" viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 0C5.37 0 0 5.37 0 12C0 19.5 10.5 27.5 11.5 28C11.8 28.2 12.2 28.2 12.5 28C13.5 27.5 24 19.5 24 12C24 5.37 18.63 0 12 0Z" fill="#0F172A" stroke="#FFFFFF" stroke-width="1.5"/>
                <circle cx="12" cy="11" r="4.5" fill="#FFFFFF"/>
              </svg>
            </div>
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
      if (footprintPolygonRef.current) {
        map.removeLayer(footprintPolygonRef.current);
        footprintPolygonRef.current = null;
      }

      if (orientationDegrees !== undefined) {
        const angleRad = (orientationDegrees * Math.PI) / 180.0;
        const lengthDeg = 30.0 / 111139.0;
        const widthDeg = 15.0 / (111139.0 * Math.cos((latitude * Math.PI) / 180.0));

        const dxL = (Math.cos(angleRad) * lengthDeg) / 2.0;
        const dyL = (Math.sin(angleRad) * lengthDeg) / 2.0;
        const dxW = (-Math.sin(angleRad) * widthDeg) / 2.0;
        const dyW = (Math.cos(angleRad) * widthDeg) / 2.0;

        const p1: [number, number] = [latitude + dyL + dyW, longitude + dxL + dxW];
        const p2: [number, number] = [latitude + dyL - dyW, longitude + dxL - dxW];
        const p3: [number, number] = [latitude - dyL - dyW, longitude - dxL - dxW];
        const p4: [number, number] = [latitude - dyL + dyW, longitude - dxL + dxW];

        footprintPolygonRef.current = L.polygon([p1, p2, p3, p4], {
          color: '#0F172A',
          weight: 1.5,
          fillColor: '#0284C7',
          fillOpacity: 0.35,
          dashArray: '4, 4',
        })
          .addTo(map)
          .bindTooltip(`Proposed Layout Footprint (${orientationDegrees.toFixed(0)} deg Axis)`, {
            permanent: false,
            direction: 'top',
          });
      }

      map.panTo(latlng);
    } else {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      if (footprintPolygonRef.current) {
        map.removeLayer(footprintPolygonRef.current);
        footprintPolygonRef.current = null;
      }
    }
  }, [latitude, longitude, orientationDegrees]);

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
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 text-white backdrop-blur-sm px-3.5 py-1.5 rounded-full text-xs font-medium shadow-md flex items-center gap-2 pointer-events-none">
          <Icon name="crosshair" size={14} className="text-sky-400" />
          <span>Click anywhere on the map to place site marker</span>
        </div>
      )}

      {/* Map Floating Status Pill (bottom-left, does not cover bottom-right OSM attribution) */}
      {latitude !== null && longitude !== null && (
        <div className="absolute bottom-3 left-3 z-20 max-w-[calc(100%-160px)] bg-white/95 backdrop-blur-sm border border-slate-200 px-3 py-1.5 rounded shadow-sm flex items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1.5 text-slate-700 font-mono">
            <span className="font-semibold text-slate-900">LAT:</span> {latitude.toFixed(5)}
            <span className="text-slate-300">|</span>
            <span className="font-semibold text-slate-900">LON:</span> {longitude.toFixed(5)}
          </div>
          {orientationDegrees !== undefined && (
            <div className="flex items-center gap-1 font-mono text-[11px] text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 shrink-0">
              <Icon name="compass" size={12} />
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
