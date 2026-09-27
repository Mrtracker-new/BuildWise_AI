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

export const TYPOLOGY_ROOM_CATALOGS: Record<CanonicalTypology, RoomOption[]> = {
  T1_SINGLE_FAMILY: [
    { id: 'master_bed', label: 'Master Bedroom', required: true, minAreaSqm: 9.5, minDimensionM: 2.8, zone: 'SW' },
    { id: 'kitchen', label: 'Kitchen', required: true, minAreaSqm: 5.0, minDimensionM: 1.8, zone: 'SE' },
    { id: 'living', label: 'Living Room', required: true, minAreaSqm: 11.0, minDimensionM: 3.0, zone: 'N' },
    { id: 'puja', label: 'Puja Room', required: false, minAreaSqm: 3.0, minDimensionM: 1.5, zone: 'NE' },
    { id: 'bath_1', label: 'Primary Bath', required: true, minAreaSqm: 3.0, minDimensionM: 1.5, zone: 'W' },
    { id: 'bath_2', label: 'Common Bath', required: false, minAreaSqm: 2.5, minDimensionM: 1.2, zone: 'NW' },
    { id: 'bed_2', label: 'Bedroom 2', required: false, minAreaSqm: 9.5, minDimensionM: 2.8, zone: 'NW' },
    { id: 'dining', label: 'Dining Area', required: false, minAreaSqm: 7.5, minDimensionM: 2.4, zone: 'W' },
    { id: 'stairs', label: 'Staircase Core', required: false, isCore: true, minAreaSqm: 6.0, minDimensionM: 2.0, zone: 'W' },
    { id: 'balcony', label: 'Balcony', required: false, minAreaSqm: 3.0, minDimensionM: 1.2, zone: 'N' },
    { id: 'study', label: 'Study / Office', required: false, minAreaSqm: 6.0, minDimensionM: 2.0, zone: 'NE' },
    { id: 'utility', label: 'Utility / Store', required: false, minAreaSqm: 3.0, minDimensionM: 1.5, zone: 'SE' },
  ],
  T2_FAMILY_APARTMENT: [
    { id: 'staircase_core', label: 'Common Stair Core', required: true, isCore: true, minAreaSqm: 7.2, minDimensionM: 2.15, zone: 'W' },
    { id: 'lift_core', label: 'Passenger Lift Core', required: false, isCore: true, minAreaSqm: 4.5, minDimensionM: 1.8, zone: 'CENTER' },
    { id: 'lobby', label: 'Central Floor Lobby', required: true, minAreaSqm: 8.0, minDimensionM: 1.5, zone: 'CENTER' },
    { id: 'apt_a_living', label: 'Unit A Living Room', required: true, minAreaSqm: 12.0, minDimensionM: 3.0, zone: 'N' },
    { id: 'apt_a_kitchen', label: 'Unit A Kitchen', required: true, minAreaSqm: 5.0, minDimensionM: 1.8, zone: 'SE' },
    { id: 'apt_a_bed', label: 'Unit A Master Bed', required: true, minAreaSqm: 9.5, minDimensionM: 2.8, zone: 'SW' },
    { id: 'apt_a_bath', label: 'Unit A Bathroom', required: true, minAreaSqm: 3.0, minDimensionM: 1.5, zone: 'W' },
    { id: 'apt_b_living', label: 'Unit B Living Room', required: false, minAreaSqm: 12.0, minDimensionM: 3.0, zone: 'N' },
    { id: 'apt_b_kitchen', label: 'Unit B Kitchen', required: false, minAreaSqm: 5.0, minDimensionM: 1.8, zone: 'SE' },
    { id: 'apt_b_bed', label: 'Unit B Bedroom', required: false, minAreaSqm: 9.5, minDimensionM: 2.8, zone: 'SW' },
    { id: 'apt_b_bath', label: 'Unit B Bathroom', required: false, minAreaSqm: 3.0, minDimensionM: 1.5, zone: 'W' },
    { id: 'apt_balcony', label: 'Apartment Balcony', required: false, minAreaSqm: 3.5, minDimensionM: 1.2, zone: 'N' },
  ],
  T3_LARGE_COMPLEX: [
    { id: 'fire_stair_1', label: 'Fire Stair Core 1', required: true, isCore: true, minAreaSqm: 9.0, minDimensionM: 2.5, zone: 'W' },
    { id: 'fire_stair_2', label: 'Fire Exit Stair 2', required: false, isCore: true, minAreaSqm: 9.0, minDimensionM: 2.5, zone: 'E' },
    { id: 'lift_bank', label: 'Dual Lift Bank & Lobby', required: true, isCore: true, minAreaSqm: 12.0, minDimensionM: 2.4, zone: 'CENTER' },
    { id: 'corridor', label: '1.5m Spine Corridor', required: true, minAreaSqm: 15.0, minDimensionM: 1.5, zone: 'CENTER' },
    { id: 'commercial_suite_a', label: 'Commercial Suite A', required: true, minAreaSqm: 25.0, minDimensionM: 4.5, zone: 'N' },
    { id: 'commercial_suite_b', label: 'Commercial Suite B', required: false, minAreaSqm: 25.0, minDimensionM: 4.5, zone: 'S' },
    { id: 'commercial_suite_c', label: 'Commercial Suite C', required: false, minAreaSqm: 20.0, minDimensionM: 4.0, zone: 'E' },
    { id: 'restroom_block', label: 'Public Restrooms (M/F)', required: true, minAreaSqm: 8.0, minDimensionM: 2.0, zone: 'W' },
    { id: 'mep_room', label: 'MEP & Service Room', required: false, minAreaSqm: 6.0, minDimensionM: 2.0, zone: 'SE' },
  ],
  T4_WAREHOUSE: [
    { id: 'storage_bay', label: 'Clear-Span Storage Bay', required: true, minAreaSqm: 120.0, minDimensionM: 9.0, zone: 'CENTER' },
    { id: 'loading_dock', label: 'Loading Dock Shutter', required: true, minAreaSqm: 30.0, minDimensionM: 4.0, zone: 'N' },
    { id: 'dispatch_buffer', label: 'Dispatch Buffer Area', required: true, minAreaSqm: 20.0, minDimensionM: 3.5, zone: 'N' },
    { id: 'staff_amenities', label: 'Staff Locker & WC', required: false, minAreaSqm: 10.0, minDimensionM: 2.5, zone: 'SW' },
    { id: 'steel_stair', label: 'Industrial Steel Stair', required: false, isCore: true, minAreaSqm: 6.0, minDimensionM: 2.0, zone: 'W' },
    { id: 'mezzanine_office', label: 'Mezzanine Admin Office', required: false, minAreaSqm: 25.0, minDimensionM: 4.0, zone: 'N' },
    { id: 'conference_room', label: 'Conference Room', required: false, minAreaSqm: 18.0, minDimensionM: 3.5, zone: 'NE' },
    { id: 'catwalk', label: 'Inspection Catwalk', required: false, minAreaSqm: 12.0, minDimensionM: 1.2, zone: 'CENTER' },
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
    t in ['t2_family_apartment', 'residential_multi', 'apartment', 'duplex', 'builder_floor', 't2'] ||
    t.includes('t2') ||
    t.includes('apartment') ||
    t.includes('multi') ||
    t.includes('duplex') ||
    t.includes('builder_floor')
  ) {
    return 'T2_FAMILY_APARTMENT';
  }

  if (
    t in ['t3_large_complex', 'commercial', 'complex', 'office', 'mixed_use', 't3'] ||
    t.includes('t3') ||
    t.includes('complex') ||
    t.includes('commercial') ||
    t.includes('office') ||
    t.includes('mixed')
  ) {
    return 'T3_LARGE_COMPLEX';
  }

  if (
    t in ['t4_warehouse', 'industrial', 'warehouse', 'logistics', 'shed', 'factory', 't4'] ||
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

export function getVerticalProgram(raw?: string, storeys: number = 1): Array<{ level: number; label: string; spaceIds: string[] }> {
  const canonical = normalizeTypology(raw);
  const maxS = getMaxStoreys(canonical);
  const N = Math.max(1, Math.min(maxS, storeys));
  const res = [];
  for (let l = 0; l < N; l++) {
    if (canonical === 'T1_SINGLE_FAMILY') {
      res.push({
        level: l,
        label: l === 0 ? 'Ground Floor (G)' : l === 1 ? 'First Floor (G+1)' : 'Second Floor (G+2)',
        spaceIds: l === 0 ? ['living', 'kitchen', 'puja', 'bath_1', 'dining', 'stairs'] : ['master_bed', 'bed_2', 'bath_2', 'balcony', 'study'],
      });
    } else if (canonical === 'T2_FAMILY_APARTMENT') {
      res.push({
        level: l,
        label: l === 0 ? 'Ground Floor (G) — Entry & Core' : `Typical Floor ${l} (G+${l})`,
        spaceIds: ['staircase_core', 'lift_core', 'lobby', 'apt_a_living', 'apt_a_kitchen', 'apt_a_bed', 'apt_a_bath', 'apt_b_living', 'apt_b_kitchen', 'apt_b_bed', 'apt_b_bath'],
      });
    } else if (canonical === 'T3_LARGE_COMPLEX') {
      res.push({
        level: l,
        label: l === 0 ? 'Ground Floor (G) — Reception' : `Office Plate ${l} (G+${l})`,
        spaceIds: l === 0 ? ['fire_stair_1', 'lift_bank', 'corridor', 'reception', 'conference_room', 'restroom_block'] : ['fire_stair_1', 'fire_stair_2', 'lift_bank', 'corridor', 'commercial_suite_a', 'commercial_suite_b', 'restroom_block', 'mep_room'],
      });
    } else {
      res.push({
        level: l,
        label: l === 0 ? 'Ground Floor (G) — Storage Bay' : 'Mezzanine Level (+3.60m)',
        spaceIds: l === 0 ? ['storage_bay', 'loading_dock', 'dispatch_buffer', 'staff_amenities', 'steel_stair'] : ['steel_stair', 'mezzanine_office', 'conference_room', 'catwalk'],
      });
    }
  }
  return res;
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
    shape_type?: string;
    plot_polygon?: any;
    terrace_bands?: Record<number | string, any>;
    floor_plate_masks?: Record<number | string, Record<string, any>>;
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

  // Quality grade comparison
  if (current.quality_grade && snapshot.quality_grade && snapshot.quality_grade !== current.quality_grade) {
    return true;
  }

  // Shape type comparison
  if (current.shape_type && snapshot.shape_type && snapshot.shape_type !== current.shape_type) {
    return true;
  }

  return false;
}
