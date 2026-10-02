/**
 * BoundaryChip.tsx — map toolbar chip showing the captured boundary.
 * Area (tabular), vertex count, source badge, and Edit deep-link.
 */
import React from 'react';
import { Icon } from '../Icon';
import { metricsFor, SOURCE_LABELS, type SharedBoundaryState } from '../../services/siteBoundary';

interface BoundaryChipProps {
  boundary: SharedBoundaryState | null;
  onEdit: () => void;
}

export const BoundaryChip: React.FC<BoundaryChipProps> = ({ boundary, onEdit }) => {
  if (!boundary || boundary.vertices.length < 3) return null;
  const m = metricsFor(boundary.vertices);
  const sourceLabel = SOURCE_LABELS[boundary.source] ?? 'Captured';
  return (
    <div
      data-testid="boundary-chip"
      className="vibrancy-pill rounded-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--text-1)] border border-[var(--panel-border-color)] shadow-md"
    >
      <Icon name="maximize" size={13} className="text-[var(--accent)] shrink-0" />
      <span className="ui-font-tabular font-medium">{m.areaSqm.toFixed(0)} m²</span>
      <span className="text-[var(--hairline)]">|</span>
      <span className="ui-font-tabular text-[var(--text-2)]">{m.vertexCount}V</span>
      <span className="text-[var(--hairline)]">|</span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-3)]" title={sourceLabel}>
        {boundary.source === 'trace' ? 'TRACE' : boundary.source === 'rectangle' ? 'RECT' : boundary.source === 'preset' ? 'PRESET' : boundary.source === 'import' ? 'IMPORT' : 'LEGACY'}
      </span>
      {!m.valid && (
        <span title={m.reason} className="flex shrink-0">
          <Icon name="alert-triangle" size={12} className="text-[var(--semantic-amber)]" />
        </span>
      )}
      <button
        type="button"
        onClick={onEdit}
        className="ml-0.5 text-[11px] font-semibold text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
        aria-label="Edit boundary on map"
      >
        Edit
      </button>
    </div>
  );
};
