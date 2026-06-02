/**
 * Z.ai Quota Monitor — Extension Entry Point
 *
 * Activates on startup, creates status bar indicator, registers commands,
 * manages auto-refresh timer, and handles notifications.
 */

import * as vscode from 'vscode';
import { fetchUsage, fetchRawResponses } from './api/zaiApi';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_VALUES,
  getAcceptLanguage,
  getLocaleTag,
  getStrings,
  normalizeLanguage,
  type Language,
} from './i18n';
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
    language: normalizeLanguage(cfg.get<Language>('language', DEFAULT_LANGUAGE)),
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

  const config = getConfig();
  const strings = getStrings(config.language);
  indicator.showLoading();

  try {
    const data = await fetchUsage(apiKey, getAcceptLanguage(config.language));
    lastData = data;
    indicator.updateUsage(data);
    checkNotifications(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    indicator.showError(msg);

    // Show actionable error notification
    const action = await vscode.window.showErrorMessage(
      `Z.ai Quota Monitor: ${msg}`,
      strings.actions.openSettings,
      strings.actions.retry,
    );
    if (action === strings.actions.openSettings) {
      vscode.commands.executeCommand('zaiQuota.configure');
    } else if (action === strings.actions.retry) {
      refreshUsage(context);
    }
  }
}

/** Check if we should show a notification about quota state changes */
function checkNotifications(data: UsageData): void {
  const tokenQuota = data.quotas.find(q => q.type === 'token');
  if (!tokenQuota) return;

  const config = getConfig();
  const strings = getStrings(config.language);
  const pct = tokenQuota.percentage;

  // Quota exhausted
  if (pct >= 100 && !notifiedExhausted) {
    notifiedExhausted = true;
    notifiedLowQuota = true; // no need for low warning too
    const resetInfo = tokenQuota.nextResetTime
      ? strings.notifications.resetAt(tokenQuota.nextResetTime.toLocaleTimeString(getLocaleTag(config.language)))
      : '';
    vscode.window.showWarningMessage(strings.notifications.quotaExhausted(resetInfo));
    return;
  }

  // Quota running low (< 15% remaining)
  if (pct >= config.warnThreshold && pct < 100 && !notifiedLowQuota) {
    notifiedLowQuota = true;
    const resetInfo = tokenQuota.nextResetTime
      ? strings.notifications.resetAt(tokenQuota.nextResetTime.toLocaleTimeString(getLocaleTag(config.language)))
      : '';
    vscode.window.showInformationMessage(
      strings.notifications.quotaLow(pct.toFixed(0), resetInfo),
    );
    return;
  }

  // Reset notification flags when quota is healthy
  if (pct < config.warnThreshold) {
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
    action: 'apiKey' | 'refreshInterval' | 'warnThreshold' | 'language';
  };

  const currentConfig = getConfig();
  const strings = getStrings(currentConfig.language);
  const options: SettingsItem[] = [
    {
      label: strings.configure.apiKeyLabel,
      description: strings.configure.apiKeyDescription,
      detail: strings.configure.apiKeyDetail,
      action: 'apiKey',
    },
    {
      label: strings.configure.refreshIntervalLabel,
      description: strings.configure.refreshIntervalDescription,
      detail: strings.configure.refreshIntervalDetail,
      action: 'refreshInterval',
    },
    {
      label: strings.configure.warnThresholdLabel,
      description: strings.configure.warnThresholdDescription,
      detail: strings.configure.warnThresholdDetail,
      action: 'warnThreshold',
    },
    {
      label: strings.configure.languageLabel,
      description: strings.configure.languageDescription,
      detail: strings.configure.languageDetail,
      action: 'language',
    },
  ];
  const selected = await vscode.window.showQuickPick(options, {
    title: 'Z.ai Quota Monitor',
    placeHolder: strings.configure.placeholder,
  });

  if (!selected) return;

  if (selected.action === 'apiKey') {
    // Show instructions
    const open = await vscode.window.showInformationMessage(
      strings.configure.apiKeyInfo,
      strings.configure.openApiKeyPage,
      strings.configure.enterApiKey,
    );
    if (open === strings.configure.openApiKeyPage) {
      vscode.env.openExternal(vscode.Uri.parse('https://z.ai/manage-apikey'));
    }

    const key = await vscode.window.showInputBox({
      prompt: strings.configure.apiKeyPrompt,
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'bd16bffe...',
      validateInput: (v) => {
        if (!v || v.trim().length < 10) return strings.configure.apiKeyTooShort;
        return undefined;
      },
    });

    if (key) {
      await getSecretStorage(context).store(SECRET_KEY, key.trim());
      vscode.window.showInformationMessage(strings.configure.apiKeyStored);
      notifiedLowQuota = false;
      notifiedExhausted = false;
      refreshUsage(context);
    }
  } else if (selected.action === 'refreshInterval') {
    const config = vscode.workspace.getConfiguration('zaiQuota');
    const current = config.get<number>('refreshInterval', 5);
    const value = await vscode.window.showInputBox({
      prompt: strings.configure.refreshIntervalPrompt,
      value: String(current),
      validateInput: (v) => {
        const n = Number(v);
        if (isNaN(n) || n < 1) return strings.configure.refreshIntervalInvalid;
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
      prompt: strings.configure.warnThresholdPrompt,
      value: String(current),
      validateInput: (v) => {
        const n = Number(v);
        if (isNaN(n) || n < 50 || n > 100) return strings.configure.warnThresholdInvalid;
        return undefined;
      },
    });
    if (value) {
      await config.update('warnThreshold', Number(value), vscode.ConfigurationTarget.Global);
    }
  } else if (selected.action === 'language') {
    type LanguageItem = vscode.QuickPickItem & { language: Language };
    const languageItems: LanguageItem[] = LANGUAGE_VALUES.map((language) => ({
      label: strings.languageOptions[language].label,
      description: strings.languageOptions[language].description,
      picked: language === currentConfig.language,
      language,
    }));
    const language = await vscode.window.showQuickPick(languageItems, {
      title: 'Z.ai Quota Monitor',
      placeHolder: strings.configure.languagePlaceholder,
    });
    if (language) {
      const config = vscode.workspace.getConfiguration('zaiQuota');
      await config.update('language', language.language, vscode.ConfigurationTarget.Global);
      const nextStrings = getStrings(language.language);
      vscode.window.showInformationMessage(nextStrings.configure.languageChanged(nextStrings.languageOptions[language.language].label));
      indicator.updateConfig(getConfig());
      if (lastData) {
        indicator.updateUsage(lastData);
      } else {
        indicator.showNotConfigured();
      }
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
    await indicator.showQuickPick(lastData);
  } else {
    await refreshUsage(context);
    if (lastData) {
      await indicator.showQuickPick(lastData);
    }
  }
}

async function debugRaw(context: vscode.ExtensionContext): Promise<void> {
  const config = getConfig();
  const strings = getStrings(config.language);
  const apiKey = await getApiKey(context);
  if (!apiKey) {
    vscode.window.showErrorMessage(strings.notifications.debugRequiresApiKey);
    return;
  }

  try {
    const raw = await fetchRawResponses(apiKey, getAcceptLanguage(config.language));
    outputChannel.clear();
    outputChannel.appendLine(`=== Z.ai Raw API Responses ===`);
    outputChannel.appendLine(`Fetched at: ${new Date().toISOString()}\n`);
    outputChannel.appendLine(JSON.stringify(raw, null, 2));
    outputChannel.show(true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(strings.notifications.rawFetchFailed(msg));
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
        } else {
          void getApiKey(context).then((apiKey) => {
            if (!apiKey) {
              indicator.showNotConfigured();
            }
          });
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
    const strings = getStrings(getConfig().language);
    // Prompt to configure on first run
    const action = await vscode.window.showInformationMessage(
      strings.notifications.firstRunPrompt,
      strings.notifications.configureApiKey,
    );
    if (action === strings.notifications.configureApiKey) {
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
