import React from 'react';
import { MethodologyPopover } from './MethodologyPopover';

/**
 * termDisclosures.tsx — the single source of truth for the technical-term
 * disclosures (the small "i" popovers next to FAR, bioclimatic axis, AMSL,
 * Z-factor, NDVI, CPWD rates and ECS).
 *
 * Every clause here is a fact about how this codebase computes the term:
 *   FAR         built-up ÷ plot area           (ReportHeroHeader tile derivation)
 *   axis        90° base + 4.5°·sin(2·θwind)   (orientation_service.py)
 *   AMSL        Open-Meteo elevation endpoint  (external_data_service.py)
 *   Z-factor    IS 1893:2016 zone factor       (hazard_service.match_seismic_zone)
 *   NDVI        (B08−B04)/(B08+B04), mask 0.40 (site vision index inference)
 *   CPWD        ₹1,500 / ₹2,200 / ₹3,500 psf   (cost_service BASE_RATES)
 *   ECS         NBC 2016 Part 3 Table 7        (site_geometry.compute_required_ecs)
 *
 * Keep the copy HERE: a term explained twice is a term that will drift.
 */

export const FAR_DISCLOSURE: React.JSX.Element = (
  <MethodologyPopover
    factorName="Implied FAR"
    title="What this number is"
    triggerLabel="How is implied FAR derived?"
    sections={[
      {
        label: 'Derivation',
        text: 'Total built-up area ÷ plot area. Built-up is recovered as base cost ÷ the CPWD rate per sq ft, so it is the plinth area the cost engine actually used. The plot-area tile names where its number came from: captured boundary, client-supplied area, or built-up ÷ coverage.',
      },
      {
        label: 'Not a bylaw ceiling',
        text: 'This is the FAR the current brief implies, not a statutory FAR lookup. The ground-coverage ratio caps the footprint; the storey count then sets the built-up total.',
      },
      {
        label: 'Terrace exemption',
        text: 'The compliance certificate applies the terrace FAR exemption (RULE-FP-06 / FAR-EXEMPT) when the generated plan passes it — see the Certificate section.',
      },
    ]}
  />
);

export const BIOCLIMATIC_AXIS_DISCLOSURE: React.JSX.Element = (
  <MethodologyPopover
    factorName="Bioclimatic axis"
    title="How the axis is chosen"
    triggerLabel="How is the bioclimatic axis chosen?"
    sections={[
      {
        label: 'Base axis',
        text: 'The solver starts from a true East–West long axis (90° from true North) for balanced solar gain.',
      },
      {
        label: 'Wind deflection',
        text: 'It then deflects toward the prevailing-wind normal by 4.5° × sin(2 × wind bearing), so the long facade faces the dominant wind without swinging to north–south.',
      },
      {
        label: 'What it drives',
        text: 'The generated plan lays the long axis on this bearing, labels the resultant axis, and rates cross-ventilation from the angle between the wind vector and the facade normal.',
      },
    ]}
  />
);

export const AMSL_DISCLOSURE: React.JSX.Element = (
  <MethodologyPopover
    factorName="Site elevation (AMSL)"
    title="Where AMSL comes from"
    triggerLabel="Where does the AMSL elevation come from?"
    sections={[
      {
        label: 'Source',
        text: 'Open-Meteo’s elevation endpoint sampled at the site’s WGS84 coordinate — the same provider named in this card’s source line.',
      },
      {
        label: 'Role in flood risk',
        text: 'When the GloFAS river-discharge call degrades, the flood band is inferred from this elevation together with the NDMA atlas; the card discloses that fallback when it applies.',
      },
      {
        label: 'Honest limit',
        text: 'It is a DEM sample at the pin, not a surveyed benchmark — a steep plot varies across its own boundary.',
      },
    ]}
  />
);

export const Z_FACTOR_DISCLOSURE: React.JSX.Element = (
  <MethodologyPopover
    factorName="Design zone factor"
    title="Where Z comes from"
    triggerLabel="Where does the zone factor come from?"
    sections={[
      {
        label: 'Code definition',
        text: 'Zone factor Z from IS 1893:2016 is the peak ground acceleration coefficient for the zone — Zone II 0.10, Zone III 0.16, Zone IV 0.24, Zone V 0.36.',
      },
      {
        label: 'How the zone is matched',
        text: 'The site district/state name is matched against a static BIS catalog; a handful of regional coordinate clusters fall back to a moderate-confidence match, and the card says so when that happens.',
      },
      {
        label: 'Outside the standard',
        text: 'Coordinates outside the IS 1893 mapping extent are assigned no zone at all — the chip renders NOT ASSESSED instead of a default zone.',
      },
    ]}
  />
);

export const NDVI_DISCLOSURE: React.JSX.Element = (
  <MethodologyPopover
    factorName="Canopy NDVI"
    title="How to read this NDVI"
    triggerLabel="How is canopy NDVI computed?"
    sections={[
      {
        label: 'Formula',
        text: 'NDVI = (B08 − B04) ÷ (B08 + B04) from the Sentinel-2 near-infrared and red bands over the canopy cluster.',
      },
      {
        label: 'Mask threshold',
        text: 'A cluster only enters the canopy mask above NDVI 0.40; the preservation hierarchy then ranks clusters ≥100 m² at NDVI ≥0.50 as PRESERVE and ≥50 m² overlapping the footprint as COMPENSATE.',
      },
      {
        label: 'Per-cluster mean',
        text: 'Each cluster number is a mean, so a mixed cluster reports its average greenness — read it together with the area shown beside it.',
      },
    ]}
  />
);

export const CPWD_DISCLOSURE: React.JSX.Element = (
  <MethodologyPopover
    factorName="CPWD plinth-area rates"
    title="How CPWD rates are applied"
    triggerLabel="How are the CPWD rates applied?"
    sections={[
      {
        label: 'Rate table',
        text: 'CPWD plinth-area rates: Basic ₹1,500, Standard ₹2,200, Premium ₹3,500 per sq ft.',
      },
      {
        label: 'How it scales',
        text: 'Rate × plinth area, then × a storey factor (4% per extra level) and × the topographic multiplier. The terrain surcharge is shown as its own tile.',
      },
      {
        label: 'What it excludes',
        text: 'Government schedule rates, not a market quotation — land value is derived separately from road access and facility proximity.',
      },
    ]}
  />
);

export const ECS_DISCLOSURE: React.JSX.Element = (
  <MethodologyPopover
    factorName="Equivalent Car Spaces (ECS)"
    title="How ECS is required and laid out"
    triggerLabel="How is the ECS requirement calculated?"
    sections={[
      {
        label: 'Requirement rule',
        text: 'NBC 2016 Part 3 Table 7 — T1 single family 1 ECS (2 above a 250 m² plot or 200 m² built-up); apartments 1 per unit; commercial 1.5 per 100 m²; warehouse 1 per 200 m².',
      },
      {
        label: 'Bay geometry',
        text: 'Every bay is 2.5 m × 5.0 m with a one-way drive aisle of at least 3.5 m, laid out inside the buildable envelope beside the proposed footprint.',
      },
      {
        label: 'If it does not fit',
        text: 'A shortfall is reported as a deficit with three options — reduce the footprint, use stacked parking, or accept the deficit with municipal approval.',
      },
    ]}
  />
);
