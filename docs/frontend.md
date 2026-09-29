# Frontend Architecture & Design System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![UI: Apple Design System](https://img.shields.io/badge/Design-Apple%20Vibrancy-0071E3.svg)](#apple-design-system-tokens)
[![Framework: React 19](https://img.shields.io/badge/Framework-React%2019-61DAFB.svg)](../frontend)
[![Map Engine: MapLibre GL](https://img.shields.io/badge/Maps-MapLibre%20GL-blue.svg)](../frontend)

Detailed guide to the BuildWise AI user interface, Apple vibrancy design tokens, MapLibre cartography, and component architecture.

---

## Table of Contents

- [Design Philosophy](#design-philosophy)
- [Apple Design System Tokens](#apple-design-system-tokens)
  - [Light Mode Tokens](#light-mode-tokens)
  - [Dark Mode Tokens](#dark-mode-tokens)
  - [Vibrancy & Materials](#vibrancy--materials)
- [Component Inventory](#component-inventory)
- [Key Interface Subsystems](#key-interface-subsystems)
  - [1. MapCanvas & MapStyleSelector](#1-mapcanvas--mapstyleselector)
  - [2. AnalysisHUD](#2-analysishud)
  - [3. ReportSheet Full-Screen Dossier](#3-reportsheet-full-screen-dossier)
  - [4. IosSelect Popover](#4-iosselect-popover)
  - [5. BlueprintViewer](#5-blueprintviewer)
- [Capturing Documentation Screenshots](#capturing-documentation-screenshots)
- [Next Steps](#next-steps)

---

## Design Philosophy

BuildWise AI implements an **Apple Human Interface Guidelines (HIG)-inspired** engineering interface:
- **Translucent Materials:** Multi-layer backdrop blur (`backdrop-blur-md` and `backdrop-blur-xl`) with optical glass refraction.
- **Hairline Borders:** 0.5px to 1px delicate borders using low-opacity contrasting alphas instead of heavy drop-shadows.
- **Micro-Animations:** Fluid CSS transitions on state mutations, drawer slide-overs, and popovers.
- **Zero Generic Clutter:** Strictly avoids garish primary palettes; employs refined Apple System Colors (`#0071E3` Royal Blue, `#34C759` Kelly Green, `#FF9F0A` Tangerine Amber, `#FF3B30` Crimson).

---

## Apple Design System Tokens

Defined centrally in [`frontend/src/index.css`](../frontend/src/index.css):

### Light Mode Tokens

```css
:root, [data-theme="light"] {
  --panel: rgba(255, 255, 255, 0.72);
  --panel-border-color: rgba(255, 255, 255, 0.60);
  --panel-border: 1px solid var(--panel-border-color);
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 12px 32px rgba(0, 0, 0, 0.12);
  --fill: rgba(120, 120, 128, 0.12);
  --fill-hover: rgba(120, 120, 128, 0.18);
  --fill-active: rgba(120, 120, 128, 0.24);
  --hairline: rgba(0, 0, 0, 0.08);
  --text-1: #1D1D1F;
  --text-2: #6E6E73;
  --text-3: #86868B;
  --accent: #0071E3;
  --accent-tint: rgba(0, 113, 227, 0.12);
  --accent-press: #0062C4;
  --semantic-green: #34C759;
  --semantic-amber: #FF9F0A;
  --semantic-red: #FF3B30;
  --bg-page: #F5F5F7;
  --blueprint-bg: #F4F6F8;
  --card-bg-subtle: #FFFFFF;
  --sheet-bg: rgba(255, 255, 255, 0.92);
}
```

### Dark Mode Tokens

```css
[data-theme="dark"] {
  --panel: rgba(28, 28, 30, 0.68);
  --panel-border-color: rgba(255, 255, 255, 0.08);
  --panel-border: 1px solid var(--panel-border-color);
  --shadow: 0 12px 32px rgba(0, 0, 0, 0.50);
  --fill: rgba(120, 120, 128, 0.24);
  --fill-hover: rgba(120, 120, 128, 0.32);
  --fill-active: rgba(120, 120, 128, 0.40);
  --hairline: rgba(255, 255, 255, 0.08);
  --text-1: #F5F5F7;
  --text-2: #A1A1A6;
  --text-3: #86868B;
  --accent: #0A84FF;
  --accent-tint: rgba(10, 132, 255, 0.15);
  --accent-press: #0071E3;
  --semantic-green: #34C759;
  --semantic-amber: #FF9F0A;
  --semantic-red: #FF453A;
  --bg-page: #000000;
  --blueprint-bg: #0E1726;
  --card-bg-subtle: #2C2C2E;
  --sheet-bg: rgba(28, 28, 30, 0.92);
}
```

### Vibrancy & Materials

Glassmorphism classes are configured using standard utilities:

- `.panel-glass`: `background: var(--panel); backdrop-filter: blur(20px) saturate(180%); border: var(--panel-border);`
- `.sheet-glass`: `background: var(--sheet-bg); backdrop-filter: blur(24px) saturate(190%);`
- `.hairline-divider`: `border-color: var(--hairline);`

---

## Component Inventory

All components reside in [`frontend/src/components/`](../frontend/src/components/):

| Component | File | Responsibility |
| :--- | :--- | :--- |
| **MapCanvas** | `MapCanvas.tsx` | MapLibre GL viewport, WGS84 marker projection, 3D building layer, and orientation polygon. |
| **MapStyleSelector** | `MapStyleSelector.tsx` | Segmented control switching between Standard, Satellite (ESRI), and Terrain (OpenTopoMap). |
| **AnalysisHUD** | `AnalysisHUD.tsx` | Floating glassmorphism pill presenting overall feasibility score and quick metrics. |
| **AnalysisForm** | `AnalysisForm.tsx` | Collapsible sidebar drawer for building typology, quality grade, area, and client notes. |
| **CoordinatesInput** | `CoordinatesInput.tsx` | Direct WGS84 latitude and longitude coordinate inputs with validation. |
| **ReportSheet** | `ReportSheet.tsx` | Full-screen modal dossier organized across 4 dedicated engineering tabs. |
| **ReportHeroBand** | `ReportHeroBand.tsx` | Full-bleed scorecard banner displaying suitability score, verdict, and GPS address. |
| **FloorPlanGeneratorCard** | `FloorPlanGeneratorCard.tsx` | Blueprint generator with room selection, Vastu strictness, placement badge, and rules list. |
| **BlueprintViewer** | `BlueprintViewer.tsx` | Interactive SVG viewer featuring dual CAD/Paper modes, pan-zoom, dimension lines, and room labels. |
| **IosSelect** | `IosSelect.tsx` | Custom Apple-style popover selector replacing clunky browser native dropdowns. |
| **OrientationCompass** | `OrientationCompass.tsx` | Interactive solar azimuth and wind rose compass showing optimal building orientation. |
| **HazardProfileCard** | `HazardProfileCard.tsx` | Disaggregated seismic zone, GloFAS river discharge, and extreme weather telemetry. |
| **CostBreakdownTable** | `CostBreakdownTable.tsx` | Itemized CPWD preliminary construction budget with relative share bars. |
| **LandValueCard** | `LandValueCard.tsx` | Indicative circle rate matching and interactive client-side outlay calculator. |
| **VastuAdvisoryCard** | `VastuAdvisoryCard.tsx` | 9-zone Vastu Purusha Mandala matrix and ranked entrance portal scores. |
| **RecommendationPanel**| `RecommendationPanel.tsx` | Severity-ranked engineering action items with formal IS code citations. |
| **MethodologyModal** | `MethodologyModal.tsx` | Mathematical formula, weightings, and regulatory standards disclosure dialog. |

---

## Key Interface Subsystems

### 1. MapCanvas & MapStyleSelector

BuildWise AI leverages **MapLibre GL** with three hybrid cartographic modes (mode compositing handled by `applyMapStyleVisibility` in `MapCanvas.tsx`):
1. **Standard:** Vector tiles powered by OpenFreeMap (Liberty/Dark) with dynamic light/dark theming and 3D extruded buildings (`fill-extrusion`, auto camera tilt at zoom ≥ 14.6).
2. **Satellite Hybrid:** ESRI World Imagery as the sole base; vector fills/labels are hidden and street lines re-projected on top with dark cartography. 3D buildings are disabled so extrusions never ghost over imagery.
3. **Terrain Hybrid:** OpenTopoMap raster + AWS Terrarium DEM (`raster-dem` → `setTerrain`) driving true 3D relief with a hillshade layer; building extrusions drape over the relief and the camera auto-tilts to 55° pitch, levelling back out on exit.

### 2. AnalysisHUD

The **AnalysisHUD** floats gracefully in the lower center of the map viewport. When an analysis completes:
- Renders an animated suitability score donut (0 to 100).
- Displays color-coded risk pills (`Suitable`, `Conditionally Suitable`, or `Challenging`).
- Features a **View Full Dossier** button that smoothly expands into the `ReportSheet`.

### 3. ReportSheet Full-Screen Dossier

The dossier organizes findings across 4 segmented tabs:
- **Tab 1: Overview & Terrain:** Geotechnical slope, elevation profile, and Copernicus Sentinel-2 vegetation analysis.
- **Tab 2: Climate & Hazards:** IS 1893:2016 seismic zone, USGS historical earthquakes, and GloFAS river inundation.
- **Tab 3: Vastu & Orientation:** Solar orientation compass, 9-zone mandala grid, and ranked entrance portals.
- **Tab 4: Cost & Plan:** CPWD cost schedule, indicative circle rates, and interactive generative blueprint.

### 4. IosSelect Popover

Native HTML `<select>` elements look inconsistent across operating systems. `IosSelect.tsx` replaces them with a custom lightweight popover:
- Floating popover aligned directly to the trigger button.
- Smooth scale-in transition (`scale-95` to `scale-100`).
- Keyboard navigation (Arrow keys, Enter, Escape) and click-outside dismissal.

### 5. BlueprintViewer

Renders continuous-geometry SVG floor plans directly into the browser DOM:
- **CAD Mode:** Dark blueprint aesthetic (`#0E1726` navy background, white walls, cyan dimension lines).
- **Paper Mode:** High-contrast architectural print aesthetic (`#FFFFFF` background, solid black walls, charcoal accents).
- **Door Swings & Arcs:** Precise vector door swing quarter-circle arcs rendered from calculated hinge coordinates.

---

## Capturing Documentation Screenshots

The hero banner referenced in the root `README.md` is located at [`docs/assets/hero.png`](assets/hero.png) (master version in `assets/brand/BuildWise_AI_with_title.png`).

> [!NOTE]
> **Brand & Asset Organization:**
> Official brand identity assets (logos, square icons, title banners) are organized in [`assets/brand/`](../assets/brand/) and mirrored in `frontend/public/brand/` for client serving and favicons.

---

## Next Steps

- Explore the [Backend API Reference](backend-api.md)
- Learn about the [AI Pipeline & Groq/Gemini Integration](ai-pipeline.md)
- Inspect the [Generative Blueprint Spatial Engine](blueprint-engine.md)

---

[← Previous: Architecture](architecture.md) | [Next: Backend API Reference →](backend-api.md)

### License

Distributed under the MIT License. See [LICENSE](../LICENSE) for details.
