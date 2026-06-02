/**
 * Z.ai Quota Monitor — Extension Entry Point
 *
 * Activates on startup, creates status bar indicator, registers commands,
 * manages auto-refresh timer, and handles notifications.
 */

import * as vscode from 'vscode';
import { fetchUsage, fetchRawResponses } from './api/zaiApi';
import { QuotaIndicator } from './statusBar/quotaIndicator';
import type { UsageData, ExtensionConfig } from './types';

// ============================================================================
// Module-level state
// ============================================================================

let indicator: QuotaIndicator;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let lastData: UsageData | undefined;
let outputChannel: vscode.OutputChannel;

// Track notification states to avoid spamming
let notifiedLowQuota = false;
let notifiedExhausted = false;

const SECRET_KEY = 'zaiApiKey';

// ============================================================================
// Helpers
// ============================================================================

function getConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('zaiQuota');
  return {
    refreshInterval: cfg.get<number>('refreshInterval', 5),
    warnThreshold: cfg.get<number>('warnThreshold', 85),
    showCountdown: cfg.get<boolean>('showCountdown', true),
  };
}

function getSecretStorage(context: vscode.ExtensionContext): vscode.SecretStorage {
  return context.secrets;
}

async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  return getSecretStorage(context).get(SECRET_KEY);
}

// ============================================================================
// Core Logic
// ============================================================================

async function refreshUsage(context: vscode.ExtensionContext): Promise<void> {
  const apiKey = await getApiKey(context);
  if (!apiKey) {
    indicator.showNotConfigured();
    return;
  }

  indicator.showLoading();

  try {
    const data = await fetchUsage(apiKey);
    lastData = data;
    indicator.updateUsage(data);
    checkNotifications(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    indicator.showError(msg);

    // Show actionable error notification
    const action = await vscode.window.showErrorMessage(
      `Z.ai Quota Monitor: ${msg}`,
      '開啟設定',
      '重試',
    );
    if (action === '開啟設定') {
      vscode.commands.executeCommand('zaiQuota.configure');
    } else if (action === '重試') {
      refreshUsage(context);
    }
  }
}

/** Check if we should show a notification about quota state changes */
function checkNotifications(data: UsageData): void {
  const tokenQuota = data.quotas.find(q => q.type === 'token');
  if (!tokenQuota) return;

  const pct = tokenQuota.percentage;

  // Quota exhausted
  if (pct >= 100 && !notifiedExhausted) {
    notifiedExhausted = true;
    notifiedLowQuota = true; // no need for low warning too
    const resetInfo = tokenQuota.nextResetTime
      ? `，將在 ${tokenQuota.nextResetTime.toLocaleTimeString('zh-TW')} 重置`
      : '';
    vscode.window.showWarningMessage(`Z.ai Quota Monitor: 5 小時配額已用盡${resetInfo}。`);
    return;
  }

  // Quota running low (< 15% remaining)
  if (pct >= 85 && pct < 100 && !notifiedLowQuota) {
    notifiedLowQuota = true;
    const resetInfo = tokenQuota.nextResetTime
      ? `，將在 ${tokenQuota.nextResetTime.toLocaleTimeString('zh-TW')} 重置`
      : '';
    vscode.window.showInformationMessage(
      `Z.ai Quota Monitor: 5 小時配額已使用 ${pct.toFixed(0)}%${resetInfo}。`,
    );
    return;
  }

  // Reset notification flags when quota is healthy
  if (pct < 85) {
    notifiedLowQuota = false;
    notifiedExhausted = false;
  }
}

/** Start or restart the auto-refresh timer */
function startRefreshTimer(context: vscode.ExtensionContext): void {
  stopRefreshTimer();
  const config = getConfig();
  refreshTimer = setInterval(() => refreshUsage(context), config.refreshInterval * 60_000);
}

function stopRefreshTimer(): void {
  if (refreshTimer !== undefined) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
}

// ============================================================================
// Commands
// ============================================================================

async function configureSettings(context: vscode.ExtensionContext): Promise<void> {
  type SettingsItem = vscode.QuickPickItem & {
    action: 'apiKey' | 'refreshInterval' | 'warnThreshold';
  };

  const options: SettingsItem[] = [
    {
      label: '$(key) API Key',
      description: '更新授權憑證',
      detail: 'API Key 會儲存在 VS Code SecretStorage 中。',
      action: 'apiKey',
    },
    {
      label: '$(sync) 自動刷新間隔',
      description: '調整背景更新頻率',
      detail: '以分鐘為單位，至少 1 分鐘。',
      action: 'refreshInterval',
    },
    {
      label: '$(warning) 警告閾值',
      description: '調整狀態列警示時機',
      detail: '當 5 小時配額使用率達到此百分比時，狀態列會切換為警示色。',
      action: 'warnThreshold',
    },
  ];
  const selected = await vscode.window.showQuickPick(options, {
    title: 'Z.ai Quota Monitor',
    placeHolder: '選擇要調整的設定項目',
  });

  if (!selected) return;

  if (selected.action === 'apiKey') {
    // Show instructions
    const open = await vscode.window.showInformationMessage(
      '請前往 Z.ai 管理頁面取得 API Key，完成後回到 VS Code 貼上。',
      '開啟 API Key 頁面',
      '輸入 API Key',
    );
    if (open === '開啟 API Key 頁面') {
      vscode.env.openExternal(vscode.Uri.parse('https://z.ai/manage-apikey'));
    }

    const key = await vscode.window.showInputBox({
      prompt: '輸入 Z.ai API Key',
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'bd16bffe...',
      validateInput: (v) => {
        if (!v || v.trim().length < 10) return 'API Key 太短，請檢查';
        return undefined;
      },
    });

    if (key) {
      await getSecretStorage(context).store(SECRET_KEY, key.trim());
      vscode.window.showInformationMessage('Z.ai API Key 已安全儲存。');
      notifiedLowQuota = false;
      notifiedExhausted = false;
      refreshUsage(context);
    }
  } else if (selected.action === 'refreshInterval') {
    const config = vscode.workspace.getConfiguration('zaiQuota');
    const current = config.get<number>('refreshInterval', 5);
    const value = await vscode.window.showInputBox({
      prompt: '設定自動刷新間隔（分鐘）',
      value: String(current),
      validateInput: (v) => {
        const n = Number(v);
        if (isNaN(n) || n < 1) return '請輸入 ≥ 1 的數字';
        return undefined;
      },
    });
    if (value) {
      await config.update('refreshInterval', Number(value), vscode.ConfigurationTarget.Global);
    }
  } else if (selected.action === 'warnThreshold') {
    const config = vscode.workspace.getConfiguration('zaiQuota');
    const current = config.get<number>('warnThreshold', 85);
    const value = await vscode.window.showInputBox({
      prompt: '設定狀態列警告閾值百分比',
      value: String(current),
      validateInput: (v) => {
        const n = Number(v);
        if (isNaN(n) || n < 50 || n > 100) return '請輸入 50-100 之間的數字';
        return undefined;
      },
    });
    if (value) {
      await config.update('warnThreshold', Number(value), vscode.ConfigurationTarget.Global);
    }
  }
}

async function showDetail(context: vscode.ExtensionContext): Promise<void> {
  // No API key → open configure dialog directly
  const apiKey = await getApiKey(context);
  if (!apiKey) {
    await configureSettings(context);
    return;
  }

  if (lastData) {
    indicator.showQuickPick(lastData);
  } else {
    await refreshUsage(context);
    if (lastData) {
      indicator.showQuickPick(lastData);
    }
  }
}

async function debugRaw(context: vscode.ExtensionContext): Promise<void> {
  const apiKey = await getApiKey(context);
  if (!apiKey) {
    vscode.window.showErrorMessage('請先設定 API Key');
    return;
  }

  try {
    const raw = await fetchRawResponses(apiKey);
    outputChannel.clear();
    outputChannel.appendLine(`=== Z.ai Raw API Responses ===`);
    outputChannel.appendLine(`Fetched at: ${new Date().toISOString()}\n`);
    outputChannel.appendLine(JSON.stringify(raw, null, 2));
    outputChannel.show(true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Z.ai Quota Monitor: 原始 API 回應擷取失敗。${msg}`);
  }
}

// ============================================================================
// Extension Activate / Deactivate
// ============================================================================

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel('Z.ai Quota Debug');
  indicator = new QuotaIndicator(getConfig());

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('zaiQuota.refresh', () => refreshUsage(context)),
    vscode.commands.registerCommand('zaiQuota.configure', () => configureSettings(context)),
    vscode.commands.registerCommand('zaiQuota.showDetail', () => showDetail(context)),
    vscode.commands.registerCommand('zaiQuota.debugRaw', () => debugRaw(context)),
  );

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('zaiQuota')) {
        indicator.updateConfig(getConfig());
        startRefreshTimer(context);
        // Re-render with existing data if available
        if (lastData) {
          indicator.updateUsage(lastData);
        }
      }
    }),
  );

  // Dispose on deactivate
  context.subscriptions.push(indicator);
  context.subscriptions.push(outputChannel);

  // Check if API key exists and initialize
  const apiKey = await getApiKey(context);
  if (!apiKey) {
    indicator.showNotConfigured();
    // Prompt to configure on first run
    const action = await vscode.window.showInformationMessage(
      'Z.ai Quota Monitor 需要 API Key 才能啟用配額監控。',
      '設定 API Key',
    );
    if (action === '設定 API Key') {
      vscode.commands.executeCommand('zaiQuota.configure');
    }
  } else {
    await refreshUsage(context);
    startRefreshTimer(context);
  }
}

export function deactivate(): void {
  stopRefreshTimer();
}
