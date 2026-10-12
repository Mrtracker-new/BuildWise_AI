import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type {
  AnalysisParams,
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
import { ReportHeroHeader } from './components/report/ReportHeroHeader';
import { ProvenanceFactorCard } from './components/report/ProvenanceFactorCard';
import { ReportSheet, type ResultsTab } from './components/ReportSheet';
import { TelemetryStrip, ErrorBanner } from './components/StatusBanner';
import { EmptyState } from './components/EmptyState';
import { SiteMoveDialog } from './components/SiteMoveDialog';
import { AnalysisHUD } from './components/AnalysisHUD';
import { DesignProvider, ToastViewport, ShortcutsSheet, useShortcuts, Drawer, useTier, useViewportClass, useCompactAuthoring, useDesign, mapControlsRight } from './design';
import { UnitsProvider } from './components/report/units';
import { AssistedBar } from './components/AssistedBar';
import { isAssistedNoticeSessionDismissed, dismissAssistedNoticeForSession } from './services/sessionPrefs';
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

/** Where the site is. One pair of numbers, one owner — see `siteLocation`. */
export interface SiteLocation {
  latitude: number;
  longitude: number;
}

/** The app's default site (Bengaluru Urban), used until a link or a click moves it. */
const DEFAULT_SITE: SiteLocation = { latitude: 12.9716, longitude: 77.5946 };

/**
 * Parse a shared-site deep link written by handleCopyLink (`/app?lat=&lon=`).
 * Returns coordinates only when BOTH params are present, numeric, and in range —
 * a malformed or partial link falls back to the default site, never a broken map.
 */
function parseSiteDeepLink(search: string): SiteLocation | null {
  const params = new URLSearchParams(search);
  const latRaw = params.get('lat');
  const lonRaw = params.get('lon');
  if (latRaw === null || lonRaw === null) return null;
  if (latRaw.trim() === '' || lonRaw.trim() === '') return null;
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { latitude: lat, longitude: lon };
}

const AppShell: React.FC = () => {
  // Theme State: 'light' | 'dark'
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Shared-site deep link (/app?lat=&lon=) parsed once and applied to the
  // INITIAL state before first render, so MapCanvas mounts already centered on the
  // linked site (its instance effect creates the map exactly once).
  const deepLinkSite = useMemo(
    () => parseSiteDeepLink(window.location.search),
    []
  );
  // Application Parameters State (no coordinates: the site owns those)
  const [request, setRequest] = useState<AnalysisParams>(() => ({
    built_up_area_sqft: 2000,
    quality_grade: 'standard',
    building_typology: 'residential_single',
    floors: 1,
    ai_provider: 'groq',
    ground_coverage_ratio: 0.6,
  }));

  // ======== Single-source site boundary + capture wizard state ========
  const [boundary, setBoundary] = useState<SharedBoundaryState | null>(null);

  /** The pin, owned by setSite. Only ever the site when no plot exists. */
  const [site, setSite] = useState<SiteLocation | null>(() => deepLinkSite ?? DEFAULT_SITE);

  /**
   * THE site location — one value pair, one owner, no second copy to drift.
   *
   * A captured plot OWNS the site through its own origin (the pin the ring was
   * traced around), so the map pin, the coordinate card, the share link and
   * every request body read the same numbers and a plot can never describe a
   * different place than the pin drawn beside it. Without a plot the pin owns
   * the site; with neither, the app has no site to analyse.
   */
  const siteLocation = useMemo<SiteLocation | null>(
    () =>
      boundary
        ? { latitude: boundary.origin.lat, longitude: boundary.origin.lon }
        : site,
    [boundary, site]
  );
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

  // Responsive foundation: live capability tier + viewport class.
  const tier = useTier();
  const viewportClass = useViewportClass();
  // ASSISTED mode: narrow viewport (<768px) OR coarse primary pointer.
  // All capabilities stay available; precision authoring is assisted, not exact.
  const compactAuthoring = useCompactAuthoring();
  const [assistedNoticeDismissed, setAssistedNoticeDismissed] = useState<boolean>(
    () => isAssistedNoticeSessionDismissed()
  );
  // Design context: toast API for clipboard confirmations.
  const { pushToast } = useDesign();

  // Mobile Panels State (<1024px)
  const [isMobileControlOpen, setIsMobileControlOpen] = useState<boolean>(false);
  const [isMobileResultsOpen, setIsMobileResultsOpen] = useState<boolean>(false);

  // Capture wizard opens on the trace step when a boundary already exists (Edit).
  const openCapture = useCallback((step: CaptureStep = 'trace') => {
    setCaptureStep(boundary ? step : 'locate');
    setCaptureOpen(true);
    if (tier !== 'FULL') {
      setIsMobileControlOpen(false);
      setIsMobileResultsOpen(false);
    }
  }, [boundary, tier]);

  const handleBoundaryCommit = useCallback((b: SharedBoundaryState) => {
    setBoundary(b);
    // The pin follows the plot from here on: a committed boundary is the located
    // site, so the card, the map pin and the request bodies all read its origin.
    setSite({ latitude: b.origin.lat, longitude: b.origin.lon });
    setPreviewDismissed(false); // new boundary re-arms the preview
    setCaptureOpen(false);
    pushToast({ message: 'Site boundary saved · ready to analyze', tone: 'success' });
    if (tier !== 'FULL') {
      setIsMobileControlOpen(true);
    }
  }, [tier, pushToast]);

  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  // Confirm an honored shared-site deep link once per mount (StrictMode-safe).
  const deepLinkToastShown = useRef<boolean>(false);
  useEffect(() => {
    if (deepLinkSite && !deepLinkToastShown.current) {
      deepLinkToastShown.current = true;
      pushToast({ message: 'Opened shared site location', tone: 'success' });
    }
  }, [deepLinkSite, pushToast]);
  /** Soft dismissal only: continues this session, never blocks the map. */
  const handleAssistedContinue = useCallback((): void => {
    setAssistedNoticeDismissed(true);
    dismissAssistedNoticeForSession();
  }, []);
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
  /** Compact-tier panel triggers (focus return for the Drawer primitive). */
  const mobileControlToggleRef = useRef<HTMLButtonElement>(null);
  const mobileResultsToggleRef = useRef<HTMLButtonElement>(null);

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

  // Deep-link from the generator card ("Edit on map"): the capture sheet lives
  // in the map layer (z-0) while the report sheet is a modal (z-[2000]), so the
  // report must close first or the control looks inert - its target opens
  // underneath the sheet. Reuses the normal close path so the #report hash and
  // focus handling stay single-sourced.
  useEffect(() => {
    const onEditRequest = (): void => {
      handleCloseReport();
      openCapture('trace');
    };
    window.addEventListener('bw:edit-boundary', onEditRequest);
    return () => window.removeEventListener('bw:edit-boundary', onEditRequest);
  }, [handleCloseReport, openCapture]);

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

  /** Copy a shareable /app deep link (site coordinates). */
  const handleCopyLink = useCallback((): void => {
    // A link needs a site to point at; with no site there is nothing to share.
    if (!siteLocation) {
      pushToast({ message: 'No site location to share yet', tone: 'neutral' });
      return;
    }
    const params = new URLSearchParams();
    params.set('lat', siteLocation.latitude.toFixed(6));
    params.set('lon', siteLocation.longitude.toFixed(6));
    const url = `${window.location.origin}/app?${params.toString()}`;
    navigator.clipboard.writeText(url).then(
      () => pushToast({ message: 'Site link copied', tone: 'success' }),
      () => pushToast({ message: 'Copy failed — clipboard unavailable', tone: 'critical' })
    );
  }, [siteLocation, pushToast]);

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

  /**
   * THE only writer of the site location (plus clear/reset/commit below). Every
   * move — a map click, a typed coordinate, the site-move dialog — lands here, so
   * the pin and the plot can never end up describing two different places.
   */
  const applySiteMove = useCallback(
    (lat: number, lon: number, withPlot: boolean): void => {
      invalidateSiteResults();
      const target: SiteLocation = { latitude: lat, longitude: lon };
      setSite(target);
      if (withPlot && boundary) {
        // The boundary is anchored to the pin: same traced shape, new origin.
        setBoundary({ ...boundary, origin: { lat: target.latitude, lon: target.longitude } });
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
    (lat: number, lon: number, fromInput = false) => {
      if (boundary) {
        setPendingSiteMove({ lat, lon });
        if (tier !== 'FULL') {
          setIsMobileControlOpen(false);
        }
        return;
      }
      applySiteMove(lat, lon, false);
      if (fromInput) {
        if (tier !== 'FULL') {
          setIsMobileControlOpen(false);
        }
        openCapture('locate');
        pushToast({ message: 'Site located · ready to trace boundary', tone: 'neutral' });
      }
    },
    [boundary, applySiteMove, tier, openCapture, pushToast]
  );

  const handleSiteMoveApply = useCallback((): void => {
    if (!pendingSiteMove) return;
    applySiteMove(pendingSiteMove.lat, pendingSiteMove.lon, true);
    setPendingSiteMove(null);
  }, [pendingSiteMove, applySiteMove]);

  const handleSiteMoveRecapture = useCallback((): void => {
    if (!pendingSiteMove) return;
    invalidateSiteResults();
    setSite({ latitude: pendingSiteMove.lat, longitude: pendingSiteMove.lon });
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
    // Clearing drops the site itself, not just its display: nothing is left
    // behind for a later capture to silently anchor to.
    setSite(null);
    setAnalysisData(null);
    setSiteVisionData(null);
    setFloorPlanData(null);
    setBoundary(null);
    setCaptureOpen(false);
    setErrorMessage(null);
    setIsDrawerOpen(false);
    setIsMobileResultsOpen(false);
    setIsReportOpen(false);
    pushToast({ message: 'Location cleared', tone: 'neutral' });
    if (typeof window !== 'undefined' && window.location.hash === '#report') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  const handleRequestChange = (updated: Partial<AnalysisParams>) => {
    setRequest((prev) => ({ ...prev, ...updated }));
    // Do not clear floorPlanData on parameter changes (floors, typology, area, coverage)
    // so the stale-plan guard can display the "Parameters changed - regenerate" indicator.
    // Moving the site is not a parameter change: it goes through applySiteMove,
    // which invalidates the location-specific results itself.
  };

  // Run Satellite Vision Analysis
  const handleRunSiteVision = async (
    modeOverride?: 'segformer' | 'index-only',
    signal?: AbortSignal
  ) => {
    if (!siteLocation) return;
    setIsSiteVisionLoading(true);
    try {
      const resp = await submitSiteVision({
        latitude: siteLocation.latitude,
        longitude: siteLocation.longitude,
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
    if (!siteLocation) {
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
      // The site's coordinates come from `siteLocation` — the same value the map
      // pin and the coordinate card show, and the plot's own origin whenever a
      // plot exists. Nothing here reads a second copy.
      const analyzeRequest: AnalysisRequest = {
        ...request,
        latitude: siteLocation.latitude,
        longitude: siteLocation.longitude,
        // Carry the map-captured boundary (server re-validates; null
        // keeps the legacy request shape byte-comparable).
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
      built_up_area_sqft: 2000,
      quality_grade: 'standard',
      building_typology: 'residential_single',
      floors: 1,
      ai_provider: 'mock',
    });
    setSite(DEFAULT_SITE);
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

  // Captured plot area (m²) for the coverage control's live footprint cap.
  // A malformed boundary yields null rather than a wrong number.
  const boundaryAreaSqm = useMemo(() => {
    if (!boundary) return null;
    try {
      return boundaryToSummaryPayload(boundary).area_sqm;
    } catch {
      return null;
    }
  }, [boundary]);

  // ---- Compact-tier panel content (shared: desktop aside + compact Drawer) ----
  const controlsPanelBody = (
    <>
      {/* System Error Banner */}
      <ErrorBanner errorMessage={errorMessage} onDismiss={() => setErrorMessage(null)} />

      {/* Coordinates Input Card */}
      <CoordinatesInput
        key={`coords-${coordinatesSyncKey}`}
        latitude={siteLocation?.latitude ?? null}
        longitude={siteLocation?.longitude ?? null}
        formattedAddress={analysisData?.formatted_address}
        onCoordinatesChange={handleLocationSelect}
        onClear={handleClearLocation}
      />

      {/* Parameters Form with Submit Action */}
      <AnalysisForm
        request={request}
        isLoading={isLoading}
        /* The plot is the gate (STEP ZERO): a captured boundary always carries
           its own located origin, so there is no separate "has a pin" flag. */
        hasCoordinates={boundary !== null}
        onChange={handleRequestChange}
        onSubmit={handleRunAnalysis}
        onRequestCapture={() => openCapture('locate')}
        providerAvailability={serverStatus}
        boundaryAreaSqm={boundaryAreaSqm}
      />
    </>
  );

  // Map canvas resize after compact drawer open/close transitions.
  useEffect(() => {
    if (tier === 'FULL') return;
    const t = window.setTimeout(() => triggerMapResize(), 260);
    return () => window.clearTimeout(t);
  }, [isMobileControlOpen, isMobileResultsOpen, tier, triggerMapResize]);

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
          {/* Panel Header. Wrapping row: in the 360px panel the copy-ref pill
              used to squeeze the title into "Land Suitability Asses…", so the
              pill drops to its own line instead of truncating the heading. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pb-2.5 border-b border-[var(--hairline)] min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1 basis-[max-content]">
              <Icon name="shield-check" size={16} className="text-[var(--text-1)] shrink-0" />
              <h2 className="text-[14px] font-semibold text-[var(--text-1)] tracking-tight truncate">
                Land Suitability Assessment
              </h2>
            </div>
            <button
              type="button"
              onClick={handleCopyRef}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[12px] font-mono text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors cursor-pointer select-none shrink-0 ml-auto"
              title="Click to copy analysis reference ID"
            >
              <Icon
                name={copiedRef ? 'check' : 'copy'}
                size={12}
                className={copiedRef ? 'text-[var(--semantic-green-ink)]' : 'text-[var(--text-3)]'}
              />
              <span>{copiedRef ? 'Copied' : `Ref: ${analysisData.request_id.slice(0, 8)}`}</span>
            </button>
          </div>

          {/* Score Hero Card (Clicking hero triggers open report) */}
          <ReportHeroHeader
            data={analysisData}
            variant="compact"
            onClickHero={handleOpenReport}
          />

          {/* Top 3 Factor Breakdown Rows — same factor card as the report, so
              status badges and provenance are present in the sidebar too. */}
          <div className="rounded-[14px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-4 sm:p-[18px] space-y-3.5 w-full min-w-0">
            <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <Icon name="layers" size={15} className="text-[var(--text-2)] shrink-0" />
                <h3 className="text-[14px] font-semibold text-[var(--text-1)] tracking-tight">
                  Multi-Criteria Factor Breakdown
                </h3>
              </div>
              <span className="text-[12px] font-normal text-[var(--text-3)] shrink-0">
                MCDA model (Top 3)
              </span>
            </div>
            <div className="divide-y divide-[var(--hairline)]">
              {analysisData.factors.slice(0, 3).map((factor) => (
                <ProvenanceFactorCard
                  key={factor.factor_id}
                  factor={factor}
                  dataSources={analysisData.data_sources}
                  variant="compact"
                />
              ))}
            </div>
          </div>

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
      style={{ '--map-controls-right': mapControlsRight(isDrawerOpen, viewportClass) } as React.CSSProperties}
    >
      {/* ========================================================================= */}
      {/* LAYER 0: FULL-BLEED MAP CANVAS (Edge-to-edge background, no inset/frame)  */}
      {/* ========================================================================= */}
      <section
        id="center-map-section"
        className="fixed inset-0 w-full h-full overflow-hidden z-0 pointer-events-auto"
      >
        <MapCanvas
          latitude={siteLocation?.latitude ?? null}
          longitude={siteLocation?.longitude ?? null}
          orientationDegrees={analysisData?.orientation.optimal_axis_degrees}
          plinthAreaSqFt={request.built_up_area_sqft}
          onLocationSelect={
            captureOpen && (captureStep === 'trace' || captureStep === 'frontage')
              ? () => {}
              : handleLocationSelect
          }
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
          /* The wizard anchors its boundary at the pin, so it is only ever
             offered a LOCATED pin: after the coordinates are cleared, request
             still holds the old numbers, and anchoring a plot there would
             capture a site that neither the map nor the coordinate card shows.
             No pin means the wizard asks for one instead. */
          pin={
            siteLocation
              ? { lat: siteLocation.latitude, lon: siteLocation.longitude }
              : null
          }
          onPinChange={handleLocationSelect}
          onCommit={handleBoundaryCommit}
          onCancel={() => setCaptureOpen(false)}
          getMap={() => mapInstanceRef.current}
        />
        {/* Chip hidden while the capture sheet is open: the sheet carries the
            same live metrics (area / perimeter / vertices / frontage) and an
            overlapping chip would collide with the sheet on compact screens
            and leave a dead Edit control behind it. */}
        {!captureOpen && (
          <div className="absolute bottom-14 sm:bottom-16 left-2 sm:left-3 lg:left-[364px] z-[999] pointer-events-auto flex items-center gap-2 max-w-[calc(100vw-64px)]">
            <BoundaryChip boundary={boundary} onEdit={() => openCapture('trace')} />
          </div>
        )}

        {/* Deterministic site preview overlay + measurement HUD (also yields
            to the capture sheet so one owner holds the bottom band at a time) */}
        {!captureOpen && (
          <SitePreviewHUD
            preview={sitePreview}
            loading={previewLoading}
            error={previewError}
            onDismiss={handleDismissPreview}
            onEditBoundary={boundary ? () => openCapture('trace') : undefined}
          />
        )}
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
        headerControlToggleRef={mobileControlToggleRef}
        headerResultsToggleRef={mobileResultsToggleRef}
      />

      {/* Floating Single-Line Dismissible Telemetry Notice */}
      {warnings.length > 0 && !isWarningDismissed && (
        <div className="print-hide fixed top-[58px] sm:top-[72px] left-2 sm:left-3 right-2 sm:right-3 lg:left-[364px] lg:right-[384px] z-[1001] pointer-events-auto">
          <TelemetryStrip
            warnings={warnings}
            isDismissed={isWarningDismissed}
            onDismiss={handleDismissWarning}
          />
        </div>
      )}

      {/* Floating AI Engine Fallback Toast */}
      {fallbackToast && (
        <div className="print-hide fixed top-[98px] sm:top-[114px] left-2 sm:left-3 right-2 sm:right-3 lg:left-[364px] lg:right-[384px] z-[1001] pointer-events-auto animate-fade-in">
          <div
            role="alert"
            className="vibrancy-panel rounded-[12px] border border-[var(--semantic-amber)]/50 bg-[var(--surface)] text-[var(--semantic-amber-ink)] px-3.5 py-2.5 text-[12px] flex items-center justify-between gap-3 shadow-lg"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Icon name="alert-triangle" size={14} className="text-[var(--semantic-amber-ink)] shrink-0" />
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
      {/* Desktop (>=lg): persistent floating aside. Compact (<lg): Drawer.        */}
      {/* ========================================================================= */}
      <aside
        className={`fixed left-3 top-[76px] w-[340px] max-w-[calc(100vw-24px)] h-fit max-h-[calc(100vh-88px)] rounded-[20px] vibrancy-panel z-[1000] overflow-y-auto bw-scroll-pane overflow-x-clip scrollbar-apple p-4 space-y-4 pointer-events-auto border border-[var(--panel-border-color)] shadow-xl @container ${
          tier === 'FULL' ? '' : 'hidden'
        }`}
      >
        {/* Mobile Header with Close action */}
        <div className="flex lg:hidden items-center justify-between border-b border-[var(--hairline)] pb-2 mb-1">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-1)]">
            <Icon name="sliders" size={14} className="text-[var(--accent-ink)]" />
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

        {controlsPanelBody}
      </aside>

      {/* COMPACT/ADAPTIVE tier: parameters as an edge drawer with scrim,
          swipe/ESC dismiss and focus management. FULL tier keeps the
          persistent floating aside above. */}
      {tier !== 'FULL' && (
        <Drawer
          open={isMobileControlOpen}
          onClose={() => setIsMobileControlOpen(false)}
          side={viewportClass === 'md' ? 'right' : 'bottom'}
          label="Site Parameters"
          id="controls-drawer"
          returnFocusRef={mobileControlToggleRef}
          className="vibrancy-panel p-4 space-y-4 overflow-y-auto scrollbar-apple"
        >
          <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2 mb-1">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-1)]">
              <Icon name="sliders" size={14} className="text-[var(--accent-ink)]" />
              <span>Site Parameters</span>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileControlOpen(false)}
              className="w-8 h-8 rounded-[8px] bg-[var(--fill)] text-[var(--text-2)] hover:text-[var(--text-1)] flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Close parameters panel"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
          {controlsPanelBody}
        </Drawer>
      )}

      {/* ========================================================================= */}
      {/* LAYER 3.5: ASSISTED BAR (ASSISTED capability tier)                         */}
      {/* SOFT notice + copy-link — never blocks interaction; session-dismissed via  */}
      {/* "Continue"; yields to the capture wizard (chip/HUD precedent).             */}
      {/* ========================================================================= */}
      {!compactAuthoring || captureOpen ? null : (
        <AssistedBar
          noticeVisible={!assistedNoticeDismissed}
          onContinue={handleAssistedContinue}
          onCopyLink={handleCopyLink}
        />
      )}

      {/* ========================================================================= */}
      {/* LAYER 3: DESKTOP DRAWER TOGGLE BUTTON (FULL tier only)                     */}
      {/* ========================================================================= */}
      <div
        className={`${tier === 'FULL' ? '' : 'hidden'} fixed top-[76px] map-controls-anchor z-[1000] pointer-events-auto`}
      >
        <button
          ref={drawerToggleBtnRef}
          type="button"
          onClick={() => {
            const next = !isDrawerOpen;
            setIsDrawerOpen(next);
            triggerMapResize();
          }}
          aria-expanded={isDrawerOpen}
          aria-controls="results-drawer"
          aria-label={isDrawerOpen ? 'Close analysis panel' : 'Open analysis panel'}
          className="h-8 flex items-center gap-2 px-3 rounded-[12px] vibrancy-panel text-[12px] font-medium text-[var(--text-1)] border border-[var(--panel-border-color)] shadow-md hover:bg-[var(--fill)] transition-colors active:brightness-95 cursor-pointer select-none"
        >
          <Icon name="layers" size={14} className="text-[var(--accent-ink)]" />
          <span>{isDrawerOpen ? (analysisData ? 'Hide Results' : 'Hide Panel') : (analysisData ? 'View Results' : 'View Panel')}</span>
          {analysisData && (
            <span className="font-mono font-semibold bg-[var(--accent-tint)] text-[var(--accent-ink)] px-1.5 py-0.5 rounded-[6px] text-[11px] ml-0.5">
              {analysisData.overall_suitability_score.toFixed(1)}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* LAYER 4: RIGHT FLOATING RESULTS PANEL (360px, top 76px, h-fit, r-20)     */}
      {/* Desktop (>=lg): slide-in floating aside. Compact (<lg): Drawer.          */}
      {/* ========================================================================= */}
      {tier === 'FULL' && (
        <aside
          id="results-drawer"
          ref={resultsDrawerRef}
          role="region"
          aria-label="Analysis Results"
          onTransitionEnd={triggerMapResize}
          className={`fixed right-3 top-[76px] w-[360px] max-w-[calc(100vw-24px)] h-fit max-h-[calc(100vh-88px)] rounded-[20px] vibrancy-panel z-[1000] overflow-y-auto bw-scroll-pane overflow-x-clip scrollbar-apple p-4 space-y-4 border border-[var(--panel-border-color)] shadow-xl @container transition-all duration-300 ease-in-out ${
            isDrawerOpen
              ? 'translate-x-0 opacity-100 pointer-events-auto'
              : 'translate-x-full opacity-0 pointer-events-none'
          }`}
        >
          {/* Results Body */}
          {renderResultsContent()}
        </aside>
      )}

      {/* COMPACT/ADAPTIVE tier: results as a drawer (bottom sheet on phones,
          edge drawer on tablets) with scrim + swipe/ESC dismiss. */}
      {tier !== 'FULL' && (
        <Drawer
          open={isMobileResultsOpen}
          onClose={() => {
            setIsMobileResultsOpen(false);
            setIsDrawerOpen(false);
          }}
          side={viewportClass === 'md' ? 'right' : 'bottom'}
          label="Analysis Results"
          id="results-drawer"
          returnFocusRef={mobileResultsToggleRef}
          className="vibrancy-panel p-4 space-y-4 overflow-y-auto scrollbar-apple"
        >
          <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2 mb-1">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-1)]">
              <Icon name="layers" size={14} className="text-[var(--accent-ink)]" />
              <span>Feasibility Results</span>
            </div>
            <button
              ref={drawerCloseBtnRef}
              type="button"
              onClick={() => {
                setIsMobileResultsOpen(false);
                setIsDrawerOpen(false);
              }}
              className="w-8 h-8 rounded-[8px] bg-[var(--fill)] text-[var(--text-2)] hover:text-[var(--text-1)] flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Close results panel"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
          {renderResultsContent()}
        </Drawer>
      )}

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
            <Icon name="map-pin" size={14} className="text-[var(--accent-ink)] shrink-0" />
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
            <Icon name="info" size={14} className="text-[var(--accent-ink)]" />
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
          hasLocation={siteLocation !== null}
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
    <UnitsProvider>
      <AppShell />
    </UnitsProvider>
  </DesignProvider>
);

export default App;
