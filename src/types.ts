/**
 * Z.ai Quota Monitor — Type Definitions
 */

// ============================================================================
// API Response Types (raw from Z.ai endpoints)
// ============================================================================

/** Single quota limit item from /api/monitor/usage/quota/limit */
export interface ApiQuotaLimitItem {
  type: string;               // 'TOKENS_LIMIT' | 'TIME_LIMIT'
  percentage: number;
  currentValue?: number;
  usage?: number;             // total limit value
  total?: number;             // alias for usage in some responses
  nextResetTime?: number;     // Unix timestamp in milliseconds
  periodType?: string;        // 'ROLLING_5H' | 'WEEKLY' | 'MONTHLY'
  usageDetails?: ApiUsageDetail[];
}

/** MCP tool usage detail */
export interface ApiUsageDetail {
  modelCode: string;
  usage: number;
}

/** Raw response from /api/monitor/usage/quota/limit */
export interface ApiQuotaResponse {
  data?: {
    limits?: ApiQuotaLimitItem[];
    planName?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Raw response from /api/monitor/usage/model-usage */
export interface ApiModelUsageResponse {
  data?: {
    totalUsage?: {
      totalModelCallCount?: number;
      totalTokensUsage?: number;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Raw response from /api/monitor/usage/tool-usage */
export interface ApiToolUsageResponse {
  data?: {
    totalUsage?: {
      totalNetworkSearchCount?: number;
      totalWebReadMcpCount?: number;
      totalZreadMcpCount?: number;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ============================================================================
// Processed Data Types (used internally by the extension)
// ============================================================================

/** A single processed quota limit */
export interface QuotaLimit {
  label: string;              // e.g. 'Token usage (5 Hour)'
  type: 'token' | 'mcp' | 'weekly';
  percentage: number;
  currentValue?: number;
  total?: number;
  nextResetTime?: Date;
  usageDetails?: ApiUsageDetail[];
}

/** 24-hour model usage summary */
export interface ModelUsage {
  totalTokens: number;
  totalCalls: number;
}

/** 24-hour MCP tool usage summary */
export interface ToolUsage {
  networkSearches: number;
  webReads: number;
  zreadCalls: number;
}

/** Complete usage data returned by the API client */
export interface UsageData {
  quotas: QuotaLimit[];
  modelUsage: ModelUsage | null;
  toolUsage: ToolUsage | null;
  planName?: string;
  fetchedAt: Date;
}

/** Connection state for status display */
export type ConnectionState = 'connected' | 'loading' | 'error' | 'not_configured';

// ============================================================================
// Configuration Types
// ============================================================================

/** Extension configuration */
export interface ExtensionConfig {
  refreshInterval: number;    // minutes
  warnThreshold: number;      // percentage
  showCountdown: boolean;
}
