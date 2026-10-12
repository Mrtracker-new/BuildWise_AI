import React from 'react';

export interface ReportSectionLink {
  id: string;
  label: string;
}

interface SectionNavProps {
  sections: ReportSectionLink[];
  activeSection: string;
  onNavigate: (id: string) => void;
}

/**
 * In-tab section nav. It lives in the report's sub-header row, beside the
 * contextual read-out — it is chrome, not a sticky strip inside the pane.
 *
 * Why: as a sticky strip in the pane it had to be rendered on EVERY tab, or the
 * tab body moved by the strip's own height whenever the switch landed on a tab
 * with no anchors. That placeholder bought a stable offset and cost three real
 * defects: 39px of dead space at the top of the pane, a phantom scrollbar on a
 * tab that would otherwise fit (Hazards, scrollMax 43px), and — because the
 * strip carried a translucent `bg/95 + backdrop-blur` — a frosted band that
 * ghosted whatever scrolled under it.
 *
 * In the sub-header row the nav costs the pane nothing, never overlays content,
 * and the row keeps the same height on every tab, so a tab without anchors
 * renders the read-out alone (no empty tray, no placeholder pill). Hazards and
 * Ecology have no links: both are a couple of screens under their own headings.
 *
 * It renders the tray ONLY. The back-to-top control is a row-level sibling, so
 * the `<nav>` holds exactly the section links: its accessible name, its link
 * inventory and the harness snapshot of it all stay what they claim to be. It
 * is also left-anchored in the row on purpose — a content-sized, right-anchored
 * slot moved 66px sideways on a tab switch (a real, measured layout shift) as
 * the pill set changed width.
 *
 * Every pill carries `data-section-target`, the section id it scrolls to: the
 * harnesses assert each one resolves to a live `sec-<id>` anchor, so a pill can
 * never point at a section that is not on the tab.
 *
 * The sheet-header read-out pill is gone with it: it was fixed-width (`104px`)
 * for layout stability and had no label for `landvalue` / `certificate` /
 * `blueprint`, so on the Cost & Plan tab it rendered as an empty pill from the
 * cost breakdown down to the end of the report. The tray is the read-out now.
 */
export const SectionNav: React.FC<SectionNavProps> = ({ sections, activeSection, onNavigate }) => {
  if (sections.length === 0) return null;

  /* py-[3px]: the tray has to fit the sub-header row's own height (38px) so
     that row stays one height with a tray and without one. */
  const pillCls =
    'px-2.5 py-[3px] rounded-full text-[11.5px] font-medium whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40';

  return (
    <nav
      aria-label="Sections in this tab"
      data-testid="section-nav"
      className="print-hide flex items-center min-w-0 shrink"
    >
      {/* The app's tab-strip treatment: the tray scrolls horizontally on
          narrow panes instead of wrapping or squashing the pills. */}
      <div className="flex items-center gap-1 rounded-full bg-[var(--fill)] p-[3px] min-w-0 max-w-full overflow-x-auto bw-tab-strip">
        {sections.map((s) => {
          const active = s.id === activeSection;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onNavigate(s.id)}
              aria-current={active ? 'true' : undefined}
              title={`Go to ${s.label}`}
              data-section-target={s.id}
              className={`${pillCls} ${
                active
                  ? 'bg-[var(--segmented-active-bg)] text-[var(--segmented-active-label)] font-semibold bw-segmented-active-shadow'
                  : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--card-bg-subtle)]'
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
