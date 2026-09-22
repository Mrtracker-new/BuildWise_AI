import React from 'react';
import type { AnalysisRequest } from '../services/types';
import { Icon } from './Icon';

interface AnalysisFormProps {
  request: AnalysisRequest;
  isLoading: boolean;
  hasCoordinates: boolean;
  onChange: (updated: Partial<AnalysisRequest>) => void;
  onSubmit: () => void;
}

export const AnalysisForm: React.FC<AnalysisFormProps> = ({
  request,
  isLoading,
  hasCoordinates,
  onChange,
  onSubmit,
}) => {
  const isAreaValid = request.built_up_area_sqft >= 500 && request.built_up_area_sqft <= 50000;
  const canSubmit = hasCoordinates && isAreaValid && !isLoading;

  const qualityGrades: { id: 'basic' | 'standard' | 'premium'; label: string; rate: string }[] = [
    { id: 'basic', label: 'Basic', rate: '1,500 /sq ft' },
    { id: 'standard', label: 'Standard', rate: '2,200 /sq ft' },
    { id: 'premium', label: 'Premium', rate: '3,500 /sq ft' },
  ];

  const typologies = [
    { id: 'residential_single', label: 'Residential (Single-Family)' },
    { id: 'residential_multi', label: 'Residential (Apartments/Multi-Family)' },
    { id: 'commercial', label: 'Commercial Office / Retail' },
    { id: 'industrial', label: 'Light Industrial / Warehouse' },
  ];

  const aiProviders = [
    { id: 'mock', label: 'Mock Deterministic (Zero-Config, Default)' },
    { id: 'groq', label: 'Groq Cloud LLM (Optional Key)' },
    { id: 'gemini', label: 'Google Gemini (Optional Key)' },
    { id: 'ollama', label: 'Ollama Local (Offline LLM)' },
  ];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Icon name="settings" size={16} className="text-slate-700" />
          <h2 className="text-[15px] font-semibold text-slate-900 tracking-tight">
            Project Parameters
          </h2>
        </div>
        <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 font-mono">
          CPWD Standard
        </span>
      </div>

      {/* Built-up Area Input */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <label htmlFor="area-input" className="text-xs uppercase tracking-wider font-semibold text-slate-500">
            Built-up Plinth Area
          </label>
          <span className="text-sm font-mono font-semibold text-slate-900 bg-slate-100 px-2.5 py-1 rounded">
            {request.built_up_area_sqft.toLocaleString()} sq ft
          </span>
        </div>
        <input
          id="area-input"
          type="range"
          min="500"
          max="50000"
          step="100"
          value={request.built_up_area_sqft}
          onChange={(e) => onChange({ built_up_area_sqft: parseFloat(e.target.value) || 500 })}
          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
        />
        <div className="flex justify-between text-xs font-mono text-slate-400">
          <span>500 sq ft</span>
          <span>25,000 sq ft</span>
          <span>50,000 sq ft</span>
        </div>
        {!isAreaValid && (
          <p className="text-xs text-rose-600 font-medium mt-1">
            Area must be between 500 and 50,000 sq ft.
          </p>
        )}
      </div>

      {/* Construction Quality Grade */}
      <div className="space-y-1.5">
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-500">
          Specification Grade
        </label>
        <div className="grid grid-cols-3 gap-2">
          {qualityGrades.map((grade) => (
            <button
              key={grade.id}
              type="button"
              onClick={() => onChange({ quality_grade: grade.id })}
              className={`p-2.5 rounded text-left border transition-all ${
                request.quality_grade === grade.id
                  ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <div className="text-sm font-semibold">{grade.label}</div>
              <div
                className={`text-xs font-mono mt-0.5 ${
                  request.quality_grade === grade.id ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                {grade.rate}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Building Typology & Floors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="typology-select" className="block text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">
            Building Typology
          </label>
          <select
            id="typology-select"
            value={request.building_typology}
            onChange={(e) => onChange({ building_typology: e.target.value })}
            className="w-full h-10 text-sm px-3 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
          >
            {typologies.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="floors-select" className="block text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">
            Storeys (Levels)
          </label>
          <select
            id="floors-select"
            value={request.floors}
            onChange={(e) => onChange({ floors: parseInt(e.target.value, 10) || 1 })}
            className="w-full h-10 text-sm px-3 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
          >
            <option value={1}>G (1 Level)</option>
            <option value={2}>G + 1 (2 Levels)</option>
            <option value={3}>G + 2 (3 Levels)</option>
            <option value={4}>G + 3 (4 Levels)</option>
          </select>
        </div>
      </div>

      {/* AI Explanation Provider */}
      <div>
        <label htmlFor="ai-provider-select" className="block text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">
          Technical Explanation Generator
        </label>
        <select
          id="ai-provider-select"
          value={request.ai_provider}
          onChange={(e) => onChange({ ai_provider: e.target.value })}
          className="w-full h-10 text-sm px-3 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
        >
          {aiProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Submit Action (44px height, 14-15px text) */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`w-full h-11 px-4 rounded-md font-medium text-sm flex items-center justify-center gap-2 transition-all ${
            canSubmit
              ? 'bg-slate-900 hover:bg-slate-800 text-white shadow'
              : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <>
              <Icon name="loader" size={16} />
              <span>Synthesizing Site Engineering Data...</span>
            </>
          ) : (
            <>
              <Icon name="crosshair" size={16} />
              <span>
                {hasCoordinates ? 'Run Site Feasibility Analysis' : 'Select Location on Map to Begin'}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
