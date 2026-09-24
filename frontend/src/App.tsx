import React, { useState, useEffect, useRef, useCallback } from 'react';
import type {
  AnalysisRequest,
  AnalysisResponse,
  SiteVisionResponse,
  FloorPlanResponse,
  ReportRequestPayload,
} from './services/types';
import { submitSiteVision } from './services/api';
import { generateFeasibilityReport, fetchBackendStatus } from './services/aiService';
import { AppHeader } from './components/AppHeader';
import { MapCanvas } from './components/MapCanvas';
import { CoordinatesInput } from './components/CoordinatesInput';
import { AnalysisForm } from './components/AnalysisForm';
import { ScoreSummaryCard } from './components/ScoreSummaryCard';
import { HazardProfileCard } from './components/HazardProfileCard';
import { SiteVisionCard } from './components/SiteVisionCard';
import { FactorBreakdown } from './components/FactorBreakdown';
import { OrientationCompass } from './components/OrientationCompass';
import { VastuAdvisoryCard } from './components/VastuAdvisoryCard';
import { FloorPlanGeneratorCard } from './components/FloorPlanGeneratorCard';
import { CostBreakdownTable } from './components/CostBreakdownTable';
import { LandValueCard } from './components/LandValueCard';
import { RiskMatrix } from './components/RiskMatrix';
import { RecommendationPanel } from './components/RecommendationPanel';
import { DownloadReportButton } from './components/DownloadReportButton';
import { TelemetryStrip, ErrorBanner } from './components/StatusBanner';
import { EmptyState } from './components/EmptyState';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { MethodologyModal } from './components/MethodologyModal';
import { DataSourcesDisclosure } from './components/DataSourcesDisclosure';
import { Icon } from './components/Icon';

export const App: React.FC = () => {
  // Theme State: 'light' | 'dark'
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Application Parameters State
  const [request, setRequest] = useState<AnalysisRequest>({
    latitude: 12.9716, // Default to Bengaluru Urban, India
    longitude: 77.5946,
    built_up_area_sqft: 2000,
    quality_grade: 'standard',
    building_typology: 'residential_single',
    floors: 1,
    ai_provider: 'groq',
    ground_coverage_ratio: 0.6,
  });

  const [hasLocation, setHasLocation] = useState<boolean>(true);
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null);
  const [overrideLandRate, setOverrideLandRate] = useState<number | null>(null);
  const [overridePlotArea, setOverridePlotArea] = useState<number | null>(null);
  const [siteVisionData, setSiteVisionData] = useState<SiteVisionResponse | null>(null);
  const [floorPlanData, setFloorPlanData] = useState<FloorPlanResponse | null>(null);
  const [isSiteVisionLoading, setIsSiteVisionLoading] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fallbackToast, setFallbackToast] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState<boolean>(false);
  const [serverStatus, setServerStatus] = useState<{ groq: boolean; gemini: boolean } | null>(null);
  const [isMethodologyOpen, setIsMethodologyOpen] = useState<boolean>(false);

  // Mobile Panels State (<1024px)
  const [isMobileControlOpen, setIsMobileControlOpen] = useState<boolean>(false);
  const [isMobileResultsOpen, setIsMobileResultsOpen] = useState<boolean>(false);

  // Responsive Drawer State: persistent on desktop (>=1024px)
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(true);
  const [leafletResizeTrigger, setLeafletResizeTrigger] = useState<number>(0);

  // Telemetry Warnings State
  const [isWarningDismissed, setIsWarningDismissed] = useState<boolean>(false);
  const [testWarnings, setTestWarnings] = useState<string[] | null>(null);

  // Accessibility Refs for Drawer Focus Trap/Return
  const drawerToggleBtnRef = useRef<HTMLButtonElement>(null);
  const drawerCloseBtnRef = useRef<HTMLButtonElement>(null);
  const prevDrawerOpenRef = useRef<boolean>(false);
  const resultsDrawerRef = useRef<HTMLElement>(null);

  // Segmented Tabs State: 'overview' | 'hazards' | 'ecology' | 'cost_plan'
  type ResultsTab = 'overview' | 'hazards' | 'ecology' | 'cost_plan';
  const [activeResultsTab, setActiveResultsTab] = useState<ResultsTab>('overview');
  const [copiedRef, setCopiedRef] = useState<boolean>(false);

  const handleTabChange = (tab: ResultsTab) => {
    setActiveResultsTab(tab);
    if (resultsDrawerRef.current) {
      resultsDrawerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  };

  const handleCopyRef = () => {
    if (!analysisData) return;
    navigator.clipboard.writeText(analysisData.request_id);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 1500);
  };

  // Synchronize document theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__setTestWarnings = (w: string[] | null) => setTestWarnings(w);
    }
  }, []);

  const warnings = testWarnings !== null ? testWarnings : analysisData?.warnings || [];

  // Invalidate Leaflet helper
  const triggerMapResize = useCallback(() => {
    setLeafletResizeTrigger((prev) => prev + 1);
  }, []);

  // Initial Backend Status & LLM Key Verification
  useEffect(() => {
    fetchBackendStatus()
      .then((res) => {
        setBackendConnected(res.status === 'online');
        setServerStatus({ groq: res.groq, gemini: res.gemini });
        if (res.groq) {
          setRequest((prev) => ({ ...prev, ai_provider: 'groq' }));
        } else if (res.gemini) {
          setRequest((prev) => ({ ...prev, ai_provider: 'gemini' }));
        }
      })
      .catch(() => {
        setBackendConnected(false);
        setServerStatus(null);
      });
  }, []);

  // Focus management for Responsive Drawer
  useEffect(() => {
    if (isDrawerOpen && !prevDrawerOpenRef.current) {
      const timer = setTimeout(() => {
        drawerCloseBtnRef.current?.focus();
        triggerMapResize();
      }, 50);
      return () => clearTimeout(timer);
    } else if (!isDrawerOpen && prevDrawerOpenRef.current) {
      drawerToggleBtnRef.current?.focus();
      const timer = setTimeout(() => {
        triggerMapResize();
      }, 50);
      return () => clearTimeout(timer);
    }
    prevDrawerOpenRef.current = isDrawerOpen;
  }, [isDrawerOpen, triggerMapResize]);

  // Keyboard navigation: Escape key closes drawer and mobile sheets
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDrawerOpen) setIsDrawerOpen(false);
        if (isMobileControlOpen) setIsMobileControlOpen(false);
        if (isMobileResultsOpen) setIsMobileResultsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen, isMobileControlOpen, isMobileResultsOpen]);

  // Coordinate changes from map click or input
  // STALE-STATE RULE: Changing selected coordinates clears siteVisionData
  const handleLocationSelect = (lat: number, lon: number) => {
    setRequest((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lon,
    }));
    setHasLocation(true);
    setSiteVisionData(null);
  };

  const handleClearLocation = () => {
    setHasLocation(false);
    setAnalysisData(null);
    setSiteVisionData(null);
    setFloorPlanData(null);
    setErrorMessage(null);
    setIsDrawerOpen(false);
    setIsMobileResultsOpen(false);
  };

  const handleRequestChange = (updated: Partial<AnalysisRequest>) => {
    setRequest((prev) => ({ ...prev, ...updated }));
  };

  // Run Satellite Vision Analysis
  const handleRunSiteVision = async (modeOverride?: 'segformer' | 'index-only') => {
    if (!hasLocation) return;
    setIsSiteVisionLoading(true);
    try {
      const resp = await submitSiteVision({
        latitude: request.latitude,
        longitude: request.longitude,
        plot_area_sqft: overridePlotArea ?? (analysisData?.land_value?.plot_area_sqft ?? 2000),
        mode_override: modeOverride,
        orientation_deg: analysisData?.orientation?.optimal_axis_degrees ?? undefined,
      });
      setSiteVisionData(resp);
    } catch (err: any) {
      setSiteVisionData({
        mode: 'unavailable',
        green_cover_pct: 0,
        water_cover_pct: 0,
        built_up_pct: 0,
        tree_clusters: { type: 'FeatureCollection', features: [] },
        water_bodies: { type: 'FeatureCollection', features: [] },
        preservation_plan: [],
        warnings: [err.message || 'Satellite vision service temporarily unreachable.'],
        timing_ms: {},
      });
    } finally {
      setIsSiteVisionLoading(false);
      triggerMapResize();
    }
  };

  // Run Feasibility Analysis
  const handleRunAnalysis = async () => {
    if (!hasLocation) {
      setErrorMessage('Please select a site location on the map before analyzing.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setFallbackToast(null);
    setIsWarningDismissed(false);

    // Open results on desktop drawer and mobile
    setIsDrawerOpen(true);
    setIsMobileResultsOpen(true);
    setIsMobileControlOpen(false);
    setActiveResultsTab('overview');

    // Concurrently trigger site vision scan
    handleRunSiteVision();

    try {
      const prevPlotArea = overridePlotArea ?? analysisData?.land_value?.plot_area_sqft;

      const { data: response, fallbackTriggered } = await generateFeasibilityReport(request);
      setAnalysisData(response);

      if (fallbackTriggered) {
        setFallbackToast('AI Engine unreachable, falling back to deterministic mock.');
      }

      // STALE-STATE RULE: Retain floorPlanData only when plot dimensions are unchanged
      const newPlotArea = overridePlotArea ?? response.land_value?.plot_area_sqft;
      if (
        prevPlotArea != null &&
        newPlotArea != null &&
        Math.abs(prevPlotArea - newPlotArea) > 0.5
      ) {
        setFloorPlanData(null);
      }

      setIsDrawerOpen(true);
    } catch (err: any) {
      setErrorMessage(
        err.message || 'An unexpected error occurred during site feasibility analysis.'
      );
    } finally {
      setIsLoading(false);
      triggerMapResize();
    }
  };

  // Reset entire application
  const handleReset = () => {
    setRequest({
      latitude: 12.9716,
      longitude: 77.5946,
      built_up_area_sqft: 2000,
      quality_grade: 'standard',
      building_typology: 'residential_single',
      floors: 1,
      ai_provider: 'mock',
    });
    setHasLocation(true);
    setAnalysisData(null);
    setSiteVisionData(null);
    setFloorPlanData(null);
    setOverrideLandRate(null);
    setOverridePlotArea(null);
    setErrorMessage(null);
    setIsDrawerOpen(true);
    setIsMobileControlOpen(false);
    setIsMobileResultsOpen(false);
    setIsWarningDismissed(false);
    triggerMapResize();
  };

  // Dismiss telemetry notice
  const handleDismissWarning = () => {
    setIsWarningDismissed(true);
    triggerMapResize();
  };

  // Restore telemetry notice from header badge
  const handleRestoreWarning = () => {
    setIsWarningDismissed(false);
    triggerMapResize();
  };

  // Reusable Results Content Renderer
  const renderResultsContent = () => {
    if (isLoading) {
      return <LoadingSkeleton />;
    }

    if (analysisData) {
      const currentEffectiveRate =
        overrideLandRate !== null
          ? overrideLandRate
          : analysisData.land_value?.indicative_rate_per_sqft ?? null;

      const currentPlotArea =
        overridePlotArea !== null
          ? overridePlotArea
          : analysisData.land_value?.plot_area_sqft ?? 0;

      const currentLandCost =
        currentEffectiveRate !== null && currentEffectiveRate > 0 && currentPlotArea > 0
          ? Math.round(currentEffectiveRate * currentPlotArea)
          : analysisData.land_value?.land_cost_inr ?? null;

      const currentCombinedTotal =
        currentLandCost !== null
          ? analysisData.cost_estimate.total_estimated_cost_inr + currentLandCost
          : null;

      const reportPayload: ReportRequestPayload = {
        analysis_data: {
          ...analysisData,
          land_value: analysisData.land_value
            ? {
                ...analysisData.land_value,
                indicative_rate_per_sqft: currentEffectiveRate,
                plot_area_sqft: currentPlotArea,
                land_cost_inr: currentLandCost,
                combined_project_total_inr: currentCombinedTotal,
                is_user_override:
                  overrideLandRate !== null ||
                  overridePlotArea !== null ||
                  analysisData.land_value.is_user_override,
              }
            : undefined,
        },
        site_vision: siteVisionData ?? null,
        floor_plan: floorPlanData ?? null,
      };

      return (
        <div className="@container w-full min-w-0 space-y-3.5 animate-fade-in">
          {/* Panel Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-[var(--hairline)] min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Icon name="shield-check" size={16} className="text-[var(--text-1)] shrink-0" />
              <h2 className="text-[14px] font-semibold text-[var(--text-1)] tracking-tight truncate">
                Land Suitability Assessment
              </h2>
            </div>
            <button
              type="button"
              onClick={handleCopyRef}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[12px] font-mono text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors cursor-pointer select-none shrink-0"
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

          {/* Sticky iOS Segmented Control */}
          <div className="sticky top-0 z-20 py-1.5 bg-[var(--panel)]/95 backdrop-blur-md border-b border-[var(--hairline)]">
            <div className="bg-[var(--fill)] rounded-[10px] p-[2px] grid grid-cols-4 gap-1 text-[12px] font-medium select-none">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'hazards', label: 'Hazards' },
                { id: 'ecology', label: 'Ecology' },
                { id: 'cost_plan', label: 'Cost & Plan' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id as ResultsTab)}
                  className={`py-1.5 px-1 rounded-[8px] text-[11px] sm:text-[12px] text-center transition-all truncate cursor-pointer ${
                    activeResultsTab === tab.id
                      ? 'bg-[var(--segmented-active-bg)] text-[var(--segmented-active-label)] font-semibold shadow-[var(--segmented-active-shadow)]'
                      : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content Mapping with 200ms Fade/Slide */}
          <div key={activeResultsTab} className="animate-tab-switch space-y-3 pt-0.5">
            {activeResultsTab === 'overview' && (
              <>
                {/* 1. ScoreSummaryCard hero */}
                <ScoreSummaryCard data={analysisData} />

                {/* 2. Top 3 FactorBreakdown rows */}
                <FactorBreakdown factors={analysisData.factors} limit={3} />

                {/* 3. RecommendationPanel summary */}
                <RecommendationPanel
                  summary={analysisData.engineering_summary}
                  recommendations={analysisData.detailed_recommendations}
                  recommendationItems={analysisData.recommendation_items}
                  aiMetadata={analysisData.ai_metadata}
                  parameterReflection={analysisData.parameter_reflection}
                  summaryOnly={true}
                />

                {/* 4. Download Vector PDF Report */}
                <DownloadReportButton payload={reportPayload} />
              </>
            )}

            {activeResultsTab === 'hazards' && (
              <>
                {/* HazardProfileCard sections */}
                {analysisData.hazard_profile && (
                  <HazardProfileCard hazard={analysisData.hazard_profile} />
                )}

                {/* Risk Mitigation Matrix */}
                <RiskMatrix risks={analysisData.risks} />

                {/* Consolidated Data Sources & Standards */}
                <DataSourcesDisclosure category="hazards" />
              </>
            )}

            {activeResultsTab === 'ecology' && (
              <>
                {/* Ecological Site Vision & Tree Preservation */}
                <SiteVisionCard
                  data={siteVisionData}
                  isLoading={isSiteVisionLoading}
                  onScan={handleRunSiteVision}
                  hasCoordinates={hasLocation}
                />

                {/* Passive Orientation Compass */}
                <OrientationCompass orientation={analysisData.orientation} />

                {/* Vastu & Functional Planning Advisory */}
                {analysisData.vastu_advisory && (
                  <VastuAdvisoryCard advisory={analysisData.vastu_advisory} />
                )}

                {/* Consolidated Data Sources & Standards */}
                <DataSourcesDisclosure category="ecology" />
              </>
            )}

            {activeResultsTab === 'cost_plan' && (
              <>
                {/* Cost Breakdown Table */}
                <CostBreakdownTable costEstimate={analysisData.cost_estimate} />

                {/* Indicative Land Value & Combined Project Total */}
                {analysisData.land_value && (
                  <LandValueCard
                    landValue={analysisData.land_value}
                    civilTotalCostInr={analysisData.cost_estimate.total_estimated_cost_inr}
                    onOverrideChange={(rate, area) => {
                      setOverrideLandRate(rate);
                      setOverridePlotArea(area);
                    }}
                  />
                )}

                {/* Generative Floor Plan Engine */}
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
                  onFloorPlanGenerated={(plan) => setFloorPlanData(plan)}
                />
              </>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="@container w-full min-w-0">
        <EmptyState />
      </div>
    );
  };

  return (
    <div
      className="h-screen w-screen relative overflow-hidden select-text text-[var(--text-1)] antialiased font-sans"
      style={{ '--map-controls-right': isDrawerOpen ? '384px' : '16px' } as React.CSSProperties}
    >
      {/* ========================================================================= */}
      {/* LAYER 0: FULL-BLEED MAP CANVAS (Edge-to-edge background, no inset/frame)  */}
      {/* ========================================================================= */}
      <section
        id="center-map-section"
        className="fixed inset-0 w-full h-full overflow-hidden z-0 pointer-events-auto"
      >
        <MapCanvas
          latitude={hasLocation ? request.latitude : null}
          longitude={hasLocation ? request.longitude : null}
          orientationDegrees={analysisData?.orientation.optimal_axis_degrees}
          plinthAreaSqFt={request.built_up_area_sqft}
          onLocationSelect={handleLocationSelect}
          invalidateTrigger={leafletResizeTrigger}
          entranceDirection={analysisData?.vastu_advisory?.ranked_entrances?.[0]?.direction}
          treeClusters={siteVisionData?.tree_clusters}
          waterBodies={siteVisionData?.water_bodies}
          theme={theme}
          className="w-full h-full"
        />
      </section>

      {/* ========================================================================= */}
      {/* LAYER 1: FLOATING TOP TOOLBAR (Vibrancy, 12px insets, 52px tall, r-16)    */}
      {/* ========================================================================= */}
      <AppHeader
        backendConnected={backendConnected}
        activeAiProvider={request.ai_provider}
        serverStatus={serverStatus}
        onOpenMethodology={() => setIsMethodologyOpen(true)}
        onReset={handleReset}
        warnings={warnings}
        isWarningDismissed={isWarningDismissed}
        onRestoreWarning={handleRestoreWarning}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        isMobileControlOpen={isMobileControlOpen}
        onToggleMobileControl={() => {
          setIsMobileControlOpen((prev) => !prev);
          if (!isMobileControlOpen) setIsMobileResultsOpen(false);
        }}
        isMobileResultsOpen={isMobileResultsOpen}
        onToggleMobileResults={() => {
          setIsMobileResultsOpen((prev) => !prev);
          if (!isMobileResultsOpen) setIsMobileControlOpen(false);
        }}
        hasResults={Boolean(analysisData)}
      />

      {/* Floating Single-Line Dismissible Telemetry Notice */}
      {warnings.length > 0 && !isWarningDismissed && (
        <div className="fixed top-[72px] left-3 right-3 lg:left-[364px] lg:right-[384px] z-[1001] pointer-events-auto">
          <TelemetryStrip
            warnings={warnings}
            isDismissed={isWarningDismissed}
            onDismiss={handleDismissWarning}
          />
        </div>
      )}

      {/* Floating AI Engine Fallback Toast */}
      {fallbackToast && (
        <div className="fixed top-[114px] left-3 right-3 lg:left-[364px] lg:right-[384px] z-[1001] pointer-events-auto animate-fade-in">
          <div
            role="alert"
            className="vibrancy-panel rounded-[12px] border border-[var(--semantic-amber)]/50 bg-[var(--surface)] text-[var(--semantic-amber)] px-3.5 py-2.5 text-[12px] flex items-center justify-between gap-3 shadow-lg"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Icon name="alert-triangle" size={14} className="text-[var(--semantic-amber)] shrink-0" />
              <span className="font-semibold shrink-0 uppercase tracking-[0.08em] text-[11px]">
                Notice:
              </span>
              <span className="text-[var(--text-1)] font-medium text-[12px]">
                {fallbackToast}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFallbackToast(null)}
              className="text-[var(--text-3)] hover:text-[var(--text-1)] p-1 rounded-[6px] transition-colors shrink-0 cursor-pointer"
              title="Dismiss notice"
              aria-label="Dismiss notice"
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LAYER 2: LEFT FLOATING CONTROL PANEL (340px, top 76px, bottom 12px, r-20) */}
      {/* ========================================================================= */}
      <aside
        className={`fixed left-3 top-[76px] w-[340px] max-w-[calc(100vw-24px)] h-fit max-h-[calc(100vh-88px)] rounded-[20px] vibrancy-panel z-[1000] overflow-y-auto overflow-x-clip scrollbar-apple p-4 space-y-4 pointer-events-auto border border-[var(--panel-border-color)] shadow-xl @container transition-transform duration-300 ease-in-out ${
          isMobileControlOpen ? 'max-lg:translate-x-0' : 'max-lg:hidden'
        }`}
      >
        {/* Mobile Header with Close action */}
        <div className="flex lg:hidden items-center justify-between border-b border-[var(--hairline)] pb-2 mb-1">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-1)]">
            <Icon name="sliders" size={14} className="text-[var(--accent)]" />
            <span>Site Parameters</span>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileControlOpen(false)}
            className="w-7 h-7 rounded-[8px] bg-[var(--fill)] text-[var(--text-2)] hover:text-[var(--text-1)] flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close parameters panel"
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        {/* System Error Banner */}
        <ErrorBanner errorMessage={errorMessage} onDismiss={() => setErrorMessage(null)} />

        {/* Coordinates Input Card */}
        <CoordinatesInput
          latitude={hasLocation ? request.latitude : null}
          longitude={hasLocation ? request.longitude : null}
          formattedAddress={analysisData?.formatted_address}
          onCoordinatesChange={handleLocationSelect}
          onClear={handleClearLocation}
        />

        {/* Parameters Form with Submit Action */}
        <AnalysisForm
          request={request}
          isLoading={isLoading}
          hasCoordinates={hasLocation}
          onChange={handleRequestChange}
          onSubmit={handleRunAnalysis}
        />
      </aside>

      {/* ========================================================================= */}
      {/* LAYER 3: DESKTOP DRAWER TOGGLE BUTTON                                      */}
      {/* ========================================================================= */}
      <div
        className="hidden lg:block fixed top-[76px] map-controls-anchor z-[1000] pointer-events-auto"
      >
        <button
          ref={drawerToggleBtnRef}
          type="button"
          onClick={() => {
            const next = !isDrawerOpen;
            setIsDrawerOpen(next);
            setIsMobileResultsOpen(next);
            triggerMapResize();
          }}
          aria-expanded={isDrawerOpen}
          aria-controls="results-drawer"
          aria-label={isDrawerOpen ? 'Close analysis panel' : 'Open analysis panel'}
          className="h-8 flex items-center gap-2 px-3 rounded-[12px] vibrancy-panel text-[12px] font-medium text-[var(--text-1)] border border-[var(--panel-border-color)] shadow-md hover:bg-[var(--fill)] transition-colors active:brightness-95 cursor-pointer select-none"
        >
          <Icon name="layers" size={14} className="text-[var(--accent)]" />
          <span>{isDrawerOpen ? (analysisData ? 'Hide Results' : 'Hide Panel') : (analysisData ? 'View Results' : 'View Panel')}</span>
          {analysisData && (
            <span className="font-mono font-semibold bg-[var(--accent-tint)] text-[var(--accent)] px-1.5 py-0.5 rounded-[6px] text-[11px] ml-0.5">
              {analysisData.overall_suitability_score.toFixed(1)}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* LAYER 4: RIGHT FLOATING RESULTS PANEL (360px, top 76px, h-fit, r-20)     */}
      {/* ========================================================================= */}
      <aside
        id="results-drawer"
        ref={resultsDrawerRef}
        role="region"
        aria-label="Analysis Results"
        onTransitionEnd={triggerMapResize}
        className={`fixed right-3 top-[76px] w-[360px] max-w-[calc(100vw-24px)] h-fit max-h-[calc(100vh-88px)] rounded-[20px] vibrancy-panel z-[1000] overflow-y-auto overflow-x-clip scrollbar-apple p-4 space-y-4 border border-[var(--panel-border-color)] shadow-xl @container transition-all duration-300 ease-in-out ${
          isDrawerOpen
            ? 'translate-x-0 opacity-100 pointer-events-auto'
            : 'translate-x-full opacity-0 pointer-events-none'
        } ${
          isMobileResultsOpen
            ? 'max-lg:translate-x-0 max-lg:opacity-100 max-lg:pointer-events-auto'
            : 'max-lg:translate-x-full max-lg:opacity-0 max-lg:pointer-events-none max-lg:hidden'
        }`}
      >
        {/* Mobile Header with Close action */}
        <div className="flex lg:hidden items-center justify-between border-b border-[var(--hairline)] pb-2 mb-1">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-1)]">
            <Icon name="layers" size={14} className="text-[var(--accent)]" />
            <span>Feasibility Results</span>
          </div>
          <button
            ref={drawerCloseBtnRef}
            type="button"
            onClick={() => {
              setIsMobileResultsOpen(false);
              setIsDrawerOpen(false);
            }}
            className="w-7 h-7 rounded-[8px] bg-[var(--fill)] text-[var(--text-2)] hover:text-[var(--text-1)] flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close results panel"
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        {/* Results Body */}
        {renderResultsContent()}
      </aside>

      {/* Engineering Methodology Reference Dialog (z-[2000]) */}
      <MethodologyModal
        isOpen={isMethodologyOpen}
        onClose={() => setIsMethodologyOpen(false)}
      />
    </div>
  );
};

export default App;
