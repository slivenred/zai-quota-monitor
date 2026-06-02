#!/usr/bin/env node

/**
 * Z.ai Quota Monitor — 獨立查詢腳本
 *
 * 查詢 Z.ai GLM Coding Plan 的配額使用狀況、模型使用量、MCP 工具使用量，
 * 並顯示配額重置倒數時間。
 *
 * 用法：
 *   node zai-quota.mjs                    # 使用 ZAI_API_KEY 環境變數
 *   ZAI_API_KEY=xxx node zai-quota.mjs    # 內聯提供 API Key
 *   node zai-quota.mjs --key YOUR_KEY     # 命令列參數
 *
 * 無需安裝任何依賴 — 僅使用 Node.js 內建模組。
 */

import https from 'node:https';

// ============================================================================
// 常量
// ============================================================================

const API_BASE = 'https://api.z.ai';
const ENDPOINTS = {
  quotaLimit: `${API_BASE}/api/monitor/usage/quota/limit`,
  modelUsage: `${API_BASE}/api/monitor/usage/model-usage`,
  toolUsage:  `${API_BASE}/api/monitor/usage/tool-usage`,
};

const REQUEST_TIMEOUT_MS = 15000;
const PROGRESS_WIDTH = 12;

// ============================================================================
// 工具函數
// ============================================================================

/**
 * 格式化數字（千位分隔符）
 */
function fmtNum(n) {
  return n.toLocaleString('en-US');
}

/**
 * 格式化日期為 yyyy-MM-dd HH:mm:ss
 */
function fmtDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 建立進度條
 */
function progressBar(pct) {
  const clamped = Math.min(100, Math.max(0, pct));
  const filled = Math.round((clamped / 100) * PROGRESS_WIDTH);
  const empty = PROGRESS_WIDTH - filled;
  return '■'.repeat(filled) + '□'.repeat(empty);
}

/**
 * 格式化重置倒數
 */
function fmtResetCountdown(resetTimeMs) {
  if (!resetTimeMs || typeof resetTimeMs !== 'number') return null;
  const diff = resetTimeMs - Date.now();
  if (diff <= 0) return null;

  const totalMin = Math.floor(diff / 60000);
  if (totalMin >= 24 * 60) {
    const days = Math.floor(totalMin / 1440);
    const hrs = Math.floor((totalMin % 1440) / 60);
    return `Resets in ${days} ${days === 1 ? 'day' : 'days'} and ${hrs} ${hrs === 1 ? 'hour' : 'hours'}`;
  }
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `Resets in ${hrs} hours ${mins} minutes`;
}

/**
 * 計算 24 小時滾動時間窗口
 */
function getTimeWindow() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, now.getHours(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 59, 59, 999);
  return {
    startTime: fmtDate(start),
    endTime: fmtDate(end),
    queryParams: `startTime=${encodeURIComponent(fmtDate(start))}&endTime=${encodeURIComponent(fmtDate(end))}`,
  };
}

/**
 * 取得 API Key
 */
function getApiKey() {
  // 1. 命令列 --key 參數
  const keyIdx = process.argv.indexOf('--key');
  if (keyIdx !== -1 && process.argv[keyIdx + 1]) {
    return process.argv[keyIdx + 1];
  }
  // 2. 環境變數
  return process.env.ZAI_API_KEY || process.env.ZHIPU_API_KEY || null;
}

// ============================================================================
// API 請求
// ============================================================================

/**
 * 發送 HTTPS GET 請求
 */
function makeRequest(url, authToken, queryParams) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const fullPath = queryParams ? `${parsed.pathname}?${queryParams}` : parsed.pathname;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 443,
      path: fullPath,
      method: 'GET',
      headers: {
        'Authorization': authToken,  // 注意：不加 "Bearer" 前綴
        'Accept-Language': 'en-US,en',
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON response: ${data.substring(0, 200)}`));
        }
      });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

/**
 * 查詢所有 API 端點
 */
async function queryAll(apiKey) {
  const { queryParams, startTime, endTime } = getTimeWindow();

  const [quotaRes, modelRes, toolRes] = await Promise.all([
    makeRequest(ENDPOINTS.quotaLimit, apiKey).catch((e) => ({ error: e.message })),
    makeRequest(ENDPOINTS.modelUsage, apiKey, queryParams).catch((e) => ({ error: e.message })),
    makeRequest(ENDPOINTS.toolUsage, apiKey, queryParams).catch((e) => ({ error: e.message })),
  ]);

  return { quotaRes, modelRes, toolRes, startTime, endTime };
}

// ============================================================================
// 輸出格式化
// ============================================================================

function formatResetTime(resetTimeMs) {
  if (!resetTimeMs || typeof resetTimeMs !== 'number') return '';
  const d = new Date(resetTimeMs);
  return fmtDate(d);
}

function displayResults({ quotaRes, modelRes, toolRes, startTime, endTime }) {
  const W = 66; // 總寬度
  const inner = W - 4; // 內容寬度
  const line = (s) => `║ ${String(s).padEnd(inner)} ║`;
  const separator = `╟${'─'.repeat(W - 2)}╢`;
  const divider = `╠${'═'.repeat(W - 2)}╣`;

  console.log(`╔${'═'.repeat(W - 2)}╗`);
  console.log(line(''));
  console.log(line('Z.ai GLM Coding Plan - Quota Monitor'));
  console.log(line(''));
  console.log(divider);
  console.log(line(`Platform:  Z.AI (api.z.ai)`));
  console.log(line(`Period:    ${startTime} → ${endTime}`));
  console.log(divider);

  // ── Quota Limits ──────────────────────────────────
  console.log(line('QUOTA LIMITS'));
  console.log(separator);

  const quotaData = quotaRes?.data || quotaRes;
  if (quotaRes?.error) {
    console.log(line(`Error: ${quotaRes.error}`));
  } else if (quotaData?.limits && Array.isArray(quotaData.limits)) {
    for (const limit of quotaData.limits) {
      const pct = typeof limit.percentage === 'number' ? limit.percentage : 0;

      // 類型標籤
      let label = limit.type || 'Unknown';
      if (label === 'TOKENS_LIMIT') label = 'Token usage (5 Hour)';
      if (label === 'TIME_LIMIT') label = 'MCP usage (1 Month)';
      if (limit.periodType === 'WEEKLY') label = 'Token usage (Weekly)';

      // 進度條
      const bar = `[${progressBar(pct)}] ${pct.toFixed(1)}%`;
      console.log(line(`${label}:`));
      console.log(line(`  ${bar}`));

      // 重置倒數
      if (limit.nextResetTime) {
        const countdown = fmtResetCountdown(limit.nextResetTime);
        const exactTime = formatResetTime(limit.nextResetTime);
        if (countdown) console.log(line(`  ${countdown}`));
        if (exactTime) console.log(line(`  Reset at: ${exactTime}`));
      }

      // MCP 用量明細
      if (limit.currentValue !== undefined && limit.total !== undefined) {
        console.log(line(`  Used: ${limit.currentValue} / ${limit.total}`));
      }
    }

    // 額外顯示帳戶方案（如有）
    if (quotaData.planName) {
      console.log(separator);
      console.log(line(`Plan: ${quotaData.planName}`));
    }
  } else {
    console.log(line('No quota data available'));
  }
  console.log(divider);

  // ── Model Usage ───────────────────────────────────
  console.log(line('MODEL USAGE (24h)'));
  console.log(separator);

  const modelData = modelRes?.data || modelRes;
  if (modelRes?.error) {
    console.log(line(`Error: ${modelRes.error}`));
  } else if (modelData?.totalUsage) {
    const tu = modelData.totalUsage;
    if (tu.totalTokensUsage !== undefined) {
      const defaultLimit = 40000000;
      const pctOf5h = Math.round((tu.totalTokensUsage / defaultLimit) * 100);
      console.log(line(`Total Tokens:   ${fmtNum(tu.totalTokensUsage)} (~${pctOf5h}% of 5h limit)`));
    }
    if (tu.totalModelCallCount !== undefined) {
      console.log(line(`Total Calls:    ${fmtNum(tu.totalModelCallCount)}`));
    }
  } else {
    console.log(line('No model usage data'));
  }
  console.log(divider);

  // ── Tool/MCP Usage ────────────────────────────────
  console.log(line('TOOL / MCP USAGE (24h)'));
  console.log(separator);

  const toolData = toolRes?.data || toolRes;
  if (toolRes?.error) {
    console.log(line(`Error: ${toolRes.error}`));
  } else if (toolData?.totalUsage) {
    const tu = toolData.totalUsage;
    if (tu.totalNetworkSearchCount !== undefined) {
      console.log(line(`Network Searches:  ${fmtNum(tu.totalNetworkSearchCount)}`));
    }
    if (tu.totalWebReadMcpCount !== undefined) {
      console.log(line(`Web Reads:         ${fmtNum(tu.totalWebReadMcpCount)}`));
    }
    if (tu.totalZreadMcpCount !== undefined) {
      console.log(line(`ZRead Calls:       ${fmtNum(tu.totalZreadMcpCount)}`));
    }
  } else {
    console.log(line('No tool usage data'));
  }

  console.log(`╚${'═'.repeat(W - 2)}╝`);
}

// ============================================================================
// 主程式
// ============================================================================

async function main() {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.error('');
    console.error('未找到 Z.ai API Key');
    console.error('');
    console.error('請使用以下任一方式提供 API Key：');
    console.error('');
    console.error('  1. 設定環境變數：');
    console.error('     export ZAI_API_KEY="your-api-key"');
    console.error('');
    console.error('  2. 命令列參數：');
    console.error('     node zai-quota.mjs --key YOUR_KEY');
    console.error('');
    console.error('API Key 可從 https://z.ai/manage-apikey 取得');
    console.error('');
    process.exit(1);
  }

  try {
    const results = await queryAll(apiKey);
    displayResults(results);
  } catch (err) {
    console.error(`\nError: ${err.message}\n`);
    process.exit(1);
  }
}

main();
