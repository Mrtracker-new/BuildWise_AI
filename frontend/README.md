# BuildWise AI - Frontend UI System & Architecture

BuildWise AI's frontend is an engineered, responsive spatial workspace built with React 19, TypeScript, Vite, Tailwind CSS v3 with `@tailwindcss/container-queries`, and MapLibre GL vector maps.

---

## 1. Project Layout & Responsive Guidelines

### Systemic Guardrail: Container Queries vs Viewport Breakpoints
Components rendered inside fixed-width or constrained surfaces (the 380px left rail, 460px right rail, slide-over results drawer, and modals) **must not use viewport breakpoints** (`sm:`, `md:`, `lg:`, `xl:`) for internal layout or styling decisions.
- **Rule**: Internal layout decisions must be governed by container queries (via `@tailwindcss/container-queries`, e.g. `@container`, `@sm:`, `@md:`, `@lg:`) or intrinsic CSS layouts (such as `flex-wrap`, `min-w-0`, and natural vertical stacking).
- **Rationale**: In desktop layouts with fixed sidebars (e.g. 460px rail on a 2560px screen), viewport queries like `sm:` or `md:` evaluate true based on the 2560px window width, causing components to attempt horizontal multi-column layouts inside a narrow 460px container, resulting in clipping and off-canvas projection.
- **Enforcement**: Rail components (`ScoreSummaryCard`, `FactorBreakdown`, `OrientationCompass`, `CostBreakdownTable`, `RiskMatrix`, `RecommendationPanel`, `CoordinatesInput`, `AnalysisForm`, and `EmptyState`) utilize `@container` root classes and container variants exclusively.

### Intentional Truncation Whitelist
- **Rule**: `truncate` and `line-clamp` are forbidden on analytical cards, factor names, risk matrices, plinth rates, coordinates, and methodology descriptions.
- **Whitelist Exception**: `truncate` is permitted **only** on the single-line telemetry banner (`TelemetryStrip`) on desktop viewports (`lg:truncate`), under the strict conditions that:
  1. The full text is always reachable via native `title` tooltip attribute.
  2. The full text is accessible via the persistent header Notice badge popover dialog (`aria-haspopup="dialog"`).
  3. Below 1024px (`< lg:`), the banner wraps naturally with `whitespace-normal break-words`.

### Surface Overflow Semantics
- **Scrolling Rails**: Must use `overflow-y-auto` paired with `overflow-x-clip` (and `overscroll-contain`). Do NOT apply `overflow-hidden` to rails, as vertical scrolling must be preserved while eliminating horizontal scroll leakage.
- **Center GIS Section**: Only `#center-map-section` applies `overflow-hidden` to clip MapLibre spatial vector/raster tile canvases and contain the translated slide-over results drawer.
- **Text Wrapping**: Set `overflow-wrap: break-word` on `body` globally. Reserve `overflow-wrap: anywhere` and `break-all` strictly for monospace data strings (WGS84 coordinate pairs, reference IDs, formulas, and INR currency ranges).

### Mathematical & Engineering Formula Wrapping
- In modals and commentary blocks (e.g. `MethodologyModal`), formulas must not use blind `break-all`. Insert `<wbr />` or zero-width spaces (`\u200B`) after operators (`+`, `*`, `=`, and parentheses) to provide natural line break opportunities. The formula container must be equipped with `overflow-x-auto scrollbar-thin`.

---

## 2. Verification & Automated UI Audit Suite

The repository includes a permanent, headless Chromium UI integrity audit suite in `scripts/audit.cjs` that programmatically evaluates 10 viewport/drawer/state combinations:

```bash
# Run the automated UI integrity audit suite
npm run audit:ui
```

### Audited Viewport Matrix
- `2560x1440` (Empty & Loaded 3-column desktop)
- `1920x1080` (Empty & Loaded 3-column desktop)
- `1536x900` (Empty & Loaded breakpoint boundary)
- `1535x900` (Loaded with drawer closed AND loaded with drawer open)
- `1366x768` (Loaded with drawer closed AND loaded with drawer open)
- `1024x768` (Loaded with drawer closed AND loaded with drawer open)
- `900x1000` (Empty & Loaded tablet stacked)
- `768x1024` (Empty & Loaded tablet portrait)
- `390x844` (Empty & Loaded mobile portrait)

### Targeted Automated Checks
1. **Zero DOM Overflow**:
   - `scrollWidth <= clientWidth` on all non-scrolling elements.
   - `document.documentElement.scrollWidth <= window.innerWidth` (no page-level horizontal overflow).
   - Zero vertical clipping on `overflow: hidden` elements with text.
   - Zero off-canvas elements exceeding viewport edges.
2. **Score Gauge SVG**: Strictly verifies that the SVG ring gauge renders at `120x120px` and never below 120px.
3. **Telemetry Strip**: Verifies `lg:truncate` and title tooltip on desktop; verifies natural wrapping below 1024px.
4. **Telemetry Popover Accessibility**: Verifies keyboard (`Enter`, `Escape`) and mouse reachability.
5. **Formula Wrapping**: Verifies `<wbr>` break opportunities and `overflow-x-auto`.
6. **Rail Semantics**: Verifies rails keep `overflow-y-auto` and `overflow-x-clip`, while map uses `overflow-hidden`.

---

## 3. Standard Scripts

```bash
# Start development server
npm run dev

# Run Oxlint linter
npm run lint

# TypeScript verification & Production build
npm run build

# Run automated UI integrity audit
npm run audit:ui
```
