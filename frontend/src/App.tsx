import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { AnalysisRequest, AnalysisResponse } from './services/types';
import { fetchHealth, submitAnalysis } from './services/api';
import { AppHeader } from './components/AppHeader';
import { MapCanvas } from './components/MapCanvas';
import { CoordinatesInput } from './components/CoordinatesInput';
import { AnalysisForm } from './components/AnalysisForm';
import { ScoreSummaryCard } from './components/ScoreSummaryCard';
import { HazardProfileCard } from './components/HazardProfileCard';
import { FactorBreakdown } from './components/FactorBreakdown';
import { OrientationCompass } from './components/OrientationCompass';
import { VastuAdvisoryCard } from './components/VastuAdvisoryCard';
import { CostBreakdownTable } from './components/CostBreakdownTable';
import { LandValueCard } from './components/LandValueCard';
import { RiskMatrix } from './components/RiskMatrix';
import { RecommendationPanel } from './components/RecommendationPanel';
import { DownloadReportButton } from './components/DownloadReportButton';
import { TelemetryStrip, ErrorBanner } from './components/StatusBanner';
import { EmptyState } from './components/EmptyState';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { MethodologyModal } from './components/MethodologyModal';
import { Icon } from './components/Icon';

export const App: React.FC = () => {
  // Application Parameters State
  const [request, setRequest] = useState<AnalysisRequest>({
    latitude: 12.9716, // Default to Bengaluru Urban, India
    longitude: 77.5946,
    built_up_area_sqft: 2000,
    quality_grade: 'standard',
    building_typology: 'residential_single',
    floors: 1,
    ai_provider: 'mock',
    ground_coverage_ratio: 0.60,
  });

  const [hasLocation, setHasLocation] = useState<boolean>(true);
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null);
  const [overrideLandRate, setOverrideLandRate] = useState<number | null>(null);
  const [overridePlotArea, setOverridePlotArea] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState<boolean>(false);
  const [activeAiProvider, setActiveAiProvider] = useState<string>('mock');
  const [isMethodologyOpen, setIsMethodologyOpen] = useState<boolean>(false);

  // Telemetry Warnings State
  const [isWarningDismissed, setIsWarningDismissed] = useState<boolean>(false);
  const [testWarnings, setTestWarnings] = useState<string[] | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__setTestWarnings = (w: string[] | null) => setTestWarnings(w);
    }
  }, []);

  // Responsive Drawer State (for viewports between 1024px and 1535px)
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [leafletResizeTrigger, setLeafletResizeTrigger] = useState<number>(0);

  // Accessibility Refs for Drawer Focus Trap/Return
  const drawerToggleBtnRef = useRef<HTMLButtonElement>(null);
  const drawerCloseBtnRef = useRef<HTMLButtonElement>(null);
  const prevDrawerOpenRef = useRef<boolean>(false);

  const warnings = testWarnings !== null ? testWarnings : (analysisData?.warnings || []);

  // Invalidate Leaflet helper
  const triggerMapResize = useCallback(() => {
    setLeafletResizeTrigger((prev) => prev + 1);
  }, []);

  // Initial Health Check
  useEffect(() => {
    fetchHealth()
      .then((res) => {
        setBackendConnected(res.status === 'healthy');
        setActiveAiProvider(res.active_default_ai);
      })
      .catch(() => {
        setBackendConnected(false);
      });
  }, []);

  // Focus management for Responsive Drawer
  useEffect(() => {
    if (isDrawerOpen && !prevDrawerOpenRef.current) {
      // Drawer opened: move focus to close button
      const timer = setTimeout(() => {
        drawerCloseBtnRef.current?.focus();
        triggerMapResize();
      }, 50);
      return () => clearTimeout(timer);
    } else if (!isDrawerOpen && prevDrawerOpenRef.current) {
      // Drawer closed: return focus to toggle button
      drawerToggleBtnRef.current?.focus();
      const timer = setTimeout(() => {
        triggerMapResize();
      }, 50);
      return () => clearTimeout(timer);
    }
    prevDrawerOpenRef.current = isDrawerOpen;
  }, [isDrawerOpen, triggerMapResize]);

  // Keyboard navigation: Escape key closes drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawerOpen) {
        setIsDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen]);

  // Coordinate changes from map click or input
  const handleLocationSelect = (lat: number, lon: number) => {
    setRequest((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lon,
    }));
    setHasLocation(true);
  };

  const handleClearLocation = () => {
    setHasLocation(false);
    setAnalysisData(null);
    setErrorMessage(null);
    setIsDrawerOpen(false);
  };

  const handleRequestChange = (updated: Partial<AnalysisRequest>) => {
    setRequest((prev) => ({ ...prev, ...updated }));
  };

  // Run Feasibility Analysis
  const handleRunAnalysis = async () => {
    if (!hasLocation) {
      setErrorMessage('Please select a site location on the map before analyzing.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setIsWarningDismissed(false);

    // On 1024px - 1535px, open the drawer so results/skeleton are immediately visible
    setIsDrawerOpen(true);

    try {
      const response = await submitAnalysis(request);
      setAnalysisData(response);
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
    setErrorMessage(null);
    setIsDrawerOpen(false);
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
      const currentEffectiveRate = overrideLandRate !== null
        ? overrideLandRate
        : (analysisData.land_value?.indicative_rate_per_sqft ?? null);

      const currentPlotArea = overridePlotArea !== null
        ? overridePlotArea
        : (analysisData.land_value?.plot_area_sqft ?? 0);

      const currentLandCost = currentEffectiveRate !== null && currentEffectiveRate > 0 && currentPlotArea > 0
        ? Math.round(currentEffectiveRate * currentPlotArea)
        : (analysisData.land_value?.land_cost_inr ?? null);

      const currentCombinedTotal = currentLandCost !== null
        ? analysisData.cost_estimate.total_estimated_cost_inr + currentLandCost
        : null;

      const reportPayload: AnalysisResponse = {
        ...analysisData,
        land_value: analysisData.land_value
          ? {
              ...analysisData.land_value,
              indicative_rate_per_sqft: currentEffectiveRate,
              plot_area_sqft: currentPlotArea,
              land_cost_inr: currentLandCost,
              combined_project_total_inr: currentCombinedTotal,
              is_user_override: overrideLandRate !== null || overridePlotArea !== null || analysisData.land_value.is_user_override,
            }
          : undefined,
      };

      return (
        <div className="@container w-full min-w-0 space-y-4 animate-fade-in">
          {/* 1. Scorecard - Always first element visible */}
          <ScoreSummaryCard data={analysisData} />

          {/* 2. Hazard History & Climate Stress Profile */}
          {analysisData.hazard_profile && (
            <HazardProfileCard hazard={analysisData.hazard_profile} />
          )}

          {/* 3. Factor Breakdown Bars */}
          <FactorBreakdown factors={analysisData.factors} />

          {/* 4. Passive Orientation Compass */}
          <OrientationCompass orientation={analysisData.orientation} />

          {/* 5. Vastu & Functional Planning Advisory */}
          {analysisData.vastu_advisory && (
            <VastuAdvisoryCard advisory={analysisData.vastu_advisory} />
          )}

          {/* 6. Cost Breakdown Table */}
          <CostBreakdownTable costEstimate={analysisData.cost_estimate} />

          {/* 7. Indicative Land Value & Combined Project Total */}
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

          {/* 8. Risk Mitigation Matrix */}
          <RiskMatrix risks={analysisData.risks} />

          {/* 9. Engineering Commentary & Traceable Recommendations */}
          <RecommendationPanel
            summary={analysisData.engineering_summary}
            recommendations={analysisData.detailed_recommendations}
            recommendationItems={analysisData.recommendation_items}
            aiMetadata={analysisData.ai_metadata}
          />

          {/* 10. Download Vector PDF Report */}
          <DownloadReportButton analysisData={reportPayload} />
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
    <div className="min-h-screen lg:h-screen flex flex-col bg-slate-50 text-slate-800 antialiased overflow-x-clip overflow-y-auto lg:overflow-hidden select-text w-full max-w-full min-w-0">
      {/* 64px Header */}
      <AppHeader
        backendConnected={backendConnected}
        activeAiProvider={activeAiProvider}
        onOpenMethodology={() => setIsMethodologyOpen(true)}
        onReset={handleReset}
        warnings={warnings}
        isWarningDismissed={isWarningDismissed}
        onRestoreWarning={handleRestoreWarning}
      />

      {/* Single-Line Dismissible Telemetry Notice Strip */}
      <TelemetryStrip
        warnings={warnings}
        isDismissed={isWarningDismissed}
        onDismiss={handleDismissWarning}
      />

      {/* ========================================================================= */}
      {/* DESKTOP WORKSPACE (lg: and 2xl:) - Independent Scroll Rails, Full Bleed    */}
      {/* ========================================================================= */}
      <div className="hidden lg:grid grid-cols-[380px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)_460px] flex-1 min-h-0 w-full overflow-hidden relative">
        {/* Left Rail: Coordinates & Project Parameters ONLY (No Results) */}
        <aside className="w-[380px] h-full min-h-0 overflow-y-auto overflow-x-clip overscroll-contain p-4 space-y-4 border-r border-slate-200 bg-slate-50/70 shrink-0 @container">
          {/* System Error Banner */}
          <ErrorBanner
            errorMessage={errorMessage}
            onDismiss={() => setErrorMessage(null)}
          />

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

        {/* Center Fluid: Full-bleed Leaflet Map */}
        <section id="center-map-section" className="min-w-0 h-full relative z-0 overflow-hidden flex flex-col flex-1">
          <MapCanvas
            latitude={hasLocation ? request.latitude : null}
            longitude={hasLocation ? request.longitude : null}
            orientationDegrees={analysisData?.orientation.optimal_axis_degrees}
            plinthAreaSqFt={request.built_up_area_sqft}
            onLocationSelect={handleLocationSelect}
            invalidateTrigger={leafletResizeTrigger}
            entranceDirection={analysisData?.vastu_advisory?.ranked_entrances?.[0]?.direction}
            className="w-full h-full"
          />

          {/* Toggle Button for Results Drawer (Active between 1024px and 1535px) */}
          <div className="2xl:hidden absolute top-3 left-3 z-30">
            <button
              ref={drawerToggleBtnRef}
              type="button"
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              aria-expanded={isDrawerOpen}
              aria-controls="results-drawer"
              aria-label={isDrawerOpen ? 'Close analysis results' : 'Open analysis results'}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-900/90 hover:bg-slate-900 text-white rounded-md shadow-md text-xs font-medium backdrop-blur-sm transition-all border border-slate-800"
            >
              <Icon name="layers" size={15} className="text-sky-400" />
              <span>{isDrawerOpen ? 'Hide Results' : 'View Results'}</span>
              {analysisData && (
                <span className="font-mono font-semibold bg-sky-500/30 text-sky-200 border border-sky-400/40 px-1.5 py-0.5 rounded text-[11px] ml-0.5">
                  {analysisData.overall_suitability_score.toFixed(1)}
                </span>
              )}
            </button>
          </div>

          {/* Slide-over Results Drawer for 1024px - 1535px */}
          <div
            id="results-drawer"
            role="region"
            aria-label="Analysis Results"
            onTransitionEnd={triggerMapResize}
            className={`2xl:hidden absolute top-0 right-0 bottom-0 w-[460px] max-w-[85vw] bg-slate-50 border-l border-slate-200 z-40 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
              isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {/* Drawer Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Icon name="layers" size={16} className="text-slate-800" />
                <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                  Analysis Results
                </h3>
              </div>
              <button
                ref={drawerCloseBtnRef}
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded hover:bg-slate-100 transition-colors focus:outline-none focus:ring-1 focus:ring-slate-400"
                title="Close results drawer (Esc)"
                aria-label="Close results drawer"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            {/* Drawer Body (Independently Scrollable) */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-clip overscroll-contain p-4 space-y-4 @container">
              {renderResultsContent()}
            </div>
          </div>
        </section>

        {/* Right Rail: Results Display on 2xl (1536px and wider) */}
        <aside className="hidden 2xl:block w-[460px] h-full min-h-0 overflow-y-auto overflow-x-clip overscroll-contain p-4 space-y-4 border-l border-slate-200 bg-slate-50/70 shrink-0 @container">
          {renderResultsContent()}
        </aside>
      </div>

      {/* ========================================================================= */}
      {/* MOBILE / TABLET STACKED VIEW (< 1024px) - Document Scrolls Vertically    */}
      {/* ========================================================================= */}
      <div className="lg:hidden flex flex-col p-3 sm:p-4 gap-4 w-full min-w-0 @container">
        {/* Error Banner */}
        <ErrorBanner
          errorMessage={errorMessage}
          onDismiss={() => setErrorMessage(null)}
        />

        {/* 1. Controls: Coordinates & Form */}
        <CoordinatesInput
          latitude={hasLocation ? request.latitude : null}
          longitude={hasLocation ? request.longitude : null}
          formattedAddress={analysisData?.formatted_address}
          onCoordinatesChange={handleLocationSelect}
          onClear={handleClearLocation}
        />

        <AnalysisForm
          request={request}
          isLoading={isLoading}
          hasCoordinates={hasLocation}
          onChange={handleRequestChange}
          onSubmit={handleRunAnalysis}
        />

        {/* 2. Interactive Map (Explicit height h-[60vh] in stacked mode) */}
        <section className="h-[60vh] min-h-[380px] rounded-lg border border-slate-200 overflow-hidden shadow-sm">
          <MapCanvas
            latitude={hasLocation ? request.latitude : null}
            longitude={hasLocation ? request.longitude : null}
            orientationDegrees={analysisData?.orientation.optimal_axis_degrees}
            plinthAreaSqFt={request.built_up_area_sqft}
            onLocationSelect={handleLocationSelect}
            invalidateTrigger={leafletResizeTrigger}
            entranceDirection={analysisData?.vastu_advisory?.ranked_entrances?.[0]?.direction}
            className="w-full h-full"
          />
        </section>

        {/* 3. Results Section */}
        <section className="space-y-4 w-full min-w-0 @container">
          {renderResultsContent()}
        </section>
      </div>

      {/* Engineering Methodology Reference Dialog */}
      <MethodologyModal
        isOpen={isMethodologyOpen}
        onClose={() => setIsMethodologyOpen(false)}
      />
    </div>
  );
};

export default App;
