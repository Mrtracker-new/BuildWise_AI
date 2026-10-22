import React from 'react';
import type { SchemeAlternative } from '../services/types';
import { Icon } from './Icon';

/**
 * Scheme picker (audit F09).
 *
 * The three profiles are alternatives the solver already scored. Choosing one
 * re-solves the plate with that profile's weights - it does not merely relabel
 * the current drawing - so the badge states what the backend actually did:
 * applied, rejected as non-compliant, or recorded only because this plate shape
 * is not re-partitioned by the band solver.
 */

export type SchemeSelectionStatus =
  | 'applied'
  | 'rejected_non_compliant'
  | 'recorded_only'
  | 'unselected';

const fmt = (value: number | null | undefined, digits = 1) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';

const signed = (value: number | null | undefined, digits = 1) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
};

interface SchemePickerProps {
  alternatives?: SchemeAlternative[] | null;
  selectedSchemeId?: string | null;
  selectionStatus?: SchemeSelectionStatus;
  pendingProfile?: string | null;
  onSelect: (schemeId: string) => void;
  disabled?: boolean;
}

export const SchemePicker: React.FC<SchemePickerProps> = ({
  alternatives,
  selectedSchemeId,
  selectionStatus = 'unselected',
  pendingProfile = null,
  onSelect,
  disabled = false,
}) => {
  const list = Array.isArray(alternatives) ? alternatives : [];
  if (list.length === 0) return null;

  const selected = list.find((alt) => alt.scheme_id === selectedSchemeId) || null;

  const statusBadge = (() => {
    if (!selected) return null;
    if (pendingProfile) return { text: 'RE-SOLVING…', cls: 'bg-[var(--fill)] text-[var(--text-2)]' };
    switch (selectionStatus) {
      case 'applied':
        return { text: 'APPLIED TO THIS PLAN', cls: 'bg-[var(--semantic-green)]/15 text-[var(--semantic-green-ink)]' };
      case 'rejected_non_compliant':
        return { text: 'REFUSED · NON-COMPLIANT', cls: 'bg-[var(--semantic-red)]/15 text-[var(--semantic-red-ink)]' };
      case 'recorded_only':
        return { text: 'RECORDED ONLY', cls: 'bg-[var(--semantic-amber)]/15 text-[var(--semantic-amber-ink)]' };
      default:
        return { text: 'NOT APPLIED', cls: 'bg-[var(--fill)] text-[var(--text-2)]' };
    }
  })();

  const statusNote = (() => {
    if (!selected) return null;
    const alternativeScores = selected.delta_vs_best;
    if (selectionStatus === 'rejected_non_compliant') {
      return (
        'This profile could not produce a certifiable plan for this plate. The certified '
        + 'baseline geometry is kept and the refusal is stated here and in the report - it is never '
        + 'wrapped in a compliant badge.'
      );
    }
    if (selectionStatus === 'recorded_only') {
      return (
        'This plate shape (multi-wing, terrace band or floor mask) is not re-partitioned by the band '
        + 'solver, so the certified baseline geometry is kept. The selection is recorded in the report '
        + 'provenance.'
      );
    }
    if (selectionStatus === 'applied') {
      const delta = alternativeScores?.total_score;
      return (
        'The plate was re-solved with this profile and every downstream stage '
        + '(openings, walls, land economics, gate, certificate, sheets) ran on the new geometry.'
        + (typeof delta === 'number' ? ` Score vs best alternative: ${signed(delta)}.` : '')
      );
    }
    return 'Choose a profile to re-solve the plate with its weights.';
  })();

  return (
    <section
      data-testid="scheme-picker"
      aria-label="Scheme alternatives"
      className="rounded-[12px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-3 space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon name="layers" size={14} className="text-[var(--text-2)] shrink-0" />
          <h4 className="text-[13px] font-semibold text-[var(--text-1)] truncate">Scheme alternatives</h4>
        </div>
        {statusBadge && (
          <span
            data-testid="scheme-selection-status"
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusBadge.cls}`}
          >
            {statusBadge.text}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {list.map((alt) => {
          const isSelected = alt.scheme_id === selectedSchemeId;
          const isPending = pendingProfile === alt.scheme_id;
          return (
            <button
              key={alt.scheme_id}
              type="button"
              data-testid={`scheme-option-${alt.scheme_id}`}
              aria-pressed={isSelected}
              disabled={disabled || Boolean(pendingProfile)}
              onClick={() => onSelect(alt.scheme_id)}
              className={`text-left rounded-[10px] border p-2.5 space-y-1.5 transition-colors min-w-0 ${
                isSelected
                  ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                  : 'border-[var(--hairline)] bg-[var(--fill)] hover:border-[var(--accent)]/40'
              } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[12px] font-semibold text-[var(--text-1)] truncate">
                  {alt.label}
                </span>
                <span className="font-mono text-[10px] text-[var(--text-3)] shrink-0">
                  #{alt.rank}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1.5 text-[11px]">
                <span className="text-[var(--text-2)] tabular-nums">
                  Score {fmt(alt.score)}
                </span>
                <span
                  className={`font-mono text-[9px] px-1.5 py-0.5 rounded ${
                    alt.feasible
                      ? 'bg-[var(--semantic-green)]/15 text-[var(--semantic-green-ink)]'
                      : 'bg-[var(--semantic-red)]/15 text-[var(--semantic-red-ink)]'
                  }`}
                >
                  {alt.feasible ? 'FEASIBLE' : 'INFEASIBLE'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 text-[10px] text-[var(--text-3)] tabular-nums">
                <span>Land {fmt(alt.metrics?.land_use_efficiency_pct)}%</span>
                <span>Daylight {fmt(alt.metrics?.daylight_score)}</span>
                <span>Vastu {fmt(alt.metrics?.vastu_score)}</span>
                <span>Circ {fmt(alt.metrics?.circulation_ratio_pct)}%</span>
              </div>
              {(alt.metrics?.program_deficit_sqm ?? 0) > 0.05 && (
                <div className="text-[10px] text-[var(--semantic-amber-ink)]">
                  Deficit {fmt(alt.metrics.program_deficit_sqm)} m²
                </div>
              )}
              {alt.metrics?.dropped_rooms?.length ? (
                <div className="text-[10px] text-[var(--semantic-red-ink)] truncate">
                  Dropped: {alt.metrics.dropped_rooms.join(', ')}
                </div>
              ) : null}
              {isPending && (
                <div className="text-[10px] text-[var(--accent-ink)]">Re-solving…</div>
              )}
            </button>
          );
        })}
      </div>

      {statusNote && (
        <p className="text-[11px] leading-snug text-[var(--text-2)]" data-testid="scheme-selection-note">
          {statusNote}
        </p>
      )}

      {selected?.warnings?.length ? (
        <ul className="space-y-0.5" data-testid="scheme-warnings">
          {selected.warnings.slice(0, 3).map((warning) => (
            <li
              key={warning}
              className="text-[10px] leading-snug text-[var(--semantic-amber-ink)] flex items-start gap-1"
            >
              <Icon name="alert-triangle" size={10} className="shrink-0 mt-[1px]" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
