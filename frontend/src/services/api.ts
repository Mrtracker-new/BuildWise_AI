import type {
  AnalysisRequest,
  AnalysisResponse,
  HealthResponse,
  SiteVisionRequest,
  SiteVisionResponse,
  FloorPlanRequest,
  FloorPlanResponse,
  ReportRequestPayload,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function fetchHealth(): Promise<HealthResponse> {
  const resp = await fetch(`${API_BASE_URL}/api/health`);
  if (!resp.ok) {
    throw new Error(`Health check failed with status: ${resp.status}`);
  }
  return resp.json();
}

export async function submitAnalysis(
  request: AnalysisRequest,
  signal?: AbortSignal
): Promise<AnalysisResponse> {
  const resp = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Analysis request failed with status: ${resp.status}`);
  }

  return resp.json();
}

export async function submitSiteVision(
  request: SiteVisionRequest,
  signal?: AbortSignal
): Promise<SiteVisionResponse> {
  const resp = await fetch(`${API_BASE_URL}/api/site-vision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Site vision request failed with status: ${resp.status}`);
  }

  return resp.json();
}

export async function generateFloorPlan(
  request: FloorPlanRequest,
  signal?: AbortSignal
): Promise<FloorPlanResponse> {
  const resp = await fetch(`${API_BASE_URL}/api/generate-floorplan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Floor plan generation failed with status: ${resp.status}`);
  }

  return resp.json();
}

export async function downloadPdfReport(
  payloadOrAnalysis: ReportRequestPayload | AnalysisResponse,
  floorplanData?: FloorPlanResponse | null
): Promise<void> {
  const isUnified = 'analysis_data' in payloadOrAnalysis;
  const analysisData = isUnified ? payloadOrAnalysis.analysis_data : payloadOrAnalysis;
  const siteVision = isUnified
    ? (payloadOrAnalysis.site_vision ?? null)
    : (payloadOrAnalysis.site_vision ?? null);
  const floorPlan = isUnified
    ? (payloadOrAnalysis.floor_plan ?? null)
    : (floorplanData ?? payloadOrAnalysis.floorplan ?? null);

  const requestBody = {
    analysis_data: analysisData,
    site_vision: siteVision,
    floor_plan: floorPlan,
  };

  const resp = await fetch(`${API_BASE_URL}/api/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!resp.ok) {
    let errorDetail = `Report generation failed with status: ${resp.status}`;
    try {
      const errData = await resp.json();
      if (errData?.detail) errorDetail = errData.detail;
    } catch {
      // ignore json parse error
    }
    throw new Error(errorDetail);
  }

  const blob = await resp.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  const lat = analysisData.coordinates?.latitude != null ? analysisData.coordinates.latitude.toFixed(2) : '0.00';
  const lon = analysisData.coordinates?.longitude != null ? analysisData.coordinates.longitude.toFixed(2) : '0.00';
  link.download = `BuildWise_Report_${lat}_${lon}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);
}
