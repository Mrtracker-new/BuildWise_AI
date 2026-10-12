import React, { useState } from 'react';
import type { ExtractedClientConstraints } from '../services/types';
import { Icon } from './Icon';

interface ConstraintChipsProps {
  constraints: ExtractedClientConstraints | null;
  /** Omit for a read-only display (e.g. constraints inherited by the report). */
  onChange?: (updated: ExtractedClientConstraints) => void;
  isLoading?: boolean;
  /** Render as annotated, non-interactive chips (no steppers / remove buttons). */
  readOnly?: boolean;
}

const COMMON_SPACES: { id: string; label: string; icon: string }[] = [
  { id: 'home_office', label: 'Office', icon: 'briefcase' },
  { id: 'study', label: 'Study', icon: 'book' },
  { id: 'pooja_room', label: 'Pooja', icon: 'sun' },
  { id: 'powder_room', label: 'Powder Room', icon: 'droplet' },
  { id: 'utility_room', label: 'Utility', icon: 'layers' },
  { id: 'balcony', label: 'Balcony', icon: 'maximize' },
  { id: 'open_kitchen', label: 'Open Kitchen', icon: 'home' },
  { id: 'gym', label: 'Gym', icon: 'activity' },
];

export const ConstraintChips: React.FC<ConstraintChipsProps> = ({
  constraints,
  onChange,
  isLoading = false,
  readOnly = false,
}) => {
  const [isAddingSpace, setIsAddingSpace] = useState<boolean>(false);
  // Interactive only when a real handler is wired and the caller allows edits.
  const canEdit = !readOnly && Boolean(onChange);

  if (!constraints) return null;

  const emit = (updated: ExtractedClientConstraints) => onChange?.(updated);

  const handleUpdateBeds = (delta: number) => {
    const newCount = Math.max(1, Math.min(6, constraints.target_bedroom_count + delta));
    emit({ ...constraints, target_bedroom_count: newCount });
  };

  const handleUpdateBaths = (delta: number) => {
    const newCount = Math.max(1, Math.min(6, constraints.target_bathroom_count + delta));
    emit({ ...constraints, target_bathroom_count: newCount });
  };

  const handleRemoveSpace = (spaceId: string) => {
    const updated = constraints.specialized_spaces.filter((s) => s !== spaceId);
    emit({ ...constraints, specialized_spaces: updated });
  };

  const handleToggleSpace = (spaceId: string) => {
    const exists = constraints.specialized_spaces.includes(spaceId);
    const updated = exists
      ? constraints.specialized_spaces.filter((s) => s !== spaceId)
      : [...constraints.specialized_spaces, spaceId];
    emit({ ...constraints, specialized_spaces: updated });
  };

  const handleRemoveOrientation = (idx: number) => {
    const updated = constraints.orientation_preferences.filter((_, i) => i !== idx);
    emit({ ...constraints, orientation_preferences: updated });
  };

  const hasSpecialized = constraints.specialized_spaces.length > 0;
  const hasOrientations = constraints.orientation_preferences.length > 0;
  const hasContent = constraints.raw_notes && constraints.raw_notes.trim().length > 0;

  if (!hasContent && !hasSpecialized && !hasOrientations) {
    return null;
  }

  return (
    <div className="rounded-[10px] bg-[var(--fill)]/50 border border-[var(--separator)] p-2.5 space-y-2 text-[12px] transition-all">
      {/* Header with Source Badge */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Icon name="check" size={13} className="text-[var(--accent-ink)] shrink-0" />
          <span className="text-[11px] font-semibold text-[var(--text-1)] uppercase tracking-wider">
            Parsed Design Constraints
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isLoading && (
            <span className="text-[10px] text-[var(--text-3)] flex items-center gap-1 mr-1">
              <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-ping" />
              Parsing...
            </span>
          )}
          <span
            className={`px-1.5 py-0.5 rounded-[4px] text-[10px] font-semibold uppercase tracking-wider ${
              constraints.extraction_source === 'groq_llm'
                ? 'bg-[var(--accent-tint)] text-[var(--accent-ink)]'
                : 'bg-[var(--fill)] text-[var(--text-3)]'
            }`}
          >
            {constraints.extraction_source === 'groq_llm' ? 'AI Extracted' : 'Rule Parsed'}
          </span>
        </div>
      </div>

      {/* Main Interactive Chips Row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Bedroom Stepper Chip */}
        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-[6px] bg-[var(--card-bg)] border border-[var(--separator)] text-[12px] font-medium text-[var(--text-1)] shadow-2xs">
          <span className="text-[var(--text-3)] mr-0.5">Bedrooms:</span>
          <span className="font-semibold text-[var(--text-1)] tabular-nums">
            {constraints.target_bedroom_count}
          </span>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => handleUpdateBeds(-1)}
                disabled={constraints.target_bedroom_count <= 1}
                className="w-4 h-4 rounded-[4px] hover:bg-[var(--fill)] flex items-center justify-center text-[var(--text-2)] disabled:opacity-30 cursor-pointer ml-1"
                title="Decrease bedrooms"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => handleUpdateBeds(1)}
                disabled={constraints.target_bedroom_count >= 6}
                className="w-4 h-4 rounded-[4px] hover:bg-[var(--fill)] flex items-center justify-center text-[var(--text-2)] disabled:opacity-30 cursor-pointer"
                title="Increase bedrooms"
              >
                +
              </button>
            </>
          )}
        </div>

        {/* Bathroom Stepper Chip */}
        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-[6px] bg-[var(--card-bg)] border border-[var(--separator)] text-[12px] font-medium text-[var(--text-1)] shadow-2xs">
          <span className="text-[var(--text-3)] mr-0.5">Baths:</span>
          <span className="font-semibold text-[var(--text-1)] tabular-nums">
            {constraints.target_bathroom_count}
          </span>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => handleUpdateBaths(-1)}
                disabled={constraints.target_bathroom_count <= 1}
                className="w-4 h-4 rounded-[4px] hover:bg-[var(--fill)] flex items-center justify-center text-[var(--text-2)] disabled:opacity-30 cursor-pointer ml-1"
                title="Decrease bathrooms"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => handleUpdateBaths(1)}
                disabled={constraints.target_bathroom_count >= 6}
                className="w-4 h-4 rounded-[4px] hover:bg-[var(--fill)] flex items-center justify-center text-[var(--text-2)] disabled:opacity-30 cursor-pointer"
                title="Increase bathrooms"
              >
                +
              </button>
            </>
          )}
        </div>

        {/* Specialized Space Chips */}
        {constraints.specialized_spaces.map((space) => {
          const formatted = space.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          return (
            <div
              key={space}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[6px] bg-[var(--accent-tint)] text-[var(--accent-ink)] text-[12px] font-semibold border border-[var(--accent)]/30 animate-fade-in"
            >
              <span>{formatted}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleRemoveSpace(space)}
                  className="hover:opacity-70 cursor-pointer text-[10px] w-4 h-4 rounded-full flex items-center justify-center bw-touch-target"
                  title={`Remove ${formatted}`}
                  aria-label={`Remove ${formatted}`}
                >
                  <Icon name="x" size={9} />
                </button>
              )}
            </div>
          );
        })}

        {/* Orientation Preference Chips */}
        {constraints.orientation_preferences.map((ori, idx) => (
          <div
            key={idx}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-[6px] bg-[var(--card-bg)] border border-[var(--separator)] text-[11px] text-[var(--text-1)] font-medium"
          >
            <span className="text-[var(--accent-ink)] font-semibold">{ori.preferred_facing}</span>
            <span className="capitalize">{ori.space.replace('_', ' ')}</span>
            {canEdit && (
              <button
                type="button"
                onClick={() => handleRemoveOrientation(idx)}
                className="hover:opacity-70 cursor-pointer text-[10px] text-[var(--text-3)] ml-0.5 w-4 h-4 flex items-center justify-center rounded-full bw-touch-target"
                title="Remove orientation constraint"
                aria-label={`Remove ${ori.preferred_facing} orientation constraint`}
              >
                <Icon name="x" size={9} />
              </button>
            )}
          </div>
        ))}

        {/* Add Space Button Toggle (editable mode only) */}
        {canEdit && (
          <button
            type="button"
            onClick={() => setIsAddingSpace(!isAddingSpace)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-[6px] bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-2)] text-[11px] font-medium border border-dashed border-[var(--separator)] cursor-pointer transition-colors"
          >
            <span>{isAddingSpace ? 'Done' : '+ Add Feature'}</span>
          </button>
        )}
      </div>

      {/* Expanded Quick-Add Drawer (editable mode only) */}
      {canEdit && isAddingSpace && (
        <div className="pt-1 border-t border-[var(--separator)]/60 flex flex-wrap gap-1 items-center animate-fade-in">
          <span className="text-[10px] text-[var(--text-3)] uppercase tracking-wider mr-1">
            Quick Add:
          </span>
          {COMMON_SPACES.map((item) => {
            const isSelected = constraints.specialized_spaces.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleToggleSpace(item.id)}
                className={`px-2 py-0.5 rounded-[4px] text-[11px] font-medium transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--accent)] text-white shadow-2xs'
                    : 'bg-[var(--card-bg)] text-[var(--text-2)] hover:text-[var(--text-1)] border border-[var(--separator)]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
