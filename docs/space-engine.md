# Space Engine
> `Deterministic Solver` • `Ontology as Data` • `L1–L15 Gate` • `Invariant Sweep` • `Certificates`

How BuildWise turns a plot, a typology and a programme into a certified floor plan —
and how you can verify the claim yourself instead of trusting the sheet.

The engine contains no LLM. Every room rectangle, corridor, core and wet stack is
produced by deterministic geometry code from the request; language models are used
upstream (planning the brief, critiquing a drawing), never inside the solve.

On compact dual-unit plates the plan is a **pocket plan**, not a wider row: the
stair moves to the east flank, one unit's bedroom and the other unit's bathroom
occupy the freed pocket beside the stair band, and both living rooms keep the
frontage they need. Stacking the bath over the kitchen — the obvious way to free
frontage — is rejected by the ontology's own HYG-02 law and never emitted.

---

## Table of Contents
- [Pipeline](#pipeline)
- [Engine subsystems and contracts](#engine-subsystems-and-contracts)
- [Two independent judges: gate layers and sweep invariants](#two-independent-judges-gate-layers-and-sweep-invariants)
- [Verifying it yourself](#verifying-it-yourself)
- [Current status](#current-status)
- [Navigation](#navigation)

---

## Pipeline

One entry point, dispatched by typology, with single-sourced statics:

```text
FloorPlanRequest
  └─ generate_floor_plan()               floorplan/floorplan_service.py
      └─ SoleGeometryEngine(req)         floorplan/engine.py
          ├─ _compute_envelope()         NBC setbacks, coverage cap; irregular sites
          │                              via compute_canonical_site_plan() (site_geometry.py)
          ├─ _lock_vertical_anchors()    stair/duct cores, identical on every storey
          ├─ _resolve_floor_plate_masks() wing bands as present / terrace / void
          ├─ _partition_floor_plate()    per-typology partitioners (T1–T4)
          └─ evaluate_validation_gate() L1–L15 stack + certificate
              └─ drawing_ir.py           SVG / ReportLab PDF sheets from the same model
```

| Layer | Module | Responsibility |
|:--|:--|:--|
| Service | `floorplan/floorplan_service.py` | public entry point, cache bypass, response assembly |
| Engine | `floorplan/engine.py` | envelope, cores, bands, partitioners, warnings |
| Ontology | `floorplan/ontology.py` | 57 space types: zone, hygiene class, minima, relations, furniture sets |
| Solver | `floorplan/constrained_solver.py` | constrained rectangular-plate placement for the scheme portfolio |
| Schemes | `floorplan/scheme_solver.py` | ranked alternatives behind `include_scheme_alternatives` |
| Land economics | `floorplan/land_economics.py` | programme demand vs buildable, residual absorption |
| Identity | `floorplan/identity.py` | one resolved name per space, shared by model, schedule, SVG, PDF |
| Gate | `floorplan/validation_gate.py` | L1–L15 evaluation and the certificate |
| Drawing | `floorplan/drawing_ir.py` | vector sheets that read only the model |

## Engine subsystems and contracts

Each subsystem is verified by its own regression suite:

| Subsystem | What it makes true | Where |
|:--|:--|:--|
| Ontology as data | Every space carries a zone, hygiene class, furniture set, clear-area basis and orientation preferences; 57 catalogue entries; relations algebra for forbidden / facing / above pairs | `ontology.py`, `tests/test_coverage_truth.py`, `tests/test_ontology_contracts.py` |
| Constrained solver & schemes | Deterministic plate solver plus three ranked profiles (`max_area`, `max_light_vent`, `max_vastu`) that can actually be selected and re-solved | `constrained_solver.py`, `scheme_solver.py`, `tests/test_scheme_selection.py`, `tests/test_scheme_solver.py` |
| Land economics | Programme area demanded from the ontology, programme-aware footprint (opt-in), residual absorption, and a land report on every response | `land_economics.py`, `tests/test_land_economics.py` |
| Identity as naming source | Model label, wall-graph schedule, SVG text, PDF legend and service classification all read one `SpaceIdentity` | `identity.py`, `tests/test_scheme_picker_wiring.py`, `tests/test_space_identity.py` |
| Furniture & fresh air | The plate is divided against the real furniture catalogue, not audited afterwards; every wet room leaves the solver with a ventilation path, so L4 and L9 stop discovering failures the dimensions made inevitable | `furniture.py`, `tests/test_furniture_ventilation.py`, `tests/test_proportions_and_wet_stack.py` |
| Typology programme | The generation records the typology it actually built, emits that typology's programme (kitchen / utility / balcony included for T2) and names the same rooms on every surface | `typologies/`, `room_aliases.py`, `tests/test_room_program_v10.py` |
| Compact apartment unit plan | The canonical 12 × 15 T2 plate stops publishing 11.7 m² living rooms: the stair moves to the east flank and the freed pocket carries Unit A's bedroom plus Unit B's bathroom, so both units meet every catalogue gross minimum without stacking a bath against a kitchen (HYG-02) | `engine.py` (`_t2_pocket_plan`), `tests/test_compact_t2_unit_plan.py` |

## Two independent judges: gate layers and sweep invariants

**The gate (L1–L15)** runs inside generation and is what the certificate reports.
Overall status is the worst layer (FAIL > WARN > N/A > PASS). A layer that genuinely
does not apply is N/A with an explicit reason and never counts as a pass; a layer whose
evaluator did not run is a FAIL, because an absent evaluator is not evidence of compliance.

```text
L1  Geometry & statutory        L6  Stair as computed object   L11 Terrace drainage
L2  Door swings                 L7  Vastu (advisory)           L12 Structural
L3  Bathroom clearances         L8  Program intent             L13 Accessibility
L4  Furniture clearances        L9  Ventilation                L14 Fire & egress
L5  Naming honesty              L10 Wet-core & plumbing        L15 Programme completeness
```

**The sweep** (`backend/scripts/qa_invariant_sweep.py`) is deliberately independent of the
gate: it measures the returned payload from outside and shares no code with the layer
evaluators, so agreement between the two means something.

| Invariant | Judges |
|:--|:--|
| I1 relations | forbidden wall / door-facing / above pairs, straight from the ontology |
| I2 minima | room area and width against `SpaceTypeSpec`, gross and clear |
| I3 egress | BFS connectivity, travel distance, core continuity, T4 chain |
| I4 land | anonymous slivers, wedge labels, circulation band, coverage versus cap |
| I5 identity | label == schedule == SVG == model, naming honesty |
| I6 determinism | same seed and inputs → byte-identical payload |
| I7 schemes | three ranked alternatives, materially different, honest deltas |
| I8 layers | gate present, ventilation zero-miss, furniture, certificate |
| I9 typology | returned rooms carry the requested typology's programme |
| I10 refusal | a refused brief is refused honestly, with a FAIL gate and no invented rooms |

## Verifying it yourself

```bash
cd backend

# Land-use baseline across the golden matrix (read-only, no engine patching)
python scripts/space_engine_baseline.py

# Adversarial invariant sweep: 4 typologies x 7 plots x storeys x strictness
python scripts/qa_invariant_sweep.py --quick

# One case, with its full register
python scripts/qa_invariant_sweep.py --only T3-rect-20x20-F2

# The sweep is also a standing test: two pinned reproductions run in every pytest run
python -m pytest tests/test_invariant_sweep_standing.py -q
```

The sweep is occurrence-level on purpose: each violation is stamped with its case id,
seed and payload so it can be pinned as a regression test. Room minima dominate the
register, which is why they are counted individually rather than collapsed into one bug.

## Current status

Stated plainly, because a certificate nobody audits is decoration:

- The backend suite is green (**1,159 tests**), including the standing sweep tests.
- On the canonical 12 × 15 T2 plate the compact pocket plan now puts every unit room
  at or above its catalogue **gross** minimum (living 21.98 / 17.20 m², bedroom
  10.77 / 11.53 m², kitchen 8.08 / 8.04 m², bathroom 6.70 / 6.82 m²) and the
  mathematical certificate is valid. Previously those units published living
  rooms of 11.73 / 14.48 m² with `min_dimensions_satisfied = False`.
- The sweep still finds real shortfalls on constrained plates. On the same compact
  case the targeted register drops from 11 violations to 5: the two gross living
  failures are gone and three **clear-dimension** I2 entries remain, which a
  9.60 × 11.25 m plate cannot recover without pushing another room below its floor.
  These are disclosed as `ROOM-MIN` / `ROOM-MAX` warnings in the payload rather than
  hidden.
- The stricter grid catalogue (bath 8.0 m², kitchen 9.0 m², living 18.0 m² for two
  units on 108 m²) and the land programme deficit still keep the report status at
  `compromise` with an L1/L10 WARN; the certificate itself is valid.
- Aspect-ratio and minima overruns produced by a legal but tight plate remain a
  known open item, not a passing check.

## Navigation
- **Previous:** [← Blueprint Engine](blueprint-engine.md)
- **Next:** [Map & Data Providers →](map-and-data.md)
