import type { AnalysisRequest, AnalysisResponse, HealthResponse } from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function fetchHealth(): Promise<HealthResponse> {
  const resp = await fetch(`${API_BASE_URL}/api/health`);
  if (!resp.ok) {
    throw new Error(`Health check failed with status: ${resp.status}`);
  }
  return resp.json();
}

export async function submitAnalysis(request: AnalysisRequest): Promise<AnalysisResponse> {
  const resp = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Analysis request failed with status: ${resp.status}`);
  }

  return resp.json();
}

export async function downloadPdfReport(analysisData: AnalysisResponse): Promise<void> {
  const resp = await fetch(`${API_BASE_URL}/api/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ analysis_data: analysisData }),
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
