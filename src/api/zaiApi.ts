/**
 * Z.ai API Client
 *
 * Queries three Z.ai monitoring endpoints:
 * - /api/monitor/usage/quota/limit    → Quota percentages + reset times
 * - /api/monitor/usage/model-usage    → Token/call counts (24h window)
 * - /api/monitor/usage/tool-usage     → MCP tool counts (24h window)
 *
 * Zero runtime dependencies — uses Node.js built-in https module.
 *
 * The API key is sent verbatim in the Authorization header (Z.ai expects
 * no "Bearer" prefix). Failures reject with ZaiApiError so callers can
 * distinguish auth / timeout / network / HTTP problems.
 */

import * as https from 'node:https';
import type {
  ApiQuotaResponse,
  ApiModelUsageResponse,
  ApiToolUsageResponse,
  ApiQuotaLimitItem,
  EndpointError,
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
/** Hard wall-clock deadline so a stalled response can never hang a request. */
const REQUEST_DEADLINE_MS = REQUEST_TIMEOUT_MS + 5000;
const DEFAULT_ACCEPT_LANGUAGE = 'en-US,en;q=0.9';

const ENDPOINTS = {
  quotaLimit: `${API_BASE}/api/monitor/usage/quota/limit`,
  modelUsage: `${API_BASE}/api/monitor/usage/model-usage`,
  toolUsage: `${API_BASE}/api/monitor/usage/tool-usage`,
} as const;

// ============================================================================
// Errors
// ============================================================================

export type ApiErrorKind = 'auth' | 'http' | 'network' | 'timeout' | 'parse';

export class ZaiApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly statusCode?: number,
    /** Underlying system error code (ECONNRESET, ETIMEDOUT, ...) for logs. */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ZaiApiError';
  }
}

/** Normalize any thrown value into a ZaiApiError. */
function toApiError(err: unknown): ZaiApiError {
  if (err instanceof ZaiApiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const code = typeof (err as { code?: unknown })?.code === 'string'
    ? (err as { code: string }).code
    : undefined;
  if (/timed?[\s-]?out/i.test(message)) {
    return new ZaiApiError('timeout', message, undefined, code);
  }
  return new ZaiApiError('network', message, undefined, code);
}

/** Pick the most actionable error when every endpoint failed. */
export function selectError(errors: unknown[]): ZaiApiError {
  const zaiErrors = errors
    .map((e) => toApiError(e))
    .filter((e): e is ZaiApiError => e instanceof ZaiApiError);
  return (
    zaiErrors.find((e) => e.kind === 'auth') ??
    zaiErrors[0] ??
    new ZaiApiError('network', 'All API requests failed.')
  );
}

// ============================================================================
// Helpers
// ============================================================================

/** Format date as yyyy-MM-dd HH:mm:ss */
function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Build an exact 24-hour rolling time window ending now */
export function buildTimeWindow(): { start: Date; end: Date; params: string } {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return {
    start,
    end,
    params: `startTime=${encodeURIComponent(fmtDate(start))}&endTime=${encodeURIComponent(fmtDate(end))}`,
  };
}

export function buildTimeWindowParams(): string {
  return buildTimeWindow().params;
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

    // Guarantee the promise settles exactly once, even if several error
    // paths fire for the same request (socket error + abort + deadline...).
    let settled = false;
    let deadline: NodeJS.Timeout | undefined;
    const settle = (win: boolean, value: unknown): void => {
      if (settled) return;
      settled = true;
      if (deadline !== undefined) clearTimeout(deadline);
      if (win) resolve(value);
      else reject(value);
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk; });
      res.on('error', (err: Error) => {
        req.destroy();
        settle(false, toApiError(err));
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          const kind = res.statusCode === 401 || res.statusCode === 403 ? 'auth' : 'http';
          settle(false, new ZaiApiError(
            kind,
            `HTTP ${res.statusCode}: ${data.substring(0, 200)}`,
            res.statusCode,
          ));
          return;
        }
        try {
          settle(true, JSON.parse(data));
        } catch {
          settle(false, new ZaiApiError('parse', 'Invalid JSON response'));
        }
      });
    });

    // Inactivity timeout (no data for 15s)
    req.setTimeout(REQUEST_TIMEOUT_MS);
    req.on('timeout', () => {
      req.destroy();
      settle(false, new ZaiApiError('timeout', 'Request timed out'));
    });
    // Hard wall-clock deadline — covers a premature close where neither
    // 'end' nor 'error' ever fires.
    deadline = setTimeout(() => {
      req.destroy();
      settle(false, new ZaiApiError('timeout', 'Request timed out'));
    }, REQUEST_DEADLINE_MS);
    req.on('error', (err: Error) => settle(false, toApiError(err)));
    req.end();
  });
}

// ============================================================================
// Retry
// ============================================================================

/**
 * Whether a failure is worth retrying: transient transport problems
 * (connection resets, DNS blips, timeouts) and server-side throttling or
 * outages. Auth and parse failures are deterministic and never retried.
 */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof ZaiApiError)) return true; // unknown shape → assume transient
  if (err.kind === 'network' || err.kind === 'timeout') return true;
  if (err.kind === 'http') {
    return err.statusCode === 429 || (err.statusCode ?? 0) >= 500;
  }
  return false;
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

/**
 * Run `fn`, retrying transient failures with exponential backoff plus jitter.
 * The default policy is 3 attempts with 400ms/1.2s backoff — long enough for
 * a connection reset or DNS blip to clear, short enough that a real outage
 * still surfaces quickly.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 400;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts || !isRetryable(err)) throw err;
      const backoff = baseDelayMs * 3 ** (attempt - 1);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, backoff + Math.random() * backoff * 0.5);
      });
    }
  }
  /* istanbul ignore next -- unreachable: the loop always returns or throws */
  throw new Error('withRetry: unreachable');
}

// ============================================================================
// Response Processing
// ============================================================================

/** Classify a raw quota limit item into a labeled QuotaLimit */
export function classifyLimit(item: ApiQuotaLimitItem): QuotaLimit {
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
    endpointErrors: [],
  };
}

// ============================================================================
// Public API
// ============================================================================

type EndpointResult =
  | { ok: true; value: unknown }
  | { ok: false; error: unknown };

function toResult(p: Promise<unknown>): Promise<EndpointResult> {
  return p.then(
    (value): EndpointResult => ({ ok: true, value }),
    (error): EndpointResult => ({ ok: false, error }),
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Fetch all usage data from Z.ai.
 *
 * The API key is sent verbatim in the Authorization header. Individual
 * endpoint failures are caught gracefully — partial data is returned with
 * the failed endpoints listed in `endpointErrors`. Only when every endpoint
 * fails does this throw (a ZaiApiError whose kind distinguishes auth,
 * timeout, network, and HTTP failures).
 */
export async function fetchUsage(apiKey: string, acceptLanguage = DEFAULT_ACCEPT_LANGUAGE): Promise<UsageData> {
  const timeParams = buildTimeWindowParams();

  // Fire all three requests in parallel; catch individually
  const [quotaR, modelR, toolR] = await Promise.all([
    toResult(withRetry(() => makeRequest(ENDPOINTS.quotaLimit, apiKey, undefined, acceptLanguage))),
    toResult(withRetry(() => makeRequest(ENDPOINTS.modelUsage, apiKey, timeParams, acceptLanguage))),
    toResult(withRetry(() => makeRequest(ENDPOINTS.toolUsage, apiKey, timeParams, acceptLanguage))),
  ]);

  // If all three failed, surface the most actionable cause
  if (!quotaR.ok && !modelR.ok && !toolR.ok) {
    throw selectError([quotaR.error, modelR.error, toolR.error]);
  }

  const endpointErrors: EndpointError[] = [];
  if (!quotaR.ok) endpointErrors.push({ endpoint: 'quotaLimit', message: errorMessage(quotaR.error) });
  if (!modelR.ok) endpointErrors.push({ endpoint: 'modelUsage', message: errorMessage(modelR.error) });
  if (!toolR.ok) endpointErrors.push({ endpoint: 'toolUsage', message: errorMessage(toolR.error) });

  return {
    ...processResponses(
      quotaR.ok ? (quotaR.value as ApiQuotaResponse) : null,
      modelR.ok ? (modelR.value as ApiModelUsageResponse) : null,
      toolR.ok ? (toolR.value as ApiToolUsageResponse) : null,
    ),
    endpointErrors,
  };
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
    withRetry(() => makeRequest(ENDPOINTS.quotaLimit, apiKey, undefined, acceptLanguage)).catch(e => ({ error: String(e) })),
    withRetry(() => makeRequest(ENDPOINTS.modelUsage, apiKey, timeParams, acceptLanguage)).catch(e => ({ error: String(e) })),
    withRetry(() => makeRequest(ENDPOINTS.toolUsage, apiKey, timeParams, acceptLanguage)).catch(e => ({ error: String(e) })),
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
