# BuildWise AI - Geo-Based Intelligent Construction Planning System

BuildWise AI is an open-access, geo-intelligent site feasibility evaluation and preliminary construction planning platform designed for civil engineers, architectural consultants, real estate planners, and prospective builders. Given geographic coordinates and architectural parameters (built-up area, quality grade, building typology, storeys), the application executes deterministic multi-factor land suitability evaluations, passive solar and aerodynamic building orientation recommendations, CPWD-aligned preliminary cost estimates, and professional engineering commentary.

The application operates completely without paid APIs, without Google Maps Platform, and without mandatory AI API keys by employing a deterministic engineering rule engine. Optional adapters for Groq, Google Gemini, and local Ollama are supported through a decoupled adapter pattern.

---

## Key Features

1. **Free Interactive Spatial Workspace**:
   - Built on Leaflet.js with OpenStreetMap cartography.
   - Interactive click-to-pin, draggable marker, coordinate displays, and real-time bounding box synchronization.
   - Zero map API keys required.

2. **Deterministic Land Suitability Engine (MCDA Model)**:
   - Evaluates 5 standardized civil engineering criteria normalized on a 0 to 100 scale:
     - Topographic Slope (25% weight): Digital elevation sampling across 33m offsets.
     - Flood Risk Approximation (20% weight): Altitude AMSL, local depressions, and precipitation indices.
     - Road Accessibility (20% weight): Highway and arterial street network proximity.
     - Environmental & Thermal Comfort (15% weight): Peak summer heat index and ambient ventilation.
     - Civic Facility Proximity (20% weight): Municipal infrastructure density index.
   - Categorizes feasibility into Suitable (>= 70), Conditionally Suitable (50 - 70), and Challenging (< 50).

3. **Passive Bioclimatic Orientation Optimization**:
   - Calculates solar noon altitude profiles and solar declination.
   - Recommends optimal principal longitudinal building axis (East-West at 90 degrees in tropical/subtropical latitudes) to prevent peak solar facade overheating.
   - Deflects axis by up to +/- 15 degrees based on prevailing wind vectors to optimize cross-ventilation.
   - Visualized with a custom SVG technical engineering compass.

4. **Preliminary Construction Cost Estimation (CPWD Aligned)**:
   - Uses Central Public Works Department (CPWD) Plinth Area Rates (PAR) benchmarks:
     - Basic Specification: INR 1,500 /sq ft
     - Standard Specification: INR 2,200 /sq ft
     - Premium Specification: INR 3,500 /sq ft
   - Applies dynamic terrain slope multipliers (1.0x for flat up to 1.25x for steep grades).
   - Itemizes budget across Structural Works (50%), Architectural Finishes (18%), MEP Services (14%), Site Grading (8-15%), and Contingencies (8-10%).

5. **Site Risk Identification & Mitigation Matrix**:
   - Automatically detects topographic differential settlement risks, drainage surcharges, and heavy transit mixer access constraints.
   - Assigns severity ratings (Low, Medium, High) with prescribed engineering countermeasures.

6. **Pluggable AI & Rule-Based Explanation Layer**:
   - Default provider: `mock` (deterministic, zero latency, zero API keys, no network calls).
   - Optional providers: `groq`, `gemini`, `ollama`.
   - Automatic fallback to deterministic generator on timeout, missing key, or network error.
   - AI generates only qualitative explanations and actionable recommendations; all numerical calculations remain strictly deterministic.

7. **Vector PDF Engineering Feasibility Report**:
   - Server-side compilation using ReportLab into a clean A4 multi-page technical report.
   - Contains executive scorecard, factor tables, orientation details, itemized budgets, risk matrices, and formal engineering disclaimers.

8. **Minimal, Engineered Design System**:
   - Clean slate and white palette with high data-to-ink ratio.
   - 100% Inline SVG icons with consistent 1.75px stroke width.
   - Zero emojis anywhere in UI, code, or documentation.

---

## Technical Stack

### Frontend
- **Framework**: React 19, TypeScript
- **Tooling**: Vite
- **Styling**: Tailwind CSS
- **Mapping**: Leaflet.js with OpenStreetMap Cartography
- **Iconography**: Custom Inline SVG Icon System

### Backend
- **Framework**: Python 3.10+, FastAPI, Uvicorn
- **Data Validation**: Pydantic v2
- **HTTP Client**: HTTPX (async requests with 3.5s timeout)
- **Document Generation**: ReportLab
- **Testing**: Pytest, Pytest-AsyncIO

---

## Project Structure

```
Buildwise/
|-- backend/
|   |-- app/
|   |   |-- __init__.py
|   |   |-- main.py                    # FastAPI application and route endpoints
|   |   |-- config.py                  # Environment settings and configuration
|   |   |-- schemas/
|   |   |   |-- __init__.py
|   |   |   |-- request.py             # Pydantic request models
|   |   |   `-- response.py            # Pydantic response models
|   |   |-- services/
|   |   |   |-- __init__.py
|   |   |   |-- suitability_service.py # MCDA multi-criteria scoring logic
|   |   |   |-- orientation_service.py # Passive solar and wind orientation calculations
|   |   |   |-- cost_service.py        # CPWD plinth area rate cost estimation
|   |   |   |-- risk_service.py        # Site constraints and mitigation evaluator
|   |   |   |-- report_service.py      # ReportLab vector PDF generator
|   |   |   `-- external_data_service.py # OSM, elevation, and climate integrations
|   |   |-- ai/
|   |   |   |-- __init__.py            # Adapter factory
|   |   |   |-- base_adapter.py        # Abstract interface
|   |   |   |-- mock_adapter.py        # Default deterministic explanation generator
|   |   |   |-- groq_adapter.py        # Optional Groq cloud adapter
|   |   |   |-- gemini_adapter.py      # Optional Google Gemini adapter
|   |   |   `-- ollama_adapter.py      # Optional local Ollama adapter
|   |   `-- utils/
|   |       |-- __init__.py
|   |       |-- geo_utils.py           # Haversine distance, solar path, synthetic terrain
|   |       `-- cache_utils.py         # Thread-safe spatial coordinate TTL cache
|   |-- tests/
|   |   |-- __init__.py
|   |   |-- test_suitability.py        # Unit tests for suitability formulas
|   |   |-- test_orientation.py        # Unit tests for orientation logic
|   |   |-- test_cost.py               # Unit tests for CPWD cost calculations
|   |   `-- test_api.py                # Integration tests for API routes and PDF stream
|   |-- requirements.txt               # Backend dependencies
|   |-- .env.example                   # Environment configuration template
|   |-- .env                           # Active environment settings
|   `-- run_backend.py                 # Backend entry point script
|
|-- frontend/
|   |-- public/
|   |   `-- favicon.svg                # Clean SVG geometric favicon
|   |-- src/
|   |   |-- components/
|   |   |   |-- AppHeader.tsx          # Navigation bar with telemetry and modal trigger
|   |   |   |-- CoordinatesInput.tsx   # Precise coordinates display and manual sync
|   |   |   |-- AnalysisForm.tsx       # Parameters form (area, grade, typology, storeys)
|   |   |   |-- MapCanvas.tsx          # Leaflet map container and footprint simulation
|   |   |   |-- ScoreSummaryCard.tsx   # Circular gauge scorecard and feasibility classification
|   |   |   |-- FactorBreakdown.tsx    # 5 progress bars for MCDA evaluation factors
|   |   |   |-- OrientationCompass.tsx # Custom SVG engineering compass
|   |   |   |-- CostBreakdownTable.tsx # Itemized CPWD budget allocations
|   |   |   |-- RiskMatrix.tsx         # Site constraints and mitigation items
|   |   |   |-- RecommendationPanel.tsx# Technical commentary and action items
|   |   |   |-- DownloadReportButton.tsx# Async PDF export trigger
|   |   |   |-- StatusBanner.tsx       # Warnings and degraded mode alerts
|   |   |   |-- EmptyState.tsx         # Initial walkthrough instructions
|   |   |   |-- LoadingSkeleton.tsx    # Staged progress and pulse placeholders
|   |   |   |-- MethodologyModal.tsx   # Reference dialog for calculation standards
|   |   |   `-- Icon.tsx               # Unified inline SVG icon library
|   |   |-- services/
|   |   |   |-- api.ts                 # Backend fetch client
|   |   |   `-- types.ts               # TypeScript data definitions
|   |   |-- App.tsx                    # Master responsive workspace layout
|   |   |-- main.tsx                   # React client bootstrap
|   |   `-- index.css                  # Tailwind directives and Leaflet overrides
|   |-- index.html                     # HTML5 shell
|   |-- package.json                   # Frontend dependencies
|   |-- tsconfig.json                  # TypeScript compiler settings
|   |-- tailwind.config.js             # Tailwind design token configuration
|   `-- vite.config.ts                 # Vite bundler configuration
|
|-- run_project.bat                    # Windows one-click startup launcher
`-- README.md                          # System documentation
```

---

## Local Installation & Setup

### Prerequisites
- Python 3.10 or higher
- Node.js 18.0 or higher
- npm 9.0 or higher

### 1. Backend Setup

1. Open a terminal and navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Configure environment settings:
   Copy `.env.example` to `.env` (already created with default mock values):
   ```bash
   cp .env.example .env
   ```

4. Run the backend calculation engine unit tests:
   ```bash
   python -m pytest tests/
   ```

5. Start the FastAPI server:
   ```bash
   python run_backend.py
   ```
   The backend will be live at: `http://127.0.0.1:8000` (API documentation at `http://127.0.0.1:8000/docs`).

### 2. Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install npm dependencies:
   ```bash
   npm install
   ```

3. Build the production bundle to verify types:
   ```bash
   npm run build
   ```

4. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The frontend will be live at: `http://127.0.0.1:5173/`.

### 3. One-Click Launch (Windows)

Double-click `run_project.bat` from the root directory to automatically launch both the backend and frontend services in separate console windows.

---

## Configuration Reference (`backend/.env`)

```ini
# Server Binding
HOST=127.0.0.1
PORT=8000
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# AI Explanation Provider: mock (default), groq, gemini, ollama
DEFAULT_AI_PROVIDER=mock

# Optional API Keys (Leave blank to use zero-config deterministic mock provider)
GROQ_API_KEY=
GEMINI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
```

---

## How to Use BuildWise AI

1. **Select Coordinates**:
   - Click anywhere on the interactive map canvas to drop a marker pin.
   - Alternatively, enter exact Latitude and Longitude values into the input fields and click "Update Pin".
   - The system automatically queries OpenStreetMap Nominatim for the reverse geocoded address.

2. **Configure Parameters**:
   - Adjust the built-up plinth area slider between 500 and 50,000 square feet.
   - Choose the specification quality grade (Basic, Standard, Premium).
   - Select the building typology and number of storeys.
   - Select your preferred technical explanation engine (defaults to Mock Deterministic).

3. **Run Feasibility Analysis**:
   - Click "Run Site Feasibility Analysis".
   - The engine queries digital elevation contours and meteorological telemetry, normalizes MCDA factors, aligns orientation, and estimates CPWD budgets.

4. **Review Results**:
   - **Scorecard**: Review the composite score (0-100) and classification tag.
   - **Factor Breakdown**: Inspect the 5 factors, weights, and normalized bars.
   - **Orientation Compass**: View the optimal building longitudinal axis, summer/winter solar paths, and prevailing wind vector.
   - **Cost Table**: Examine the itemized preliminary construction budget and terrain slope multiplier.
   - **Risk Matrix**: Review identified geotechnical and climatic site constraints with mitigations.
   - **Technical Commentary**: Read the engineering narrative and actionable recommendations.

5. **Download PDF Report**:
   - Click "Download Engineering Feasibility Report (PDF)" to stream an official vector A4 engineering report directly to your browser.

---

## Testing & Quality Assurance

The system includes automated tests for all deterministic calculation services and API contracts.

Run backend tests:
```bash
cd backend
python -m pytest tests/ -v
```

Test coverage includes:
- Slope grading thresholds and score boundaries (flat, gentle, moderate, steep).
- Hydrological flood risk penalty deductions and elevation metrics.
- Multi-criteria weights summation (strictly equals 1.0).
- Building orientation angles across Northern and Southern hemispheres.
- CPWD plinth area base rates, terrain multipliers, and sub-allocation sums.
- API health check, analysis endpoint schema validation, and PDF binary stream header checks.

---

## Engineering Limitations & Assumptions

1. **Preliminary Planning Scope**: Calculations are intended for preliminary architectural feasibility, conceptual planning, and initial budgeting. They do not substitute for an on-site physical geotechnical borehole survey, certified structural analysis, or municipal regulatory sanctions.
2. **Economic Benchmarks**: Cost estimation defaults to CPWD Plinth Area Rates (PAR) benchmarked in Indian Rupees (INR). Geographic slope, solar altitude, and wind vectors function globally.
3. **Open Elevation Sampling**: Elevation sampling utilizes Open-Meteo elevation and SRTM models. In remote locations with localized digital elevation errors, a conservative synthetic gradient engages automatically.

---

## Future Enhancements

- Integration of geotechnical soil classification GIS layers (e.g., USGS / Survey of India maps).
- Direct export of 2D DXF boundary contours and 3D IFC / gbXML bioclimatic massing models.
- Support for customizable municipal building bye-laws (FAR/FSI, setbacks, ground coverage).
