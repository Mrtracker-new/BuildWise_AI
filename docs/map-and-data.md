# Map & Geospatial Data Architecture
> `MapLibre GL` • `OpenFreeMap` • `Esri World Imagery` • `OpenTopoMap` • `USGS` • `Open-Meteo` • `Sentinel-2`

Technical breakdown of map layers, geospatial data providers, microclimate telemetry, and third-party attribution obligations in BuildWise AI.

---

## Table of Contents
- [Geospatial Philosophy: Zero Paid APIs](#geospatial-philosophy-zero-paid-apis)
- [Frontend MapLibre GL Integration](#frontend-maplibre-gl-integration)
- [Hybrid Map Layer Switcher](#hybrid-map-layer-switcher)
  - [1. Vector Street Map (OpenFreeMap Positron)](#1-vector-street-map-openfreemap-positron)
  - [2. High-Resolution Satellite Hybrid (Esri + OpenFreeMap Overlay)](#2-high-resolution-satellite-hybrid-esri--openfreemap-overlay)
  - [3. Topographic Contours (OpenTopoMap)](#3-topographic-contours-opentopomap)
- [Backend Geospatial Telemetry Pipelines](#backend-geospatial-telemetry-pipelines)
  - [Digital Elevation & Slope Model](#digital-elevation--slope-model)
  - [Microclimate Telemetry](#microclimate-telemetry)
  - [Seismic Hazard Telemetry (USGS)](#seismic-hazard-telemetry-usgs)
  - [Hydrological Discharge & Flood Telemetry (Open-Meteo GloFAS)](#hydrological-discharge--flood-telemetry-open-meteo-glofas)
  - [Multispectral Satellite Vision (Sentinel-2 L2A)](#multispectral-satellite-vision-sentinel-2-l2a)
- [Attribution Obligations & License Matrix](#attribution-obligations--license-matrix)
- [Code Licensing vs Data Licensing](#code-licensing-vs-data-licensing)
- [Navigation](#navigation)

---

## Geospatial Philosophy: Zero Paid APIs

BuildWise AI is engineered to eliminate proprietary mapping fees (e.g. Google Maps Platform, Mapbox billing, commercial DEM subscriptions). Every map tile, elevation query, meteorological metric, and satellite observation relies on **open-access, public domain, or open-data infrastructure**.

```
                ┌─────────────────────────────────────────────────────┐
                │                  BuildWise AI App                   │
                └──────────────────────────┬──────────────────────────┘
                                           │
         ┌─────────────────────────────────┴─────────────────────────────────┐
         │                                                                   │
         ▼                                                                   ▼
┌───────────────────┐                                               ┌───────────────────┐
│     Frontend      │                                               │      Backend      │
│  (MapLibre GL)    │                                               │     (FastAPI)     │
└────────┬──────────┘                                               └────────┬──────────┘
         │                                                                   │
 ┌───────┴───────┬──────────────┐                    ┌───────────────┬───────┴───────┬───────────────┐
 │               │              │                    │               │               │               │
 ▼               ▼              ▼                    ▼               ▼               ▼               ▼
OpenFreeMap    Esri World   OpenTopoMap           Open-Meteo      USGS FDSN      Open-Meteo      Copernicus
 (Vector Tiles)  Imagery    (Contours)            (Elevation &    Earthquake      (GloFAS        Sentinel-2
                                                   Microclimate)    Catalog)      Discharge)        (L2A)
```

---

## Frontend MapLibre GL Integration

The map interface is powered by **MapLibre GL JS** (`frontend/src/components/Map.tsx`), an open-source WebGL mapping library.
- **Dynamic Viewport Centering:** Pans smoothly with inertial physics when a user selects a location.
- **Pin Placement:** Supports one-click map placement, draggable markers, and direct WGS84 coordinate queries.
- **Vastu Compass Ring:** An interactive cardinal alignment overlay rendered over the selected plot.

---

## Hybrid Map Layer Switcher

Managed via `MapStyleSelector.tsx`. Users can switch between 3 basemap modes:

### 1. Vector Street Map (OpenFreeMap Positron)
- **Style URL:** `https://tiles.openfreemap.org/styles/positron`
- **Features:** Clean, high-contrast monochrome design tailored for engineering overlays, road labels, and building footprints.
- **Provider:** OpenFreeMap / OpenStreetMap contributors.

### 2. High-Resolution Satellite Hybrid (Esri + OpenFreeMap Overlay)
- **Basemap:** Esri World Imagery (Maxar, Earthstar Geographics, USDA, USGS, AeroGRID, IGN).
  - Tile URL: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
- **Overlay Layer:** OpenFreeMap vector street and boundary lines overlaid with transparency to provide contextual navigation over aerial imagery.

### 3. Topographic Contours (OpenTopoMap)
- **Tile URL:** `https://a.tile.opentopomap.org/{z}/{x}/{y}.png`
- **Features:** Visual relief shading, 20-meter contour lines, and topographic elevation gradients.

---

## Backend Geospatial Telemetry Pipelines

### Digital Elevation & Slope Model
Located in `app/services/external_data_service.py` (`fetch_elevation_and_slope`).
- Samples 5 points: site centroid $(x, y)$ plus 4 cardinal offsets $(x \pm 33\text{m}, y \pm 33\text{m})$.
- Queries Open-Meteo Elevation API (grounded in Copernicus DEM 30m / GLO-30).
- Calculates true topographic gradient:
  $$\text{Slope (\%)} = \left(\frac{\max(\Delta h)}{33.0}\right) \times 100$$
- **Synthetic Fallback:** Latitudinal polynomial elevation gradient if the remote API is unreachable.

### Microclimate Telemetry
Located in `app/services/external_data_service.py` (`fetch_climate_data`).
- Queries Open-Meteo Forecast API for current temperature, prevailing wind direction (degrees), wind speed, and annual precipitation.
- Feeds building orientation calculations and passive thermal comfort scoring.

### Seismic Hazard Telemetry (USGS)
Located in `app/services/hazard_service.py` (`fetch_usgs_seismic_data`).
- Queries USGS Earthquake Hazards Program FDSN web service.
- **Query Bounds:** Radius $\le 250\text{ km}$, Magnitude $\ge 4.5$, historical window of 50 years.
- Returns event counts, maximum recorded magnitude, years since last seismic event, and epicentral distance.

### Hydrological Discharge & Flood Telemetry (Open-Meteo GloFAS)
Located in `app/services/hazard_service.py` (`fetch_open_meteo_flood_data`).
- Queries Global Flood Awareness System (GloFAS) via Open-Meteo Flood API.
- Analyzes 365 days of river discharge ($\text{m}^3/\text{s}$).
- Calculates peak-to-mean flow ratios to identify seasonal surge anomalies. Guarded by a dry channel threshold ($\ge 0.1\text{ m}^3/\text{s}$) to avoid division-by-zero artifacts.

### Multispectral Satellite Vision (Sentinel-2 L2A)
Located in `app/services/vision/`.
- Accesses European Space Agency (ESA) Copernicus Sentinel-2 L2A multi-band surface reflectance telemetry.
- Evaluates Normalized Difference Vegetation Index (NDVI), Normalized Difference Water Index (NDWI), and built-up index for tree preservation planning.

---

## Attribution Obligations & License Matrix

When deploying or distributing BuildWise AI, all upstream data attributions must remain intact. The table below outlines the license and citation obligations for every integrated data source:

| Data Provider | Service / Dataset | Upstream License | Mandatory Citation & Attribution Notice |
|:---|:---|:---|:---|
| **OpenStreetMap** | Geocoding & Road Network | Open Database License (ODbL) | `"© OpenStreetMap contributors"` |
| **OpenFreeMap** | Vector Basemap & Tiles | Open Data / ODbL | `"Map data © OpenStreetMap, tiles by OpenFreeMap"` |
| **Esri / Maxar** | World Imagery Satellite Tiles | Esri Master License Agreement | `"Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"` |
| **OpenTopoMap** | Topographic Contours & Relief | CC-BY-SA 3.0 | `"Kartendaten: © OpenStreetMap-Mitwirkende, SRTM | Kartendarstellung: © OpenTopoMap (CC-BY-SA)"` |
| **USGS** | Earthquake Hazards Program FDSN | U.S. Public Domain | `"Data courtesy of U.S. Geological Survey (USGS)"` |
| **Open-Meteo** | Weather & River Discharge (GloFAS) | CC-BY 4.0 / Copernicus | `"Weather and hydrological data by Open-Meteo under CC-BY 4.0"` |
| **Copernicus / ESA** | Sentinel-2 Multispectral Imagery | Copernicus Open Access Policy | `"Contains modified Copernicus Sentinel data [year], processed by ESA"` |

---

## Code Licensing vs Data Licensing

> [!IMPORTANT]
> The source code of **BuildWise AI** is released under the **MIT License** (see [LICENSE](../LICENSE)).
> 
> However, the map tiles, meteorological metrics, elevation grids, and satellite observations retrieved at runtime remain the intellectual property of their respective creators and are governed by the licenses listed in the table above.
> 
> When creating derivative commercial applications or self-hosting production instances, ensure that user-facing map views and downloaded PDF reports retain the proper attribution badges.

---

## Navigation
- **Previous:** [← Generative Blueprint Engine](blueprint-engine.md)
- **Next:** [Testing & Quality Assurance →](testing.md)

---
*BuildWise AI • [MIT License](../LICENSE) • Copyright (c) 2026 Rolan Lobo*
