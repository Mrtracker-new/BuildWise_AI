import React, { useState, useEffect, useRef } from 'react';
import type { AnalysisRequest } from '../services/types';
import { Icon } from './Icon';
import { IosSelect } from './IosSelect';
import { ConstraintChips } from './ConstraintChips';
import { parseRequirements, parseRequirementsClientFallback } from '../services/api';
import { TYPOLOGY_OPTIONS } from '../services/typology';

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
  const [isParsingConstraints, setIsParsingConstraints] = useState(false);
  const lastParsedTextRef = useRef<string | null>(null);

  // Auto-parse client requirements into editable constraint chips
  useEffect(() => {
    const text = (request.client_requirements || '').trim();
    if (!text) {
      if (lastParsedTextRef.current !== null && request.extracted_constraints) {
        lastParsedTextRef.current = null;
        onChange({ extracted_constraints: undefined });
      }
      return;
    }

    if (text === lastParsedTextRef.current) {
      return;
    }

    // Immediately provide synchronous fallback chips for instantaneous UI feedback
    if (!request.extracted_constraints) {
      const immediate = parseRequirementsClientFallback(text);
      onChange({ extracted_constraints: immediate });
    }

    const timer = setTimeout(async () => {
      lastParsedTextRef.current = text;
      setIsParsingConstraints(true);
      try {
        const parsed = await parseRequirements(text, request.ai_provider);
        onChange({ extracted_constraints: parsed });
      } catch {
        const fallback = parseRequirementsClientFallback(text);
        onChange({ extracted_constraints: fallback });
      } finally {
        setIsParsingConstraints(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [request.client_requirements, request.ai_provider]);

  const isAreaValid = request.built_up_area_sqft >= 500 && request.built_up_area_sqft <= 50000;
  const canSubmit = hasCoordinates && isAreaValid && !isLoading;

  const qualityGrades: { id: 'basic' | 'standard' | 'premium'; label: string; rate: string }[] = [
    { id: 'basic', label: 'Basic', rate: '₹1,500/sq ft' },
    { id: 'standard', label: 'Standard', rate: '₹2,200/sq ft' },
    { id: 'premium', label: 'Premium', rate: '₹3,500/sq ft' },
  ];

  const floorOptions = [
    { id: 1, label: 'G (1 Level)' },
    { id: 2, label: 'G + 1 (2 Levels)' },
    { id: 3, label: 'G + 2 (3 Levels)' },
    { id: 4, label: 'G + 3 (4 Levels)' },
  ];

  const aiProviders = [
    { id: 'groq', label: 'Groq Cloud LLM (Llama 3.3 70B)' },
    { id: 'gemini', label: 'Google Gemini (Gemini 1.5 Flash)' },
    { id: 'mock', label: 'Deterministic Engine (Default, Zero-Config)' },
    { id: 'ollama', label: 'Ollama Local (Offline LLM)' },
  ];

  // Calculate track fill percentages for iOS sliders
  const areaMin = 500;
  const areaMax = 50000;
  const areaPct = Math.min(100, Math.max(0, ((request.built_up_area_sqft - areaMin) / (areaMax - areaMin)) * 100));

  const covMin = 0.40;
  const covMax = 0.75;
  const currentCoverage = request.ground_coverage_ratio ?? 0.60;
  const covPct = Math.min(100, Math.max(0, ((currentCoverage - covMin) / (covMax - covMin)) * 100));

  return (
    <div className="space-y-4 w-full min-w-0">
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2.5 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="settings" size={15} className="text-[var(--text-2)] shrink-0" />
          <h2 className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight">
            Project Parameters
          </h2>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] shrink-0">
          CPWD Standard
        </span>
      </div>

      {/* Built-up Area Input with iOS Slider */}
      <div className="space-y-1 min-w-0">
        <div className="flex justify-between items-baseline gap-2 min-w-0">
          <label
            htmlFor="area-input"
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]"
          >
            Built-up Plinth Area
          </label>
          <span className="text-[13px] font-medium text-[var(--text-1)] tabular-nums shrink-0">
            {request.built_up_area_sqft.toLocaleString()} sq ft
          </span>
        </div>

        {/* 16px vertical padding prevents 22px thumb from clipping */}
        <div className="py-4 min-w-0">
          <input
            id="area-input"
            type="range"
            min={areaMin}
            max={areaMax}
            step="100"
            value={request.built_up_area_sqft}
            onChange={(e) => onChange({ built_up_area_sqft: parseFloat(e.target.value) || 500 })}
            className="ios-slider"
            style={{
              background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${areaPct}%, var(--fill) ${areaPct}%, var(--fill) 100%)`,
            }}
          />
          {/* Strictly 3-column flex layout for labels, preventing overlap */}
          <div className="flex justify-between items-center text-[11px] text-[var(--text-3)] font-medium pt-2">
            <span className="w-1/3 text-left truncate">500 sq ft</span>
            <span className="w-1/3 text-center truncate">25,000 sq ft</span>
            <span className="w-1/3 text-right truncate">50,000 sq ft</span>
          </div>
        </div>

        {!isAreaValid && (
          <p className="text-[12px] text-[var(--semantic-red)] font-medium mt-1">
            Area must be between 500 and 50,000 sq ft.
          </p>
        )}
      </div>

      {/* Construction Quality Grade: iOS SEGMENTED CONTROL */}
      <div className="space-y-1.5 min-w-0">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">
          Specification Grade
        </label>
        <div className="bg-[var(--fill)] rounded-[10px] p-[2px] grid grid-cols-3 gap-1 min-w-0">
          {qualityGrades.map((grade) => {
            const isActive = request.quality_grade === grade.id;
            return (
              <button
                key={grade.id}
                type="button"
                onClick={() => onChange({ quality_grade: grade.id })}
                className={`py-2 px-1 rounded-[8px] text-center transition-all duration-200 select-none ${
                  isActive
                    ? 'bg-[var(--segmented-active-bg)] shadow-[var(--segmented-active-shadow)]'
                    : 'hover:text-[var(--text-1)]'
                }`}
              >
                <span
                  className="text-[13px] font-semibold block leading-tight"
                  style={{
                    color: isActive ? 'var(--segmented-active-label)' : 'var(--text-2)',
                  }}
                >
                  {grade.label}
                </span>
                <span
                  className="text-[11px] block mt-0.5 font-normal leading-tight"
                  style={{
                    color: isActive ? 'var(--segmented-active-sublabel)' : 'var(--text-3)',
                  }}
                >
                  {grade.rate}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Building Typology & Floors Selects */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-w-0">
        <div className="min-w-0">
          <label
            htmlFor="typology-select"
            className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] mb-1"
          >
            Building Typology
          </label>
          <IosSelect
            id="typology-select"
            value={request.building_typology}
            onChange={(val) => onChange({ building_typology: val })}
            options={TYPOLOGY_OPTIONS}
            ariaLabel="Building Typology"
          />
        </div>

        <div className="min-w-0">
          <label
            htmlFor="floors-select"
            className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] mb-1"
          >
            Storeys (Levels)
          </label>
          <IosSelect
            id="floors-select"
            value={request.floors}
            onChange={(val) => onChange({ floors: parseInt(val, 10) || 1 })}
            options={floorOptions}
            ariaLabel="Storeys (Levels)"
          />
        </div>
      </div>

      {/* Ground Coverage Ratio */}
      <div className="space-y-1 min-w-0">
        <div className="flex justify-between items-baseline gap-2 min-w-0">
          <label
            htmlFor="coverage-input"
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]"
          >
            Ground Coverage Ratio
          </label>
          <span className="text-[13px] font-medium text-[var(--text-1)] tabular-nums shrink-0">
            {Math.round(currentCoverage * 100)}%
          </span>
        </div>

        {/* 16px vertical padding for thumb clearance */}
        <div className="py-4 min-w-0">
          <input
            id="coverage-input"
            type="range"
            min={covMin}
            max={covMax}
            step="0.05"
            value={currentCoverage}
            onChange={(e) => onChange({ ground_coverage_ratio: parseFloat(e.target.value) || 0.60 })}
            className="ios-slider"
            style={{
              background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${covPct}%, var(--fill) ${covPct}%, var(--fill) 100%)`,
            }}
          />
          <div className="flex justify-between items-center text-[11px] text-[var(--text-3)] font-medium pt-2">
            <span className="w-1/3 text-left truncate">40% (Spacious)</span>
            <span className="w-1/3 text-center truncate">60% (Default)</span>
            <span className="w-1/3 text-right truncate">75% (Dense Urban)</span>
          </div>
        </div>
      </div>

      {/* Client Requirements (Optional) */}
      <div className="space-y-1.5 min-w-0">
        <div className="flex justify-between items-baseline gap-2 min-w-0">
          <label
            htmlFor="client-requirements-input"
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]"
          >
            Client Requirements <span className="font-normal normal-case text-[10px] text-[var(--text-3)]">(Optional)</span>
          </label>
          <span className="text-[10px] text-[var(--text-3)] tabular-nums shrink-0">
            {(request.client_requirements?.length || 0)}/240
          </span>
        </div>
        <textarea
          id="client-requirements-input"
          rows={3}
          maxLength={240}
          value={request.client_requirements || ''}
          onChange={(e) => onChange({ client_requirements: e.target.value })}
          placeholder="e.g. home office, 2 baths, north-facing study, open kitchen"
          className="w-full bg-[var(--fill)] border border-[var(--separator)] rounded-[10px] p-2.5 text-[13px] text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none transition-all duration-200"
        />

        {/* Interactive Constraint Chips */}
        {request.extracted_constraints && (
          <div className="pt-1">
            <ConstraintChips
              constraints={request.extracted_constraints}
              onChange={(updated) => onChange({ extracted_constraints: updated })}
              isLoading={isParsingConstraints}
            />
          </div>
        )}
      </div>

      {/* Technical Explanation Generator */}
      <div className="min-w-0">
        <label
          htmlFor="ai-provider-select"
          className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] mb-1"
        >
          Technical Explanation Generator
        </label>
        <IosSelect
          id="ai-provider-select"
          value={request.ai_provider}
          onChange={(val) => onChange({ ai_provider: val })}
          options={aiProviders}
          ariaLabel="Technical Explanation Generator"
        />
      </div>

      {/* Primary CTA Button: flat --accent, white 14px/600, radius 12, height 40, full width */}
      <div className="pt-2 min-w-0">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || isLoading}
          className={`w-full h-11 px-4 rounded-[12px] font-semibold text-[13px] sm:text-[14px] flex items-center justify-center gap-2 transition-all duration-200 select-none shadow-sm ${
            isLoading
              ? 'bg-[var(--fill)] text-[var(--text-3)] cursor-not-allowed opacity-90'
              : canSubmit
              ? 'bg-[var(--accent)] text-white hover:brightness-[0.98] active:brightness-95 cursor-pointer'
              : 'bg-[var(--fill)] text-[var(--text-3)] cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <>
              <div className="ios-spinner-16 shrink-0" aria-hidden="true" />
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <Icon name="crosshair" size={16} className="shrink-0" />
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
