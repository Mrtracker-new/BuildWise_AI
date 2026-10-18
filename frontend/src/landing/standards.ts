/**
 * landing/standards.ts — the landing page's single source of truth for the
 * codes the engine implements and the data it consumes.
 *
 * WHY THIS FILE EXISTS. The same facts were written out three times, in three
 * vocabularies: the hero's spec bar, the mid-page sheet, and the footer's three
 * columns. The footer said "IS 1893 seismic zones" where the sheet said
 * "IS 1893 (Part 1): 2016"; the footer credited the imagery providers as three
 * separate names while the sheet merged them into one row ("Esri, Sentinel-2,
 * OpenTopoMap") — a row that cannot carry three licences, and did not. Each
 * divergence was small; together they were the one thing a page about
 * provenance cannot afford, because a reader who checks the footer against the
 * sheet and finds two different answers stops believing both.
 *
 * So the facts live here once and the three surfaces render at three densities:
 *
 *   Hero       oneLine(group)          — the two groups a hero has room for
 *   #standards name + role + credit    — the full row
 *   Footer     GROUP_LABELS + name     — the index, for the reader who scrolls
 *                                        straight down looking for the licence
 *
 * The hero's two lines and the footer's three columns are DERIVED, not typed:
 * they can no longer disagree with the sheet, or with each other.
 *
 * THE AUTHORITY IS docs/map-and-data.md ("Attribution Obligations & License
 * Matrix"). Names, licences and citation obligations here mirror that table; a
 * provider added or a licence changed means editing both.
 *
 * `credit` is the landing's CONDENSATION of that table's "mandatory citation"
 * column: the licence, plus the holder short enough to hold one line in a
 * 360px column. It is not a replacement for the citation — the obligation is
 * discharged in the product, by the map's own attribution bar and each
 * dossier's data sources panel, which carry the full strings. A marketing row
 * that wrapped to four lines to reproduce Esri's full notice would be read by
 * nobody, which is the one outcome worse than a short credit.
 *
 * TWO GROUPINGS THE SHEET USED TO GET WRONG, now fixed here:
 *
 *  1. "Open data" was the caption over a list containing Esri World Imagery,
 *     whose licence is the Esri Master License Agreement. A page that files a
 *     commercially licensed basemap under an open-data heading is wrong in the
 *     way that matters most on this particular page. `siteData` (open: ODbL,
 *     public domain, CC BY) and `imagery` (one commercial basemap, two open
 *     basemaps, and one open-access satellite archive) are separate groups
 *     because they have separate rights regimes — and the sheet's own closing
 *     sentence, "provider terms for the basemaps", already said so.
 *  2. The footer listed six data providers of the matrix's seven — OpenFreeMap,
 *     the app's default vector basemap, was on neither surface — and the sheet
 *     named Copernicus only as a bare "Sentinel-2" inside its merged row, with
 *     neither the provider nor the licence it obliges. Both are rows now.
 *
 * NOT INCLUDED, deliberately: CARTO, which the map does use for the dark raster
 * fallback (`© CARTO © OpenStreetMap` in MapCanvas.tsx) but which the docs
 * matrix does not list. Adding it here would make the landing more complete
 * than the document it mirrors; the matrix is the place for that fix.
 */
export type SourceGroup = 'standards' | 'siteData' | 'imagery';

export interface Source {
  readonly group: SourceGroup;
  /** The provider's own name for itself, as docs/map-and-data.md spells it. */
  readonly name: string;
  /** The one-line form, for the surfaces with room for a phrase, not a name. */
  readonly short: string;
  /** What the engine does with it — the sheet's middle line. */
  readonly role: string;
  /** Licence and the credit it obliges, on one line — the sheet's third line. */
  readonly credit: string;
}

/**
 * Groups in reading order. The order is the same in the sheet's columns and the
 * footer's columns, so the eye can carry a column from one to the other.
 */
export const GROUP_ORDER: ReadonlyArray<SourceGroup> = ['standards', 'siteData', 'imagery'];

/**
 * One caption, used by both the sheet and the footer. "Implements" rather than
 * "Standards" because the column lists what the engine answers to, not the
 * section's own name.
 */
export const GROUP_LABELS: Record<SourceGroup, string> = {
  standards: 'Implements',
  siteData: 'Site data',
  imagery: 'Imagery and basemaps',
};

export const SOURCES: ReadonlyArray<Source> = [
  /* ── Implements ─────────────────────────────────────────────────────────
     The rights line is a publisher, not a licence: these are copyrighted
     publications the engine cites, and naming the body that issues each one is
     the honest equivalent of a credit. */
  {
    group: 'standards',
    name: 'IS 1893 (Part 1): 2016',
    short: 'IS 1893',
    role: 'Seismic zone factor and design lateral load',
    credit: 'Bureau of Indian Standards',
  },
  {
    group: 'standards',
    name: 'NBC 2016',
    short: 'NBC 2016',
    role: 'Urban form, setbacks, and permitted building use',
    credit: 'Bureau of Indian Standards',
  },
  {
    group: 'standards',
    name: 'CPWD DSR',
    short: 'CPWD DSR',
    role: 'Elemental cost heads and benchmark rates',
    credit: 'Central Public Works Department',
  },

  /* ── Site data ──────────────────────────────────────────────────────────
     Everything the analysis measures the site with. All three are openly
     licensed, which is why they are not grouped with the basemaps. */
  {
    group: 'siteData',
    name: 'OpenStreetMap',
    short: 'OpenStreetMap',
    role: 'Site context, road network, land use',
    credit: 'ODbL · © OpenStreetMap contributors',
  },
  {
    group: 'siteData',
    name: 'USGS',
    short: 'USGS',
    role: 'Elevation and historical seismicity',
    credit: 'Public domain · data courtesy of U.S. Geological Survey',
  },
  {
    group: 'siteData',
    name: 'Open-Meteo',
    short: 'Open-Meteo',
    role: 'Climate normals and river discharge',
    credit: 'CC BY 4.0 · Open-Meteo (GloFAS, ERA5)',
  },

  /* ── Imagery and basemaps ───────────────────────────────────────────────
     What the map is drawn on, plus the satellite archive the vision analysis
     reads. One row per provider, because one row cannot hold four licences. */
  {
    group: 'imagery',
    name: 'OpenFreeMap',
    short: 'OpenFreeMap',
    role: 'Vector basemap and map tiles',
    credit: 'ODbL · tiles by OpenFreeMap',
  },
  {
    group: 'imagery',
    name: 'Esri / Maxar',
    short: 'Esri / Maxar',
    role: 'World Imagery satellite tiles',
    credit: 'Esri Master License · Esri, Maxar',
  },
  {
    group: 'imagery',
    name: 'OpenTopoMap',
    short: 'OpenTopoMap',
    role: 'Topographic contours and relief',
    credit: 'CC BY-SA 3.0 · © OpenTopoMap',
  },
  {
    group: 'imagery',
    name: 'Copernicus Sentinel-2',
    short: 'Sentinel-2',
    role: 'Multispectral canopy and water analysis',
    credit: 'Copernicus Open Access · processed by ESA',
  },
];

/** The sources of one group, in declaration order. */
export const sourcesIn = (group: SourceGroup): ReadonlyArray<Source> =>
  SOURCES.filter((source) => source.group === group);

/** A group's short names joined for one line — the hero's spec bar. */
export const oneLine = (group: SourceGroup): string =>
  sourcesIn(group)
    .map((source) => source.short)
    .join(' · ');
