# Testing & Quality Assurance
> `pytest` • `Regression Suites` • `Topological Invariants` • `Puppeteer UI Audit` • `Oxlint`

Complete guide to testing, regression prevention, structural invariants validation, and UI audits across the BuildWise AI codebase.

---

## Table of Contents
- [Test Strategy Overview](#test-strategy-overview)
- [Backend Test Suites (`backend/tests/`)](#backend-test-suites-backendtests)
  - [Architectural Placement Regression Suite (`test_placement_rules.py`)](#architectural-placement-regression-suite-test_placement_rulespy)
  - [Generative Room Program Suite (`test_room_program_v10.py`)](#generative-room-program-suite-test_room_program_v10py)
  - [Formal PDF Report Suite (`test_pdf_report_v9.py`)](#formal-pdf-report-suite-test_pdf_report_v9py)
  - [API Contract & Rate Limit Suite (`test_api.py`)](#api-contract--rate-limit-suite-test_apipy)
  - [Geospatial & Hazard Suites](#geospatial--hazard-suites)
- [Frontend Testing & Quality Gates](#frontend-testing--quality-gates)
  - [Linting with Oxlint](#linting-with-oxlint)
  - [TypeScript Compilation & Vite Build](#typescript-compilation--vite-build)
  - [Multi-Viewport Automated UI Audit (`audit.cjs`)](#multi-viewport-automated-ui-audit-auditcjs)
- [Running All Tests Locally](#running-all-tests-locally)
- [Navigation](#navigation)

---

## Test Strategy Overview

BuildWise AI employs a multi-tiered verification hierarchy ensuring that zero invalid architectural geometry or UI layout bugs reach production:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Continuous Quality Gates                        │
├──────────────────────────────────┬─────────────────────────────────────┤
│        Backend Verification      │        Frontend Verification        │
│  • 236 Automated Pytest Cases    │  • Oxlint Fast Static Analysis      │
│  • 145 Placement Regression Test │  • TypeScript Strict Typing (tsc)   │
│  • Vastu / Topological Invariant │  • Vite Production Bundling         │
│  • CPWD Mathematical Accuracy    │  • Puppeteer 9-Viewport Audit       │
└──────────────────────────────────┴─────────────────────────────────────┘
```

---

## Backend Test Suites (`backend/tests/`)

Backend test suites are run using `pytest` inside the Python virtual environment:
```bash
cd backend
python -m pytest tests/ -v
```

### Architectural Placement Regression Suite (`test_placement_rules.py`)
Encodes non-negotiable architectural invariants into 145 parameterized tests across 6 plot geometries and 3 typologies:

```python
TEST_PLOTS = [
    (10.9, 10.6),  # Square single-family plot
    (12.0, 10.0),  # Wide plot
    (10.0, 15.0),  # Deep plot
    (15.0, 12.0),  # Mid-size suburban
    (23.3, 14.0),  # Wide frontage plot
    (16.1, 19.3),  # Large residential estate
]

TEST_TYPOLOGIES = [
    ["living", "puja", "master_bed", "bath_1", "kitchen"],
    ["living", "puja", "master_bed", "bed_2", "bath_1", "kitchen"],
    ["living", "puja", "master_bed", "bed_2", "bath_1", "bath_2", "dining", "kitchen"],
]
```

#### Parameterized Test Matrix:
1. **`test_bath_never_adjacent_pooja`** (18 cases): Asserts that no bathroom/WC ever shares a vertical or horizontal wall segment ($> 0.15\text{m}$) with a Pooja room.
2. **`test_bath_never_at_entry_or_frontage`** (18 cases): Asserts that the main entry door never opens into a bathroom and no bathroom touches the front boundary wall.
3. **`test_bath_never_central`** (18 cases): Asserts that the centroid of every bathroom lies strictly outside the central 40% plot box.
4. **`test_bath_is_leaf`** (18 cases): Asserts that in the door connectivity graph, all bathroom nodes have degree exactly equal to 1 (zero through-traffic).
5. **`test_living_receives_entry`** (18 cases): Asserts that the main entry door opens directly into the Living Room.
6. **`test_pooja_ne_corner`** (18 cases): Asserts that the Pooja room sits in the North-East corner with width $\ge 2.4\text{m}$.
7. **`test_kitchen_se_corner`** (18 cases): Asserts that the Kitchen occupies the South-East corner and touches exterior envelope walls.
8. **`test_all_rooms_within_area_catalog_and_aspect`** (18 cases): Verifies that all room areas comply with the NBC 2016 room catalog bounds and aspect ratios $\le 1:2.2$.
9. **`test_validator_repairs_illegal_placement`**: Unit tests validating that `validate_and_repair_placement()` repairs faulty LLM placements before geometry solver execution.

---

### Generative Room Program Suite (`test_room_program_v10.py`)
- Verifies dynamic room program generation across diverse plinth areas (800 sqft to 5,000 sqft) and specification grades.
- Validates fallback program selection when LLM inference is disabled.
- Asserts that room programs respect client notes (e.g. requesting a home office, study, or additional ensuite).

---

### Formal PDF Report Suite (`test_pdf_report_v9.py`)
- Tests end-to-end vector PDF compilation in ReportLab.
- Verifies page layout constraints: A4 portrait, 18mm margins, Inter TTF font subsetting.
- Tests Section 10 dedicated full-page blueprint layout with the 4-tile solver metric strip and 174mm vector drawing.
- Ensures zero page-count overflow or orphaned heading elements.

---

### API Contract & Rate Limit Suite (`test_api.py`)
- Tests `POST /api/analyze` request validation and Pydantic response models.
- Tests sliding window in-memory rate limiting (asserts `HTTP 429` on the 31st request within 60s).
- Tests CORS headers and preflight `OPTIONS` requests.
- Validates graceful degradation when external telemetry APIs simulate timeouts.

---

### Geospatial & Hazard Suites
- **`test_hazard.py`:** Tests USGS FDSN seismic parsing, 50-year filtering, and GloFAS river discharge ratio calculations.
- **`test_site_vision.py`:** Tests Copernicus Sentinel-2 multispectral vegetation index calculation (NDVI) and tree preservation clustering.
- **`test_cost.py`:** Tests CPWD Plinth Area Rate formulas and floor height adjustments.
- **`test_vastu.py`:** Tests 8-directional cardinal analysis and entrance scoring.

---

## Frontend Testing & Quality Gates

The frontend employs static analysis, type checking, and automated browser audits:

### Linting with Oxlint
Fast static code analysis powered by [Oxlint](https://oxc.rs/):
```bash
npm run lint
```

### TypeScript Compilation & Vite Build
Validates that all React components, hooks, and types compile with zero type errors:
```bash
npm run build
```
Executes `tsc -b && vite build`.

### Multi-Viewport Automated UI Audit (`audit.cjs`)
Located in `frontend/scripts/audit.cjs`. Uses headless Chrome via Puppeteer to evaluate 9 responsive screen resolutions:

| Viewport | Dimensions (WxH) | Target Device Class |
|:---|:---|:---|
| **2560x1440** | 2560 × 1440 | 2K / 4K Desktop Monitors |
| **1920x1080** | 1920 × 1080 | Standard Full HD Desktop |
| **1536x900** | 1536 × 900 | Common High-DPI Laptops |
| **1535x900** | 1535 × 900 | High-DPI Breakpoint Boundary |
| **1366x768** | 1366 × 768 | Legacy Desktop / Budget Laptops |
| **1024x768** | 1024 × 768 | iPad / Small Tablets (Landscape) |
| **900x1000** | 900 × 1000 | Tiled Window / Foldable Screen |
| **768x1024** | 768 × 1024 | Tablet Portrait |
| **390x844** | 390 × 844 | Modern Mobile Smartphone |

#### Automated Audit Checks:
- [x] **Zero Page Overflow:** Asserts `document.documentElement.scrollWidth <= window.innerWidth`.
- [x] **No Clipped Text:** Identifies truncated labels or overflow issues.
- [x] **Drawer Collisions:** Confirms that floating glass cards and the sliding ReportSheet do not overlap the top navigation or map tools.
- [x] **Accessible Tap Targets:** Verifies buttons and inputs meet the 44×44px minimum target standard.

To execute the audit:
```bash
npm run audit:ui
```

---

## Running All Tests Locally

Run the complete test cycle before submitting pull requests:

```bash
# 1. Run backend unit & regression suites
cd backend
python -m pytest tests/

# 2. Run frontend type check, lint, and production bundle
cd ../frontend
npm run lint
npm run build
```

---

## Navigation
- **Previous:** [← Map & Data Providers](map-and-data.md)
- **Next:** [Production Deployment →](deployment.md)

---
*BuildWise AI • [MIT License](../LICENSE) • Copyright (c) 2026 Rolan Lobo*
