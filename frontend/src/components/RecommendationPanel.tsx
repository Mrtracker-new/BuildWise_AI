import React, { useState } from 'react';
import type { RecommendationItem } from '../services/types';
import { Icon } from './Icon';

interface RecommendationPanelProps {
  summary: string;
  recommendations: string[];
  recommendationItems?: RecommendationItem[];
  aiMetadata: {
    provider_requested?: string;
    provider_used?: string;
    generation_time_ms?: string;
    fallback_reason?: string;
  };
}

export const RecommendationPanel: React.FC<RecommendationPanelProps> = ({
  summary,
  recommendations,
  recommendationItems,
  aiMetadata,
}) => {
  const [copied, setCopied] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  const handleCopy = () => {
    let fullText = `${summary}\n\n`;
    if (recommendationItems && recommendationItems.length > 0) {
      fullText += `Traceable Engineering Recommendations:\n` +
        recommendationItems
          .map((r) => `[${r.rule_id || r.id}] (${r.severity.toUpperCase()}) ${r.category_label || r.title || r.category}: ${r.recommendation_text || r.description} [Trigger: ${r.trigger_condition || 'N/A'}] [Ref: ${r.source_data_ref || r.source_standard}]`)
          .join('\n\n');
    } else {
      fullText += `Key Engineering Recommendations:\n` +
        recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n');
    }
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'critical':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      case 'advisory':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'optimal':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const items = recommendationItems || [];
  const filteredItems = filterSeverity === 'all'
    ? items
    : items.filter((it) => it.severity === filterSeverity);

  return (
    <div className="@container bg-white rounded-lg border border-slate-200 p-4 @sm:p-5 shadow-sm space-y-4 min-w-0 w-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2.5 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="file-text" size={16} className="text-slate-700 shrink-0" />
          <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight whitespace-normal break-words">
            Technical Engineering Commentary & Traceable Recommendations
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {aiMetadata.provider_used && (
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 break-all shrink-0">
              Provider: {aiMetadata.provider_used}
              {aiMetadata.generation_time_ms && ` (${aiMetadata.generation_time_ms}ms)`}
            </span>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded border border-slate-200 transition-colors shrink-0"
          >
            {copied ? 'Copied' : 'Copy Text'}
          </button>
        </div>
      </div>

      {/* Summary Narrative */}
      <div className="text-sm text-slate-700 leading-relaxed space-y-2.5 min-w-0">
        {summary.split('\n\n').map((para, i) => (
          <p key={i} className="whitespace-normal break-words leading-relaxed">{para}</p>
        ))}
      </div>

      {/* Traceable Recommendation Items Table / Cards */}
      {items.length > 0 ? (
        <div className="pt-3 border-t border-slate-100 space-y-3 min-w-0">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900 whitespace-normal break-words">
              Traceable Civil Action Items ({items.length} Rules Fired)
            </h4>
            <div className="flex items-center gap-1">
              {['all', 'critical', 'advisory', 'optimal'].map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setFilterSeverity(sev)}
                  className={`text-[11px] px-2 py-0.5 rounded font-medium capitalize transition-colors ${
                    filterSeverity === sev
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 min-w-0">
            {filteredItems.map((item, idx) => {
              const ruleId = item.rule_id || item.id || `RULE-${idx + 1}`;
              const label = item.category_label || item.title || item.category;
              const text = item.recommendation_text || item.description;
              const ref = item.source_data_ref || item.source_standard;

              return (
                <div
                  key={`${ruleId}-${idx}`}
                  className="rounded-md border border-slate-200 p-3 bg-slate-50/50 space-y-1.5 min-w-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                        {ruleId}
                      </span>
                      <span className="font-semibold text-xs text-slate-900 whitespace-normal break-words">{label}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border tracking-wider ${getSeverityBadge(item.severity)} shrink-0`}>
                      {item.severity}
                    </span>
                  </div>

                  {item.trigger_condition && (
                    <div className="text-[11px] text-slate-500 font-medium">
                      Trigger: <span className="text-slate-700">{item.trigger_condition}</span>
                    </div>
                  )}

                  <p className="text-xs text-slate-700 whitespace-normal break-words leading-relaxed">
                    {text}
                  </p>

                  <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60 gap-1">
                    <span>Category: <span className="font-medium text-slate-700 capitalize">{item.category}</span></span>
                    {ref && (
                      <span className="font-mono text-[10px] text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200 break-words">
                        Ref: {ref}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Fallback to simple recommendations list */
        <div className="pt-3 border-t border-slate-100 space-y-2.5 min-w-0">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900 whitespace-normal break-words">
            Prescribed Action Items & Best Practices
          </h4>
          <ul className="space-y-2 text-sm text-slate-700 min-w-0">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2.5 min-w-0">
                <span className="font-mono font-semibold text-slate-400 text-xs shrink-0 mt-0.5">
                  {String(i + 1).padStart(2, '0')}.
                </span>
                <span className="leading-snug whitespace-normal break-words min-w-0 flex-1">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
