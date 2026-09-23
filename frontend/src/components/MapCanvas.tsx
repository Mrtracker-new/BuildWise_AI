import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from './Icon';
import type { GeoJsonFeatureCollection } from '../services/types';

interface MapCanvasProps {
  latitude: number | null;
  longitude: number | null;
  orientationDegrees?: number;
  plinthAreaSqFt?: number;
  onLocationSelect: (lat: number, lon: number) => void;
  invalidateTrigger?: any;
  className?: string;
  entranceDirection?: string;
  treeClusters?: GeoJsonFeatureCollection | null;
  waterBodies?: GeoJsonFeatureCollection | null;
  theme?: 'light' | 'dark';
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  latitude,
  longitude,
  orientationDegrees,
  plinthAreaSqFt,
  onLocationSelect,
  invalidateTrigger,
  className = 'h-full w-full',
  entranceDirection,
  treeClusters,
  waterBodies,
  theme = 'light',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const footprintPolygonRef = useRef<L.Polygon | null>(null);
  const entranceArrowRef = useRef<L.LayerGroup | null>(null);
  const treeLayerRef = useRef<L.GeoJSON | null>(null);
  const waterLayerRef = useRef<L.GeoJSON | null>(null);

  const [showTreeLayer, setShowTreeLayer] = useState<boolean>(true);
  const [showWaterLayer, setShowWaterLayer] = useState<boolean>(true);

  const onLocationSelectRef = useRef(onLocationSelect);
  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  // Default coordinate: Center of India (Nagpur / Central Plateau)
  const defaultLat = 20.5937;
  const defaultLon = 78.9629;
  const defaultZoom = 5;

  const cartoApiKey =
    (import.meta.env.VITE_CARTO_API_KEY as string | undefined) ||
    'cb1_3vk0_1_9281be2f944ee8308f719dd1';

  const getTileUrl = (t: 'light' | 'dark') => {
    const base =
      t === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    return cartoApiKey ? `${base}?key=${cartoApiKey}` : base;
  };

  const getPinIcon = (t: 'light' | 'dark') => {
    const accentColor = t === 'dark' ? '#0A84FF' : '#0071E3';
    return L.divIcon({
      className: 'apple-map-pin-root',
      html: `
        <div class="apple-pin-container">
          <div class="apple-pin-ring" style="border-color: ${accentColor};"></div>
          <svg class="apple-pin-svg" width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 0C7.61 0 0 7.61 0 17C0 28.5 15.3 40.8 16.2 41.5C16.7 41.9 17.3 41.9 17.8 41.5C18.7 40.8 34 28.5 34 17C34 7.61 26.39 0 17 0Z" fill="${accentColor}"/>
            <circle cx="17" cy="16" r="4.5" fill="#FFFFFF"/>
          </svg>
        </div>
      `,
      iconSize: [34, 42],
      iconAnchor: [17, 42],
    });
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [latitude ?? defaultLat, longitude ?? defaultLon],
      zoom: latitude && longitude ? 14 : defaultZoom,
      zoomControl: false,
    });

    const tileLayer = L.tileLayer(getTileUrl(theme), {
      attribution: '&copy; CARTO &copy; OpenStreetMap contributors',
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    tileLayerRef.current = tileLayer;

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
      if (entranceArrowRef.current) {
        try { map.removeLayer(entranceArrowRef.current); } catch {}
        entranceArrowRef.current = null;
      }
      if (treeLayerRef.current) {
        try { map.removeLayer(treeLayerRef.current); } catch {}
        treeLayerRef.current = null;
      }
      if (waterLayerRef.current) {
        try { map.removeLayer(waterLayerRef.current); } catch {}
        waterLayerRef.current = null;
      }
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  // Synchronize CARTO tile URL when theme toggles
  useEffect(() => {
    if (tileLayerRef.current) {
      tileLayerRef.current.setUrl(getTileUrl(theme));
    }
    if (markerRef.current) {
      markerRef.current.setIcon(getPinIcon(theme));
    }
  }, [theme]);

  // Trigger manual invalidateSize when external trigger changes
  useEffect(() => {
    if (mapInstanceRef.current) {
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

      if (!markerRef.current || !map.hasLayer(markerRef.current)) {
        if (markerRef.current) {
          try { map.removeLayer(markerRef.current); } catch {}
          markerRef.current = null;
        }

        const customIcon = getPinIcon(theme);

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
        const plinthSqFt = plinthAreaSqFt ?? 2000;
        const areaM2 = plinthSqFt * 0.092903;
        const aspectRatio = 1.75;
        const widthM = Math.sqrt(areaM2 / aspectRatio);
        const lengthM = widthM * aspectRatio;
        const halfLength = lengthM / 2.0;
        const halfWidth = widthM / 2.0;

        const aRad = (orientationDegrees * Math.PI) / 180.0;
        const longUnitE = Math.sin(aRad);
        const longUnitN = Math.cos(aRad);

        const shortAngleRad = aRad + Math.PI / 2.0;
        const shortUnitE = Math.sin(shortAngleRad);
        const shortUnitN = Math.cos(shortAngleRad);

        const corners = [
          { x: -halfLength, y: -halfWidth },
          { x: halfLength, y: -halfWidth },
          { x: halfLength, y: halfWidth },
          { x: -halfLength, y: halfWidth },
        ];

        const latRad = (latitude * Math.PI) / 180.0;
        const polygonPoints: [number, number][] = corners.map((c) => {
          const metersEast = c.x * longUnitE + c.y * shortUnitE;
          const metersNorth = c.x * longUnitN + c.y * shortUnitN;
          const dLat = metersNorth / 110540.0;
          const dLng = metersEast / (111320.0 * Math.cos(latRad));
          return [latitude + dLat, longitude + dLng];
        });

        const accentColor = theme === 'dark' ? '#0A84FF' : '#0071E3';

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
            color: accentColor,
            weight: 1.5,
            fillColor: accentColor,
            fillOpacity: 0.2,
            dashArray: '4, 4',
          })
            .addTo(map)
            .bindTooltip(`Proposed Layout Footprint (${orientationDegrees.toFixed(0)}° Long Axis)`, {
              permanent: false,
              direction: 'top',
            });
        }

        // Footprint entrance arrow anchored at midpoint of corresponding edge
        if (entranceDirection) {
          const DIR_TO_DEG: Record<string, number> = {
            N: 0, NE: 45, E: 90, SE: 135,
            S: 180, SW: 225, W: 270, NW: 315,
          };
          const entDeg = DIR_TO_DEG[entranceDirection.toUpperCase()] ?? 45;
          const entRad = (entDeg * Math.PI) / 180.0;
          const uE = Math.sin(entRad);
          const uN = Math.cos(entRad);

          const edgeMidpoints = [
            { metersEast: -halfWidth * shortUnitE, metersNorth: -halfWidth * shortUnitN, normalE: -shortUnitE, normalN: -shortUnitN },
            { metersEast: halfLength * longUnitE, metersNorth: halfLength * longUnitN, normalE: longUnitE, normalN: longUnitN },
            { metersEast: halfWidth * shortUnitE, metersNorth: halfWidth * shortUnitN, normalE: shortUnitE, normalN: shortUnitN },
            { metersEast: -halfLength * longUnitE, metersNorth: -halfLength * longUnitN, normalE: -longUnitE, normalN: -longUnitN },
          ];

          let bestEdge = edgeMidpoints[0];
          let bestDot = -Infinity;
          for (const edge of edgeMidpoints) {
            const dot = edge.normalE * uE + edge.normalN * uN;
            if (dot > bestDot) {
              bestDot = dot;
              bestEdge = edge;
            }
          }

          const anchorDLat = bestEdge.metersNorth / 110540.0;
          const anchorDLng = bestEdge.metersEast / (111320.0 * Math.cos(latRad));
          const anchorLat = latitude + anchorDLat;
          const anchorLng = longitude + anchorDLng;

          const arrowLen = 7.0;
          const headLen = 2.5;
          const tipLat = anchorLat + (arrowLen * uN) / 110540.0;
          const tipLng = anchorLng + (arrowLen * uE) / (111320.0 * Math.cos(latRad));

          const headAngle1 = entRad + (145 * Math.PI) / 180.0;
          const headAngle2 = entRad - (145 * Math.PI) / 180.0;
          const wing1Lat = tipLat + (headLen * Math.cos(headAngle1)) / 110540.0;
          const wing1Lng = tipLng + (headLen * Math.sin(headAngle1)) / (111320.0 * Math.cos(latRad));
          const wing2Lat = tipLat + (headLen * Math.cos(headAngle2)) / 110540.0;
          const wing2Lng = tipLng + (headLen * Math.sin(headAngle2)) / (111320.0 * Math.cos(latRad));

          if (entranceArrowRef.current) {
            try { map.removeLayer(entranceArrowRef.current); } catch {}
            entranceArrowRef.current = null;
          }

          const arrowGroup = L.layerGroup();
          const shaft = L.polyline([[anchorLat, anchorLng], [tipLat, tipLng]], {
            color: accentColor,
            weight: 3,
            lineCap: 'round',
          });
          const head = L.polygon([[tipLat, tipLng], [wing1Lat, wing1Lng], [wing2Lat, wing2Lng]], {
            color: accentColor,
            fillColor: accentColor,
            fillOpacity: 1.0,
            weight: 1,
          });
          arrowGroup.addLayer(shaft);
          arrowGroup.addLayer(head);
          arrowGroup.addTo(map);
          arrowGroup.bindTooltip(`Main Entrance: ${entranceDirection.toUpperCase()}`, {
            permanent: false,
            direction: 'top',
          });
          entranceArrowRef.current = arrowGroup;
        } else if (entranceArrowRef.current) {
          try { map.removeLayer(entranceArrowRef.current); } catch {}
          entranceArrowRef.current = null;
        }
      } else {
        if (footprintPolygonRef.current) {
          try { map.removeLayer(footprintPolygonRef.current); } catch {}
          footprintPolygonRef.current = null;
        }
        if (entranceArrowRef.current) {
          try { map.removeLayer(entranceArrowRef.current); } catch {}
          entranceArrowRef.current = null;
        }
      }

      // Expose map, marker, and footprint for audit testing
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
      if (treeLayerRef.current) {
        try { map.removeLayer(treeLayerRef.current); } catch {}
        treeLayerRef.current = null;
      }
      if (waterLayerRef.current) {
        try { map.removeLayer(waterLayerRef.current); } catch {}
        waterLayerRef.current = null;
      }
      if (typeof window !== 'undefined') {
        (window as any).__leafletMarker = null;
        (window as any).__leafletFootprint = null;
        (window as any).__leafletTreeClusters = null;
        (window as any).__leafletWaterBodies = null;
      }
    }
  }, [latitude, longitude, orientationDegrees, plinthAreaSqFt, entranceDirection, theme]);

  // Synchronize Ecological GeoJSON Layers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (treeLayerRef.current) {
      try { map.removeLayer(treeLayerRef.current); } catch {}
      treeLayerRef.current = null;
    }

    if (showTreeLayer && treeClusters && treeClusters.features && treeClusters.features.length > 0) {
      const geoLayer = L.geoJSON(treeClusters as any, {
        style: (feature) => {
          const rank = feature?.properties?.rank || feature?.properties?.preservation_rank;
          let color = '#34C759';
          let fillColor = '#34C759';
          if (rank === 'preserve') {
            color = '#248A3D';
            fillColor = '#34C759';
          } else if (rank === 'compensate') {
            color = '#FF9F0A';
            fillColor = '#FF9F0A';
          } else if (rank === 'removable') {
            color = '#FF3B30';
            fillColor = '#FF3B30';
          }
          return {
            color,
            weight: 1.5,
            fillColor,
            fillOpacity: 0.3,
            dashArray: '4, 4',
          };
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {};
          const id = props.cluster_id || 'Cluster';
          const area = props.area_sqm ? `${props.area_sqm} m²` : '';
          const ndvi = props.mean_ndvi !== undefined ? ` (NDVI: ${props.mean_ndvi.toFixed(2)})` : '';
          const r = props.rank || props.preservation_rank;
          const rank = r ? ` [${r.toUpperCase()}]` : '';
          layer.bindTooltip(`Tree ${id}: ${area}${ndvi}${rank}`, {
            permanent: false,
            direction: 'top',
          });
        },
      }).addTo(map);

      treeLayerRef.current = geoLayer;
    }

    if (waterLayerRef.current) {
      try { map.removeLayer(waterLayerRef.current); } catch {}
      waterLayerRef.current = null;
    }

    if (showWaterLayer && waterBodies && waterBodies.features && waterBodies.features.length > 0) {
      const geoLayer = L.geoJSON(waterBodies as any, {
        style: {
          color: '#0A84FF',
          weight: 1.5,
          fillColor: '#0A84FF',
          fillOpacity: 0.3,
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {};
          const id = props.cluster_id || 'Water Body';
          const area = props.area_sqm ? `${props.area_sqm} m²` : '';
          layer.bindTooltip(`${id}: ${area}`, {
            permanent: false,
            direction: 'top',
          });
        },
      }).addTo(map);

      waterLayerRef.current = geoLayer;
    }

    if (typeof window !== 'undefined') {
      (window as any).__leafletTreeClusters = treeLayerRef.current;
      (window as any).__leafletWaterBodies = waterLayerRef.current;
    }

    return () => {
      if (treeLayerRef.current) {
        try { map.removeLayer(treeLayerRef.current); } catch {}
        treeLayerRef.current = null;
      }
      if (waterLayerRef.current) {
        try { map.removeLayer(waterLayerRef.current); } catch {}
        waterLayerRef.current = null;
      }
    };
  }, [treeClusters, waterBodies, showTreeLayer, showWaterLayer]);

  const handleResetView = () => {
    if (mapInstanceRef.current) {
      if (latitude !== null && longitude !== null) {
        mapInstanceRef.current.setView([latitude, longitude], 14);
      } else {
        mapInstanceRef.current.setView([defaultLat, defaultLon], defaultZoom);
      }
    }
  };

  const handleZoomIn = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomOut();
    }
  };

  return (
    <div className={`relative z-0 overflow-hidden ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Instructions Banner (when no coordinate selected) */}
      {!latitude && !longitude && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
          <div className="vibrancy-pill px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-[12px] font-medium text-[var(--text-1)] border border-[var(--panel-border-color)]">
            <Icon name="crosshair" size={14} className="text-[var(--accent)] shrink-0" />
            <span>Click anywhere on the map to place site pin</span>
          </div>
        </div>
      )}

      {/* Floating Coordinate Chip (bottom-left) */}
      {latitude !== null && longitude !== null && (
        <div className="absolute bottom-3 left-3 lg:left-[364px] z-[1000] pointer-events-auto">
          <div className="vibrancy-pill px-3 py-1.5 rounded-full flex items-center gap-2 text-[12px] font-medium text-[var(--text-1)] border border-[var(--panel-border-color)] shadow-md">
            <Icon name="crosshair" size={14} className="text-[var(--text-2)] shrink-0" />
            <span className="font-mono tabular-nums">
              {latitude.toFixed(5)}, {longitude.toFixed(5)}
            </span>
            {orientationDegrees !== undefined && (
              <>
                <span className="text-[var(--hairline)]">|</span>
                <span className="text-[11px] text-[var(--text-2)] flex items-center gap-1">
                  <Icon name="compass" size={12} className="text-[var(--accent)]" />
                  {orientationDegrees.toFixed(0)}°
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating Zoom Controls: Vertical group, two 32px vibrancy squares radius 10 with hairline divider */}
      <div className="absolute top-[76px] lg:top-[118px] map-controls-anchor z-[1000] pointer-events-auto flex flex-col rounded-[10px] vibrancy-panel overflow-hidden border border-[var(--panel-border-color)] shadow-md">
        <button
          type="button"
          onClick={handleZoomIn}
          className="w-8 h-8 flex items-center justify-center text-[var(--text-1)] hover:bg-[var(--fill)] transition-colors active:brightness-95"
          title="Zoom In"
          aria-label="Zoom In"
        >
          <Icon name="plus" size={15} />
        </button>
        <div className="h-[1px] w-full bg-[var(--hairline)]" />
        <button
          type="button"
          onClick={handleZoomOut}
          className="w-8 h-8 flex items-center justify-center text-[var(--text-1)] hover:bg-[var(--fill)] transition-colors active:brightness-95"
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <Icon name="minus" size={15} />
        </button>
      </div>

      {/* Floating Recenter & Layer Chips */}
      <div className="absolute top-[152px] lg:top-[194px] map-controls-anchor z-[1000] pointer-events-auto flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={handleResetView}
          className="w-8 h-8 rounded-[10px] vibrancy-panel flex items-center justify-center text-[var(--text-1)] hover:bg-[var(--fill)] transition-colors border border-[var(--panel-border-color)] shadow-md"
          title="Recenter Map View"
          aria-label="Recenter Map View"
        >
          <Icon name="crosshair" size={15} />
        </button>

        {/* Ecological Layer Toggles */}
        {((treeClusters?.features?.length ?? 0) > 0 || (waterBodies?.features?.length ?? 0) > 0) && (
          <div className="vibrancy-panel rounded-[12px] p-1 flex flex-col gap-1 border border-[var(--panel-border-color)] shadow-md">
            {(treeClusters?.features?.length ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => setShowTreeLayer((prev) => !prev)}
                className={`flex items-center gap-1 px-2 py-1 rounded-[8px] transition-colors text-[11px] font-medium cursor-pointer ${
                  showTreeLayer
                    ? 'bg-[var(--accent-tint)] text-[var(--accent)]'
                    : 'text-[var(--text-2)] hover:bg-[var(--fill)]'
                }`}
                title="Toggle Tree Canopy Layer"
                aria-label="Toggle Tree Canopy Layer"
              >
                <Icon name="tree" size={12} className={showTreeLayer ? 'text-[var(--accent)]' : 'text-[var(--text-2)]'} />
                <span>Canopy ({treeClusters?.features.length})</span>
              </button>
            )}
            {(waterBodies?.features?.length ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => setShowWaterLayer((prev) => !prev)}
                className={`flex items-center gap-1 px-2 py-1 rounded-[8px] transition-colors text-[11px] font-medium cursor-pointer ${
                  showWaterLayer
                    ? 'bg-[var(--accent-tint)] text-[var(--accent)]'
                    : 'text-[var(--text-2)] hover:bg-[var(--fill)]'
                }`}
                title="Toggle Water Bodies Layer"
                aria-label="Toggle Water Bodies Layer"
              >
                <Icon name="droplet" size={12} className={showWaterLayer ? 'text-[var(--accent)]' : 'text-[var(--text-2)]'} />
                <span>Water ({waterBodies?.features.length})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* CARTO Basemap Attribution Compliance Pill (bottom-right) */}
      <div className="absolute bottom-3 map-controls-anchor z-[1000] pointer-events-auto">
        <div className="vibrancy-pill px-2.5 py-1 rounded-full text-[10px] text-[var(--text-2)] flex items-center gap-1 border border-[var(--panel-border-color)] shadow-sm">
          <span>&copy;</span>
          <a
            href="https://carto.com/attributions"
            target="_blank"
            rel="noreferrer"
            className="hover:underline text-[var(--text-1)] font-medium"
          >
            CARTO
          </a>
          <span>&copy;</span>
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="hover:underline text-[var(--text-1)] font-medium"
          >
            OpenStreetMap contributors
          </a>
        </div>
      </div>
    </div>
  );
};
