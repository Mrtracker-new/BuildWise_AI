"""
test_ontology.py - Unit Tests for Universal Space Semantics Ontology & Algebra
==============================================================================
Validates:
1. Complete space catalog coverage across all 4 typologies (T1, T2, T3, T4).
2. Derived relational algebra golden matrix for representative pairs:
   - bath-pooja -> FORBIDDEN_WALL, FORBIDDEN_DOOR_FACING, FORBIDDEN_ABOVE
   - bath-kitchen -> FORBIDDEN_WALL, FORBIDDEN_DOOR_FACING
   - kitchen-dining -> MUST_ADJACENT
   - server-wet -> FORBIDDEN_ABOVE, FORBIDDEN_WALL
   - dock-dispatch -> MUST_ADJACENT
3. Override precedence tests:
   - puja-living -> PREFER_ADJACENT
   - master_bed-bath_1 -> MUST_ADJACENT
   - utility-kitchen -> MUST_ADJACENT
4. Vertical stacking rules:
   - wet over sacred/cooking/eating/sleep/technical -> FORBIDDEN_ABOVE
   - wet over wet -> permitted
   - heavy load -> ground only (prohibited above level 0)
   - core continuity -> core over non-core prohibited
5. Dynamic space type registration requiring ZERO solver code changes.
"""

import pytest
from app.services.floorplan.ontology import (
    ONTOLOGY,
    OntologyRegistry,
    SpaceTypeSpec,
    SpatialRule,
    FunctionType,
    HygieneType,
    RelationType,
    RationaleTag,
    PublicAccess,
    VisitorDepth,
    SecurityLevel,
    FireHazard,
    EgressRole,
    FloorLoad,
    ServiceSide,
    UNIVERSAL_SPACE_CATALOG,
    TYPOLOGY_PROFILES,
)


def test_catalog_coverage_and_completeness():
    """Verify that all spaces in the catalog have valid attributes and cover all 4 typologies."""
    spaces = ONTOLOGY.all_spaces
    assert len(spaces) >= 25, f"Expected comprehensive space catalog, found {len(spaces)}"

    typology_sets = {"T1_SINGLE_FAMILY": 0, "T2_FAMILY_APARTMENT": 0, "T3_LARGE_COMPLEX": 0, "T4_WAREHOUSE": 0}

    for sid, spec in spaces.items():
        assert spec.id == sid
        assert spec.name
        assert spec.min_area_sqm > 0.0
        assert spec.min_width_m > 0.0
        assert spec.max_aspect_ratio >= 1.0
        assert 0 <= spec.odor_emit <= 3
        assert 0 <= spec.moisture_emit <= 3
        assert 0 <= spec.grease_emit <= 3
        assert 0 <= spec.noise_emit <= 3
        assert 0 <= spec.noise_sensitive <= 3
        assert 0 <= spec.acoustic_privacy <= 3
        assert len(spec.permitted_levels) > 0

        for t in spec.typologies:
            if t in typology_sets:
                typology_sets[t] += 1

    # Verify every typology has a substantial program
    for t_key, count in typology_sets.items():
        assert count >= 6, f"Typology {t_key} has too few spaces ({count})"


def test_typology_profiles():
    """Verify all 4 typology profiles have statutory egress, sanitation, and parking data."""
    profiles = ONTOLOGY.all_typologies
    assert "T1_SINGLE_FAMILY" in profiles
    assert "T2_FAMILY_APARTMENT" in profiles
    assert "T3_LARGE_COMPLEX" in profiles
    assert "T4_WAREHOUSE" in profiles

    t1 = profiles["T1_SINGLE_FAMILY"]
    assert t1.vastu_weight_scale == 1.0
    assert "NBC 2016" in t1.egress_constants["citation"]
    assert t1.egress_constants["max_travel_distance_non_sprinklered_m"] == 30.0

    t3 = profiles["T3_LARGE_COMPLEX"]
    assert t3.vastu_weight_scale < t1.vastu_weight_scale
    assert t3.egress_constants["min_corridor_width_m"] == 1.50
    assert "dead_end_corridor_max_m" in t3.egress_constants

    t4 = profiles["T4_WAREHOUSE"]
    assert t4.vastu_weight_scale <= 0.1
    assert t4.floor_height_m >= 6.0


def test_derived_algebra_bath_pooja():
    """Golden test: bath vs pooja (foul vs sacred)."""
    rules = ONTOLOGY.get_relations("bath_1", "puja")
    rule_map = {r.relation: r for r in rules}

    assert RelationType.FORBIDDEN_WALL in rule_map
    assert RelationType.FORBIDDEN_DOOR_FACING in rule_map
    assert RelationType.FORBIDDEN_ABOVE in rule_map

    wall_rule = rule_map[RelationType.FORBIDDEN_WALL]
    assert wall_rule.rule_id == "HYG-01-FOUL-SACRED-WALL"
    assert wall_rule.rationale == RationaleTag.HYGIENE
    assert "NBC 2016" in wall_rule.citation

    # Helper queries
    assert ONTOLOGY.is_forbidden_wall("bath_1", "puja") is True
    assert ONTOLOGY.is_forbidden_door_facing("bath_1", "puja") is True
    assert ONTOLOGY.is_must_adjacent("bath_1", "puja") is False


def test_derived_algebra_bath_kitchen():
    """Golden test: bath vs kitchen (foul/odor vs cooking)."""
    rules = ONTOLOGY.get_relations("bath_1", "kitchen")
    rule_map = {r.relation: r for r in rules}

    assert RelationType.FORBIDDEN_WALL in rule_map
    assert RelationType.FORBIDDEN_DOOR_FACING in rule_map

    wall_rule = rule_map[RelationType.FORBIDDEN_WALL]
    assert wall_rule.rule_id == "HYG-02-FOUL-FOOD-WALL"
    assert wall_rule.rationale == RationaleTag.HYGIENE
    assert "NBC 2016" in wall_rule.citation

    assert ONTOLOGY.is_forbidden_wall("bath_1", "kitchen") is True
    assert ONTOLOGY.is_forbidden_door_facing("bath_1", "kitchen") is True


def test_derived_algebra_kitchen_dining():
    """Golden test: kitchen vs dining (cooking vs eating)."""
    rules = ONTOLOGY.get_relations("kitchen", "dining")
    rule_map = {r.relation: r for r in rules}

    assert RelationType.MUST_ADJACENT in rule_map
    adj_rule = rule_map[RelationType.MUST_ADJACENT]
    assert adj_rule.rule_id == "FUNC-01-COOK-EAT-ADJ"
    assert adj_rule.rationale == RationaleTag.FUNCTION

    assert ONTOLOGY.is_must_adjacent("kitchen", "dining") is True
    assert ONTOLOGY.is_forbidden_wall("kitchen", "dining") is False


def test_derived_algebra_server_wet():
    """Golden test: server_room vs bath (technical/secure vs wet/foul)."""
    rules = ONTOLOGY.get_relations("server_room", "bath_1")
    rule_map = {r.relation: r for r in rules}

    assert RelationType.FORBIDDEN_WALL in rule_map
    assert RelationType.FORBIDDEN_ABOVE in rule_map

    rule_above = rule_map[RelationType.FORBIDDEN_ABOVE]
    assert rule_above.rule_id == "SAF-01-WET-TECH-ABOVE"
    assert rule_above.rationale == RationaleTag.STRUCTURE
    assert "NBC 2016" in rule_above.citation

    assert ONTOLOGY.is_forbidden_wall("server_room", "bath_1") is True


def test_derived_algebra_dock_dispatch_storage():
    """Golden test: loading vs dispatch vs storage in T4 warehouse."""
    dock_disp_rules = ONTOLOGY.get_relations("dock_bay", "dispatch")
    assert any(r.relation == RelationType.MUST_ADJACENT for r in dock_disp_rules)
    assert ONTOLOGY.is_must_adjacent("dock_bay", "dispatch") is True

    disp_stor_rules = ONTOLOGY.get_relations("dispatch", "storage_bay")
    assert any(r.relation == RelationType.MUST_ADJACENT for r in disp_stor_rules)
    assert ONTOLOGY.is_must_adjacent("dispatch", "storage_bay") is True


def test_override_precedence():
    """Tests that explicit overrides supersede default derived algebra."""
    # 1. Puja vs Living: override specifies PREFER_ADJACENT
    puja_liv_rules = ONTOLOGY.get_relations("puja", "living")
    assert len(puja_liv_rules) == 1
    assert puja_liv_rules[0].is_override is True
    assert puja_liv_rules[0].rule_id == "OVR-01-PUJA-LIVING"
    assert puja_liv_rules[0].relation == RelationType.PREFER_ADJACENT

    # 2. Master Bed vs Bath 1: override specifies MUST_ADJACENT for ensuite
    mbed_bath_rules = ONTOLOGY.get_relations("master_bed", "bath_1")
    assert len(mbed_bath_rules) == 1
    assert mbed_bath_rules[0].is_override is True
    assert mbed_bath_rules[0].rule_id == "OVR-02-ENSUITE-MASTER"
    assert mbed_bath_rules[0].relation == RelationType.MUST_ADJACENT

    # 3. Kitchen vs Utility: override specifies MUST_ADJACENT
    kitch_util_rules = ONTOLOGY.get_relations("kitchen", "utility")
    assert len(kitch_util_rules) == 1
    assert kitch_util_rules[0].is_override is True
    assert kitch_util_rules[0].rule_id == "OVR-04-UTILITY-KITCHEN"
    assert kitch_util_rules[0].relation == RelationType.MUST_ADJACENT


def test_vertical_rules():
    """Tests vertical stacking invariants."""
    # 1. Wet above sacred -> forbidden
    v1 = ONTOLOGY.evaluate_vertical_stack(upper_space_id="bath_1", lower_space_id="puja", upper_level=1)
    v1_map = {r.rule_id: r for r in v1}
    assert "VERT-02-NO-WET-OVER-HABITABLE" in v1_map
    assert v1_map["VERT-02-NO-WET-OVER-HABITABLE"].relation == RelationType.FORBIDDEN_ABOVE

    # 2. Wet above master bedroom -> forbidden
    v2 = ONTOLOGY.evaluate_vertical_stack(upper_space_id="bath_1", lower_space_id="master_bed", upper_level=1)
    v2_map = {r.rule_id: r for r in v2}
    assert "VERT-02-NO-WET-OVER-HABITABLE" in v2_map
    assert v2_map["VERT-02-NO-WET-OVER-HABITABLE"].relation == RelationType.FORBIDDEN_ABOVE

    # 3. Wet above kitchen -> forbidden
    v3 = ONTOLOGY.evaluate_vertical_stack(upper_space_id="bath_1", lower_space_id="kitchen", upper_level=1)
    v3_map = {r.rule_id: r for r in v3}
    assert "VERT-02-NO-WET-OVER-HABITABLE" in v3_map

    # 4. Wet stacked directly over wet -> VERT-02 NOT violated
    v4 = ONTOLOGY.evaluate_vertical_stack(upper_space_id="bath_1", lower_space_id="bath_1", upper_level=1)
    assert not any(r.rule_id == "VERT-02-NO-WET-OVER-HABITABLE" for r in v4)
    assert not any(r.rule_id == "VERT-01-WET-STACK" for r in v4)

    # 5. Heavy load on upper level -> forbidden
    v5 = ONTOLOGY.evaluate_vertical_stack(upper_space_id="storage_bay", lower_space_id="storage_bay", upper_level=1)
    v5_map = {r.rule_id: r for r in v5}
    assert "VERT-04-HEAVY-LOAD-GROUND" in v5_map

    # 6. Core over non-core -> forbidden
    v6 = ONTOLOGY.evaluate_vertical_stack(upper_space_id="t1_stair", lower_space_id="living", upper_level=1)
    v6_map = {r.rule_id: r for r in v6}
    assert "VERT-03-CORE-CONTINUITY" in v6_map


def test_zero_solver_change_extensibility():
    """Verify that a brand new custom space type can be registered and queried dynamically."""
    custom_registry = OntologyRegistry()

    lab_spec = SpaceTypeSpec(
        id="biotech_lab",
        name="Bio-Tech Cleanroom Lab",
        typologies=["T3_LARGE_COMPLEX"],
        function=FunctionType.PRODUCTION,
        hygiene=HygieneType.SACRED,  # Requires ultra-clean sterile conditions
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=1,
        noise_sensitive=3, acoustic_privacy=3,
        public_access=PublicAccess.RESTRICTED,
        visitor_depth=VisitorDepth.DEEP,
        security=SecurityLevel.SECURE,
        service_side=ServiceSide.BACK_OF_HOUSE,
        fire_hazard=FireHazard.MEDIUM,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=False,
        ventilation_req="mechanical",
        min_area_sqm=50.0,
        min_width_m=6.00,
        max_aspect_ratio=1.50,
        permitted_levels=[1, 2],
    )

    custom_registry.register_space(lab_spec)

    # Cleanroom (sacred hygiene) vs Bathroom (foul hygiene) -> Algebra automatically triggers
    rules = custom_registry.get_relations("biotech_lab", "bath_1")
    assert any(r.rule_id == "HYG-01-FOUL-SACRED-WALL" for r in rules)
    assert custom_registry.is_forbidden_wall("biotech_lab", "bath_1") is True

    # Wet stack test: bath over cleanroom -> forbidden above
    v_rules = custom_registry.evaluate_vertical_stack(upper_space_id="bath_1", lower_space_id="biotech_lab", upper_level=2)
    assert any(r.rule_id == "VERT-02-NO-WET-OVER-HABITABLE" for r in v_rules)
