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
    { id: 'master_bed', label: 'Master Bedroom (SW)', required: true },
    { id: 'kitchen', label: 'Kitchen (SE)', required: true },
    { id: 'living', label: 'Living Room (N/NE)', required: true },
    { id: 'puja', label: 'Puja Room (NE)', required: false },
    { id: 'bath_1', label: 'Primary Bath (W)', required: true },
    { id: 'bath_2', label: 'Common Bath (NW)', required: false },
    { id: 'bed_2', label: 'Bedroom 2 (NW)', required: false },
    { id: 'dining', label: 'Dining Area (W)', required: false },
    { id: 'stairs', label: 'Staircase Core (SW/W)', required: false, isCore: true },
    { id: 'balcony', label: 'Balcony (N/E)', required: false },
    { id: 'study', label: 'Study / Office (NE)', required: false },
    { id: 'utility', label: 'Utility / Store (SE)', required: false },
  ],
  T2_FAMILY_APARTMENT: [
    { id: 'staircase_core', label: 'Common Stair Core', required: true, isCore: true },
    { id: 'lift_core', label: 'Passenger Lift Core', required: false, isCore: true },
    { id: 'lobby', label: 'Central Floor Lobby', required: true },
    { id: 'apt_a_living', label: 'Unit A Living Room', required: true },
    { id: 'apt_a_kitchen', label: 'Unit A Kitchen (SE)', required: true },
    { id: 'apt_a_bed', label: 'Unit A Master Bed (SW)', required: true },
    { id: 'apt_a_bath', label: 'Unit A Bathroom (W)', required: true },
    { id: 'apt_b_living', label: 'Unit B Living Room', required: false },
    { id: 'apt_b_kitchen', label: 'Unit B Kitchen', required: false },
    { id: 'apt_b_bed', label: 'Unit B Bedroom', required: false },
    { id: 'apt_b_bath', label: 'Unit B Bathroom', required: false },
    { id: 'apt_balcony', label: 'Apartment Balcony', required: false },
  ],
  T3_LARGE_COMPLEX: [
    { id: 'fire_stair_1', label: 'Fire Stair Core 1', required: true, isCore: true },
    { id: 'fire_stair_2', label: 'Fire Exit Stair 2', required: false, isCore: true },
    { id: 'lift_bank', label: 'Dual Lift Bank & Lobby', required: true, isCore: true },
    { id: 'corridor', label: '1.5m Spine Corridor', required: true },
    { id: 'commercial_suite_a', label: 'Commercial Suite A', required: true },
    { id: 'commercial_suite_b', label: 'Commercial Suite B', required: false },
    { id: 'commercial_suite_c', label: 'Commercial Suite C', required: false },
    { id: 'restroom_block', label: 'Public Restrooms (M/F)', required: true },
    { id: 'mep_room', label: 'MEP & Service Room', required: false },
  ],
  T4_WAREHOUSE: [
    { id: 'storage_bay', label: 'Clear-Span Storage Bay', required: true },
    { id: 'loading_dock', label: 'Loading Dock Shutter', required: true },
    { id: 'dispatch_buffer', label: 'Dispatch Buffer Area', required: true },
    { id: 'staff_amenities', label: 'Staff Locker & WC', required: false },
    { id: 'steel_stair', label: 'Industrial Steel Stair', required: false, isCore: true },
    { id: 'mezzanine_office', label: 'Mezzanine Admin Office', required: false },
    { id: 'conference_room', label: 'Conference Room', required: false },
    { id: 'catwalk', label: 'Inspection Catwalk', required: false },
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

export function formatStoreysChip(floors: number): string {
  if (floors <= 1) return 'G (1 LEVEL)';
  return `G+${floors - 1} (${floors} LEVELS)`;
}

export function formatCoverageChip(coverage?: number): string {
  const pct = Math.round((coverage ?? 0.60) * 100);
  return `${pct}% COVERAGE`;
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

  return false;
}
