# BuildWise AI — Brand & Identity Assets

This directory contains the canonical master brand identity assets for the **BuildWise AI** platform.

---

## Asset Directory Overview

| File | Resolution | Format | Description / Usage |
| :--- | :---: | :---: | :--- |
| **`BuildWise_AI_with_title.png`** | 2172 × 724 | PNG (RGB) | Full horizontal banner with title and brandmark on white background. Used as the primary hero image in `README.md` and documentation. |
| **`BuildWise_AI_with_title_transparent.png`** | 2172 × 724 | PNG (RGBA) | Horizontal title banner with transparent background for overlays and custom canvas renders. |
| **`BuildWise_logo_transparent.png`** | 1536 × 1024 | PNG (RGBA) | Master brandmark logo on transparent background. |
| **`BuildWise_logo_with_white_Background.png`** | 1536 × 1024 | PNG (RGB) | Master brandmark logo on clean white background. |
| **`BuildWise_logo_square.png`** | 512 × 512 | PNG (RGBA) | Centered 1:1 square crop with padding. Used in `AppHeader.tsx`, app navigation, and PWA icons. |
| **`BuildWise_logo_square_white.png`** | 512 × 512 | PNG (RGBA) | Inverted white monochrome square mark, optimized for dark-mode UI elements and dark browser tabs. |

---

## Derivative Deployments

These master assets are automatically consumed and mirrored in the following application locations:

- **Frontend Client (`frontend/public/`):**
  - `favicon.ico`: Multi-resolution (16×16, 32×32, 48×48) browser favicon.
  - `favicon.svg`: Adaptive SVG favicon dynamically switching between light and dark modes based on system preference.
  - `favicon.png`, `favicon-16x16.png`, `favicon-32x32.png`: High-DPI PNG favicons.
  - `apple-touch-icon.png`: 180×180 iOS home-screen icon.
  - `icon-192.png`, `icon-512.png`: PWA manifest web app icons.
  - `brand/`: Public static asset folder for direct web consumption.

- **Frontend Source (`frontend/src/assets/`):**
  - Bundled brand assets for Vite/React imports (`AppHeader.tsx`, etc.).

- **Backend PDF Engine (`backend/app/assets/brand/`):**
  - High-resolution vector/raster logo embedded into the executive summary header of generated ReportLab PDF reports.

- **Documentation (`docs/assets/hero.png`):**
  - Primary project banner for GitHub README and repository presentations.
