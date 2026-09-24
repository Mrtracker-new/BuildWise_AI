import type { AnalysisRequest, AnalysisResponse } from './types';
import { env } from '../config/env';

export interface BackendStatus {
  status: string;
  groq: boolean;
  gemini: boolean;
  default_provider: string;
}

/**
 * Checks server health and which LLM providers have API keys configured
 */
export async function fetchBackendStatus(): Promise<BackendStatus> {
  const resp = await fetch(`${env.VITE_API_URL}/api/status`);
  if (!resp.ok) {
    throw new Error(`Failed to fetch backend status: ${resp.status}`);
  }
  return resp.json();
}

export interface FeasibilityResult {
  data: AnalysisResponse;
  fallbackTriggered: boolean;
  fallbackReason?: string;
}

/**
 * Dispatches feasibility analysis request to the secure backend proxy
 */
export async function generateFeasibilityReport(
  request: AnalysisRequest,
  signal?: AbortSignal
): Promise<FeasibilityResult> {
  const resp = await fetch(`${env.VITE_API_URL}/api/analyze`, {
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

  const data: AnalysisResponse = await resp.json();
  const providerUsed = data.ai_metadata?.provider_used || '';
  const fallbackTriggered =
    request.ai_provider !== 'mock' && providerUsed.includes('mock_fallback');
  const fallbackReason = data.ai_metadata?.fallback_reason;

  return {
    data,
    fallbackTriggered,
    fallbackReason,
  };
}
