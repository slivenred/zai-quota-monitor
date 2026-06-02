/**
 * Z.ai API Client
 *
 * Queries three Z.ai monitoring endpoints:
 * - /api/monitor/usage/quota/limit    → Quota percentages + reset times
 * - /api/monitor/usage/model-usage    → Token/call counts (24h window)
 * - /api/monitor/usage/tool-usage     → MCP tool counts (24h window)
 *
 * Zero runtime dependencies — uses Node.js built-in https module.
 */

import * as https from 'node:https';
import type {
  ApiQuotaResponse,
  ApiModelUsageResponse,
  ApiToolUsageResponse,
  ApiQuotaLimitItem,
  QuotaLimit,
  ModelUsage,
  ToolUsage,
  UsageData,
} from '../types';

// ============================================================================
// Constants
// ============================================================================

const API_BASE = 'https://api.z.ai';
const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_ACCEPT_LANGUAGE = 'en-US,en;q=0.9';

const ENDPOINTS = {
  quotaLimit: `${API_BASE}/api/monitor/usage/quota/limit`,
  modelUsage: `${API_BASE}/api/monitor/usage/model-usage`,
  toolUsage: `${API_BASE}/api/monitor/usage/tool-usage`,
} as const;

// ============================================================================
// Helpers
// ============================================================================

/** Format date as yyyy-MM-dd HH:mm:ss */
function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Build 24-hour rolling time window query params */
function buildTimeWindowParams(): string {
  const now = new Date();
  const start = new Date(
    now.getFullYear(), now.getMonth(), now.getDate() - 1,
    now.getHours(), 0, 0, 0
  );
  const end = new Date(
    now.getFullYear(), now.getMonth(), now.getDate(),
    now.getHours(), 59, 59, 999
  );
  return `startTime=${encodeURIComponent(fmtDate(start))}&endTime=${encodeURIComponent(fmtDate(end))}`;
}

/** Make an HTTPS GET request and return parsed JSON */
function makeRequest(
  url: string,
  authToken: string,
  queryParams?: string,
  acceptLanguage = DEFAULT_ACCEPT_LANGUAGE,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const fullPath = queryParams
      ? `${parsed.pathname}?${queryParams}`
      : parsed.pathname;

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 443,
      path: fullPath,
      method: 'GET',
      headers: {
        'Authorization': authToken,  // NO "Bearer" prefix for Z.ai
        'Accept-Language': acceptLanguage,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON response`));
        }
      });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.on('error', (err: Error) => reject(err));
    req.end();
  });
}

// ============================================================================
// Response Processing
// ============================================================================

/** Classify a raw quota limit item into a labeled QuotaLimit */
function classifyLimit(item: ApiQuotaLimitItem): QuotaLimit {
  let label: QuotaLimit['type'];
  let displayLabel: string;

  if (item.type === 'TIME_LIMIT') {
    label = 'mcp';
    displayLabel = 'Monthly MCP Usage';
  } else if (item.periodType === 'WEEKLY') {
    label = 'weekly';
    displayLabel = 'Weekly Token Quota';
  } else {
    label = 'token';
    displayLabel = '5-hour Token Quota';
  }

  return {
    label: displayLabel,
    type: label,
    percentage: typeof item.percentage === 'number' ? item.percentage : 0,
    currentValue: item.currentValue,
    total: item.total ?? item.usage,
    nextResetTime: item.nextResetTime ? new Date(item.nextResetTime) : undefined,
    usageDetails: item.usageDetails,
  };
}

/** Process raw API responses into a unified UsageData object */
function processResponses(
  quotaRes: ApiQuotaResponse | null,
  modelRes: ApiModelUsageResponse | null,
  toolRes: ApiToolUsageResponse | null,
): UsageData {
  // -- Quota limits --
  const quotas: QuotaLimit[] = [];
  if (quotaRes?.data?.limits && Array.isArray(quotaRes.data.limits)) {
    for (const item of quotaRes.data.limits) {
      quotas.push(classifyLimit(item));
    }
  }

  // -- Model usage --
  let modelUsage: ModelUsage | null = null;
  const mu = modelRes?.data?.totalUsage ?? (modelRes as Record<string, unknown>)?.totalUsage;
  if (mu && typeof mu === 'object') {
    const m = mu as Record<string, unknown>;
    modelUsage = {
      totalTokens: typeof m.totalTokensUsage === 'number' ? m.totalTokensUsage : 0,
      totalCalls: typeof m.totalModelCallCount === 'number' ? m.totalModelCallCount : 0,
    };
  }

  // -- Tool usage --
  let toolUsage: ToolUsage | null = null;
  const tu = toolRes?.data?.totalUsage ?? (toolRes as Record<string, unknown>)?.totalUsage;
  if (tu && typeof tu === 'object') {
    const t = tu as Record<string, unknown>;
    toolUsage = {
      networkSearches: typeof t.totalNetworkSearchCount === 'number' ? t.totalNetworkSearchCount : 0,
      webReads: typeof t.totalWebReadMcpCount === 'number' ? t.totalWebReadMcpCount : 0,
      zreadCalls: typeof t.totalZreadMcpCount === 'number' ? t.totalZreadMcpCount : 0,
    };
  }

  return {
    quotas,
    modelUsage,
    toolUsage,
    planName: quotaRes?.data?.planName as string | undefined,
    fetchedAt: new Date(),
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Fetch all usage data from Z.ai.
 *
 * Tries direct token auth first; on 401, falls back to Bearer format.
 * Individual endpoint failures are caught gracefully — only partial data is returned.
 */
export async function fetchUsage(apiKey: string, acceptLanguage = DEFAULT_ACCEPT_LANGUAGE): Promise<UsageData> {
  const timeParams = buildTimeWindowParams();

  // Fire all three requests in parallel; catch individually
  const [quotaRes, modelRes, toolRes] = await Promise.all([
    makeRequest(ENDPOINTS.quotaLimit, apiKey, undefined, acceptLanguage)
      .then(r => r as ApiQuotaResponse)
      .catch(() => null),
    makeRequest(ENDPOINTS.modelUsage, apiKey, timeParams, acceptLanguage)
      .then(r => r as ApiModelUsageResponse)
      .catch(() => null),
    makeRequest(ENDPOINTS.toolUsage, apiKey, timeParams, acceptLanguage)
      .then(r => r as ApiToolUsageResponse)
      .catch(() => null),
  ]);

  // If all three failed, the API key is likely invalid
  if (!quotaRes && !modelRes && !toolRes) {
    throw new Error('All API requests failed. Please check your API key.');
  }

  return processResponses(quotaRes, modelRes, toolRes);
}

/**
 * Fetch raw API responses for debugging.
 */
export async function fetchRawResponses(
  apiKey: string,
  acceptLanguage = DEFAULT_ACCEPT_LANGUAGE,
): Promise<Record<string, unknown>> {
  const timeParams = buildTimeWindowParams();

  const [quota, model, tool] = await Promise.all([
    makeRequest(ENDPOINTS.quotaLimit, apiKey, undefined, acceptLanguage).catch(e => ({ error: String(e) })),
    makeRequest(ENDPOINTS.modelUsage, apiKey, timeParams, acceptLanguage).catch(e => ({ error: String(e) })),
    makeRequest(ENDPOINTS.toolUsage, apiKey, timeParams, acceptLanguage).catch(e => ({ error: String(e) })),
  ]);

  return {
    quotaLimit: quota,
    modelUsage: model,
    toolUsage: tool,
    timeWindow: {
      params: timeParams,
      fetchedAt: new Date().toISOString(),
    },
  };
}
