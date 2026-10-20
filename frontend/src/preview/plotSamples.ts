/**
 * plotSamples.ts — the REAL engine geometry the landing preview draws from.
 *
 * GENERATED FILE. Do not edit by hand: run
 *   cd frontend && node scripts/extract_plot_samples.cjs
 * which reads the raw captures produced by the committed engine capture script
 * (../backend/scripts/capture_landing_generation.py) and rewrites this module.
 *
 * Every field below is copied out of a real `POST /api/generate-floorplan`
 * response. Coordinates are in the engine's local tangent plane, in metres
 * (E/N), which is the same space the app's capture tool draws the plot ring in —
 * so the preview can hand them straight to the SHIPPED client geometry
 * (`services/siteBoundary`) with no conversion and no re-implementation.
 *
 * These are CANDIDATE generations, not marketing figures: each carries the
 * certificate verdict the engine actually returned, WARN layers included. If a
 * number appears on screen it is one of these, or it was computed by the same
 * module the app computes it with.
 */
export interface PlotEdge {
  index: number;
  from: string;
  to: string;
  lengthM: number;
  bearingDeg: number;
  bearingDms: string;
}

export interface PlotLayerStatus {
  id: string;
  title: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'N/A';
  summary: string;
}

export interface PlotSample {
  id: string;
  generationId: string;
  seed: string;
  typology: string;
  storeys: number;
  solverStatus: string;
  ring: ReadonlyArray<readonly [number, number]>;
  shapeType: string;
  isRegularRectangle: boolean;
  plotAreaSqm: number;
  plotPerimeterM: number;
  vertexTable: ReadonlyArray<{ id: string; x: number; y: number }>;
  edges: ReadonlyArray<PlotEdge>;
  setbacks: { frontM: number; rearM: number; leftM: number; rightM: number; nominalM: number; reduced: boolean };
  buildable: { ring: ReadonlyArray<readonly [number, number]>; areaSqm: number; setbackBandAreaSqm: number };
  footprint: { x: number; y: number; widthM: number; depthM: number; areaSqm: number; rotationDeg: number; topology: string };
  floors: ReadonlyArray<{
    index: number;
    name: string;
    envelope: { x: number; y: number; widthM: number; depthM: number };
    builtUpSqm: number;
    vastuPct: number;
    rooms: number;
    circulation: string;
  }>;
  floorHeightM: number;
  cores: ReadonlyArray<{ id: string; type: string; x: number; y: number; widthM: number; depthM: number }>;
  ducts: ReadonlyArray<{ id: string; wet: boolean; x: number; y: number; widthM: number; depthM: number }>;
  wedges: ReadonlyArray<{ id: string; classification: string; name: string; areaSqm: number; ring: ReadonlyArray<readonly [number, number]> }>;
  outdoor: ReadonlyArray<{ id: string; name: string; areaSqm: number; ring: ReadonlyArray<readonly [number, number]> }>;
  bays: ReadonlyArray<{ id: string; x: number; y: number; widthM: number; lengthM: number }>;
  derivation: ReadonlyArray<string>;
  certificate: { isValid: boolean; layerStatuses: ReadonlyArray<PlotLayerStatus>; counts: { pass: number; warn: number; fail: number; na: number; total: number } };
  metrics: {
    vastuPct: number;
    plumbingAdjacency: number;
    spaceUtilizationPct: number;
    plotCoveragePct: number;
    totalBuiltUpSqm: number;
    circulation: string;
  };
  provenance: { capture: string; bytes: number; sha256: string };
}

/**
 * The samples, in the order the preview offers them: the rectangle first —
 * it is the shape a reader recognises as "my plot" — then the six-vertex
 * irregular ring, which is what most cadastral plots actually are and which the
 * engine handles without a special case.
 */
export const PLOT_SAMPLES: ReadonlyArray<PlotSample> = [
  {
    "id": "residential-rect",
    "generationId": "GEN-T1-2F-20261016",
    "seed": "20261016",
    "typology": "residential_single",
    "storeys": 2,
    "solverStatus": "optimal",
    "ring": [
      [
        0,
        0
      ],
      [
        15,
        0
      ],
      [
        15,
        13
      ],
      [
        0,
        13
      ]
    ],
    "shapeType": "rectangle",
    "isRegularRectangle": true,
    "plotAreaSqm": 195,
    "plotPerimeterM": 56,
    "vertexTable": [
      {
        "id": "P1",
        "x": 0,
        "y": 0
      },
      {
        "id": "P2",
        "x": 15,
        "y": 0
      },
      {
        "id": "P3",
        "x": 15,
        "y": 13
      },
      {
        "id": "P4",
        "x": 0,
        "y": 13
      }
    ],
    "edges": [
      {
        "index": 1,
        "from": "P1",
        "to": "P2",
        "lengthM": 15,
        "bearingDeg": 90,
        "bearingDms": "N 90° 00' E"
      },
      {
        "index": 2,
        "from": "P2",
        "to": "P3",
        "lengthM": 13,
        "bearingDeg": 0,
        "bearingDms": "N 0° 00' E"
      },
      {
        "index": 3,
        "from": "P3",
        "to": "P4",
        "lengthM": 15,
        "bearingDeg": 270,
        "bearingDms": "S 90° 00' W"
      },
      {
        "index": 4,
        "from": "P4",
        "to": "P1",
        "lengthM": 13,
        "bearingDeg": 180,
        "bearingDms": "S 0° 00' E"
      }
    ],
    "setbacks": {
      "frontM": 1.95,
      "rearM": 1.3,
      "leftM": 1.5,
      "rightM": 1.5,
      "nominalM": 1.56,
      "reduced": false
    },
    "buildable": {
      "ring": [
        [
          1.5,
          1.95
        ],
        [
          13.5,
          1.95
        ],
        [
          13.5,
          11.7
        ],
        [
          1.5,
          11.7
        ]
      ],
      "areaSqm": 117,
      "setbackBandAreaSqm": 78
    },
    "footprint": {
      "x": 1.5,
      "y": 1.95,
      "widthM": 12,
      "depthM": 9.75,
      "areaSqm": 117,
      "rotationDeg": 0,
      "topology": "single_rectangle"
    },
    "floors": [
      {
        "index": 0,
        "name": "Ground Floor (G)",
        "envelope": {
          "x": 1.5,
          "y": 1.95,
          "widthM": 12,
          "depthM": 9.75
        },
        "builtUpSqm": 116.33,
        "vastuPct": 90,
        "rooms": 8,
        "circulation": "connected"
      },
      {
        "index": 1,
        "name": "First Floor (G+1)",
        "envelope": {
          "x": 1.5,
          "y": 1.95,
          "widthM": 12,
          "depthM": 9.75
        },
        "builtUpSqm": 116.34,
        "vastuPct": 90,
        "rooms": 7,
        "circulation": "connected"
      }
    ],
    "floorHeightM": 3,
    "cores": [
      {
        "id": "core_staircase_primary",
        "type": "staircase_dogleg",
        "x": 0.2,
        "y": 2.89,
        "widthM": 2.15,
        "depthM": 3.34
      }
    ],
    "ducts": [
      {
        "id": "duct_mep_primary",
        "wet": true,
        "x": 11.1,
        "y": 8.15,
        "widthM": 0.6,
        "depthM": 0.8
      },
      {
        "id": "duct_mep_secondary",
        "wet": true,
        "x": 2.25,
        "y": 6.33,
        "widthM": 0.5,
        "depthM": 0.6
      }
    ],
    "wedges": [],
    "outdoor": [],
    "bays": [
      {
        "id": "ECS-1",
        "x": 4.8,
        "y": 0.5,
        "widthM": 2.5,
        "lengthM": 5
      }
    ],
    "derivation": [
      "1. PLOT: 4 boundary vertices (195.0 m² area, 56.0m perimeter)",
      "2. SETBACKS: Front 1.95m, Rear 1.30m, Sides 1.50m (Inward Buffer)",
      "3. BUILDABLE POLYGON: 4 vertices (117.0 m² constructible area)",
      "4. PARKING ENVELOPE: 1 ECS bays (2.5m x 5.0m) + 3.5m drive aisle (Required: 1 ECS)",
      "5. BUILDING LINE: Inward setback perimeter enclosing constructible zone",
      "6. FOOTPRINT: 12.00m x 9.75m (117.0 m² enclosed)"
    ],
    "certificate": {
      "isValid": false,
      "layerStatuses": [
        {
          "id": "L1",
          "title": "Geometry & Statutory",
          "status": "WARN",
          "summary": "NBC minimum dimensions met under bounded degradation tolerance; 12 dimension chains verified within 1mm"
        },
        {
          "id": "L2",
          "title": "Door Swings",
          "status": "PASS",
          "summary": "Zero door-swing collisions after resolution"
        },
        {
          "id": "L3",
          "title": "Bathroom Fixtures",
          "status": "PASS",
          "summary": "All bathroom fixtures meet coded clearances"
        },
        {
          "id": "L4",
          "title": "Furniture Clearances",
          "status": "WARN",
          "summary": "Furniture clearance advisory"
        },
        {
          "id": "L5",
          "title": "Naming Honesty",
          "status": "PASS",
          "summary": "Room names match ontological thresholds (demote-only)"
        },
        {
          "id": "L6",
          "title": "Stair Compliance",
          "status": "PASS",
          "summary": "Stair verified as computed object (T/R/width/headroom)"
        },
        {
          "id": "L7",
          "title": "Vastu Advisory",
          "status": "PASS",
          "summary": "Vastu scoring recorded (advisory layer)"
        },
        {
          "id": "L8",
          "title": "Program Intent",
          "status": "PASS",
          "summary": "Program intent satisfied (bedrooms upstairs, zoning, terrace ratio)"
        },
        {
          "id": "L9",
          "title": "Ventilation",
          "status": "WARN",
          "summary": "1 external, 1 shaft, 1 mechanical-flagged"
        },
        {
          "id": "L10",
          "title": "Wet-Core & Plumbing",
          "status": "WARN",
          "summary": "3/3 wet rooms shaft-grouped, 2 dry-room crossings"
        },
        {
          "id": "L11",
          "title": "Terrace Drainage",
          "status": "N/A",
          "summary": "No terrace"
        },
        {
          "id": "L12",
          "title": "Structural",
          "status": "WARN",
          "summary": "35 columns (span <= 4.5m), load-path gaps flagged: 1 transfer beam(s) required"
        },
        {
          "id": "L13",
          "title": "Accessibility",
          "status": "PASS",
          "summary": "Applicability advisory: 0 corridors, 14 doors, 2 sanitary circles"
        },
        {
          "id": "L14",
          "title": "Fire & Egress",
          "status": "PASS",
          "summary": "Travel distances verified; 3 bedroom egress checks, 2 exit rows"
        },
        {
          "id": "L15",
          "title": "Programme Completeness",
          "status": "PASS",
          "summary": "All essential programme rooms present"
        }
      ],
      "counts": {
        "pass": 9,
        "warn": 5,
        "fail": 0,
        "na": 1,
        "total": 15
      }
    },
    "metrics": {
      "vastuPct": 90,
      "plumbingAdjacency": 100,
      "spaceUtilizationPct": 100,
      "plotCoveragePct": 60,
      "totalBuiltUpSqm": 116.33,
      "circulation": "connected"
    },
    "provenance": {
      "capture": "backend/data/landing-captures/generated-plan.full.json",
      "bytes": 748694,
      "sha256": "179fcd40392a7680fb0f1900641ed8d506f11114574c0ff883c0c0c5b0c200d7"
    }
  },
  {
    "id": "residential-irregular",
    "generationId": "GEN-T1-2F-20261016",
    "seed": "20261016",
    "typology": "residential_single",
    "storeys": 2,
    "solverStatus": "optimal",
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
    "shapeType": "irregular",
    "isRegularRectangle": false,
    "plotAreaSqm": 317.83,
    "plotPerimeterM": 67.96,
    "vertexTable": [
      {
        "id": "P1",
        "x": 0,
        "y": 0
      },
      {
        "id": "P2",
        "x": 18.4,
        "y": 0
      },
      {
        "id": "P3",
        "x": 21.6,
        "y": 6.9
      },
      {
        "id": "P4",
        "x": 19.1,
        "y": 15.8
      },
      {
        "id": "P5",
        "x": 7.2,
        "y": 17.4
      },
      {
        "id": "P6",
        "x": 0,
        "y": 11.2
      }
    ],
    "edges": [
      {
        "index": 1,
        "from": "P1",
        "to": "P2",
        "lengthM": 18.4,
        "bearingDeg": 90,
        "bearingDms": "N 90° 00' E"
      },
      {
        "index": 2,
        "from": "P2",
        "to": "P3",
        "lengthM": 7.61,
        "bearingDeg": 24.88,
        "bearingDms": "N 24° 53' E"
      },
      {
        "index": 3,
        "from": "P3",
        "to": "P4",
        "lengthM": 9.24,
        "bearingDeg": 344.31,
        "bearingDms": "N 15° 41' W"
      },
      {
        "index": 4,
        "from": "P4",
        "to": "P5",
        "lengthM": 12.01,
        "bearingDeg": 277.66,
        "bearingDms": "N 82° 21' W"
      },
      {
        "index": 5,
        "from": "P5",
        "to": "P6",
        "lengthM": 9.5,
        "bearingDeg": 229.27,
        "bearingDms": "S 49° 16' W"
      },
      {
        "index": 6,
        "from": "P6",
        "to": "P1",
        "lengthM": 11.2,
        "bearingDeg": 180,
        "bearingDms": "S 0° 00' E"
      }
    ],
    "setbacks": {
      "frontM": 2.51,
      "rearM": 2.09,
      "leftM": 2.09,
      "rightM": 2.09,
      "nominalM": 2.09,
      "reduced": false
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
        ],
        [
          2.09,
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
      "areaSqm": 121.5,
      "rotationDeg": 0,
      "topology": "single_rectangle"
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
        "builtUpSqm": 124.46,
        "vastuPct": 90,
        "rooms": 8,
        "circulation": "connected"
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
        "builtUpSqm": 120.83,
        "vastuPct": 90,
        "rooms": 7,
        "circulation": "connected"
      }
    ],
    "floorHeightM": 3,
    "cores": [
      {
        "id": "core_staircase_primary",
        "type": "staircase_dogleg",
        "x": 0.2,
        "y": 2.8,
        "widthM": 2.15,
        "depthM": 3.34
      }
    ],
    "ducts": [
      {
        "id": "duct_mep_primary",
        "wet": true,
        "x": 12.6,
        "y": 7.4,
        "widthM": 0.6,
        "depthM": 0.8
      },
      {
        "id": "duct_mep_secondary",
        "wet": true,
        "x": 2.25,
        "y": 6.24,
        "widthM": 0.5,
        "depthM": 0.6
      }
    ],
    "wedges": [
      {
        "id": "WDG-01",
        "classification": "stair_wedge",
        "name": "Stair & Egress Wedge",
        "areaSqm": 8.6,
        "ring": [
          [
            3.07,
            11.09
          ],
          [
            3.09,
            11.09
          ],
          [
            3.09,
            2.09
          ],
          [
            2.09,
            2.09
          ],
          [
            2.09,
            10.24
          ],
          [
            3.07,
            11.09
          ]
        ]
      },
      {
        "id": "WDG-02",
        "classification": "parking_apron",
        "name": "Parking Apron / Driveway Wedge",
        "areaSqm": 17.09,
        "ring": [
          [
            19.38,
            7.08
          ],
          [
            17.07,
            2.09
          ],
          [
            16.59,
            2.09
          ],
          [
            16.59,
            11.09
          ],
          [
            18.25,
            11.09
          ],
          [
            19.38,
            7.08
          ]
        ]
      },
      {
        "id": "WDG-03",
        "classification": "planter",
        "name": "Boundary Planter Wedge",
        "areaSqm": 40.67,
        "ring": [
          [
            7.85,
            15.21
          ],
          [
            16.59,
            14.03
          ],
          [
            16.59,
            11.09
          ],
          [
            3.09,
            11.09
          ],
          [
            3.09,
            11.11
          ],
          [
            7.85,
            15.21
          ]
        ]
      },
      {
        "id": "WDG-04",
        "classification": "storage_closet",
        "name": "Outdoor Storage Closet",
        "areaSqm": 3.63,
        "ring": [
          [
            17.46,
            13.91
          ],
          [
            18.25,
            11.09
          ],
          [
            16.59,
            11.09
          ],
          [
            16.59,
            14.03
          ],
          [
            17.46,
            13.91
          ]
        ]
      }
    ],
    "outdoor": [
      {
        "id": "OUT-01",
        "name": "North Yard 1",
        "areaSqm": 70.02,
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
          ],
          [
            2.09,
            10.24
          ]
        ]
      }
    ],
    "bays": [
      {
        "id": "ECS-1",
        "x": 4.8,
        "y": 0.5,
        "widthM": 2.5,
        "lengthM": 5
      },
      {
        "id": "ECS-2",
        "x": 7.6,
        "y": 0.5,
        "widthM": 2.5,
        "lengthM": 5
      }
    ],
    "derivation": [
      "1. PLOT: 6 boundary vertices (317.8 m² area, 68.0m perimeter)",
      "2. SETBACKS: Front 2.51m, Rear 2.09m, Sides 2.09m (Inward Buffer)",
      "3. BUILDABLE POLYGON: 7 vertices (191.5 m² constructible area)",
      "4. PARKING ENVELOPE: 2 ECS bays (2.5m x 5.0m) + 3.5m drive aisle (Required: 2 ECS)",
      "5. BUILDING LINE: Inward setback perimeter enclosing constructible zone",
      "6. FOOTPRINT: 13.50m x 9.00m (121.5 m² enclosed)"
    ],
    "certificate": {
      "isValid": false,
      "layerStatuses": [
        {
          "id": "L1",
          "title": "Geometry & Statutory",
          "status": "WARN",
          "summary": "NBC minimum dimensions met under bounded degradation tolerance; 12 dimension chains verified within 1mm"
        },
        {
          "id": "L2",
          "title": "Door Swings",
          "status": "PASS",
          "summary": "Zero door-swing collisions after resolution"
        },
        {
          "id": "L3",
          "title": "Bathroom Fixtures",
          "status": "PASS",
          "summary": "All bathroom fixtures meet coded clearances"
        },
        {
          "id": "L4",
          "title": "Furniture Clearances",
          "status": "WARN",
          "summary": "Furniture clearance advisory"
        },
        {
          "id": "L5",
          "title": "Naming Honesty",
          "status": "PASS",
          "summary": "Room names match ontological thresholds (demote-only)"
        },
        {
          "id": "L6",
          "title": "Stair Compliance",
          "status": "PASS",
          "summary": "Stair verified as computed object (T/R/width/headroom)"
        },
        {
          "id": "L7",
          "title": "Vastu Advisory",
          "status": "PASS",
          "summary": "Vastu scoring recorded (advisory layer)"
        },
        {
          "id": "L8",
          "title": "Program Intent",
          "status": "PASS",
          "summary": "Program intent satisfied (bedrooms upstairs, zoning, terrace ratio)"
        },
        {
          "id": "L9",
          "title": "Ventilation",
          "status": "WARN",
          "summary": "1 external, 1 shaft, 1 mechanical-flagged"
        },
        {
          "id": "L10",
          "title": "Wet-Core & Plumbing",
          "status": "WARN",
          "summary": "3/3 wet rooms shaft-grouped, 2 dry-room crossings"
        },
        {
          "id": "L11",
          "title": "Terrace Drainage",
          "status": "N/A",
          "summary": "No terrace"
        },
        {
          "id": "L12",
          "title": "Structural",
          "status": "WARN",
          "summary": "33 columns (span <= 4.5m), load-path gaps flagged: 1 transfer beam(s) required"
        },
        {
          "id": "L13",
          "title": "Accessibility",
          "status": "PASS",
          "summary": "Applicability advisory: 0 corridors, 14 doors, 2 sanitary circles"
        },
        {
          "id": "L14",
          "title": "Fire & Egress",
          "status": "PASS",
          "summary": "Travel distances verified; 3 bedroom egress checks, 2 exit rows"
        },
        {
          "id": "L15",
          "title": "Programme Completeness",
          "status": "PASS",
          "summary": "All essential programme rooms present"
        }
      ],
      "counts": {
        "pass": 9,
        "warn": 5,
        "fail": 0,
        "na": 1,
        "total": 15
      }
    },
    "metrics": {
      "vastuPct": 90,
      "plumbingAdjacency": 100,
      "spaceUtilizationPct": 100,
      "plotCoveragePct": 38.2,
      "totalBuiltUpSqm": 124.46,
      "circulation": "connected"
    },
    "provenance": {
      "capture": "backend/data/landing-captures/generated-plan-irregular.full.json",
      "bytes": 773407,
      "sha256": "28327478241fc2c3a1075f0803fbe4fff1c6350b5ea8bcdbc4489a6a62c25313"
    }
  }
] as unknown as ReadonlyArray<PlotSample>;
