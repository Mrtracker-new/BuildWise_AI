import type { FloorPlanParamsSnapshot } from './types';

export type CanonicalTypology =
  | 'T1_SINGLE_FAMILY'
  | 'T2_FAMILY_APARTMENT'
  | 'T3_LARGE_COMPLEX'
  | 'T4_WAREHOUSE';

export interface RoomOption {
  id: string;
  label: string;
  required: boolean;
  isCore?: boolean;
  minAreaSqm?: number;
  minDimensionM?: number;
  zone?: string;
}

export interface TypologyOption {
  id: string;
  label: string;
  canonical: CanonicalTypology;
}

export const TYPOLOGY_OPTIONS: TypologyOption[] = [
  { id: 'residential_single', label: 'Residential (Single-Family)', canonical: 'T1_SINGLE_FAMILY' },
  { id: 'residential_multi', label: 'Residential (Apartments/Multi-Family)', canonical: 'T2_FAMILY_APARTMENT' },
  { id: 'commercial', label: 'Commercial Office / Retail', canonical: 'T3_LARGE_COMPLEX' },
  { id: 'industrial', label: 'Light Industrial / Warehouse', canonical: 'T4_WAREHOUSE' },
];

export const TYPOLOGY_SHORT_CODES: Record<CanonicalTypology, string> = {
  T1_SINGLE_FAMILY: 'T1 - SINGLE FAMILY',
  T2_FAMILY_APARTMENT: 'T2 - MULTI FAMILY',
  T3_LARGE_COMPLEX: 'T3 - COMMERCIAL',
  T4_WAREHOUSE: 'T4 - WAREHOUSE',
};

export const TYPOLOGY_LABELS: Record<CanonicalTypology, string> = {
  T1_SINGLE_FAMILY: 'Single-Family Residence (T1)',
  T2_FAMILY_APARTMENT: 'Family Apartment (T2)',
  T3_LARGE_COMPLEX: 'Large Commercial Complex (T3)',
  T4_WAREHOUSE: 'Warehouse & Logistics (T4)',
};

/**
 * Canonical room catalogs. IDs MUST match the ontology space types used by the
 * solver (backend/app/services/floorplan/typologies).  The old display-only
 * ids (apt_a_living, loading_dock, fire_stair_1) are accepted as aliases by the
 * backend, but sending them from a new generation makes the programme audit
 * ambiguous, so the UI emits canonical ids only.
 */
export const TYPOLOGY_ROOM_CATALOGS: Record<CanonicalTypology, RoomOption[]> = {
  T1_SINGLE_FAMILY: [
    { id: 'master_bed', label: 'Master Bedroom', required: true, minAreaSqm: 14.0, minDimensionM: 3.4, zone: 'SW' },
    { id: 'kitchen', label: 'Kitchen', required: true, minAreaSqm: 7.5, minDimensionM: 2.1, zone: 'SE' },
    { id: 'living', label: 'Living Room', required: true, minAreaSqm: 16.0, minDimensionM: 3.6, zone: 'N' },
    { id: 'puja', label: 'Puja Room', required: false, minAreaSqm: 3.0, minDimensionM: 1.8, zone: 'NE' },
    { id: 'bath_1', label: 'Primary Bath', required: true, minAreaSqm: 3.5, minDimensionM: 1.5, zone: 'W' },
    { id: 'bath_2', label: 'Common Bath', required: false, minAreaSqm: 2.8, minDimensionM: 1.2, zone: 'NW' },
    { id: 'bed_2', label: 'Bedroom 2', required: false, minAreaSqm: 11.0, minDimensionM: 3.0, zone: 'NW' },
    { id: 'dining', label: 'Dining Area', required: false, minAreaSqm: 8.0, minDimensionM: 2.4, zone: 'W' },
    { id: 't1_stair', label: 'Private Staircase Core', required: false, isCore: true, minAreaSqm: 6.0, minDimensionM: 2.0, zone: 'W' },
    { id: 'foyer', label: 'Entry Foyer', required: false, minAreaSqm: 3.0, minDimensionM: 1.5, zone: 'N' },
    { id: 'balcony', label: 'Balcony', required: false, minAreaSqm: 3.5, minDimensionM: 1.2, zone: 'N' },
    { id: 'study', label: 'Study / Office', required: false, minAreaSqm: 7.5, minDimensionM: 2.4, zone: 'NE' },
    { id: 'utility', label: 'Utility / Store', required: false, minAreaSqm: 3.0, minDimensionM: 1.2, zone: 'SE' },
  ],
  T2_FAMILY_APARTMENT: [
    { id: 'shared_stair', label: 'Shared Staircase Core', required: true, isCore: true, minAreaSqm: 7.5, minDimensionM: 2.5, zone: 'W' },
    { id: 'lift_core', label: 'Passenger Lift Core', required: false, isCore: true, minAreaSqm: 3.24, minDimensionM: 1.8, zone: 'CENTER' },
    { id: 'floor_lobby', label: 'Floor Distribution Lobby', required: true, minAreaSqm: 6.0, minDimensionM: 1.5, zone: 'CENTER' },
    { id: 'unit_living', label: 'Unit Living / Dining', required: true, minAreaSqm: 16.0, minDimensionM: 3.4, zone: 'N' },
    { id: 'unit_kitchen', label: 'Unit Kitchen', required: true, minAreaSqm: 6.0, minDimensionM: 1.8, zone: 'SE' },
    { id: 'unit_bed', label: 'Unit Bedroom', required: true, minAreaSqm: 10.5, minDimensionM: 3.0, zone: 'SW' },
    { id: 'unit_bath', label: 'Unit Bathroom', required: true, minAreaSqm: 3.0, minDimensionM: 1.2, zone: 'W' },
    { id: 'unit_balcony', label: 'Unit Private Balcony', required: false, minAreaSqm: 3.0, minDimensionM: 1.2, zone: 'N' },
    { id: 'unit_utility', label: 'Unit Utility / Dry Balcony', required: false, minAreaSqm: 2.5, minDimensionM: 1.2, zone: 'SE' },
  ],
  T3_LARGE_COMPLEX: [
    { id: 'primary_stair', label: 'Fire Staircase 1', required: true, isCore: true, minAreaSqm: 9.0, minDimensionM: 2.5, zone: 'W' },
    { id: 'secondary_stair', label: 'Fire Exit Staircase 2', required: false, isCore: true, minAreaSqm: 9.0, minDimensionM: 2.5, zone: 'E' },
    { id: 'lift_lobby', label: 'Elevator Core & Lobby', required: true, isCore: true, minAreaSqm: 12.0, minDimensionM: 2.4, zone: 'CENTER' },
    { id: 'spine_corridor', label: '1.5m Spine Corridor', required: true, minAreaSqm: 15.0, minDimensionM: 1.5, zone: 'CENTER' },
    { id: 'commercial_suite', label: 'Commercial / Office Suite', required: true, minAreaSqm: 25.0, minDimensionM: 4.5, zone: 'N' },
    { id: 'sanitary_block', label: 'Public Restrooms (M/F/Accessible)', required: true, minAreaSqm: 6.0, minDimensionM: 2.0, zone: 'W' },
    { id: 'mep_room', label: 'MEP & Service Room', required: false, minAreaSqm: 6.0, minDimensionM: 2.0, zone: 'SE' },
  ],
  T4_WAREHOUSE: [
    { id: 'storage_bay', label: 'Clear-Span Storage Bay', required: true, minAreaSqm: 80.0, minDimensionM: 6.0, zone: 'CENTER' },
    { id: 'dock_bay', label: 'Loading Dock Shutter Bay', required: true, minAreaSqm: 25.0, minDimensionM: 3.6, zone: 'N' },
    { id: 'dispatch', label: 'Dispatch & Staging Buffer', required: true, minAreaSqm: 30.0, minDimensionM: 4.5, zone: 'N' },
    { id: 'worker_amenity', label: 'Staff Locker & Sanitary WC', required: false, minAreaSqm: 12.0, minDimensionM: 2.5, zone: 'SW' },
    { id: 'ind_stair', label: 'Industrial Fire Egress Stair', required: false, isCore: true, minAreaSqm: 7.5, minDimensionM: 1.5, zone: 'W' },
    { id: 'admin_office', label: 'Administrative Office Mezzanine', required: false, minAreaSqm: 35.0, minDimensionM: 4.5, zone: 'N' },
    { id: 'conf_room', label: 'Conference / Operations Room', required: false, minAreaSqm: 18.0, minDimensionM: 3.6, zone: 'NE' },
    { id: 'admin_catwalk', label: 'Mezzanine Access Catwalk', required: false, minAreaSqm: 15.0, minDimensionM: 1.5, zone: 'CENTER' },
  ],
};

/**
 * Normalizes any raw typology identifier (from sidebar or API) into one of the 4 canonical keys.
 * Perfectly mirrors backend app.services.floorplan.typologies.normalize_typology.
 */
export function normalizeTypology(raw?: string): CanonicalTypology {
  if (!raw) return 'T1_SINGLE_FAMILY';
  const t = raw.toLowerCase().trim();

  if (
    ['t2_family_apartment', 'residential_multi', 'apartment', 'duplex', 'builder_floor', 't2'].includes(t) ||
    t.includes('t2') ||
    t.includes('apartment') ||
    t.includes('multi_family') ||
    t.includes('multi-family') ||
    t.includes('multifamily') ||
    t.includes('duplex') ||
    t.includes('builder_floor')
  ) {
    return 'T2_FAMILY_APARTMENT';
  }

  if (
    ['t3_large_complex', 'commercial', 'complex', 'office', 'mixed_use', 't3'].includes(t) ||
    t.includes('t3') ||
    t.includes('complex') ||
    t.includes('commercial') ||
    t.includes('office') ||
    t.includes('mixed')
  ) {
    return 'T3_LARGE_COMPLEX';
  }

  if (
    ['t4_warehouse', 'industrial', 'warehouse', 'logistics', 'shed', 'factory', 't4'].includes(t) ||
    t.includes('t4') ||
    t.includes('warehouse') ||
    t.includes('industrial') ||
    t.includes('logistics') ||
    t.includes('shed') ||
    t.includes('factory')
  ) {
    return 'T4_WAREHOUSE';
  }

  return 'T1_SINGLE_FAMILY';
}

/**
 * Convenience accessor returning canonical key, short header code, display label, and room catalog.
 */
export function getTypologyConfig(raw?: string) {
  const canonical = normalizeTypology(raw);
  return {
    canonical,
    shortCode: TYPOLOGY_SHORT_CODES[canonical],
    label: TYPOLOGY_LABELS[canonical],
    rooms: TYPOLOGY_ROOM_CATALOGS[canonical] || TYPOLOGY_ROOM_CATALOGS.T1_SINGLE_FAMILY,
  };
}

export function getMaxStoreys(raw?: string): number {
  const canonical = normalizeTypology(raw);
  switch (canonical) {
    case 'T4_WAREHOUSE':
      return 2;
    case 'T1_SINGLE_FAMILY':
      return 3;
    case 'T2_FAMILY_APARTMENT':
    case 'T3_LARGE_COMPLEX':
    default:
      return 4;
  }
}


export function formatStoreysChip(floors: number): string {
  if (floors <= 1) return 'G (1 LEVEL)';
  return `G+${floors - 1} (${floors} LEVELS)`;
}

export function formatCoverageChip(coverage?: number): string {
  const pct = Math.round((coverage ?? 0.60) * 100);
  return `${pct}% COVERAGE`;
}

function normalizeTerraceBands(bands?: Record<number | string, any>): string {
  if (!bands) return '';
  const entries: string[] = [];
  Object.entries(bands).forEach(([lvl, b]) => {
    const l = parseInt(lvl, 10);
    if (l > 0 && b && b.edge && b.edge !== 'none') {
      entries.push(`${l}:${b.edge}:${Number(b.depth_m || 0).toFixed(1)}`);
    }
  });
  return entries.sort().join(';');
}

function normalizeFloorPlateMasks(masks?: Record<number | string, Record<string, string>>): string {
  if (!masks) return '';
  const entries: string[] = [];
  Object.entries(masks).forEach(([lvl, m]) => {
    Object.entries(m || {}).forEach(([wing, state]) => {
      if (state && state !== 'present') {
        entries.push(`${lvl}:${wing}:${state}`);
      }
    });
  });
  return entries.sort().join(';');
}

/**
 * Pure comparison function: evaluates whether active sidebar/card parameters differ
 * from the parameters snapshot captured at generation time.
 */
export function isFloorPlanStale(
  snapshot: FloorPlanParamsSnapshot | undefined | null,
  current: {
    building_typology?: string;
    floors?: number;
    ground_coverage_ratio?: number;
    plot_width_m?: number;
    plot_depth_m?: number;
    required_rooms?: string[];
    vastu_strictness?: string;
    built_up_area_sqft?: number;
    client_notes?: string;
    quality_grade?: string;
    ai_provider?: string;
    solar_axis_degrees?: number;
    prevailing_wind_direction_degrees?: number;
    shape_type?: string;
    plot_polygon?: any;
    terrace_bands?: Record<number | string, any>;
    floor_plate_masks?: Record<number | string, Record<string, any>>;
    design_intent?: 'maximize_enclosed' | 'passive_ventilation';
    include_service_layer?: boolean;
    include_structural_sheet?: boolean;
  }
): boolean {
  if (!snapshot) return false;

  // Typology comparison
  if (normalizeTypology(snapshot.building_typology) !== normalizeTypology(current.building_typology)) {
    return true;
  }

  // Floors / storeys comparison
  if ((snapshot.floors ?? 1) !== (current.floors ?? 1)) {
    return true;
  }

  // Ground coverage ratio comparison (0.01 tolerance for floating point)
  if (Math.abs((snapshot.ground_coverage_ratio ?? 0.60) - (current.ground_coverage_ratio ?? 0.60)) > 0.005) {
    return true;
  }

  // Plot dimensions comparison
  if (
    current.plot_width_m !== undefined &&
    Math.abs((snapshot.plot_width_m ?? 10.0) - current.plot_width_m) > 0.05
  ) {
    return true;
  }
  if (
    current.plot_depth_m !== undefined &&
    Math.abs((snapshot.plot_depth_m ?? 12.0) - current.plot_depth_m) > 0.05
  ) {
    return true;
  }

  // Vastu strictness comparison
  if (current.vastu_strictness && snapshot.vastu_strictness !== current.vastu_strictness) {
    return true;
  }

  // Required rooms selection comparison
  if (current.required_rooms && current.required_rooms.length > 0) {
    const snapRooms = [...(snapshot.required_rooms || [])].sort().join(',');
    const currRooms = [...current.required_rooms].sort().join(',');
    if (snapRooms !== currRooms) {
      return true;
    }
  }

  // Built-up plinth area comparison
  if (
    snapshot.built_up_area_sqft !== undefined &&
    current.built_up_area_sqft !== undefined &&
    Math.abs(snapshot.built_up_area_sqft - current.built_up_area_sqft) > 10
  ) {
    return true;
  }

  // Client notes comparison
  if (current.client_notes !== undefined) {
    const snapNotes = (snapshot.client_notes || '').trim();
    const currNotes = current.client_notes.trim();
    if (snapNotes !== currNotes) {
      return true;
    }
  }

  // Terrace bands comparison
  if (normalizeTerraceBands(snapshot.terrace_bands) !== normalizeTerraceBands(current.terrace_bands)) {
    return true;
  }

  // Floor plate masks comparison
  if (normalizeFloorPlateMasks(snapshot.floor_plate_masks) !== normalizeFloorPlateMasks(current.floor_plate_masks)) {
    return true;
  }

  // Design intent comparison
  if (current.design_intent && snapshot.design_intent && snapshot.design_intent !== current.design_intent) {
    return true;
  }

  // Engineering drawing toggles: change what is drawn, so flag stale to re-render sheets.
  if (
    (snapshot.include_service_layer !== undefined && current.include_service_layer !== undefined &&
      snapshot.include_service_layer !== current.include_service_layer) ||
    (snapshot.include_structural_sheet !== undefined && current.include_structural_sheet !== undefined &&
      snapshot.include_structural_sheet !== current.include_structural_sheet)
  ) {
    return true;
  }

  // Quality grade comparison
  if (current.quality_grade && snapshot.quality_grade && snapshot.quality_grade !== current.quality_grade) {
    return true;
  }

  // Narrative / programme provider comparison. The sidebar's Technical
  // Explanation Generator feeds the same provider that synthesizes the room
  // programme, so switching it after a generation must flag the plan stale
  // instead of silently showing a plan built by the previous engine.
  if (
    current.ai_provider !== undefined &&
    snapshot.ai_provider !== undefined &&
    snapshot.ai_provider !== current.ai_provider
  ) {
    return true;
  }

  // Orientation inputs (solar axis, prevailing wind) are solver policy inputs.
  if (
    current.solar_axis_degrees !== undefined &&
    snapshot.solar_axis_degrees !== undefined &&
    Math.abs(snapshot.solar_axis_degrees - current.solar_axis_degrees) > 0.5
  ) {
    return true;
  }
  if (
    current.prevailing_wind_direction_degrees !== undefined &&
    snapshot.prevailing_wind_direction_degrees !== undefined &&
    Math.abs(
      snapshot.prevailing_wind_direction_degrees - current.prevailing_wind_direction_degrees
    ) > 0.5
  ) {
    return true;
  }

  // Shape type comparison
  if (current.shape_type && snapshot.shape_type && snapshot.shape_type !== current.shape_type) {
    return true;
  }

  // Plot polygon vertex comparison (irregular plots): any vertex move or area
  // drift changes the site plan, footprint, and every downstream sheet.
  const snapPoly = snapshot.plot_polygon;
  const currPoly = current.plot_polygon;
  if (currPoly && snapPoly) {
    const sv: Array<[number, number]> = snapPoly.vertices || [];
    const cv: Array<[number, number]> = currPoly.vertices || [];
    if (sv.length !== cv.length) {
      return true;
    }
    for (let i = 0; i < cv.length; i++) {
      const s = sv[i];
      const c = cv[i];
      if (!s || Math.abs(s[0] - c[0]) > 0.05 || Math.abs(s[1] - c[1]) > 0.05) {
        return true;
      }
    }
    if (
      snapPoly.area_sqm !== undefined &&
      currPoly.area_sqm !== undefined &&
      Math.abs(snapPoly.area_sqm - currPoly.area_sqm) > 1.0
    ) {
      return true;
    }
  }

  return false;
}
