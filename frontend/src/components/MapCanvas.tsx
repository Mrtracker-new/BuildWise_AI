import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, Polygon, LineString } from 'geojson';
import { Icon } from './Icon';
import { MapStyleSelector, type MapStyleMode } from './MapStyleSelector';
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

const CUSTOM_LAYER_IDS = new Set([
  'satellite-layer',
  'terrain-layer',
  '3d-buildings',
  'footprint-fill',
  'footprint-line',
  'entrance-shaft',
  'entrance-head',
  'tree-clusters-fill',
  'tree-clusters-line',
  'water-bodies-fill',
  'water-bodies-line',
]);

const EMPTY_GEOJSON_COLLECTION: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

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
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const [showTreeLayer, setShowTreeLayer] = useState<boolean>(true);
  const [showWaterLayer, setShowWaterLayer] = useState<boolean>(true);
  const [mapStyle, setMapStyle] = useState<MapStyleMode>('standard');

  const onLocationSelectRef = useRef(onLocationSelect);
  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  const mapStyleRef = useRef<MapStyleMode>(mapStyle);
  useEffect(() => {
    mapStyleRef.current = mapStyle;
  }, [mapStyle]);

  const themeRef = useRef<'light' | 'dark'>(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const showTreeLayerRef = useRef(showTreeLayer);
  useEffect(() => {
    showTreeLayerRef.current = showTreeLayer;
  }, [showTreeLayer]);

  const showWaterLayerRef = useRef(showWaterLayer);
  useEffect(() => {
    showWaterLayerRef.current = showWaterLayer;
  }, [showWaterLayer]);

  const treeClustersRef = useRef(treeClusters);
  useEffect(() => {
    treeClustersRef.current = treeClusters;
  }, [treeClusters]);

  const waterBodiesRef = useRef(waterBodies);
  useEffect(() => {
    waterBodiesRef.current = waterBodies;
  }, [waterBodies]);

  const footprintGeoJsonRef = useRef<FeatureCollection>(EMPTY_GEOJSON_COLLECTION);
  const entranceShaftGeoJsonRef = useRef<FeatureCollection>(EMPTY_GEOJSON_COLLECTION);
  const entranceHeadGeoJsonRef = useRef<FeatureCollection>(EMPTY_GEOJSON_COLLECTION);
  const footprintCornersLatLngRef = useRef<{ lat: number; lng: number }[]>([]);

  // Default coordinate: Center of India (Nagpur / Central Plateau)
  const defaultLat = 20.5937;
  const defaultLon = 78.9629;
  const defaultZoom = 5;

  const getVectorStyleUrl = (t: 'light' | 'dark') =>
    t === 'dark'
      ? 'https://tiles.openfreemap.org/styles/dark'
      : 'https://tiles.openfreemap.org/styles/liberty';

  const createPinElement = (t: 'light' | 'dark') => {
    const accentColor = t === 'dark' ? '#0A84FF' : '#0071E3';
    const el = document.createElement('div');
    el.className = 'apple-map-pin-root';
    el.innerHTML = `
      <div class="apple-pin-container">
        <div class="apple-pin-ring" style="border-color: ${accentColor};"></div>
        <svg class="apple-pin-svg" width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M17 0C7.61 0 0 7.61 0 17C0 28.5 15.3 40.8 16.2 41.5C16.7 41.9 17.3 41.9 17.8 41.5C18.7 40.8 34 28.5 34 17C34 7.61 26.39 0 17 0Z" fill="${accentColor}"/>
          <circle cx="17" cy="16" r="4.5" fill="#FFFFFF"/>
        </svg>
      </div>
    `;
    return el;
  };

  /**
   * Hybrid Logic Filter:
   * - Satellite Mode: Hide base fills and background; keep lines (roads) and symbols (labels).
   * - Terrain Mode: Hide all vector base layers (fills, lines, symbols) to avoid double vision.
   * - Standard Mode: Show all base vector layers.
   */
  const applyMapStyleVisibility = (map: maplibregl.Map, mode: MapStyleMode) => {
    const style = map.getStyle();
    if (!style || !style.layers) return;

    if (map.getLayer('satellite-layer')) {
      map.setLayoutProperty('satellite-layer', 'visibility', mode === 'satellite' ? 'visible' : 'none');
    }
    if (map.getLayer('terrain-layer')) {
      map.setLayoutProperty('terrain-layer', 'visibility', mode === 'terrain' ? 'visible' : 'none');
    }

    for (const layer of style.layers) {
      if (CUSTOM_LAYER_IDS.has(layer.id)) continue;

      try {
        if (mode === 'standard') {
          map.setLayoutProperty(layer.id, 'visibility', 'visible');
        } else if (mode === 'satellite') {
          if (layer.type === 'fill' || layer.id === 'background') {
            map.setLayoutProperty(layer.id, 'visibility', 'none');
          } else if (layer.type === 'line' || layer.type === 'symbol') {
            map.setLayoutProperty(layer.id, 'visibility', 'visible');
          }
        } else if (mode === 'terrain') {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        }
      } catch {
        // Ignore unmodifiable internal layer styles
      }
    }
  };

  /**
   * Registers all raster sources, 3D buildings, and custom GeoJSON overlays.
   * Called on initial load and every style.load event (e.g. theme toggle).
   */
  const setupCustomLayersAndSources = (map: maplibregl.Map) => {
    const style = map.getStyle();
    if (!style) return;

    const currentTheme = themeRef.current;
    const currentMode = mapStyleRef.current;
    const accentColor = currentTheme === 'dark' ? '#0A84FF' : '#0071E3';
    const firstLayerId = style.layers?.[0]?.id;

    // 1. Satellite Raster Source & Layer (ESRI World Imagery, maxzoom 19)
    if (!map.getSource('satellite-source')) {
      map.addSource('satellite-source', {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Esri, Maxar, Earthstar Geographics',
      });
    }
    if (!map.getLayer('satellite-layer')) {
      map.addLayer(
        {
          id: 'satellite-layer',
          type: 'raster',
          source: 'satellite-source',
          layout: {
            visibility: currentMode === 'satellite' ? 'visible' : 'none',
          },
        },
        firstLayerId
      );
    }

    // 2. Terrain Raster Source & Layer (OpenTopoMap, maxzoom 17)
    if (!map.getSource('terrain-source')) {
      map.addSource('terrain-source', {
        type: 'raster',
        tiles: [
          'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
          'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
          'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        maxzoom: 17,
        attribution: '© OpenTopoMap (CC-BY-SA)',
      });
    }
    if (!map.getLayer('terrain-layer')) {
      map.addLayer(
        {
          id: 'terrain-layer',
          type: 'raster',
          source: 'terrain-source',
          layout: {
            visibility: currentMode === 'terrain' ? 'visible' : 'none',
          },
        },
        firstLayerId
      );
    }

    // 3. Find first symbol layer to place 3D buildings below street/POI labels
    let firstSymbolId: string | undefined;
    for (const l of style.layers || []) {
      if (l.type === 'symbol') {
        firstSymbolId = l.id;
        break;
      }
    }

    // Remove default building-3d if already present in style (e.g., liberty) to ensure standardized styling
    if (map.getLayer('building-3d')) {
      try {
        map.removeLayer('building-3d');
      } catch {}
    }

    // Add standardized 3D Buildings Fill-Extrusion Layer
    if (!map.getLayer('3d-buildings')) {
      const vectorSourceId =
        Object.keys(style.sources || {}).find(
          (id) => (map.getSource(id) as any)?.type === 'vector'
        ) || 'openmaptiles';

      map.addLayer(
        {
          id: '3d-buildings',
          source: vectorSourceId,
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 15.5,
          paint: {
            'fill-extrusion-color': currentTheme === 'dark' ? '#1F2430' : '#E8E6E1',
            'fill-extrusion-height': [
              'coalesce',
              ['get', 'render_height'],
              ['get', 'height'],
              0,
            ],
            'fill-extrusion-base': [
              'coalesce',
              ['get', 'render_min_height'],
              ['get', 'min_height'],
              0,
            ],
            'fill-extrusion-opacity': 0.9,
          },
        },
        firstSymbolId
      );
    }

    // 4. Proposed Building Footprint Overlay
    if (!map.getSource('footprint-source')) {
      map.addSource('footprint-source', {
        type: 'geojson',
        data: footprintGeoJsonRef.current,
      });
    } else {
      (map.getSource('footprint-source') as maplibregl.GeoJSONSource).setData(
        footprintGeoJsonRef.current
      );
    }
    if (!map.getLayer('footprint-fill')) {
      map.addLayer({
        id: 'footprint-fill',
        type: 'fill',
        source: 'footprint-source',
        paint: {
          'fill-color': accentColor,
          'fill-opacity': 0.25,
        },
      });
    }
    if (!map.getLayer('footprint-line')) {
      map.addLayer({
        id: 'footprint-line',
        type: 'line',
        source: 'footprint-source',
        paint: {
          'line-color': accentColor,
          'line-width': 2,
          'line-dasharray': [2, 2],
        },
      });
    }

    // 5. Entrance Arrow (Shaft & Head) Overlay
    if (!map.getSource('entrance-shaft-source')) {
      map.addSource('entrance-shaft-source', {
        type: 'geojson',
        data: entranceShaftGeoJsonRef.current,
      });
    } else {
      (map.getSource('entrance-shaft-source') as maplibregl.GeoJSONSource).setData(
        entranceShaftGeoJsonRef.current
      );
    }
    if (!map.getLayer('entrance-shaft')) {
      map.addLayer({
        id: 'entrance-shaft',
        type: 'line',
        source: 'entrance-shaft-source',
        layout: {
          'line-cap': 'round',
        },
        paint: {
          'line-color': accentColor,
          'line-width': 3,
        },
      });
    }

    if (!map.getSource('entrance-head-source')) {
      map.addSource('entrance-head-source', {
        type: 'geojson',
        data: entranceHeadGeoJsonRef.current,
      });
    } else {
      (map.getSource('entrance-head-source') as maplibregl.GeoJSONSource).setData(
        entranceHeadGeoJsonRef.current
      );
    }
    if (!map.getLayer('entrance-head')) {
      map.addLayer({
        id: 'entrance-head',
        type: 'fill',
        source: 'entrance-head-source',
        paint: {
          'fill-color': accentColor,
          'fill-opacity': 1.0,
        },
      });
    }

    // 6. Tree Canopy Clusters Overlay
    const treeData =
      treeClustersRef.current && treeClustersRef.current.features?.length
        ? (treeClustersRef.current as any)
        : EMPTY_GEOJSON_COLLECTION;

    if (!map.getSource('tree-clusters-source')) {
      map.addSource('tree-clusters-source', {
        type: 'geojson',
        data: treeData,
      });
    } else {
      (map.getSource('tree-clusters-source') as maplibregl.GeoJSONSource).setData(
        treeData
      );
    }
    if (!map.getLayer('tree-clusters-fill')) {
      map.addLayer({
        id: 'tree-clusters-fill',
        type: 'fill',
        source: 'tree-clusters-source',
        layout: {
          visibility: showTreeLayerRef.current ? 'visible' : 'none',
        },
        paint: {
          'fill-color': [
            'match',
            ['coalesce', ['get', 'rank'], ['get', 'preservation_rank'], ''],
            'preserve',
            '#34C759',
            'compensate',
            '#FF9F0A',
            'removable',
            '#FF3B30',
            '#34C759',
          ],
          'fill-opacity': 0.3,
        },
      });
    }
    if (!map.getLayer('tree-clusters-line')) {
      map.addLayer({
        id: 'tree-clusters-line',
        type: 'line',
        source: 'tree-clusters-source',
        layout: {
          visibility: showTreeLayerRef.current ? 'visible' : 'none',
        },
        paint: {
          'line-color': [
            'match',
            ['coalesce', ['get', 'rank'], ['get', 'preservation_rank'], ''],
            'preserve',
            '#248A3D',
            'compensate',
            '#FF9F0A',
            'removable',
            '#FF3B30',
            '#34C759',
          ],
          'line-width': 1.5,
          'line-dasharray': [2, 2],
        },
      });
    }

    // 7. Water Bodies Overlay
    const waterData =
      waterBodiesRef.current && waterBodiesRef.current.features?.length
        ? (waterBodiesRef.current as any)
        : EMPTY_GEOJSON_COLLECTION;

    if (!map.getSource('water-bodies-source')) {
      map.addSource('water-bodies-source', {
        type: 'geojson',
        data: waterData,
      });
    } else {
      (map.getSource('water-bodies-source') as maplibregl.GeoJSONSource).setData(
        waterData
      );
    }
    if (!map.getLayer('water-bodies-fill')) {
      map.addLayer({
        id: 'water-bodies-fill',
        type: 'fill',
        source: 'water-bodies-source',
        layout: {
          visibility: showWaterLayerRef.current ? 'visible' : 'none',
        },
        paint: {
          'fill-color': '#0A84FF',
          'fill-opacity': 0.3,
        },
      });
    }
    if (!map.getLayer('water-bodies-line')) {
      map.addLayer({
        id: 'water-bodies-line',
        type: 'line',
        source: 'water-bodies-source',
        layout: {
          visibility: showWaterLayerRef.current ? 'visible' : 'none',
        },
        paint: {
          'line-color': '#0A84FF',
          'line-width': 1.5,
        },
      });
    }

    // Apply the active Hybrid logic filter
    applyMapStyleVisibility(map, currentMode);
  };

  // Mount MapLibre Map instance
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialCenter: [number, number] = [
      longitude ?? defaultLon,
      latitude ?? defaultLat,
    ];
    const initialZoom = latitude && longitude ? 14 : defaultZoom;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getVectorStyleUrl(theme),
      center: initialCenter,
      zoom: initialZoom,
      minZoom: 3,
      maxZoom: 20,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
      className: 'apple-map-popup',
    });
    popupRef.current = popup;

    map.on('style.load', () => {
      setupCustomLayersAndSources(map);
    });

    // Click handler for location selection
    map.on('click', (e: maplibregl.MapMouseEvent) => {
      onLocationSelectRef.current(e.lngLat.lat, e.lngLat.lng);
    });

    // Tooltips on Hover for Custom GeoJSON Layers
    map.on('mouseenter', 'tree-clusters-fill', (e: maplibregl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer';
      const feature = e.features?.[0];
      if (feature) {
        const props = (feature.properties as any) || {};
        const id = props.cluster_id || 'Cluster';
        const area = props.area_sqm ? `${props.area_sqm} m²` : '';
        const ndvi =
          props.mean_ndvi !== undefined
            ? ` (NDVI: ${Number(props.mean_ndvi).toFixed(2)})`
            : '';
        const r = props.rank || props.preservation_rank;
        const rank = r ? ` [${String(r).toUpperCase()}]` : '';
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="vibrancy-pill px-2 py-1 text-xs">Tree ${id}: ${area}${ndvi}${rank}</div>`
          )
          .addTo(map);
      }
    });
    map.on('mouseleave', 'tree-clusters-fill', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });

    map.on('mouseenter', 'water-bodies-fill', (e: maplibregl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer';
      const feature = e.features?.[0];
      if (feature) {
        const props = (feature.properties as any) || {};
        const id = props.cluster_id || 'Water Body';
        const area = props.area_sqm ? `${props.area_sqm} m²` : '';
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="vibrancy-pill px-2 py-1 text-xs">${id}: ${area}</div>`
          )
          .addTo(map);
      }
    });
    map.on('mouseleave', 'water-bodies-fill', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });

    map.on('mouseenter', 'footprint-fill', (e: maplibregl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer';
      const feature = e.features?.[0];
      if (feature) {
        const title =
          (feature.properties as any)?.title || 'Proposed Layout Footprint';
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="vibrancy-pill px-2 py-1 text-xs">${title}</div>`
          )
          .addTo(map);
      }
    });
    map.on('mouseleave', 'footprint-fill', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });

    map.on('mouseenter', 'entrance-head', (e: maplibregl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer';
      const feature = e.features?.[0];
      if (feature) {
        const title = (feature.properties as any)?.title || 'Main Entrance';
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="vibrancy-pill px-2 py-1 text-xs">${title}</div>`
          )
          .addTo(map);
      }
    });
    map.on('mouseleave', 'entrance-head', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });

    mapInstanceRef.current = map;

    // Window and container resize observers
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    const handleWindowResize = () => {
      map.resize();
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      resizeObserver.disconnect();
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Theme switch: update vector style URL & marker element
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.setStyle(getVectorStyleUrl(theme));

    if (markerRef.current) {
      const pinEl = createPinElement(theme);
      // Replace DOM contents inside marker
      const markerEl = markerRef.current.getElement();
      markerEl.innerHTML = pinEl.innerHTML;
    }
  }, [theme]);

  // Map Details style change: Standard / Satellite / Terrain
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    applyMapStyleVisibility(map, mapStyle);
  }, [mapStyle]);

  // Invalidate / Resize helper
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.resize();
      const timer = setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.resize();
        }
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [invalidateTrigger]);

  // Update site pin marker position and building footprint overlays
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const accentColor = theme === 'dark' ? '#0A84FF' : '#0071E3';

    if (latitude !== null && longitude !== null) {
      const lngLat: [number, number] = [longitude, latitude];

      if (!markerRef.current) {
        const pinEl = createPinElement(theme);
        const marker = new maplibregl.Marker({
          element: pinEl,
          draggable: true,
          anchor: 'bottom',
        })
          .setLngLat(lngLat)
          .addTo(map);

        marker.on('dragend', () => {
          const pos = marker.getLngLat();
          onLocationSelectRef.current(pos.lat, pos.lng);
        });

        markerRef.current = marker;
      } else {
        markerRef.current.setLngLat(lngLat);
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
          return [longitude + dLng, latitude + dLat]; // [lng, lat]
        });

        // Store the 4 unique polygon corners for centroid calculation
        footprintCornersLatLngRef.current = polygonPoints.slice(0, 4).map(([lng, lat]) => ({
          lat,
          lng,
        }));

        // Close polygon ring for GeoJSON polygon geometry
        const closedPolygonPoints = [...polygonPoints, polygonPoints[0]];

        const footprintFeatureCollection: FeatureCollection<Polygon> = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [closedPolygonPoints],
              },
              properties: {
                title: `Proposed Layout Footprint (${orientationDegrees.toFixed(0)}° Long Axis)`,
              },
            },
          ],
        };

        footprintGeoJsonRef.current = footprintFeatureCollection;

        const footprintSource = map.getSource('footprint-source') as
          | maplibregl.GeoJSONSource
          | undefined;
        if (footprintSource) {
          footprintSource.setData(footprintFeatureCollection);
        }

        // Footprint entrance arrow anchored at midpoint of corresponding edge
        if (entranceDirection) {
          const DIR_TO_DEG: Record<string, number> = {
            N: 0,
            NE: 45,
            E: 90,
            SE: 135,
            S: 180,
            SW: 225,
            W: 270,
            NW: 315,
          };
          const entDeg = DIR_TO_DEG[entranceDirection.toUpperCase()] ?? 45;
          const entRad = (entDeg * Math.PI) / 180.0;
          const uE = Math.sin(entRad);
          const uN = Math.cos(entRad);

          const edgeMidpoints = [
            {
              metersEast: -halfWidth * shortUnitE,
              metersNorth: -halfWidth * shortUnitN,
              normalE: -shortUnitE,
              normalN: -shortUnitN,
            },
            {
              metersEast: halfLength * longUnitE,
              metersNorth: halfLength * longUnitN,
              normalE: longUnitE,
              normalN: longUnitN,
            },
            {
              metersEast: halfWidth * shortUnitE,
              metersNorth: halfWidth * shortUnitN,
              normalE: shortUnitE,
              normalN: shortUnitN,
            },
            {
              metersEast: -halfLength * longUnitE,
              metersNorth: -halfLength * longUnitN,
              normalE: -longUnitE,
              normalN: -longUnitN,
            },
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

          const shaftCollection: FeatureCollection<LineString> = {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [anchorLng, anchorLat],
                    [tipLng, tipLat],
                  ],
                },
                properties: {
                  title: `Main Entrance: ${entranceDirection.toUpperCase()}`,
                },
              },
            ],
          };

          const headCollection: FeatureCollection<Polygon> = {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [tipLng, tipLat],
                      [wing1Lng, wing1Lat],
                      [wing2Lng, wing2Lat],
                      [tipLng, tipLat],
                    ],
                  ],
                },
                properties: {
                  title: `Main Entrance: ${entranceDirection.toUpperCase()}`,
                },
              },
            ],
          };

          entranceShaftGeoJsonRef.current = shaftCollection;
          entranceHeadGeoJsonRef.current = headCollection;

          const shaftSource = map.getSource('entrance-shaft-source') as
            | maplibregl.GeoJSONSource
            | undefined;
          if (shaftSource) shaftSource.setData(shaftCollection);

          const headSource = map.getSource('entrance-head-source') as
            | maplibregl.GeoJSONSource
            | undefined;
          if (headSource) headSource.setData(headCollection);
        } else {
          entranceShaftGeoJsonRef.current = EMPTY_GEOJSON_COLLECTION;
          entranceHeadGeoJsonRef.current = EMPTY_GEOJSON_COLLECTION;
          const shaftSource = map.getSource('entrance-shaft-source') as
            | maplibregl.GeoJSONSource
            | undefined;
          if (shaftSource) shaftSource.setData(EMPTY_GEOJSON_COLLECTION);
          const headSource = map.getSource('entrance-head-source') as
            | maplibregl.GeoJSONSource
            | undefined;
          if (headSource) headSource.setData(EMPTY_GEOJSON_COLLECTION);
        }
      } else {
        footprintGeoJsonRef.current = EMPTY_GEOJSON_COLLECTION;
        entranceShaftGeoJsonRef.current = EMPTY_GEOJSON_COLLECTION;
        entranceHeadGeoJsonRef.current = EMPTY_GEOJSON_COLLECTION;
        footprintCornersLatLngRef.current = [];

        const footprintSource = map.getSource('footprint-source') as
          | maplibregl.GeoJSONSource
          | undefined;
        if (footprintSource) footprintSource.setData(EMPTY_GEOJSON_COLLECTION);

        const shaftSource = map.getSource('entrance-shaft-source') as
          | maplibregl.GeoJSONSource
          | undefined;
        if (shaftSource) shaftSource.setData(EMPTY_GEOJSON_COLLECTION);

        const headSource = map.getSource('entrance-head-source') as
          | maplibregl.GeoJSONSource
          | undefined;
        if (headSource) headSource.setData(EMPTY_GEOJSON_COLLECTION);
      }

      // Keep paint colors synced with theme
      if (map.getLayer('footprint-fill')) {
        map.setPaintProperty('footprint-fill', 'fill-color', accentColor);
      }
      if (map.getLayer('footprint-line')) {
        map.setPaintProperty('footprint-line', 'line-color', accentColor);
      }
      if (map.getLayer('entrance-shaft')) {
        map.setPaintProperty('entrance-shaft', 'line-color', accentColor);
      }
      if (map.getLayer('entrance-head')) {
        map.setPaintProperty('entrance-head', 'fill-color', accentColor);
      }
      if (map.getLayer('3d-buildings')) {
        map.setPaintProperty(
          '3d-buildings',
          'fill-extrusion-color',
          theme === 'dark' ? '#1F2430' : '#E8E6E1'
        );
      }

      map.panTo(lngLat);
    } else {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      footprintGeoJsonRef.current = EMPTY_GEOJSON_COLLECTION;
      entranceShaftGeoJsonRef.current = EMPTY_GEOJSON_COLLECTION;
      entranceHeadGeoJsonRef.current = EMPTY_GEOJSON_COLLECTION;
      footprintCornersLatLngRef.current = [];

      const footprintSource = map.getSource('footprint-source') as
        | maplibregl.GeoJSONSource
        | undefined;
      if (footprintSource) footprintSource.setData(EMPTY_GEOJSON_COLLECTION);

      const shaftSource = map.getSource('entrance-shaft-source') as
        | maplibregl.GeoJSONSource
        | undefined;
      if (shaftSource) shaftSource.setData(EMPTY_GEOJSON_COLLECTION);

      const headSource = map.getSource('entrance-head-source') as
        | maplibregl.GeoJSONSource
        | undefined;
      if (headSource) headSource.setData(EMPTY_GEOJSON_COLLECTION);
    }

    // Expose map, marker, and footprint test shim on window for automated audit/screenshot scripts
    if (typeof window !== 'undefined') {
      const isVisible =
        mapContainerRef.current && mapContainerRef.current.offsetParent !== null;

      (window as any).__maplibreMap = map;
      (window as any).__maplibreMarker = markerRef.current;

      // Provide backwards-compatible proxy shim for __leafletMap / __leafletMarker / __leafletFootprint
      if (isVisible || !(window as any).__leafletMap) {
        const markerObj = markerRef.current;
        (window as any).__leafletMarker = markerObj
          ? {
              getLatLng: () => {
                const ll = markerObj.getLngLat();
                return { lat: ll.lat, lng: ll.lng };
              },
            }
          : null;

        (window as any).__leafletFootprint =
          footprintCornersLatLngRef.current.length > 0
            ? {
                getLatLngs: () => [footprintCornersLatLngRef.current],
              }
            : null;

        (window as any).__leafletMap = {
          raw: map,
          latLngToContainerPoint: (latlng: any) => {
            const lat = latlng.lat !== undefined ? latlng.lat : latlng[0];
            const lng = latlng.lng !== undefined ? latlng.lng : latlng[1];
            return map.project([lng, lat]);
          },
          project: (latlng: any, _zoom?: number) => {
            const lat = latlng.lat !== undefined ? latlng.lat : latlng[0];
            const lng = latlng.lng !== undefined ? latlng.lng : latlng[1];
            return map.project([lng, lat]);
          },
          setZoom: (z: number, _opts?: any) => {
            map.setZoom(z);
          },
          setView: (latlng: any, z: number, _opts?: any) => {
            const lat = latlng.lat !== undefined ? latlng.lat : latlng[0];
            const lng = latlng.lng !== undefined ? latlng.lng : latlng[1];
            map.jumpTo({ center: [lng, lat], zoom: z });
          },
          panTo: (latlng: any) => {
            const lat = latlng.lat !== undefined ? latlng.lat : latlng[0];
            const lng = latlng.lng !== undefined ? latlng.lng : latlng[1];
            map.panTo([lng, lat]);
          },
        };
      }
    }
  }, [latitude, longitude, orientationDegrees, plinthAreaSqFt, entranceDirection, theme]);

  // Synchronize Ecological GeoJSON Layers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const treeSource = map.getSource('tree-clusters-source') as
      | maplibregl.GeoJSONSource
      | undefined;
    if (treeSource) {
      const data =
        treeClusters && treeClusters.features?.length
          ? treeClusters
          : EMPTY_GEOJSON_COLLECTION;
      treeSource.setData(data as any);
    }

    if (map.getLayer('tree-clusters-fill')) {
      map.setLayoutProperty(
        'tree-clusters-fill',
        'visibility',
        showTreeLayer ? 'visible' : 'none'
      );
    }
    if (map.getLayer('tree-clusters-line')) {
      map.setLayoutProperty(
        'tree-clusters-line',
        'visibility',
        showTreeLayer ? 'visible' : 'none'
      );
    }

    const waterSource = map.getSource('water-bodies-source') as
      | maplibregl.GeoJSONSource
      | undefined;
    if (waterSource) {
      const data =
        waterBodies && waterBodies.features?.length
          ? waterBodies
          : EMPTY_GEOJSON_COLLECTION;
      waterSource.setData(data as any);
    }

    if (map.getLayer('water-bodies-fill')) {
      map.setLayoutProperty(
        'water-bodies-fill',
        'visibility',
        showWaterLayer ? 'visible' : 'none'
      );
    }
    if (map.getLayer('water-bodies-line')) {
      map.setLayoutProperty(
        'water-bodies-line',
        'visibility',
        showWaterLayer ? 'visible' : 'none'
      );
    }
  }, [treeClusters, waterBodies, showTreeLayer, showWaterLayer]);

  const handleResetView = () => {
    if (mapInstanceRef.current) {
      if (latitude !== null && longitude !== null) {
        mapInstanceRef.current.flyTo({
          center: [longitude, latitude],
          zoom: 16,
          essential: true,
        });
      } else {
        mapInstanceRef.current.flyTo({
          center: [defaultLon, defaultLat],
          zoom: defaultZoom,
          essential: true,
        });
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

      {/* Floating Bottom-Left Group: Map Details Selector + Coordinate Chip */}
      <div className="absolute bottom-3 left-3 lg:left-[364px] z-[1000] pointer-events-auto flex items-center gap-2">
        <MapStyleSelector
          currentStyle={mapStyle}
          onStyleChange={(s) => setMapStyle(s)}
        />

        {latitude !== null && longitude !== null && (
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
        )}
      </div>

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
        {((treeClusters?.features?.length ?? 0) > 0 ||
          (waterBodies?.features?.length ?? 0) > 0) && (
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
                <Icon
                  name="tree"
                  size={12}
                  className={showTreeLayer ? 'text-[var(--accent)]' : 'text-[var(--text-2)]'}
                />
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
                <Icon
                  name="droplet"
                  size={12}
                  className={showWaterLayer ? 'text-[var(--accent)]' : 'text-[var(--text-2)]'}
                />
                <span>Water ({waterBodies?.features.length})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dynamic Attribution Compliance Pill (bottom-right) */}
      <div className="absolute bottom-3 map-controls-anchor z-[1000] pointer-events-auto">
        <div className="vibrancy-pill px-2.5 py-1 rounded-full text-[10px] text-[var(--text-2)] flex items-center gap-1 border border-[var(--panel-border-color)] shadow-sm">
          <span>&copy;</span>
          <a
            href="https://openfreemap.org"
            target="_blank"
            rel="noreferrer"
            className="hover:underline text-[var(--text-1)] font-medium"
          >
            OpenFreeMap
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

          {mapStyle === 'satellite' && (
            <>
              <span className="text-[var(--hairline)]">|</span>
              <span>Imagery:</span>
              <a
                href="https://www.esri.com"
                target="_blank"
                rel="noreferrer"
                className="hover:underline text-[var(--text-1)] font-medium"
              >
                Esri, Maxar, Earthstar Geographics
              </a>
            </>
          )}

          {mapStyle === 'terrain' && (
            <>
              <span className="text-[var(--hairline)]">|</span>
              <span>&copy;</span>
              <a
                href="https://opentopomap.org"
                target="_blank"
                rel="noreferrer"
                className="hover:underline text-[var(--text-1)] font-medium"
              >
                OpenTopoMap (CC-BY-SA)
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
