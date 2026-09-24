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
    parameter_reflection?: string;
    feasibility_score?: string;
  };
  parameterReflection?: string;
  summaryOnly?: boolean;
}

export const RecommendationPanel: React.FC<RecommendationPanelProps> = ({
  summary,
  recommendations,
  recommendationItems,
  aiMetadata,
  parameterReflection,
  summaryOnly = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  const handleCopy = () => {
    let fullText = `${summary}\n\n`;
    if (!summaryOnly) {
      if (recommendationItems && recommendationItems.length > 0) {
        fullText += `Traceable Engineering Recommendations:\n` +
          recommendationItems
            .map((r) => `[${r.rule_id || r.id}] (${r.severity}) ${r.category_label || r.title || r.category}: ${r.recommendation_text || r.description}`)
            .join('\n\n');
      } else {
        fullText += `Key Engineering Recommendations:\n` +
          recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n');
      }
    }
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const getSeverityStyle = (sev: string) => {
    switch (sev.toLowerCase()) {
      case 'critical':
      case 'high':
        return {
          bg: 'rgba(255, 59, 48, 0.12)',
          text: 'var(--semantic-red)',
        };
      case 'advisory':
      case 'moderate':
        return {
          bg: 'rgba(255, 159, 10, 0.12)',
          text: 'var(--semantic-amber)',
        };
      default:
        return {
          bg: 'rgba(52, 199, 89, 0.12)',
          text: 'var(--semantic-green)',
        };
    }
  };

  const items = recommendationItems || [];
  const filteredItems = filterSeverity === 'all'
    ? items
    : items.filter((it) => it.severity === filterSeverity);

  return (
    <div className="rounded-[14px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-4 space-y-3.5 w-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="file-text" size={15} className="text-[var(--text-2)] shrink-0" />
          <h3 className="text-[14px] font-semibold text-[var(--text-1)] tracking-tight">
            {summaryOnly ? 'Engineering Summary & Advisory' : 'Engineering Commentary & Action Items'}
          </h3>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium text-[var(--text-2)] hover:text-[var(--text-1)] bg-[var(--fill)] hover:bg-[var(--fill-hover)] rounded-full transition-colors shrink-0 cursor-pointer"
        >
          <Icon name={copied ? 'check' : 'copy'} size={12} className={copied ? 'text-[var(--semantic-green)]' : 'text-[var(--text-3)]'} />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* Parameter Reflection (AI Decision Transparency) */}
      {(parameterReflection || aiMetadata.parameter_reflection) && (
        <div className="p-3 bg-[var(--fill)] rounded-[12px] space-y-1">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent)]">
            <Icon name="check-circle" size={13} />
            <span>AI parameter reflection</span>
          </div>
          <p className="text-[12px] text-[var(--text-1)] leading-relaxed italic">
            "{parameterReflection || aiMetadata.parameter_reflection}"
          </p>
        </div>
      )}

      {/* Engineering Narrative Summary */}
      <div className="p-3 bg-[var(--fill)] rounded-[12px] text-[13px] text-[var(--text-2)] leading-[1.5]">
        {summary}
      </div>

      {/* Detailed Recommendations (only if not summaryOnly) */}
      {!summaryOnly && items.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="bg-[var(--fill)] rounded-[10px] p-[2px] grid grid-cols-4 gap-1 text-[11px] font-medium">
            {['all', 'critical', 'advisory', 'optimal'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilterSeverity(f)}
                className={`py-1 rounded-[8px] text-center capitalize transition-all ${
                  filterSeverity === f
                    ? 'bg-[var(--segmented-active-bg)] shadow-[var(--segmented-active-shadow)] font-semibold'
                    : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                }`}
                style={{
                  color: filterSeverity === f ? 'var(--segmented-active-label)' : 'var(--text-2)',
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Grouped Recommendations List */}
          <div className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
            {filteredItems.map((item, idx) => {
              const style = getSeverityStyle(item.severity);
              return (
                <div key={idx} className="py-2.5 space-y-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-[13px] font-semibold text-[var(--text-1)] leading-snug break-words">
                      {item.category_label || item.title || item.category}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize shrink-0"
                      style={{ backgroundColor: style.bg, color: style.text }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: style.text }} />
                      <span>{item.severity}</span>
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--text-2)] leading-normal">
                    {item.recommendation_text || item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fallback to simple list if no structured items and not summaryOnly */}
      {!summaryOnly && items.length === 0 && recommendations.length > 0 && (
        <div className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
          {recommendations.map((rec, idx) => (
            <div key={idx} className="py-2.5 text-[12px] text-[var(--text-2)] leading-normal flex items-start gap-2">
              <span className="font-semibold text-[var(--text-1)] shrink-0">{idx + 1}.</span>
              <p className="flex-1">{rec}</p>
            </div>
          ))}
        </div>
      )}

      {/* Latency and provider metadata */}
      <div className="flex items-center justify-between text-[11px] text-[var(--text-3)] pt-1">
        <span>Engine: {aiMetadata.provider_used || 'deterministic'}</span>
        <span>Latency: {aiMetadata.generation_time_ms ? `${parseFloat(aiMetadata.generation_time_ms).toFixed(0)}ms` : 'Instant'}</span>
      </div>
    </div>
  );
};
