import React from 'react';
import type { FloorPlanQA } from '../../services/types';
import { Icon } from '../Icon';
import { Tooltip } from '../../design/primitives';

interface CertificatePanelProps {
  qa?: FloorPlanQA;
}

type GateStatus = 'PASS' | 'WARN' | 'FAIL' | 'N/A';

const CHIP_STYLES: Record<GateStatus, string> = {
  PASS: 'bg-[var(--semantic-green)]/10 text-[var(--semantic-green-ink)] border border-[var(--semantic-green)]/30',
  WARN: 'bg-[var(--semantic-amber)]/10 text-[var(--semantic-amber-ink)] border border-[var(--semantic-amber)]/30',
  FAIL: 'bg-[var(--semantic-red)]/10 text-[var(--semantic-red-ink)] border border-[var(--semantic-red)]/30',
  'N/A': 'bg-[var(--fill)] text-[var(--text-2)] border border-dashed border-[var(--hairline)]',
};

export const CertificatePanel: React.FC<CertificatePanelProps> = ({ qa }) => {
  const gate = qa?.validation_gate as { layers?: { layer_id: string; title: string; status: GateStatus; summary?: string; reason?: string; citation?: string }[]; overall_status?: string; certificate_id?: string } | undefined;
  if (!gate?.layers || gate.layers.length === 0) return null;

  const overall = gate.overall_status ?? 'FAIL';
  const relaxZero = overall === 'PASS'; // all four gates passed: relaxations used none
  const counts = gate.layers.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section
      data-testid="certificate-panel"
      aria-label="Universal validation gate certificate"
      className="bw-card rounded-[14px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-4 space-y-3 w-full min-w-0"
    >
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="shield-check" size={15} className="text-[var(--text-2)] shrink-0" />
          <h3 className="text-[14px] font-semibold text-[var(--text-1)] tracking-tight">
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

      <div className="divide-y divide-[var(--hairline)]">
        {gate.layers.map((layer) => (
          <div key={layer.layer_id} className="py-2 flex items-start justify-between gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[11px] text-[var(--text-3)] shrink-0">{layer.layer_id}</span>
                <span className="text-[12px] font-semibold text-[var(--text-1)] truncate">{layer.title}</span>
              </div>
              <p className="text-[11px] text-[var(--text-3)] leading-snug mt-0.5 line-clamp-2 pl-[calc(3rem+0.5rem)]">
                {layer.summary || layer.reason || '—'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${CHIP_STYLES[layer.status]}`}>
                {layer.status}
              </span>
              <Tooltip label={`What does ${layer.layer_id} check? ${layer.summary || layer.reason || 'See citation.'}`}>
                <button
                  type="button"
                  aria-label={`What does ${layer.layer_id} check?`}
                  className="w-5 h-5 rounded-full bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-3)] flex items-center justify-center cursor-pointer transition-colors"
                >
                  <Icon name="info" size={10} />
                </button>
              </Tooltip>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-1 border-t border-[var(--hairline)] text-[11px] text-[var(--text-3)] flex items-center justify-between">
        <span className="tabular-nums">
          {counts.PASS ?? 0} pass · {counts.WARN ?? 0} warn · {counts.FAIL ?? 0} fail · {counts['N/A'] ?? 0} n/a
        </span>
        {relaxZero && (
          <span
            title="No solver relaxation or dimensional exception was used anywhere in this layout"
            className="font-medium text-[var(--semantic-green-ink)]"
          >
            Zero relaxations applied
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
