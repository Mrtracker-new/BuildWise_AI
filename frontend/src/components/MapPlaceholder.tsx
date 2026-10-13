/**
 * MapPlaceholder.tsx — the map region before the engine is allowed to load.
 * ========================================================================
 * Shown while the map's lazy chunk is deferred (services/mapLoadIntent.ts).
 * It has three jobs, in this order:
 *
 *   1. RESERVE the map's box. The map section is `fixed inset-0`, so the
 *      reservation is the viewport itself; the placeholder carries a `min-height`
 *      captured from the boot viewport (so a document that is shorter than the
 *      map would still hold the space) and is an `absolute inset-0` child of the
 *      same section the engine mounts into. The engine's own container is that
 *      same box, so the swap moves nothing: clsTrusted is measured across
 *      exactly this mount (mobile runs report 0.000004, desktop 0.0006).
 *   2. Keep the first view a MAP. This is the surface the reader is about to work
 *      on, so it is drawn as one: a river and its pond, a park, streets with
 *      casing, city blocks with building footprints, cadastral parcel lines, and
 *      — the only accent mass on screen — the site itself, platted, fronting the
 *      cross street, with its pin.
 *   3. State the trade honestly and once: tiles, the pin and the tracing tools
 *      load on first touch.
 *
 * THREE REBUILDS, each for a measured reason.
 *
 * The first version laid the artwork out as a full-bleed SVG with
 * `preserveAspectRatio="xMidYMid slice"` and centred the copy ON TOP of it with
 * an `absolute inset-0` overlay. On a phone that failed twice over: a 400x260
 * viewBox cover-scaled into 412x823 is a 3.16x blow-up, so the plot's frontage
 * edge rendered as ~3px wavy bands across the screen, and the title "Site map"
 * landed straight on the pin glyph.
 *
 * The second was structurally correct (CSS texture, `meet`, copy below) but read
 * as "a square box on graph paper": an even graticule is a grid, not a map, and
 * one lone quadrilateral adrift in the middle of it is a shape, not a site.
 *
 * The third fixed the framing but not the subject: a boundary ring plus three
 * ghost slabs on a grid still read as wireframe, because nothing in it was a
 * thing a map draws. This version draws the place instead of the diagram — water,
 * greenery, streets that behave like streets (a cased band with a fill, a bridge
 * where the boulevard crosses the river, a hierarchy from lane to boulevard),
 * buildings inside the blocks those streets cut, and cadastral parcel lines over
 * the land. The site is a surveyed plot ON one of those blocks — its north edge
 * laid along the cross street it addresses, its frontage dashed the way the
 * product dashes it, its corners handled — and everything runs off all four
 * edges, so the artwork stops reading as a box with a frame and starts reading as
 * a view of somewhere.
 *
 * The artwork stays inline SVG (no request, no font, no layout work) drawn in
 * tokens, so it is correct in both themes and costs the critical path it exists to
 * protect nothing at all. Its copy is real first-view shell text — which is also
 * what the mobile LCP resolves to (a first-frame paint, not a late async strip).
 */
import React from 'react';

export interface MapPlaceholderProps {
  /** Extra class hooks for the section that hosts it (never geometry). */
  className?: string;
}

/**
 * Street plan for the tile, in the artwork's own 248-unit space. Held as data
 * rather than as inline markup so the composition can be read — and changed —
 * as a plan: `[x1, y1, x2, y2, width]`, widest last (a lane, two streets, a
 * boulevard). Every one of them runs past the viewBox edge, so the tile reads as
 * an excerpt of a larger map rather than a framed picture.
 */
const STREETS: Array<[number, number, number, number, number]> = [
  // Lane: the short service way in the north-east block.
  [92, 46, 248, 46, 4],
  // Lane: the back way through the south-east block.
  [92, 216, 248, 216, 4],
  // Cross street: the one the site addresses (its north edge is platted along it).
  [-8, 92, 256, 92, 6],
  // North-south street, full height.
  [92, -8, 92, 256, 6],
  // North-south street, from the cross street down.
  [176, 92, 176, 256, 6],
  // Boulevard: the wide one, and the reason the river carries a bridge.
  [-8, 176, 256, 176, 11],
];

/**
 * Building footprints `[x, y, w, h]`, block by block, at the contrast of a basemap
 * rather than of a diagram. Deterministic, so every render and every headless run
 * draws the identical scene.
 */
const BUILDINGS: Array<[number, number, number, number]> = [
  // North-east block: a terrace along the lane, then the block behind it.
  [100, 12, 26, 18], [130, 10, 16, 22], [150, 14, 24, 16], [180, 10, 20, 20],
  [206, 12, 24, 18],
  [104, 36, 14, 8], [124, 38, 22, 8], [152, 36, 18, 8], [176, 38, 24, 8],
  [206, 36, 24, 8],
  [104, 58, 20, 24], [130, 60, 24, 22], [160, 58, 14, 24], [180, 62, 18, 20],
  [204, 56, 24, 26],
  // North-west block, east of the river.
  [56, 16, 26, 20], [56, 44, 22, 24], [56, 74, 26, 12],
  // Riverfront block.
  [52, 102, 28, 22], [52, 132, 22, 32], [82, 104, 6, 26], [82, 138, 6, 26],
  [52, 170, 30, 6],
  // South-east block, below the boulevard.
  [100, 186, 24, 20], [130, 184, 20, 22], [158, 186, 26, 18], [190, 184, 22, 22],
  [218, 186, 22, 20], [100, 226, 28, 16], [134, 228, 22, 14], [162, 224, 20, 18],
  [188, 226, 30, 14],
  // South-west block, east of the river.
  [52, 186, 28, 22], [52, 216, 24, 26],
];

/** Tree canopies in the park: `[cx, cy, r]`. */
const TREES: Array<[number, number, number]> = [
  [196, 116, 5], [222, 108, 4], [216, 136, 5.5], [198, 154, 4.5], [234, 156, 4],
];

/** The site's surveyed corners, clockwise from the north-west one. */
const SITE: Array<[number, number]> = [
  [104, 104], [168, 104], [176, 118], [172, 154], [146, 170], [106, 162],
];

export const MapPlaceholder: React.FC<MapPlaceholderProps> = ({ className = '' }) => {
  // The reservation is taken ONCE, from the viewport this session started in —
  // the same "last known viewport" rule the rest of the shell uses. Re-reading it
  // on resize would rebuild the box under a reader who is dragging a window.
  const [reserved] = React.useState<{ width: number; height: number }>(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }));

  const sitePoints = SITE.map(([x, y]) => `${x},${y}`).join(' ');

  return (
    <div
      data-testid="map-placeholder"
      data-map-reserved={`${reserved.width}x${reserved.height}`}
      className={`absolute inset-0 w-full h-full overflow-hidden bg-[var(--bg-page)] ${className}`}
      style={{ minHeight: reserved.height || undefined }}
    >
      {/* The page the plate sits on: block rhythm at basemap weight, in CSS, so it
          is 1px at any viewport and costs the critical path nothing. The wash
          gathers the light on the plate. */}
      <div aria-hidden="true" className="absolute inset-0 bw-placeholder-sheet" />
      <div aria-hidden="true" className="absolute inset-0 bw-placeholder-vignette" />
      <div aria-hidden="true" className="absolute inset-0 bw-placeholder-wash" />

      {/* The site, and the copy UNDER it. The overlay that used to put the title
          on the pin is gone: this is a column, so nothing can overlap. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 pb-[6vh] sm:gap-6">
        {/* The plate: the app's own card grammar around a map, so what the reader
            sees is "the map this app will open", held to the same radius, hairline
            and shadow as every other surface. The scene inside is 1:1 in its own
            units — nothing is scaled up, so nothing blurs. */}
        <div
          data-part="map-tile"
          className="bw-placeholder-map relative shrink-0 w-[min(62vw,248px)] aspect-square rounded-[18px] overflow-hidden border border-[var(--hairline)] bg-[var(--map-land)] shadow-lg"
        >
          <svg
            viewBox="0 0 248 248"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            className="absolute inset-0 w-full h-full text-[var(--accent)]"
          >
          <defs>
            <radialGradient id="bw-placeholder-halo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
              <stop offset="70%" stopColor="currentColor" stopOpacity="0.04" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Park, under the streets, so the streets bound it, with the path
              through it that a park always has. */}
          <polygon
            points="182,100 244,94 246,142 236,172 186,168"
            fill="var(--map-green)"
            stroke="var(--map-green-line)"
            strokeWidth="1"
          />
          <path
            d="M184 152 C202 148 206 160 222 152 C234 146 240 132 242 118"
            fill="none"
            stroke="var(--map-road)"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Water: a pond in the north-west corner, leaving south as a river.
              Cased like the roads — a line of bank over a band of water — so it
              reads as a channel with edges rather than a blue squiggle. */}
          <g data-part="water">
            <path
              d="M62 -10 C50 28 33 46 29 78 C25 110 36 134 28 166 C22 192 11 222 6 258"
              fill="none"
              stroke="var(--map-water-line)"
              strokeWidth="23"
              strokeLinecap="butt"
            />
            <path
              d="M62 -10 C50 28 33 46 29 78 C25 110 36 134 28 166 C22 192 11 222 6 258"
              fill="none"
              stroke="var(--map-water)"
              strokeWidth="19"
              strokeLinecap="butt"
            />
          </g>

          {/* Cadastral parcel lines: dashed, under the buildings, over the land.
              The seam between holdings, which is what a site plan is read on. */}
          <g
            stroke="var(--map-parcel)"
            strokeWidth="1"
            strokeDasharray="3 4"
            fill="none"
          >
            <path d="M92 24 248 20" />
            <path d="M148 0 148 46" />
            <path d="M204 0 204 46" />
            <path d="M112 46 112 92" />
            <path d="M92 138 248 132" />
            <path d="M40 92 40 176" />
            <path d="M92 214 248 210" />
          </g>

          {/* Building footprints, in the blocks the streets cut. */}
          <g fill="var(--map-building)">
            {BUILDINGS.map(([x, y, w, h]) => (
              <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="1.5" />
            ))}
          </g>

          {/* Streets: casing first from one path list, then the fill, so every
              junction reads as a junction and the boulevard crosses the river on
              a bridge (roads paint over water, exactly as a map draws it). */}
          {(['casing', 'fill'] as const).map((layer) => (
            <g
              key={layer}
              fill="none"
              stroke={layer === 'casing' ? 'var(--map-road-casing)' : 'var(--map-road)'}
              strokeLinecap="butt"
            >
              {STREETS.map(([x1, y1, x2, y2, w]) => (
                <path
                  key={`${x1}-${y1}-${layer}`}
                  d={y1 === y2 ? `M${x1} ${y1} H${x2}` : `M${x1} ${y1} V${y2}`}
                  strokeWidth={layer === 'casing' ? w + 3 : w}
                />
              ))}
            </g>
          ))}

          {/* A roundabout where the street meets the boulevard: one junction a
              reader recognises instantly, and it anchors the plan. */}
          <circle cx="92" cy="176" r="11" fill="var(--map-road)" />
          <circle cx="92" cy="176" r="11" fill="none" stroke="var(--map-road-casing)" strokeWidth="1.5" />
          <circle cx="92" cy="176" r="5" fill="var(--map-green)" stroke="var(--map-green-line)" strokeWidth="1" />

          {/* Trees over the park (they are canopy, so they sit on top of it). */}
          <g fill="var(--map-green-line)">
            {TREES.map(([cx, cy, r]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
            ))}
          </g>

          {/* Focus: halo and one dashed ring — this is the site the screen is
              about, so the reader's eye lands here first. */}
          <circle cx="140" cy="134" r="112" fill="url(#bw-placeholder-halo)" />
          <circle
            cx="140"
            cy="134"
            r="98"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="3 7"
            opacity="0.18"
          />

          {/* The site: a surveyed plot on the riverfront side of the cross street,
              its own fill the only accent mass on the surface. */}
          <polygon
            points={sitePoints}
            fill="currentColor"
            fillOpacity="0.14"
            stroke="currentColor"
            strokeOpacity="0.8"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          {/* Frontage: the edge the plot addresses, dashed the way the product
              draws it. Here it is the north edge, laid along the cross street. */}
          <path
            d="M104 104 168 104"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray="9 6"
            strokeLinecap="round"
            opacity="0.9"
          />
          {/* Corner handles: the vertices the reader will be dragging once the
              tracing tools load. */}
          <g fill="var(--map-land)" stroke="currentColor" strokeWidth="2">
            {SITE.map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="3.2" />
            ))}
          </g>

          {/* The site pin, tip on the plot, with a soft ground shadow.
              `data-part` is the handle the mobile-shell test measures against. */}
          <g transform="translate(138 150)" data-part="pin">
            <ellipse cx="0" cy="5" rx="17" ry="4.5" fill="currentColor" opacity="0.12" />
            <path
              d="M0 4c-7.5 0-13-5.5-13-13 0-9.5 13-25 13-25s13 15.5 13 25c0 7.5-5.5 13-13 13z"
              transform="scale(1.15)"
              fill="currentColor"
            />
            <ellipse cx="0" cy="-15" rx="4.6" ry="4.9" fill="var(--map-land)" />
          </g>
          </svg>
        </div>

        {/* First-view copy. Small, static and in the first frame — the strip that
            used to be the mobile LCP (8.1 s, 7.7 s of it render delay) is no
            longer the largest thing painted on a phone. */}
        <div className="w-full max-w-[min(84vw,340px)] text-center space-y-2">
          <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-1)]">Site map</h2>
          <p className="text-[13px] leading-[1.55] text-[var(--text-2)]">
            Tap the map to load tiles, the site pin and the boundary tools. They load on your
            first touch, which keeps this screen fast on a phone.
          </p>
        </div>
      </div>
    </div>
  );
};
