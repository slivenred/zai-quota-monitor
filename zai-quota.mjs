#!/usr/bin/env node

/**
 * Z.ai Quota Monitor - standalone query script
 *
 * Shares the compiled API client with the extension (out/api/zaiApi.js),
 * so endpoints, auth handling, error classification, and the 24-hour usage
 * window can never drift between the two. Build once before use:
 *
 *   npm install && npm run compile
 *
 * Usage:
 *   node zai-quota.mjs                    # Use ZAI_API_KEY environment variable
 *   ZAI_API_KEY=xxx node zai-quota.mjs    # Provide API key inline
 *   node zai-quota.mjs --key YOUR_KEY     # Provide API key as a CLI argument
 *
 * No runtime dependencies - only Node.js built-in modules.
 */

const PROGRESS_WIDTH = 12;

// Shared client lives in the compiled extension output. Import it lazily
// so a missing build produces a friendly message instead of a stack trace.
let fetchUsage;
let buildTimeWindow;
try {
  ({ fetchUsage, buildTimeWindow } = await import('./out/api/zaiApi.js'));
} catch {
  console.error('Compiled extension output not found (out/api/zaiApi.js).');
  console.error('Build it first:  npm install && npm run compile');
  process.exit(1);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format number with thousand separators.
 */
function fmtNum(n) {
  return n.toLocaleString('en-US');
}

/**
 * Format date as yyyy-MM-dd HH:mm:ss.
 */
function fmtDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Build progress bar.
 */
function progressBar(pct) {
  const clamped = Math.min(100, Math.max(0, pct));
  const filled = Math.round((clamped / 100) * PROGRESS_WIDTH);
  const empty = PROGRESS_WIDTH - filled;
  return '■'.repeat(filled) + '□'.repeat(empty);
}

/**
 * Format reset countdown.
 */
function fmtResetCountdown(resetTime) {
  if (!resetTime) return null;
  const diff = resetTime.getTime() - Date.now();
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
 * Get API key.
 */
function getApiKey() {
  // 1. --key CLI argument
  const keyIdx = process.argv.indexOf('--key');
  if (keyIdx !== -1 && process.argv[keyIdx + 1]) {
    return process.argv[keyIdx + 1];
  }
  // 2. Environment variables
  return process.env.ZAI_API_KEY || process.env.ZHIPU_API_KEY || null;
}

// ============================================================================
// Output Formatting
// ============================================================================

function displayResults(data, window) {
  const W = 66; // Total width
  const inner = W - 4; // Content width
  const line = (s) => `║ ${String(s).padEnd(inner)} ║`;
  const separator = `╟${'─'.repeat(W - 2)}╢`;
  const divider = `╠${'═'.repeat(W - 2)}╣`;

  const endpointError = (name) =>
    data.endpointErrors.find((e) => e.endpoint === name)?.message;

  console.log(`╔${'═'.repeat(W - 2)}╗`);
  console.log(line(''));
  console.log(line('Z.ai GLM Coding Plan - Quota Monitor'));
  console.log(line(''));
  console.log(divider);
  console.log(line('Platform:  Z.AI (api.z.ai)'));
  console.log(line(`Period:    ${fmtDate(window.start)} → ${fmtDate(window.end)}`));
  console.log(divider);

  // ── Quota Limits ──────────────────────────────────
  console.log(line('QUOTA LIMITS'));
  console.log(separator);

  const quotaError = endpointError('quotaLimit');
  if (quotaError) {
    console.log(line(`Error: ${quotaError}`));
  } else if (data.quotas.length > 0) {
    for (const quota of data.quotas) {
      const bar = `[${progressBar(quota.percentage)}] ${quota.percentage.toFixed(1)}%`;
      console.log(line(`${quota.label}:`));
      console.log(line(`  ${bar}`));

      if (quota.nextResetTime) {
        const countdown = fmtResetCountdown(quota.nextResetTime);
        if (countdown) console.log(line(`  ${countdown}`));
        console.log(line(`  Reset at: ${fmtDate(quota.nextResetTime)}`));
      }

      if (quota.currentValue !== undefined && quota.total !== undefined) {
        console.log(line(`  Used: ${quota.currentValue} / ${quota.total}`));
      }

      if (quota.usageDetails && quota.usageDetails.length > 0) {
        for (const d of quota.usageDetails) {
          console.log(line(`  ${d.modelCode}: ${fmtNum(d.usage)}`));
        }
      }
    }

    // Show account plan when available.
    if (data.planName) {
      console.log(separator);
      console.log(line(`Plan: ${data.planName}`));
    }
  } else {
    console.log(line('No quota data available'));
  }
  console.log(divider);

  // ── Model Usage ───────────────────────────────────
  console.log(line('MODEL USAGE (24h)'));
  console.log(separator);

  const modelError = endpointError('modelUsage');
  if (modelError) {
    console.log(line(`Error: ${modelError}`));
  } else if (data.modelUsage) {
    const defaultLimit = 40000000;
    const pctOf5h = Math.round((data.modelUsage.totalTokens / defaultLimit) * 100);
    console.log(line(`Total Tokens:   ${fmtNum(data.modelUsage.totalTokens)} (~${pctOf5h}% of 5h limit)`));
    console.log(line(`Total Calls:    ${fmtNum(data.modelUsage.totalCalls)}`));
  } else {
    console.log(line('No model usage data'));
  }
  console.log(divider);

  // ── Tool/MCP Usage ────────────────────────────────
  console.log(line('TOOL / MCP USAGE (24h)'));
  console.log(separator);

  const toolError = endpointError('toolUsage');
  if (toolError) {
    console.log(line(`Error: ${toolError}`));
  } else if (data.toolUsage) {
    console.log(line(`Network Searches:  ${fmtNum(data.toolUsage.networkSearches)}`));
    console.log(line(`Web Reads:         ${fmtNum(data.toolUsage.webReads)}`));
    console.log(line(`ZRead Calls:       ${fmtNum(data.toolUsage.zreadCalls)}`));
  } else {
    console.log(line('No tool usage data'));
  }

  console.log(`╚${'═'.repeat(W - 2)}╝`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.error('');
    console.error('Z.ai API key was not found.');
    console.error('');
    console.error('Provide an API key using one of these methods:');
    console.error('');
    console.error('  1. Set an environment variable:');
    console.error('     export ZAI_API_KEY="your-api-key"');
    console.error('');
    console.error('  2. Use a CLI argument:');
    console.error('     node zai-quota.mjs --key YOUR_KEY');
    console.error('');
    console.error('Get an API key from https://z.ai/manage-apikey');
    console.error('');
    process.exit(1);
  }

  try {
    const window = buildTimeWindow();
    const data = await fetchUsage(apiKey);
    displayResults(data, window);
  } catch (err) {
    console.error(`\nError: ${err.message}\n`);
    process.exit(1);
  }
}

main();
