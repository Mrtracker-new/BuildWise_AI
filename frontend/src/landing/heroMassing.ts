/**
 * heroMassing.ts — the geometry the landing hero extrudes, and its facade openings.
 *
 * GENERATED FILE. Do not edit by hand:
 *   cd frontend && node scripts/extract_hero_massing.cjs
 * reads the raw capture written by the committed engine capture script
 * (`../backend/scripts/capture_landing_generation.py`) and rewrites this module.
 * `--check` fails if the module no longer equals that capture.
 *
 * Every number below is copied out of one real `POST /api/generate-floorplan`
 * response (`generationId` and `provenance.sha256` name it). Coordinates are the
 * engine's local tangent plane in metres (E/N) — the same space the app's capture
 * tool draws the plot ring in. `floors[].openings` are the engine's OWN window and
 * exterior-door placements (`floors[].windows`, `floors[].doors`): a wall edge, a
 * span along that wall and a sill height. Nothing here is an authored mesh,
 * texture or stock model.
 *
 * ONE DRAWING SIMPLIFICATION, DISCLOSED. The capture's window records carry no
 * opening HEIGHT, so `headM` is the sill plus the schedule's most common
 * lintel − sill (1.20 m). The schedule's one 600 mm louvre is therefore drawn
 * taller than it is scheduled, and is the only facade dimension here that the
 * capture does not state directly. See the generator's header for the second
 * capture inconsistency (scheduled widths vs placed spans — the placed span wins).
 *
 * These are CANDIDATE generations, not marketing figures: the certificate counts
 * are carried so the hero can print the verdict the engine actually returned.
 */
export type MassingEdge = 'N' | 'E' | 'S' | 'W';

export interface MassingOpening {
  kind: 'window' | 'door';
  id: string;
  edge: MassingEdge;
  /** Metres along the wall from the face's start corner (N → E → S → W, clockwise). */
  alongM: number;
  widthM: number;
  /** Height of the opening's sill above its own floor. */
  sillM: number;
  /** Height of the opening's head above its own floor. */
  headM: number;
}

export interface MassingStorey {
  index: number;
  name: string;
  envelope: { x: number; y: number; widthM: number; depthM: number };
  rooms: number;
  openings: ReadonlyArray<MassingOpening>;
}

export interface HeroMassing {
  generationId: string;
  seed: string;
  typology: string;
  storeys: number;
  floorHeightM: number;
  plot: { ring: ReadonlyArray<readonly [number, number]>; areaSqm: number; perimeterM: number };
  buildable: { ring: ReadonlyArray<readonly [number, number]>; areaSqm: number; setbackBandAreaSqm: number };
  footprint: { x: number; y: number; widthM: number; depthM: number; areaSqm: number };
  floors: ReadonlyArray<MassingStorey>;
  /** The captured stair core, in absolute plane metres. */
  stairHead: { id: string; type: string; x: number; y: number; widthM: number; depthM: number };
  stacks: ReadonlyArray<{ id: string; x: number; y: number; widthM: number; depthM: number }>;
  outdoor: ReadonlyArray<{ id: string; ring: ReadonlyArray<readonly [number, number]> }>;
  figures: { plotCoveragePct: number };
  certificate: { isValid: boolean; pass: number; warn: number; na: number; total: number };
  provenance: { capture: string; bytes: number; sha256: string };
}

/** The generation the hero draws — the irregular cadastral plot. */
export const HERO_MASSING: HeroMassing = {
  "generationId": "GEN-T1-2F-20261016",
  "seed": "20261016",
  "typology": "residential_single",
  "storeys": 2,
  "floorHeightM": 3,
  "plot": {
    "ring": [
      [
        0,
        0
      ],
      [
        18.4,
        0
      ],
      [
        21.6,
        6.9
      ],
      [
        19.1,
        15.8
      ],
      [
        7.2,
        17.4
      ],
      [
        0,
        11.2
      ]
    ],
    "areaSqm": 317.83,
    "perimeterM": 67.96
  },
  "buildable": {
    "ring": [
      [
        2.09,
        2.09
      ],
      [
        2.09,
        10.24
      ],
      [
        7.85,
        15.21
      ],
      [
        17.46,
        13.91
      ],
      [
        19.38,
        7.08
      ],
      [
        17.07,
        2.09
      ]
    ],
    "areaSqm": 191.52,
    "setbackBandAreaSqm": 126.31
  },
  "footprint": {
    "x": 3.09,
    "y": 2.09,
    "widthM": 13.5,
    "depthM": 9,
    "areaSqm": 121.5
  },
  "floors": [
    {
      "index": 0,
      "name": "Ground Floor (G)",
      "envelope": {
        "x": 3.09,
        "y": 2.09,
        "widthM": 13.5,
        "depthM": 9
      },
      "rooms": 8,
      "openings": [
        {
          "kind": "window",
          "id": "win_dining_F0",
          "edge": "E",
          "alongM": 3.27,
          "widthM": 2.4,
          "sillM": 0.9,
          "headM": 2.1
        },
        {
          "kind": "window",
          "id": "win_kitchen_F0",
          "edge": "E",
          "alongM": 6.54,
          "widthM": 2.4,
          "sillM": 0.9,
          "headM": 2.1
        },
        {
          "kind": "window",
          "id": "win_living_F0",
          "edge": "N",
          "alongM": 4.35,
          "widthM": 2.4,
          "sillM": 0.9,
          "headM": 2.1
        },
        {
          "kind": "door",
          "id": "main_entry_F0",
          "edge": "N",
          "alongM": 4.95,
          "widthM": 1.2,
          "sillM": 0,
          "headM": 2.1
        },
        {
          "kind": "window",
          "id": "win_puja_F0",
          "edge": "N",
          "alongM": 11.7,
          "widthM": 1.2,
          "sillM": 0.9,
          "headM": 2.1
        },
        {
          "kind": "window",
          "id": "win_guest_bed_F0",
          "edge": "S",
          "alongM": 7.77,
          "widthM": 2.04,
          "sillM": 0.9,
          "headM": 2.1
        },
        {
          "kind": "window",
          "id": "win_bath_1_F0",
          "edge": "S",
          "alongM": 11.93,
          "widthM": 1,
          "sillM": 1.2,
          "headM": 2.4
        }
      ]
    },
    {
      "index": 1,
      "name": "First Floor (G+1)",
      "envelope": {
        "x": 3.09,
        "y": 2.09,
        "widthM": 13.5,
        "depthM": 9
      },
      "rooms": 7,
      "openings": [
        {
          "kind": "window",
          "id": "win_study_F1",
          "edge": "E",
          "alongM": 3.27,
          "widthM": 2.4,
          "sillM": 0.9,
          "headM": 2.1
        },
        {
          "kind": "window",
          "id": "win_master_bed_F1",
          "edge": "E",
          "alongM": 6.54,
          "widthM": 2.4,
          "sillM": 0.9,
          "headM": 2.1
        },
        {
          "kind": "window",
          "id": "win_bed_2_F1",
          "edge": "N",
          "alongM": 3.8,
          "widthM": 2.4,
          "sillM": 0.9,
          "headM": 2.1
        },
        {
          "kind": "window",
          "id": "win_balcony_F1",
          "edge": "N",
          "alongM": 11.05,
          "widthM": 1.4,
          "sillM": 0.9,
          "headM": 2.1
        },
        {
          "kind": "window",
          "id": "win_ensuite_bath_F1",
          "edge": "S",
          "alongM": 11.93,
          "widthM": 1,
          "sillM": 1.2,
          "headM": 2.4
        }
      ]
    }
  ],
  "stairHead": {
    "id": "core_staircase_primary",
    "type": "staircase_dogleg",
    "x": 3.29,
    "y": 4.89,
    "widthM": 2.15,
    "depthM": 3.34
  },
  "stacks": [
    {
      "id": "duct_mep_primary",
      "x": 15.69,
      "y": 9.49,
      "widthM": 0.6,
      "depthM": 0.8
    },
    {
      "id": "duct_mep_secondary",
      "x": 5.34,
      "y": 8.33,
      "widthM": 0.5,
      "depthM": 0.6
    }
  ],
  "outdoor": [
    {
      "id": "OUT-01",
      "ring": [
        [
          2.09,
          10.24
        ],
        [
          7.85,
          15.21
        ],
        [
          17.46,
          13.91
        ],
        [
          19.38,
          7.08
        ],
        [
          17.07,
          2.09
        ],
        [
          2.09,
          2.09
        ]
      ]
    }
  ],
  "figures": {
    "plotCoveragePct": 38.2
  },
  "certificate": {
    "isValid": false,
    "pass": 8,
    "warn": 5,
    "na": 1,
    "total": 14
  },
  "provenance": {
    "capture": "backend/data/landing-captures/generated-plan-irregular.full.json",
    "bytes": 773407,
    "sha256": "28327478241fc2c3a1075f0803fbe4fff1c6350b5ea8bcdbc4489a6a62c25313"
  }
} as HeroMassing;
