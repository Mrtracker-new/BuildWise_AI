# BuildWise AI - Geo-Based Intelligent Construction Planning System

BuildWise AI is an open-access, geo-intelligent site feasibility evaluation and preliminary construction planning platform designed for civil engineers, architectural consultants, real estate planners, and prospective builders. Given geographic coordinates and architectural parameters (built-up area, quality grade, building typology, storeys), the application executes deterministic multi-factor land suitability evaluations, passive solar and aerodynamic building orientation recommendations, CPWD-aligned preliminary cost estimates, comprehensive hazard and climate stress profiling, indicative land valuation, traditional Vastu Shastra reconciliation, and traceable civil engineering action items with formal IS-code citations.

The application operates completely without paid APIs, without Google Maps Platform, and without mandatory AI API keys by employing a deterministic engineering rule engine. Optional adapters for Groq, Google Gemini, and local Ollama are supported through a decoupled adapter pattern.

---

## Core Engineering Capabilities

### 1. Multi-Criteria Decision Analysis (MCDA) Land Suitability
Evaluates 5 standardized civil engineering criteria normalized on a 0 to 100 scale:
- **Topographic Slope (25% weight)**: Digital elevation sampling across 33m offsets. Flat ($\le 3\%$) = 100, Steep ($>15\%$) = 20–45.
- **Flood Risk Approximation (20% weight)**: Altitude AMSL, local depressions, and precipitation indices.
- **Road Accessibility (20% weight)**: Highway and arterial street network proximity.
- **Environmental Comfort (15% weight)**: Peak summer heat index and ambient ventilation.
- **Civic Facility Proximity (20% weight)**: Municipal infrastructure density index.
- **Classification**: Categorizes feasibility into Suitable ($\ge 70$), Conditionally Suitable (50–70), and Challenging ($< 50$).

### 2. Hazard History & Climate Stress Profile (Module 1)
Integrates live and static civil disaster mitigation datasets:
- **Seismic Hazard**: Matches site against BIS IS 1893:2016 seismic zones (Zones II to V) and zone acceleration factors ($Z = 0.10$ to $0.36$). Queries USGS FDSN API for historical earthquakes ($M \ge 4.5$ within 250 km, past 50 years, ordered by magnitude and capped at 250 with a `250+` indicator and confidence warning).
- **River Discharge & Inundation**: Queries Open-Meteo GloFAS river discharge (past 365 days). Guarded by a $0.1\text{ m}^3\text{/s}$ minimum flow threshold (negligible flow or dry channels set the discharge ratio to null, falling back gracefully to elevation AMSL and NDMA atlas proxies with low confidence warnings). Discharge ratios are capped at $20.0\times$.
- **Extreme Climatology**: Analyzes ECMWF ERA5 reanalysis data over the past 10 complete calendar years for maximum annual wind gusts and extreme precipitation days ($\ge 50\text{ mm/day}$).
- **Deterministic Hazard Aggregation**: Starts at $\max(\text{flood pressure}, \text{storm exposure})$; upgrades by one level for Seismic Zone IV; forces at least High for Zone V with historical events; reaches Critical only when Zone V coincides with High Flood or High Storm. Published in Methodology dialog.

### 3. Indicative Land Value Engine & Project Economics (Module 2)
Provides preliminary capital expenditure forecasting:
- **Guidance Circle Rates**: Matches state Inspector General of Registration (IGR) and Revenue Department published circle rates via spatial coordinate matching (haversine distance radius check first, reverse-geocoded locality second).
- **Deterministic Locality Multiplier**: Computed from road accessibility and civic infrastructure factor scores:
  $$\text{Multiplier} = 1.0 + \frac{\text{RoadScore} - 70}{200} + \frac{\text{FacilityScore} - 70}{200}$$
  Strictly clamped between $0.85\times$ and $1.25\times$.
- **Plot Area & Ground Coverage**: Derives plot area using built-up area and configurable Ground Coverage Ratio (default 60%, range 40–75%).
- **Interactive Browser Recomputation**: Users can supply custom land rates or plot area overrides. Changes recompute land acquisition cost and combined project expenditure (land + CPWD construction) debounced in the browser with a User-Supplied badge without server round-trips.

### 4. Vastu Shastra & Passive Solar Reconciliation (Module 3)
Reconciles traditional Indian architectural canon with modern bioclimatic building physics:
- **Entrance Portal Ranking**: Evaluates 8 cardinal and intercardinal orientations combining canonical Vastu weights (NE=100, N=95, E=90, S=45), road approach alignment bonus ($+35$ points within $45^\circ$), rear access penalty, and passive solar microclimate terms.
- **Unfabricated Fallback Geometry**: When OpenStreetMap Overpass road queries fail or time out, road approach defaults to an explicit unknown state (`bearing_degrees: null`, `approach_side: "unknown"`, `is_fallback: True`), skipping approach bonuses and ranking portals purely on Vastu and microclimate. Never fabricates geometry.
- **Mandala Room Matrix**: 9-zone layout (*Vastu Purusha Mandala*) mapping functional rooms (e.g. Master Bedroom in SW for thermal mass; Kitchen in SE to utilize prevailing winds for cooking fume extraction).
- **Downhill Drainage Aspect**: Calculates topographic slope aspect across cardinal offsets to verify water runoff direction and prescribe structural remediation swales for southern/southwestern slopes.

### 5. Traceable Recommendation Engine with IS-Code Citations (Module 4)
Emits categorized, severity-ranked civil engineering action items:
- Categorized into Structural & Seismic Safety, Hydrology & Flood Defense, Site Grading & Geotechnical, Access & Circulation, Vastu & Functional Planning, Land Valuation & Phasing, Climate & Passive Design, and Extreme Wind Defense.
- Formally cross-referenced with Indian Standards: **IS 1893:2016**, **IS 13920:2016** (ductile detailing), **IS 4326:2013** (earthquake resistance), **IS 875 Part 3** (design wind loads), **NBC 2016 Part 8**, and **CPWD PAR**.
- Rule IDs include `STR-001/002`, `FLD-001/002`, `SLP-001/002`, `ACC-001`, `VAS-001/002`, `LND-001/002/003`, `CLM-001`, and `STM-001`.
- Payloads passed to the AI narrative adapter are capped at the top 8 severity-ranked items to safeguard low-hardware Ollama context windows, while full structured items remain in UI and PDF.

### 6. Interactive Spatial Workspace & Entrance Geometry
- Built on MapLibre GL vector maps with OpenFreeMap vector cartography (Standard, Satellite hybrid with ESRI World Imagery, and Terrain with OpenTopoMap), 3D building extrusions, and zero paid API keys.
- **Oriented Building Footprint**: Simulates the building footprint oriented along the optimal passive solar axis.
- **Midpoint Entrance Arrow**: Computes outward unit vectors using geographic bearing mathematics clockwise from North and anchors an SVG entrance indicator at the exact midpoint of the corresponding footprint edge.

### 7. Pluggable AI Commentary & Vector PDF Export
- Default provider: `mock` (deterministic, zero latency, zero API keys, no network calls).
- Optional providers: `groq`, `gemini`, `ollama` with automatic fallback to deterministic generator.
- Server-side compilation using ReportLab into a clean A4 multi-page technical report with executive scorecard, hazard matrix, Vastu room grid, CPWD budget, and disclaimers. Compiles strictly under 3.0 seconds.

---

## Technical Stack

### Frontend
- **Framework**: React 19, TypeScript
- **Tooling**: Vite 8, Tailwind CSS with `@tailwindcss/container-queries`
- **Mapping**: MapLibre GL vector maps with OpenFreeMap vector styles, 3D buildings, and ESRI/OpenTopoMap hybrid layers
- **Testing & Audit**: Puppeteer Core (9-viewport responsive DOM integrity audit)
- **Linter**: Oxlint

### Backend
- **Framework**: Python 3.10+, FastAPI, Uvicorn
- **Data Validation**: Pydantic v2
- **HTTP Client**: HTTPX (async requests with 3.5s timeout and 24h spatial coordinate caching)
- **Document Generation**: ReportLab
- **Testing**: Pytest, Pytest-AsyncIO (offline deterministic unit tests with recorded fixtures)

---

## Project Structure

```
Buildwise/
|-- backend/
|   |-- app/
|   |   |-- main.py                    # FastAPI application and route endpoints
|   |   |-- config.py                  # Environment settings and configuration
|   |   |-- schemas/
|   |   |   |-- request.py             # Pydantic request models
|   |   |   `-- response.py            # Pydantic response models
|   |   |-- services/
|   |   |   |-- suitability_service.py # MCDA multi-criteria scoring logic
|   |   |   |-- orientation_service.py # Passive solar and wind orientation calculations
|   |   |   |-- cost_service.py        # CPWD plinth area rate cost estimation
|   |   |   |-- hazard_service.py      # Module 1: Seismic, flood, storm hazard evaluation
|   |   |   |-- landvalue_service.py   # Module 2: Indicative circle rates and locality multiplier
|   |   |   |-- vastu_service.py       # Module 3: Vastu entrance ranking and Mandala matrix
|   |   |   |-- recommendation_service.py # Module 4: Categorized, traceable civil rules
|   |   |   |-- risk_service.py        # Site constraints and mitigation evaluator
|   |   |   |-- report_service.py      # ReportLab vector PDF generator
|   |   |   `-- external_data_service.py # OSM, elevation, and climate integrations
|   |   |-- ai/                        # Pluggable AI explanation adapters (mock, groq, gemini, ollama)
|   |   `-- utils/                     # Geo math, haversine distance, and 24h spatial cache
|   |-- data/                          # Versioned static catalogs (v1.0.0 with source notes)
|   |   |-- seismic_zones.json         # BIS IS 1893:2016 state baselines and city overrides
|   |   |-- ndma_hazard_districts.json # Major river basins and coastal cyclone districts
|   |   |-- guidance_values.json       # State guidance circle rates with center coordinates
|   |   `-- vastu_rules.json           # Canonical orientation weights and climate adjustments
|   `-- tests/                         # Pytest test suite (all offline-deterministic unit tests)
|
|-- frontend/
|   |-- src/
|   |   |-- components/
|   |   |   |-- HazardProfileCard.tsx  # Seismic, flood, and storm telemetry display
|   |   |   |-- LandValueCard.tsx      # SRO circle rates, locality multiplier, and user override
|   |   |   |-- VastuAdvisoryCard.tsx  # Entrance ranking, Mandala grid, and scientific reconciliation
|   |   |   |-- RecommendationPanel.tsx# Severity-ranked traceable civil action items
|   |   |   |-- MapCanvas.tsx          # Leaflet map with oriented footprint and midpoint entrance arrow
|   |   |   |-- ScoreSummaryCard.tsx   # Circular gauge scorecard and feasibility classification
|   |   |   |-- FactorBreakdown.tsx    # 5 progress bars for MCDA evaluation factors
|   |   |   |-- OrientationCompass.tsx # Custom SVG engineering compass
|   |   |   |-- CostBreakdownTable.tsx # Itemized CPWD budget allocations
|   |   |   |-- MethodologyModal.tsx   # Calculation standards dialog with hazard aggregation rules
|   |   |   `-- Icon.tsx               # Unified inline SVG icon library
|   |   |-- services/                  # API client and TypeScript definitions
|   |   `-- App.tsx                    # Responsive workspace layout
|   `-- scripts/
|       `-- audit.cjs                  # Automated 9-viewport Puppeteer DOM integrity audit
|
|-- run_project.bat                    # Windows one-click startup launcher
`-- README.md                          # System documentation
```

---

## Local Installation & Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- npm 9+

### 1. Launch with One-Click Script (Windows)
Double-click `run_project.bat` from the root directory to automatically launch both the backend and frontend in separate console windows.
- Frontend: `http://localhost:5173/`
- Backend API Docs: `http://localhost:8000/docs`

### 2. Manual Launch

#### Backend
```bash
cd backend
pip install -r requirements.txt
python -m pytest tests/ -v
python -m uvicorn app.main:app --port 8000
```

#### Frontend
```bash
cd frontend
npm install
npm run build
npm run audit:ui
npm run dev
```

---

## Verification & Automated Test Suites

### 1. Backend Pytest Suite
```bash
cd backend
python -m pytest
```
Runs 36 tests covering:
- MCDA suitability weighting and factor boundaries.
- Bioclimatic solar noon angles and wind cross-ventilation azimuths.
- CPWD plinth area cost itemization and slope multipliers.
- USGS earthquake parsing, magnitude ordering, and 250-event cap warning.
- Open-Meteo flood guards (dry channel $<0.1\text{ m}^3\text{/s}$ ratio suppression and $20.0\times$ cap).
- ERA5 10-year mean gust and extreme rainfall calculations.
- Haversine guidance value spatial matching without geocoding dependency.
- Vastu entrance portal ranking with road approach bonus (South road top 3: NE, E, S).
- Unfabricated geometry fallback when Overpass is unreachable.
- Vector PDF compilation timing (strictly $<3.0$ seconds).
- Offline resilience and differential comparisons (Bengaluru Zone II vs Guwahati Zone V; Patna flood plain vs Bengaluru upland).

### 2. Frontend Responsive UI Integrity Audit
```bash
cd frontend
npm run audit:ui
```
Runs automated Chromium Puppeteer checks across 9 standard viewports (`2560x1440`, `1920x1080`, `1536x900`, `1535x900`, `1366x768`, `1024x768`, `900x1000`, `768x1024`, `390x844`) in both Empty and Loaded states. Asserts:
- Zero horizontal overflow (`scrollWidth <= clientWidth`).
- Zero page-level horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth`).
- Zero vertical clipping on text containers.
- Zero off-canvas projections.
- Footprint centroid and marker pin coincide within 1px across zoom levels 12–19.
- Footprint long axis runs within $5^\circ$ of East-West.

---

## Engineering Limitations & Assumptions

1. **Preliminary Planning Scope**: All calculations are intended for preliminary architectural feasibility, conceptual planning, and initial budgeting. They do not substitute for an on-site physical geotechnical borehole survey, certified structural analysis, or municipal regulatory sanctions.
2. **Economic Benchmarks**: Land valuation and construction cost estimation default to published Indian state guidance circle rates and CPWD Plinth Area Rates (PAR) benchmarked in Indian Rupees (INR). Geographic slope, solar altitude, seismic risk, and wind vectors function globally.
3. **Data Provenance Transparency**: Static tables (`seismic_zones.json`, `ndma_hazard_districts.json`, `guidance_values.json`) versioned at 1.0.0 cover state-level baselines, major river basins, and primary demo economic corridors with explicit source notes. Future iterations (v1.1.0) will expand to exhaustive nationwide district registries.
