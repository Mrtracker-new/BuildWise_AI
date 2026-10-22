import React from 'react';
import type { FloorPlanQA } from '../../services/types';
import { Icon } from '../Icon';
import { Tooltip } from '../../design/primitives';
import { groupGateLayers, qaRowText, type GateLayer } from '../../services/validationGateUI';

/**
 * SINGLE GATE RENDERER (audit F28).
 * ---------------------------------------------------------------------------
 * Every QA/gate surface — the report sheet and the generator card — renders
 * through this component. Content rules live in validationGateUI so the rows,
 * N/A reasons, warn chips and incomplete-gate flag cannot drift between
 * surfaces:
 *   - every layer renders a row; N/A rows carry their explicit reason,
 *   - WARN layers surface as chips (never a bare "Passed (0 violations)"),
 *   - a gate missing canonical layers is itself flagged,
 *   - no certificate value is printed without a derived source (F04): the
 *     relaxation claim only renders when the caller passes the real count.
 */
interface CertificatePanelProps {
  qa?: FloorPlanQA;
  /**
   * Presentation only - content is identical in both variants. `card` is the
   * generator/QA panel; `sheet` is the compact report-print treatment and
   * omits the per-row tooltips.
   */
  variant?: 'card' | 'sheet';
  /**
   * Real relaxation count derived from the plan (room-level `relaxations`).
   * Omitted => nothing is claimed. Never infer this from the gate status.
   */
  relaxationsCount?: number;
}

type GateStatus = 'PASS' | 'WARN' | 'FAIL' | 'N/A';

const CHIP_STYLES: Record<GateStatus, string> = {
  PASS: 'bg-[var(--semantic-green)]/10 text-[var(--semantic-green-ink)] border border-[var(--semantic-green)]/30',
  WARN: 'bg-[var(--semantic-amber)]/10 text-[var(--semantic-amber-ink)] border border-[var(--semantic-amber)]/30',
  FAIL: 'bg-[var(--semantic-red)]/10 text-[var(--semantic-red-ink)] border border-[var(--semantic-red)]/30',
  'N/A': 'bg-[var(--fill)] text-[var(--text-2)] border border-dashed border-[var(--hairline)]',
};

export const CertificatePanel: React.FC<CertificatePanelProps> = ({
  qa,
  variant = 'card',
  relaxationsCount,
}) => {
  const gate = qa?.validation_gate as
    | {
        layers?: GateLayer[];
        overall_status?: string;
        certificate_id?: string;
      }
    | undefined;
  if (!gate?.layers || gate.layers.length === 0) return null;

  const isSheet = variant === 'sheet';
  const { overall, warnChips, incompleteIds } = groupGateLayers(gate);
  const counts = gate.layers.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section
      data-testid="certificate-panel"
      aria-label="Universal validation gate certificate"
      className={
        isSheet
          ? 'w-full min-w-0 space-y-2'
          : 'bw-card rounded-[14px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-4 space-y-3 w-full min-w-0'
      }
    >
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="shield-check" size={isSheet ? 13 : 15} className="text-[var(--text-2)] shrink-0" />
          <h3
            className={
              isSheet
                ? 'text-xs font-semibold uppercase tracking-wider text-[var(--text-2)]'
                : 'text-[14px] font-semibold text-[var(--text-1)] tracking-tight'
            }
          >
            Validation Gate Certificate
          </h3>
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
            overall === 'PASS'
              ? 'bg-[var(--semantic-green)]/10 text-[var(--semantic-green-ink)]'
              : overall === 'WARN'
              ? 'bg-[var(--semantic-amber)]/10 text-[var(--semantic-amber-ink)]'
              : 'bg-[var(--semantic-red)]/10 text-[var(--semantic-red-ink)]'
          }`}
        >
          {overall}
        </span>
      </div>

      <div className="divide-y divide-[var(--hairline)]" data-testid="validation-gate-layer-table">
        {gate.layers.map((layer) => (
          <div key={layer.layer_id} className="py-2 flex items-start justify-between gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[11px] text-[var(--text-3)] shrink-0">{layer.layer_id}</span>
                <span className="text-[12px] font-semibold text-[var(--text-1)] truncate">{layer.title}</span>
              </div>
              <p className="text-[11px] text-[var(--text-3)] leading-snug mt-0.5 line-clamp-2 pl-[calc(3rem+0.5rem)]">
                {qaRowText(layer)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${CHIP_STYLES[layer.status]}`}>
                {layer.status}
              </span>
              {!isSheet && (
                <Tooltip label={`What does ${layer.layer_id} check? ${layer.summary || layer.reason || 'See citation.'}`}>
                  <button
                    type="button"
                    aria-label={`What does ${layer.layer_id} check?`}
                    className="w-5 h-5 rounded-full bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-3)] flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <Icon name="info" size={10} />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        ))}
      </div>

      {incompleteIds.length > 0 && (
        <div
          className="text-[10px] font-semibold text-rose-700 dark:text-rose-300"
          data-testid="validation-gate-incomplete"
        >
          Gate incomplete: missing {incompleteIds.join(', ')}
        </div>
      )}

      {warnChips.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1" data-testid="validation-gate-warn-chips">
          {warnChips.map((ld) => (
            <span
              key={ld.layer_id}
              className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200 text-[10px] font-semibold inline-flex items-center gap-1"
            >
              <Icon name="alert-triangle" size={10} className="shrink-0" />
              {ld.layer_id} {ld.title}
            </span>
          ))}
        </div>
      )}

      <div className="pt-1 border-t border-[var(--hairline)] text-[11px] text-[var(--text-3)] flex items-center justify-between gap-2 min-w-0">
        <span className="tabular-nums">
          {counts.PASS ?? 0} pass · {counts.WARN ?? 0} warn · {counts.FAIL ?? 0} fail · {counts['N/A'] ?? 0} n/a
        </span>
        {typeof relaxationsCount === 'number' && (
          <span
            title={
              relaxationsCount === 0
                ? 'No solver relaxation or dimensional exception was used anywhere in this layout'
                : 'Bounded rule relaxations the solver applied, each with a rationale tag'
            }
            className={`font-medium truncate ${
              relaxationsCount === 0
                ? 'text-[var(--semantic-green-ink)]'
                : 'text-[var(--semantic-amber-ink)]'
            }`}
          >
            {relaxationsCount === 0
              ? 'Zero relaxations applied'
              : `${relaxationsCount} relaxation${relaxationsCount === 1 ? '' : 's'} applied`}
          </span>
        )}
      </div>

      {gate.certificate_id && (
        <p className="text-[10px] font-mono text-[var(--text-3)] truncate" title={gate.certificate_id}>
          {gate.certificate_id}
        </p>
      )}
    </section>
  );
};
