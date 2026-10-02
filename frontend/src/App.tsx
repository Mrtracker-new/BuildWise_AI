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
import { FactorBreakdown } from './components/FactorBreakdown';
import { ReportSheet, type ResultsTab } from './components/ReportSheet';
import { TelemetryStrip, ErrorBanner } from './components/StatusBanner';
import { EmptyState } from './components/EmptyState';
import { SiteMoveDialog } from './components/SiteMoveDialog';
import { AnalysisHUD } from './components/AnalysisHUD';
import { DesignProvider, ToastViewport, ShortcutsSheet, useShortcuts } from './design';
import { CaptureSheet, type CaptureStep } from './components/map/CaptureSheet';
import { BoundaryChip } from './components/map/BoundaryChip';
import { SitePreviewHUD } from './components/map/SitePreviewHUD';
import { useSitePreview } from './hooks/useSitePreview';
import type { SharedBoundaryState } from './services/siteBoundary';
import { boundaryToSummaryPayload } from './services/siteIntelligence';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { MethodologyModal } from './components/MethodologyModal';
import { Icon } from './components/Icon';

const PIPELINE_STAGES = [
  'Geocoding site address...',
  'Querying USGS seismic catalogs...',
  'Analyzing GloFAS river discharge...',
  'Computing bioclimatic axis...',
  'Scanning Sentinel-2 canopy...',
  'Building CPWD cost model...',
  'Synthesizing report...',
] as const;

const AppShell: React.FC = () => {
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
  // ======== Single-source site boundary + capture wizard state ========
  const [boundary, setBoundary] = useState<SharedBoundaryState | null>(null);
  const [captureOpen, setCaptureOpen] = useState<boolean>(false);
  const [captureStep, setCaptureStep] = useState<CaptureStep>('locate');
  const mapInstanceRef = useRef<MaplibreMap | null>(null);

  // Deterministic site preview (overlay + HUD) whenever a boundary exists.
  const [previewDismissed, setPreviewDismissed] = useState<boolean>(false);
  const getMapInstance = useCallback((): MaplibreMap | null => mapInstanceRef.current, []);
  const {
    preview: sitePreview,
    loading: previewLoading,
    error: previewError,
    dismiss: dismissPreview,
  } = useSitePreview({
    getMap: getMapInstance,
    boundary,
    enabled: !captureOpen && !previewDismissed,
  });
  const handleDismissPreview = useCallback((): void => {
    setPreviewDismissed(true);
    dismissPreview();
  }, [dismissPreview]);

  // Capture wizard opens on the trace step when a boundary already exists (Edit).
  const openCapture = useCallback((step: CaptureStep = 'trace') => {
    setCaptureStep(boundary ? step : 'locate');
    setCaptureOpen(true);
  }, [boundary]);
  const handleBoundaryCommit = useCallback((b: SharedBoundaryState) => {
    setBoundary(b);
    setPreviewDismissed(false); // new boundary re-arms the preview
    setCaptureOpen(false);
  }, []);
  // Deep-link from the generator card ("Edit on map").
  useEffect(() => {
    const onEditRequest = (): void => openCapture('trace');
    window.addEventListener('bw:edit-boundary', onEditRequest);
    return () => window.removeEventListener('bw:edit-boundary', onEditRequest);
  }, [openCapture]);

  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const handleResetRef = useRef<(() => void) | null>(null);

  // Global keyboard shortcuts (T/M/R/?); Escape closes the shortcuts sheet.
  useShortcuts((action) => {
    switch (action) {
      case 'toggleTheme':
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
        break;
      case 'resetApp':
        handleResetRef.current?.();
        break;
      case 'toggleShortcuts':
        setIsShortcutsOpen((prev) => !prev);
        break;
      case 'openMapStyles':
        window.dispatchEvent(new CustomEvent('bw:open-map-styles'));
        break;
    }
  });

  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null);
  const [overrideLandRate, setOverrideLandRate] = useState<number | null>(null);
  const [overridePlotArea, setOverridePlotArea] = useState<number | null>(null);
  const [siteVisionData, setSiteVisionData] = useState<SiteVisionResponse | null>(null);
  const [floorPlanData, setFloorPlanData] = useState<FloorPlanResponse | null>(null);
  const [isSiteVisionLoading, setIsSiteVisionLoading] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentStageIndex, setCurrentStageIndex] = useState<number>(0);
  const [hudFallbackMessage, setHudFallbackMessage] = useState<string | null>(null);
  const [cancelToast, setCancelToast] = useState<string | null>(null);
  /** Shown after a pin move carried the captured plot to the new site. */
  const [siteMovedNotice, setSiteMovedNotice] = useState<boolean>(false);
  /**
   * Site move awaiting a decision. With a plot already captured, moving the pin
   * must not silently re-meaning the boundary: the coordinates are held here
   * until the user chooses (take the plot / re-capture / keep as-is).
   */
  const [pendingSiteMove, setPendingSiteMove] = useState<{ lat: number; lon: number } | null>(null);
  /** Bumped to re-sync the coordinate inputs with the app's actual coordinates. */
  const [coordinatesSyncKey, setCoordinatesSyncKey] = useState<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
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
  const [mapResizeTrigger, setMapResizeTrigger] = useState<number>(0);

  // Telemetry Warnings State
  const [isWarningDismissed, setIsWarningDismissed] = useState<boolean>(false);
  const [testWarnings, setTestWarnings] = useState<string[] | null>(null);

  // Accessibility Refs for Drawer Focus Trap/Return
  const drawerToggleBtnRef = useRef<HTMLButtonElement>(null);
  const drawerCloseBtnRef = useRef<HTMLButtonElement>(null);
  const prevDrawerOpenRef = useRef<boolean>(false);
  const resultsDrawerRef = useRef<HTMLElement>(null);

  // Segmented Tabs State: 'overview' | 'hazards' | 'ecology' | 'cost_plan'
  const [activeResultsTab, setActiveResultsTab] = useState<ResultsTab>('overview');
  const [copiedRef, setCopiedRef] = useState<boolean>(false);

  // Full-Screen Report Sheet State
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const openReportCtaRef = useRef<HTMLButtonElement>(null);

  const handleOpenReport = useCallback(() => {
    setIsReportOpen(true);
    if (typeof window !== 'undefined' && window.location.hash !== '#report') {
      window.history.pushState(null, '', '#report');
    }
  }, []);

  const handleCloseReport = useCallback(() => {
    setIsReportOpen(false);
    if (typeof window !== 'undefined' && window.location.hash === '#report') {
      window.history.pushState(null, '', window.location.pathname + window.location.search);
    }
    setTimeout(() => {
      openReportCtaRef.current?.focus();
    }, 50);
  }, []);

  // Single-source the #report hash:
  // - page load with '#report' AND existing results -> reopen sheet
  // - load with '#report' and NO results -> strip hash silently
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.location.hash === '#report') {
      if (analysisData) {
        setIsReportOpen(true);
      } else {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        setIsReportOpen(false);
      }
    }
  }, [analysisData]);

  // Browser back/forward navigation sync
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleHashChange = () => {
      if (window.location.hash === '#report') {
        if (analysisData) {
          setIsReportOpen(true);
        } else {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          setIsReportOpen(false);
        }
      } else {
        setIsReportOpen(false);
      }
    };
  handleResetRef.current = handleReset;

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [analysisData]);

  // Cycle pipeline stages during analysis
  useEffect(() => {
    if (!isLoading) return;

    const interval = setInterval(() => {
      setCurrentStageIndex((prev) => {
        if (prev < PIPELINE_STAGES.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 700);

    return () => {
      clearInterval(interval);
      setCurrentStageIndex(0);
    };
  }, [isLoading]);

  // Auto-dismiss cancel toast
  useEffect(() => {
    if (!siteMovedNotice) return;
    const timer = setTimeout(() => setSiteMovedNotice(false), 4500);
    return () => clearTimeout(timer);
  }, [siteMovedNotice]);

  useEffect(() => {
    if (!cancelToast) return;
    const timer = setTimeout(() => setCancelToast(null), 3000);
    return () => clearTimeout(timer);
  }, [cancelToast]);

  const handleCancelAnalysis = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setHudFallbackMessage(null);
    setCurrentStageIndex(0);
    setCancelToast('Analysis cancelled');
    if (typeof window !== 'undefined' && window.location.hash === '#report') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setIsReportOpen(false);
  }, []);

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

  // Invalidate map helper
  const triggerMapResize = useCallback(() => {
    setMapResizeTrigger((prev) => prev + 1);
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

  /**
   * Invalidate everything that described the previous site: the analysis, the
   * generated plan, site vision, the report modal and the preview dismissal.
   * (STALE-STATE RULE - these results are location-specific.)
   */
  const invalidateSiteResults = useCallback((): void => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setHudFallbackMessage(null);
    setErrorMessage(null);
    setSiteVisionData(null);
    setAnalysisData(null);
    setFloorPlanData(null);
    setIsReportOpen(false);
    setPreviewDismissed(false);
    if (typeof window !== 'undefined' && window.location.hash === '#report') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  /** Commit a site move: move the pin (and, when chosen, the captured plot). */
  const applySiteMove = useCallback(
    (lat: number, lon: number, withPlot: boolean): void => {
      invalidateSiteResults();
      setRequest((prev) => ({ ...prev, latitude: lat, longitude: lon }));
      setHasLocation(true);
      if (withPlot && boundary) {
        // The boundary is anchored to the pin: same traced shape, new origin.
        setBoundary({ ...boundary, origin: { lat, lon } });
        setSiteMovedNotice(true);
      }
    },
    [boundary, invalidateSiteResults]
  );

  // Coordinate changes from map click or input.
  // With a plot already captured, the move is NOT applied until the user says
  // what should happen to it (see SiteMoveDialog) - otherwise the pin, the
  // boundary and the overlays could describe different sites at once.
  const handleLocationSelect = useCallback(
    (lat: number, lon: number) => {
      if (boundary) {
        setPendingSiteMove({ lat, lon });
        return;
      }
      applySiteMove(lat, lon, false);
    },
    [boundary, applySiteMove]
  );

  const handleSiteMoveApply = useCallback((): void => {
    if (!pendingSiteMove) return;
    applySiteMove(pendingSiteMove.lat, pendingSiteMove.lon, true);
    setPendingSiteMove(null);
  }, [pendingSiteMove, applySiteMove]);

  const handleSiteMoveRecapture = useCallback((): void => {
    if (!pendingSiteMove) return;
    invalidateSiteResults();
    setRequest((prev) => ({ ...prev, latitude: pendingSiteMove.lat, longitude: pendingSiteMove.lon }));
    setHasLocation(true);
    setBoundary(null);
    setPendingSiteMove(null);
    openCapture('locate');
  }, [pendingSiteMove, invalidateSiteResults, openCapture]);

  const handleSiteMoveCancel = useCallback((): void => {
    setPendingSiteMove(null);
    // The typed coordinates were never applied: put the inputs back in sync.
    setCoordinatesSyncKey((k) => k + 1);
  }, []);

  const handleClearLocation = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setHudFallbackMessage(null);
    setPendingSiteMove(null);
    setSiteMovedNotice(false);
    setHasLocation(false);
    setAnalysisData(null);
    setSiteVisionData(null);
    setFloorPlanData(null);
    setBoundary(null);
    setErrorMessage(null);
    setIsDrawerOpen(false);
    setIsMobileResultsOpen(false);
    setIsReportOpen(false);
    if (typeof window !== 'undefined' && window.location.hash === '#report') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  const handleRequestChange = (updated: Partial<AnalysisRequest>) => {
    setRequest((prev) => ({ ...prev, ...updated }));
    // Do not clear floorPlanData on parameter changes (floors, typology, area, coverage)
    // so the stale-plan guard can display the "Parameters changed - regenerate" indicator.
    if (updated.latitude !== undefined || updated.longitude !== undefined) {
      setFloorPlanData(null);
    }
  };

  // Run Satellite Vision Analysis
  const handleRunSiteVision = async (
    modeOverride?: 'segformer' | 'index-only',
    signal?: AbortSignal
  ) => {
    if (!hasLocation) return;
    setIsSiteVisionLoading(true);
    try {
      const resp = await submitSiteVision({
        latitude: request.latitude,
        longitude: request.longitude,
        plot_area_sqft: overridePlotArea ?? (analysisData?.land_value?.plot_area_sqft ?? 2000),
        mode_override: modeOverride,
        orientation_deg: analysisData?.orientation?.optimal_axis_degrees ?? undefined,
      }, signal);
      setSiteVisionData(resp);
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        return;
      }
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

    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setCurrentStageIndex(0);
    setHudFallbackMessage(null);
    setErrorMessage(null);
    setFallbackToast(null);
    setIsWarningDismissed(false);

    // Open results on desktop drawer and mobile
    setIsDrawerOpen(true);
    setIsMobileResultsOpen(true);
    setIsMobileControlOpen(false);
    setActiveResultsTab('overview');

    // Concurrently trigger site vision scan with signal
    handleRunSiteVision(undefined, controller.signal);

    try {
      // Carry the map-captured boundary (server re-validates; null
      // keeps the legacy request shape byte-comparable).
      const analyzeRequest = {
        ...request,
        boundary: boundary ? boundaryToSummaryPayload(boundary) : null,
      };
      const { data: response, fallbackTriggered } = await generateFeasibilityReport(
        analyzeRequest,
        controller.signal
      );

      if (fallbackTriggered) {
        setHudFallbackMessage('AI unreachable - using deterministic engine');
        await new Promise((resolve) => setTimeout(resolve, 1200));
        setFallbackToast('AI Engine unreachable, falling back to deterministic mock.');
      }

      setAnalysisData(response);

      // Freshness guarantee: Clear any prior floorPlanData to eliminate stale blueprint retention and cross-run bleed
      setFloorPlanData(null);

      setIsDrawerOpen(true);
      // Auto-open ReportSheet on success
      handleOpenReport();
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        // Analysis cancelled by user
        return;
      }
      setErrorMessage(
        err.message || 'An unexpected error occurred during site feasibility analysis.'
      );
    } finally {
      setIsLoading(false);
      setHudFallbackMessage(null);
      abortControllerRef.current = null;
      triggerMapResize();
    }
  };

  // Reset entire application
  const handleReset = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setHudFallbackMessage(null);
    setCurrentStageIndex(0);
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
    setIsReportOpen(false);
    if (typeof window !== 'undefined' && window.location.hash === '#report') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
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

  // Derived report payload for export and sheet
  const currentEffectiveRate =
    overrideLandRate !== null
      ? overrideLandRate
      : analysisData?.land_value?.indicative_rate_per_sqft ?? null;

  const currentPlotArea =
    overridePlotArea !== null
      ? overridePlotArea
      : analysisData?.land_value?.plot_area_sqft ?? 0;

  const currentLandCost =
    currentEffectiveRate !== null && currentEffectiveRate > 0 && currentPlotArea > 0
      ? Math.round(currentEffectiveRate * currentPlotArea)
      : analysisData?.land_value?.land_cost_inr ?? null;

  const currentCombinedTotal =
    currentLandCost !== null && analysisData
      ? analysisData.cost_estimate.total_estimated_cost_inr + currentLandCost
      : null;

  const reportPayload: ReportRequestPayload | null = analysisData
    ? {
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
      }
    : null;

  // Reusable Results Content Renderer (Summary Preview Only)
  const renderResultsContent = () => {
    if (isLoading) {
      return (
        <div className="w-full min-w-0">
          <div className="vibrancy-panel rounded-[14px] p-3.5 border border-[var(--panel-border-color)] flex items-center gap-3 shadow-sm">
            <div className="ios-spinner-16 shrink-0" aria-hidden="true" />
            <span className="text-[13px] text-[var(--text-2)] font-medium truncate">
              {hudFallbackMessage || PIPELINE_STAGES[currentStageIndex]}
            </span>
          </div>
        </div>
      );
    }

    if (analysisData) {
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

          {/* Score Hero Card (Clicking hero triggers open report) */}
          <ScoreSummaryCard
            data={analysisData}
            variant="panel"
            onClickHero={handleOpenReport}
          />

          {/* Top 3 Factor Breakdown Rows */}
          <FactorBreakdown factors={analysisData.factors} limit={3} />

          {/* ONE Primary CTA: "Open Full Report" */}
          <button
            ref={openReportCtaRef}
            type="button"
            onClick={handleOpenReport}
            className="w-full h-10 rounded-[12px] bg-[var(--accent)] hover:brightness-[0.98] active:brightness-95 text-white text-[13px] font-semibold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer select-none"
          >
            <span>Open Full Report</span>
            <Icon name="arrow-up-right" size={16} />
          </button>
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
          invalidateTrigger={mapResizeTrigger}
          entranceDirection={analysisData?.vastu_advisory?.ranked_entrances?.[0]?.direction}
          treeClusters={siteVisionData?.tree_clusters}
          waterBodies={siteVisionData?.water_bodies}
          theme={theme}
          hideMassing={captureOpen || boundary !== null}
          hideSiteEstimate={boundary !== null}
          maxZoom={captureOpen || boundary !== null ? 20 : 18}
          onMapReady={(map) => {
            mapInstanceRef.current = map;
          }}
          className="w-full h-full"
        />

        {/* Map-first capture wizard + boundary chip (hosted inside the map section) */}
        <CaptureSheet
          open={captureOpen}
          step={captureStep}
          onStepChange={setCaptureStep}
          boundary={boundary}
          pin={{ lat: request.latitude, lon: request.longitude }}
          onPinChange={handleLocationSelect}
          onCommit={handleBoundaryCommit}
          onCancel={() => setCaptureOpen(false)}
          getMap={() => mapInstanceRef.current}
        />
        <div className="absolute bottom-16 left-3 lg:left-[364px] z-[999] pointer-events-auto flex items-center gap-2">
          <BoundaryChip boundary={boundary} onEdit={() => openCapture('trace')} />
        </div>

        {/* Deterministic site preview overlay + measurement HUD */}
        <SitePreviewHUD
          preview={sitePreview}
          loading={previewLoading}
          error={previewError}
          onDismiss={handleDismissPreview}
          onEditBoundary={boundary ? () => openCapture('trace') : undefined}
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
          key={`coords-${coordinatesSyncKey}`}
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
          hasCoordinates={hasLocation && boundary !== null}
          onChange={handleRequestChange}
          onSubmit={handleRunAnalysis}
          onRequestCapture={() => openCapture('locate')}
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

      {/* Floating Centered iOS Analysis HUD (Over Map Area) */}
      {isLoading && (
        <div
          className={`fixed inset-0 z-[1050] pointer-events-none flex items-center justify-center transition-all duration-300 ${
            isDrawerOpen ? 'lg:pl-[364px] lg:pr-[384px]' : 'lg:pl-[364px] lg:pr-0'
          }`}
        >
          <AnalysisHUD
            stageText={hudFallbackMessage || PIPELINE_STAGES[currentStageIndex]}
            stageIndex={currentStageIndex}
            totalStages={PIPELINE_STAGES.length}
            fallbackMessage={hudFallbackMessage}
            onCancel={handleCancelAnalysis}
          />
        </div>
      )}

      <SiteMoveDialog
        open={pendingSiteMove !== null}
        target={pendingSiteMove}
        onMove={handleSiteMoveApply}
        onRecapture={handleSiteMoveRecapture}
        onCancel={handleSiteMoveCancel}
      />

      {/* Site moved: the captured plot travelled with the pin */}
      {siteMovedNotice && (
        <div
          data-testid="site-moved-notice"
          className="fixed top-[72px] left-1/2 -translate-x-1/2 z-[1050] pointer-events-none animate-fade-in"
        >
          <div className="vibrancy-pill px-4 py-2 rounded-full text-[13px] font-medium text-[var(--text-1)] flex items-center gap-2 shadow-lg border border-[var(--panel-border-color)] max-w-[92vw]">
            <Icon name="map-pin" size={14} className="text-[var(--accent)] shrink-0" />
            <span>
              Plot moved with the pin - re-run the analysis for this location.
            </span>
          </div>
        </div>
      )}

      {/* Analysis Cancelled / System Toast */}
      {cancelToast && (
        <div className="fixed top-[72px] left-1/2 -translate-x-1/2 z-[1050] pointer-events-auto animate-fade-in">
          <div className="vibrancy-pill px-4 py-2 rounded-full text-[13px] font-medium text-[var(--text-1)] flex items-center gap-2 shadow-lg border border-[var(--panel-border-color)]">
            <Icon name="info" size={14} className="text-[var(--accent)]" />
            <span>{cancelToast}</span>
          </div>
        </div>
      )}

      {/* Engineering Methodology Reference Dialog (z-[2000]) */}
      <MethodologyModal
        isOpen={isMethodologyOpen}
        onClose={() => setIsMethodologyOpen(false)}
      />

      {/* Full-Screen Report Sheet (z-[2000]) */}
      {analysisData && (
        <ReportSheet
          isOpen={isReportOpen}
          onClose={handleCloseReport}
          analysisData={analysisData}
          analysisRequest={request}
          sharedBoundary={boundary}
          siteVisionData={siteVisionData}
          isSiteVisionLoading={isSiteVisionLoading}
          onRunSiteVision={handleRunSiteVision}
          hasLocation={hasLocation}
          floorPlanData={floorPlanData}
          onFloorPlanGenerated={(plan) => setFloorPlanData(plan)}
          overrideLandRate={overrideLandRate}
          overridePlotArea={overridePlotArea}
          onOverrideChange={(rate, area) => {
            setOverrideLandRate(rate);
            setOverridePlotArea(area);
          }}
          reportPayload={reportPayload!}
          activeTab={activeResultsTab}
          onTabChange={setActiveResultsTab}
        />
      )}

      {/* Design system: keyboard shortcuts sheet + toast viewport */}
      <ShortcutsSheet open={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
      <ToastViewport />
    </div>
  );
};

export const App: React.FC = () => (
  <DesignProvider>
    <AppShell />
  </DesignProvider>
);

export default App;
