import React, { useState, useEffect, useRef, useCallback } from 'react';
import type {
  AnalysisResponse,
  SiteVisionResponse,
  FloorPlanResponse,
  ReportRequestPayload,
  AnalysisRequest,
} from '../services/types';
import { ReportHeroBand } from './ReportHeroBand';
import { FactorBreakdown } from './FactorBreakdown';
import { RecommendationPanel } from './RecommendationPanel';
import { HazardProfileCard } from './HazardProfileCard';
import { RiskMatrix } from './RiskMatrix';
import { DataSourcesDisclosure } from './DataSourcesDisclosure';
import { SiteVisionCard } from './SiteVisionCard';
import { OrientationCompass } from './OrientationCompass';
import { VastuAdvisoryCard } from './VastuAdvisoryCard';
import { CostBreakdownTable } from './CostBreakdownTable';
import { LandValueCard } from './LandValueCard';
import { FloorPlanGeneratorCard } from './FloorPlanGeneratorCard';
import type { SharedBoundaryState } from '../services/siteBoundary';
import { DownloadReportButton } from './DownloadReportButton';
import { Icon } from './Icon';

export type ResultsTab = 'overview' | 'hazards' | 'ecology' | 'cost_plan';

export interface ReportSheetProps {
  isOpen: boolean;
  onClose: () => void;
  analysisData: AnalysisResponse;
  analysisRequest?: AnalysisRequest;
  siteVisionData: SiteVisionResponse | null;
  isSiteVisionLoading: boolean;
  onRunSiteVision: (modeOverride?: 'segformer' | 'index-only') => void;
  hasLocation: boolean;
  floorPlanData: FloorPlanResponse | null;
  onFloorPlanGenerated: (plan: FloorPlanResponse) => void;
  overrideLandRate: number | null;
  overridePlotArea: number | null;
  onOverrideChange: (rate: number | null, area: number | null) => void;
  reportPayload: ReportRequestPayload;
  activeTab: ResultsTab;
  onTabChange: (tab: ResultsTab) => void;
  sharedBoundary?: SharedBoundaryState | null;
}

const TABS: { id: ResultsTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'hazards', label: 'Hazards' },
  { id: 'ecology', label: 'Ecology' },
  { id: 'cost_plan', label: 'Cost & Plan' },
];

export const ReportSheet: React.FC<ReportSheetProps> = ({
  isOpen,
  onClose,
  analysisData,
  analysisRequest,
  sharedBoundary,
  siteVisionData,
  isSiteVisionLoading,
  onRunSiteVision,
  hasLocation,
  floorPlanData,
  onFloorPlanGenerated,
  overrideLandRate,
  overridePlotArea,
  onOverrideChange,
  reportPayload,
  activeTab,
  onTabChange,
}) => {
  const [copiedRef, setCopiedRef] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  // Copy Reference ID
  const handleCopyRef = () => {
    navigator.clipboard.writeText(analysisData.request_id);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 1500);
  };

  // Scroll to top of content on tab switch
  const handleTabChange = useCallback(
    (tab: ResultsTab) => {
      onTabChange(tab);
      if (contentScrollRef.current) {
        contentScrollRef.current.scrollTo({ top: 0, behavior: 'instant' });
      }
    },
    [onTabChange]
  );

  // Body scroll lock and focus trap while open
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus first focusable element inside the sheet
    const focusTimer = setTimeout(() => {
      if (sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        }
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab' && sheetRef.current) {
        const focusable = Array.from(
          sheetRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(focusTimer);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // INR Formatting Helper
  const formatInr = (val: number) => {
    if (val >= 10000000) {
      return `₹${(val / 10000000).toFixed(2)} Cr`;
    } else if (val >= 100000) {
      return `₹${(val / 100000).toFixed(2)} Lakh`;
    }
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Land value and combined calculations
  const effectiveLandRate =
    overrideLandRate !== null
      ? overrideLandRate
      : analysisData.land_value?.indicative_rate_per_sqft ?? null;

  const currentPlotArea =
    overridePlotArea !== null
      ? overridePlotArea
      : analysisData.land_value?.plot_area_sqft ?? 0;

  const currentLandCost =
    effectiveLandRate !== null && effectiveLandRate > 0 && currentPlotArea > 0
      ? Math.round(effectiveLandRate * currentPlotArea)
      : analysisData.land_value?.land_cost_inr ?? null;

  const currentCombinedTotal =
    currentLandCost !== null
      ? analysisData.cost_estimate.total_estimated_cost_inr + currentLandCost
      : null;

  return (
    <>
      {/* Behind it: rgba(0,0,0,0.20) scrim over the map */}
      <div
        className="report-sheet-scrim fixed inset-0 bg-black/20 z-[1999] transition-opacity cursor-pointer pointer-events-auto"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Surface: fixed inset-3 on desktop, inset-0 below 1024px; radius 24 (0 on mobile) */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Site Feasibility Report"
        className="fixed inset-3 max-lg:inset-0 rounded-[24px] max-lg:rounded-none z-[2000] report-sheet-surface border border-[var(--panel-border-color)] shadow-2xl flex flex-col overflow-hidden animate-sheet-open pointer-events-auto"
        style={{
          backgroundColor: 'var(--sheet-bg)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        }}
      >
        {/* Sticky Sheet Header (56px) */}
        <header className="h-[56px] min-h-[56px] border-b border-[var(--hairline)] px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3 shrink-0 select-none bg-[var(--sheet-bg)]">
          {/* Left: Shield Icon + "Site Feasibility Report" 15px/600 + Ref Copy Pill */}
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-[8px] bg-[var(--accent-tint)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <Icon name="shield" size={16} />
            </div>
            <h1 className="text-[14px] sm:text-[15px] font-semibold text-[var(--text-1)] tracking-tight truncate">
              <span className="hidden xs:inline">Site Feasibility </span>Report
            </h1>
            <button
              type="button"
              onClick={handleCopyRef}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[12px] font-mono text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors cursor-pointer select-none shrink-0"
              title="Click to copy analysis reference ID"
            >
              <Icon
                name={copiedRef ? 'check' : 'copy'}
                size={12}
                className={copiedRef ? 'text-[var(--semantic-green)]' : 'text-[var(--text-3)]'}
              />
              <span>{copiedRef ? 'Copied' : `Ref: ${analysisData.request_id.slice(0, 8)}`}</span>
            </button>
          </div>

          {/* Center: Desktop Segmented Tab Bar (Hidden on <1024px, shown in sub-header) */}
          <nav
            aria-label="Report sections"
            className="report-sheet-tabs-nav hidden lg:flex items-center justify-center flex-1 max-w-md mx-auto"
          >
            <div className="bg-[var(--fill)] rounded-[10px] p-[2px] grid grid-cols-4 gap-1 w-full text-[12px] font-medium">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`py-1.5 px-2 rounded-[8px] text-[12px] text-center transition-all truncate cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-[var(--segmented-active-bg)] text-[var(--segmented-active-label)] font-semibold shadow-[var(--segmented-active-shadow)]'
                      : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          {/* Right: Download PDF (primary), Print (secondary), Close */}
          <div className="report-sheet-header-actions flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Download PDF button (primary) */}
            <DownloadReportButton payload={reportPayload} variant="compact" />

            {/* Print button (secondary) */}
            <button
              type="button"
              onClick={() => window.print()}
              className="hidden sm:flex h-8 px-3 rounded-[10px] bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-1)] text-[12px] font-medium items-center gap-1.5 transition-colors cursor-pointer select-none"
              title="Print comprehensive report"
            >
              <Icon name="printer" size={14} />
              <span>Print</span>
            </button>

            {/* Close button (32px --fill circle) */}
            <button
              type="button"
              onClick={onClose}
              className="report-sheet-close-btn w-8 h-8 rounded-full bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-2)] hover:text-[var(--text-1)] flex items-center justify-center transition-colors cursor-pointer shrink-0"
              aria-label="Close report sheet"
              title="Close (Esc)"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        </header>

        {/* Mobile Horizontal Sub-Header Tabs (<1024px) */}
        <div className="report-sheet-tabs-nav lg:hidden border-b border-[var(--hairline)] px-4 py-2 bg-[var(--sheet-bg)] bw-tab-strip bw-fade-x shrink-0">
          <div className="bg-[var(--fill)] rounded-[10px] p-[2px] flex items-center gap-1 min-w-max text-[12px] font-medium">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`py-1.5 px-3.5 rounded-[8px] text-[12px] transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[var(--segmented-active-bg)] text-[var(--segmented-active-label)] font-semibold shadow-[var(--segmented-active-shadow)]'
                    : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area: overflow-y auto with scrollbar-apple, padding 24px, inner max-width 1160px centered */}
        <main
          ref={contentScrollRef}
          className="report-sheet-content flex-1 overflow-y-auto bw-scroll-pane scrollbar-apple p-4 sm:p-6"
        >
          <div className="max-w-[1400px] mx-auto w-full min-w-0 space-y-4">
            {/* ================================================================= */}
            {/* SCREEN VIEW: Render selected tab only                             */}
            {/* ================================================================= */}
            <div className="report-screen-only animate-tab-switch">
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  {/* a) HERO BAND: full-width single-row card (radius 14, padding 18, height ~150px) */}
                  <ReportHeroBand data={analysisData} />

                  {/* b) BELOW: grid 7fr / 5fr, gap 16: left = Multi-Criteria Factor Breakdown; right = Engineering Commentary & Action Items */}
                  <div className="grid grid-cols-1 lg:grid-cols-[7fr_5fr] gap-4 items-start">
                    {/* Left Column (7fr): Multi-Criteria Factor Breakdown card */}
                    <div className="w-full min-w-0">
                      <FactorBreakdown factors={analysisData.factors} />
                    </div>

                    {/* Right Column (5fr): Engineering Commentary & Action Items card (sticky filter control) */}
                    <div className="w-full min-w-0">
                      <RecommendationPanel
                        summary={analysisData.engineering_summary}
                        recommendations={analysisData.detailed_recommendations}
                        recommendationItems={analysisData.recommendation_items}
                        aiMetadata={analysisData.ai_metadata}
                        parameterReflection={analysisData.parameter_reflection}
                        summaryOnly={false}
                      />
                    </div>
                  </div>

                  {/* c) BELOW: full-width export / download strip */}
                  <div className="rounded-[14px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-3.5 px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-[var(--text-2)]">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon name="badge-check" size={16} className="text-[var(--semantic-green)] shrink-0" />
                      <span className="truncate">
                        Site feasibility dossier verified • Ref ID:{' '}
                        <span className="font-mono text-[var(--text-1)]">{analysisData.request_id}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <DownloadReportButton payload={reportPayload} variant="compact" />
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="h-8 px-3 rounded-[10px] bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-1)] text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer select-none"
                      >
                        <Icon name="printer" size={14} />
                        <span>Print Report</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: HAZARDS */}
              {activeTab === 'hazards' && (
                <div className="space-y-4">
                  {/* 3-col grid with Seismic / Hydrological / Storm side by side */}
                  {analysisData.hazard_profile && (
                    <HazardProfileCard hazard={analysisData.hazard_profile} layout="grid" />
                  )}

                  {/* Below: Full-width Risk Mitigation Matrix */}
                  <RiskMatrix risks={analysisData.risks} />

                  {/* Consolidated Data Sources & Standards */}
                  <DataSourcesDisclosure category="hazards" degraded={analysisData.degraded_mode || (analysisData.warnings?.length ?? 0) > 0} />
                </div>
              )}

              {/* TAB 3: ECOLOGY */}
              {activeTab === 'ecology' && (
                <div className="space-y-4">
                  {/* 2-col grid SiteVisionCard + tree preservation list */}
                  <SiteVisionCard
                    data={siteVisionData}
                    isLoading={isSiteVisionLoading}
                    onScan={onRunSiteVision}
                    hasCoordinates={hasLocation}
                    layout="grid"
                  />

                  {/* Below: 2-col grid OrientationCompass + VastuAdvisoryCard side by side */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                    <OrientationCompass orientation={analysisData.orientation} />

                    {analysisData.vastu_advisory && (
                      <VastuAdvisoryCard advisory={analysisData.vastu_advisory} />
                    )}
                  </div>

                  {/* Consolidated Data Sources & Standards */}
                  <DataSourcesDisclosure category="ecology" degraded={analysisData.degraded_mode || (analysisData.warnings?.length ?? 0) > 0} />
                </div>
              )}

              {/* TAB 4: COST & PLAN */}
              {activeTab === 'cost_plan' && (
                <div className="space-y-4">
                  {/* Summary Tiles Row (4 tiles with room: label 12px, value 22px/600) */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <div className="bg-[var(--card-bg-subtle)] border border-[var(--hairline)] p-4 rounded-[14px] min-w-0">
                      <span className="text-[12px] font-normal text-[var(--text-3)] block mb-1">
                        Plinth area base rate
                      </span>
                      <span className="text-[22px] font-semibold text-[var(--text-1)] tabular-nums block leading-tight">
                        ₹{analysisData.cost_estimate.base_rate_per_sqft.toLocaleString('en-IN')}/sq ft
                      </span>
                      <span className="text-[12px] text-[var(--text-2)] block truncate mt-0.5">
                        CPWD PAR baseline
                      </span>
                    </div>

                    <div className="bg-[var(--card-bg-subtle)] border border-[var(--hairline)] p-4 rounded-[14px] min-w-0">
                      <span className="text-[12px] font-normal text-[var(--text-3)] block mb-1">
                        Topographic modifier
                      </span>
                      <span className="text-[22px] font-semibold text-[var(--text-1)] tabular-nums block leading-tight">
                        {analysisData.cost_estimate.terrain_multiplier.toFixed(2)}x
                      </span>
                      <span className="text-[12px] text-[var(--text-2)] block truncate mt-0.5">
                        {analysisData.cost_estimate.terrain_surcharge_inr > 0
                          ? `+${formatInr(analysisData.cost_estimate.terrain_surcharge_inr)} terrain surcharge`
                          : 'Baseline topography'}
                      </span>
                    </div>

                    <div className="bg-[var(--card-bg-subtle)] border border-[var(--hairline)] p-4 rounded-[14px] min-w-0">
                      <span className="text-[12px] font-normal text-[var(--text-3)] block mb-1">
                        Total civil budget
                      </span>
                      <span className="text-[22px] font-semibold text-[var(--text-1)] tabular-nums block leading-tight">
                        {formatInr(analysisData.cost_estimate.total_estimated_cost_inr)}
                      </span>
                      <span className="text-[12px] text-[var(--text-2)] block truncate mt-0.5">
                        Range: {formatInr(analysisData.cost_estimate.cost_range_min_inr)} –{' '}
                        {formatInr(analysisData.cost_estimate.cost_range_max_inr)}
                      </span>
                    </div>

                    <div className="bg-[var(--card-bg-subtle)] border border-[var(--hairline)] p-4 rounded-[14px] min-w-0">
                      <span className="text-[12px] font-normal text-[var(--text-3)] block mb-1">
                        Combined project total
                      </span>
                      <span className="text-[22px] font-semibold text-[var(--text-1)] tabular-nums block leading-tight">
                        {currentCombinedTotal !== null ? formatInr(currentCombinedTotal) : '—'}
                      </span>
                      <span className="text-[12px] text-[var(--text-2)] block truncate mt-0.5">
                        Civil structure + Land value
                      </span>
                    </div>
                  </div>

                  {/* Full-width Cost Breakdown Table */}
                  <CostBreakdownTable
                    costEstimate={analysisData.cost_estimate}
                    hideSummaryHeader={true}
                  />

                  {/* Below: Balanced LandValueCard + FloorPlanGeneratorCard (trailing card spans both columns if blueprint expanded) */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                    {analysisData.land_value && (
                      <div className={`w-full min-w-0 ${floorPlanData ? 'lg:col-span-2' : ''}`}>
                        <LandValueCard
                          landValue={analysisData.land_value}
                          civilTotalCostInr={analysisData.cost_estimate.total_estimated_cost_inr}
                          onOverrideChange={onOverrideChange}
                        />
                      </div>
                    )}

                    <div className={`w-full min-w-0 ${floorPlanData ? 'lg:col-span-2' : ''}`}>
                      <FloorPlanGeneratorCard
                        defaultWidthM={
                          analysisData.land_value?.plot_area_sqft
                            ? Math.max(
                                6.0,
                                Math.min(
                                  60.0,
                                  +Math.sqrt(
                                    (analysisData.land_value.plot_area_sqft * 0.092903) / 1.2
                                  ).toFixed(1)
                                )
                              )
                            : 10.0
                        }
                        defaultDepthM={
                          analysisData.land_value?.plot_area_sqft
                            ? Math.max(
                                6.0,
                                Math.min(
                                  60.0,
                                  +(
                                    Math.sqrt(
                                      (analysisData.land_value.plot_area_sqft * 0.092903) / 1.2
                                    ) * 1.2
                                  ).toFixed(1)
                                )
                              )
                            : 12.0
                        }
                        activeFloorPlan={floorPlanData}
                        onFloorPlanGenerated={onFloorPlanGenerated}
                        analysisRequest={analysisRequest}
                        sharedBoundary={sharedBoundary}
                        buildingTypology={analysisRequest?.building_typology}
                        qualityGrade={analysisRequest?.quality_grade}
                        floors={analysisRequest?.floors}
                        builtUpAreaSqft={analysisRequest?.built_up_area_sqft}
                        groundCoverageRatio={analysisRequest?.ground_coverage_ratio ?? analysisData.land_value?.ground_coverage_ratio_applied}
                        clientNotes={analysisRequest?.client_requirements}
                        aiProvider={analysisRequest?.ai_provider ?? analysisData.ai_metadata?.provider_requested}
                        solarAxisDegrees={analysisData.orientation?.optimal_axis_degrees}
                        prevailingWindDirectionDegrees={analysisData.orientation?.prevailing_wind_direction_degrees}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ================================================================= */}
            {/* PRINT VIEW: Force-render all 4 sections stacked for window.print() */}
            {/* ================================================================= */}
            <div className="report-print-all hidden space-y-10">
              {/* Document Header in Print */}
              <div className="border-b-2 border-black pb-4 mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-black">
                  Comprehensive Site Feasibility Report
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Location: {analysisData.formatted_address} ({analysisData.coordinates.latitude.toFixed(5)}, {analysisData.coordinates.longitude.toFixed(5)}) • Ref ID: {analysisData.request_id}
                </p>
              </div>

              {/* SECTION 1: OVERVIEW */}
              <div className="report-print-section space-y-4">
                <div className="border-b border-gray-300 pb-1.5">
                  <h2 className="text-lg font-bold text-black uppercase tracking-wide">
                    1. Site Suitability Assessment & Overview
                  </h2>
                </div>
                <ReportHeroBand data={analysisData} />
                <div className="grid grid-cols-2 gap-4 items-start">
                  <FactorBreakdown factors={analysisData.factors} />
                  <RecommendationPanel
                    summary={analysisData.engineering_summary}
                    recommendations={analysisData.detailed_recommendations}
                    recommendationItems={analysisData.recommendation_items}
                    aiMetadata={analysisData.ai_metadata}
                    parameterReflection={analysisData.parameter_reflection}
                    summaryOnly={false}
                  />
                </div>
              </div>

              {/* SECTION 2: HAZARDS */}
              <div className="report-print-section space-y-4">
                <div className="border-b border-gray-300 pb-1.5">
                  <h2 className="text-lg font-bold text-black uppercase tracking-wide">
                    2. Climate, Seismic & Environmental Hazards
                  </h2>
                </div>
                {analysisData.hazard_profile && (
                  <HazardProfileCard hazard={analysisData.hazard_profile} layout="grid" />
                )}
                <RiskMatrix risks={analysisData.risks} />
                <DataSourcesDisclosure category="hazards" degraded={analysisData.degraded_mode || (analysisData.warnings?.length ?? 0) > 0} />
              </div>

              {/* SECTION 3: ECOLOGY */}
              <div className="report-print-section space-y-4">
                <div className="border-b border-gray-300 pb-1.5">
                  <h2 className="text-lg font-bold text-black uppercase tracking-wide">
                    3. Ecological Vision, Tree Preservation & Passive Orientation
                  </h2>
                </div>
                <SiteVisionCard
                  data={siteVisionData}
                  isLoading={false}
                  onScan={() => {}}
                  hasCoordinates={hasLocation}
                  layout="grid"
                />
                <div className="grid grid-cols-2 gap-6 items-start">
                  <OrientationCompass orientation={analysisData.orientation} />
                  {analysisData.vastu_advisory && (
                    <VastuAdvisoryCard advisory={analysisData.vastu_advisory} />
                  )}
                </div>
                <DataSourcesDisclosure category="ecology" degraded={analysisData.degraded_mode || (analysisData.warnings?.length ?? 0) > 0} />
              </div>

              {/* SECTION 4: COST & PLAN */}
              <div className="report-print-section space-y-4">
                <div className="border-b border-gray-300 pb-1.5">
                  <h2 className="text-lg font-bold text-black uppercase tracking-wide">
                    4. Construction Cost Estimation & Architectural Planning
                  </h2>
                </div>
                <div className="grid grid-cols-4 gap-3.5">
                  <div className="border border-gray-300 p-3 rounded-lg">
                    <span className="text-xs text-gray-500 block">Base Rate</span>
                    <span className="text-lg font-bold text-black block">
                      ₹{analysisData.cost_estimate.base_rate_per_sqft.toLocaleString('en-IN')}/sq ft
                    </span>
                  </div>
                  <div className="border border-gray-300 p-3 rounded-lg">
                    <span className="text-xs text-gray-500 block">Terrain Modifier</span>
                    <span className="text-lg font-bold text-black block">
                      {analysisData.cost_estimate.terrain_multiplier.toFixed(2)}x
                    </span>
                  </div>
                  <div className="border border-gray-300 p-3 rounded-lg">
                    <span className="text-xs text-gray-500 block">Civil Budget</span>
                    <span className="text-lg font-bold text-black block">
                      {formatInr(analysisData.cost_estimate.total_estimated_cost_inr)}
                    </span>
                  </div>
                  <div className="border border-gray-300 p-3 rounded-lg">
                    <span className="text-xs text-gray-500 block">Combined Total</span>
                    <span className="text-lg font-bold text-black block">
                      {currentCombinedTotal !== null ? formatInr(currentCombinedTotal) : '—'}
                    </span>
                  </div>
                </div>
                <CostBreakdownTable
                  costEstimate={analysisData.cost_estimate}
                  hideSummaryHeader={true}
                />
                {analysisData.land_value && (
                  <LandValueCard
                    landValue={analysisData.land_value}
                    civilTotalCostInr={analysisData.cost_estimate.total_estimated_cost_inr}
                  />
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
};
