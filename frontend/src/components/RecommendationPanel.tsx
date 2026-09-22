import React, { useState } from 'react';
import { Icon } from './Icon';

interface RecommendationPanelProps {
  summary: string;
  recommendations: string[];
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
  aiMetadata,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const fullText = `${summary}\n\nKey Engineering Recommendations:\n${recommendations
      .map((r, i) => `${i + 1}. ${r}`)
      .join('\n')}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-3.5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Icon name="file-text" size={16} className="text-slate-700" />
          <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">
            Technical Engineering Commentary
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {aiMetadata.provider_used && (
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              Provider: {aiMetadata.provider_used}
              {aiMetadata.generation_time_ms && ` (${aiMetadata.generation_time_ms}ms)`}
            </span>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded border border-slate-200 transition-colors"
          >
            {copied ? 'Copied' : 'Copy Text'}
          </button>
        </div>
      </div>

      {/* Summary Narrative */}
      <div className="text-sm text-slate-700 leading-relaxed space-y-2.5">
        {summary.split('\n\n').map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>

      {/* Prescribed Recommendations */}
      <div className="pt-3 border-t border-slate-100 space-y-2.5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900">
          Prescribed Action Items & Best Practices
        </h4>
        <ul className="space-y-2 text-sm text-slate-700">
          {recommendations.map((rec, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="font-mono font-semibold text-slate-400 text-xs shrink-0 mt-0.5">
                {String(i + 1).padStart(2, '0')}.
              </span>
              <span className="leading-snug">{rec}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
