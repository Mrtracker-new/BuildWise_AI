import React from 'react';
import type { SeismicProfile } from '../../services/types';
import { TABULAR_NUMS_CLASS } from '../../design/tokens';

interface SeismicZoneChipProps {
  seismic: SeismicProfile;
}

/**
 * Seismic zone chip. A null zone (site outside the IS 1893 mapping extent)
 * renders the explicit neutral/warn NOT ASSESSED state — never a default zone
 * letter, never a low-risk green signal.
 */
export const SeismicZoneChip: React.FC<SeismicZoneChipProps> = ({ seismic }) => {
  const assessed = seismic.zone !== null && seismic.zone !== undefined && seismic.zone !== '';

  if (!assessed) {
    return (
      <span
        data-testid="seismic-zone-chip"
        data-zone-assessed="false"
        title="Site coordinates lie outside the IS 1893:2016 mapping extent — engage the governing national seismic code for this jurisdiction."
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-[var(--fill)] text-[var(--text-2)] border border-dashed border-[var(--hairline)] shrink-0"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--semantic-amber)]" aria-hidden="true" />
        <span>NOT ASSESSED</span>
      </span>
    );
  }

  const zone = seismic.zone as string;
  const isHigh = zone.includes('V') || zone.includes('IV');
  const isModerate = zone.includes('III');

  // Two roles, two tokens: the bright hue paints the dot, the -ink hue paints
  // the text (the bright green/amber/red measure 2.0-3.0:1 as 12px text on the
  // chip's own 12% tint).
  const color = isHigh ? 'var(--semantic-red)' : isModerate ? 'var(--semantic-amber)' : 'var(--semantic-green)';
  const ink = isHigh
    ? 'var(--semantic-red-ink)'
    : isModerate
    ? 'var(--semantic-amber-ink)'
    : 'var(--semantic-green-ink)';
  const bg = isHigh ? 'rgba(255,59,48,0.12)' : isModerate ? 'rgba(255,159,10,0.12)' : 'rgba(52,199,89,0.12)';

  return (
    <span
      data-testid="seismic-zone-chip"
      data-zone-assessed="true"
      data-zone-value={zone}
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-semibold shrink-0"
      style={{ backgroundColor: bg, color: ink }}
      title={`${zone} · Zone factor Z=${seismic.zone_factor?.toFixed(2) ?? '—'} per ${seismic.standard}`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      <span className={TABULAR_NUMS_CLASS}>{zone}</span>
      <span className={TABULAR_NUMS_CLASS}>Z={seismic.zone_factor?.toFixed(2) ?? '—'}</span>
    </span>
  );
};
