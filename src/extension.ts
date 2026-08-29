/**
 * Z.ai Quota Monitor — Extension Entry Point
 *
 * Activates on startup, creates status bar indicator, registers commands,
 * manages auto-refresh timer, and handles notifications.
 */

import * as vscode from 'vscode';
import { fetchUsage, fetchRawResponses, ZaiApiError } from './api/zaiApi';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_VALUES,
  getAcceptLanguage,
  getLocaleTag,
  getStrings,
  normalizeLanguage,
  type Language,
  type LocaleStrings,
} from './i18n';
import { QuotaIndicator } from './statusBar/quotaIndicator';
import type { UsageData, ExtensionConfig } from './types';

// ============================================================================
// Module-level state
// ============================================================================

let indicator: QuotaIndicator;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let lastData: UsageData | undefined;
let outputChannel: vscode.LogOutputChannel;

/** Guards against overlapping refreshes (manual + timer + retry). */
let refreshInFlight: Promise<void> | undefined;

/** Whether the most recent refresh succeeded (drives the stale-data ticker). */
let lastRefreshOk = true;

/** Latch so a persistent error only raises one toast per ok→error transition. */
let errorNotified = false;

/** Notification state per quota type, to avoid spamming. */
const notificationState: Record<'token' | 'weekly', { low: boolean; exhausted: boolean }> = {
  token: { low: false, exhausted: false },
  weekly: { low: false, exhausted: false },
};

const SECRET_KEY = 'zaiApiKey';

/** Re-render interval for the countdown display (no network involved). */
const UI_TICKER_MS = 30_000;

// ============================================================================
// Helpers
// ============================================================================

function getConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('zaiQuota');
  // Clamp refreshInterval: settings.json can bypass the declared minimum,
  // and 0/NaN would turn setInterval into a request storm.
  const rawInterval = Number(cfg.get<number>('refreshInterval', 5));
  return {
    refreshInterval: Number.isFinite(rawInterval) && rawInterval >= 1 ? rawInterval : 5,
    warnThreshold: cfg.get<number>('warnThreshold', 85),
    showCountdown: cfg.get<boolean>('showCountdown', true),
    language: normalizeLanguage(cfg.get<Language>('language', DEFAULT_LANGUAGE)),
  };
}

async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  return context.secrets.get(SECRET_KEY);
}

function resetNotificationState(): void {
  notificationState.token = { low: false, exhausted: false };
  notificationState.weekly = { low: false, exhausted: false };
  errorNotified = false;
}

/** Re-render the status bar from cached state after a config change. */
function renderCurrentState(context: vscode.ExtensionContext): void {
  if (lastData && lastRefreshOk) {
    indicator.updateUsage(lastData);
  } else if (!lastData) {
    void getApiKey(context).then((apiKey) => {
      if (!apiKey) {
        indicator.showNotConfigured();
      }
    });
  }
}

/** Map an API failure to a localized, user-facing message. */
function localizeApiError(err: unknown, strings: LocaleStrings): string {
  if (err instanceof ZaiApiError) {
    if (err.kind === 'auth') return strings.notifications.errorAuth;
    if (err.kind === 'timeout') return strings.notifications.errorTimeout;
  }
  return strings.notifications.errorRequest;
}

// ============================================================================
// Core Logic
// ============================================================================

async function doRefresh(context: vscode.ExtensionContext, options: { manual?: boolean } = {}): Promise<void> {
  const apiKey = await getApiKey(context);
  if (!apiKey) {
    indicator.showNotConfigured();
    return;
  }

  const config = getConfig();
  const strings = getStrings(config.language);
  // Don't flash a loading state over data that is already on screen.
  if (!lastData) {
    indicator.showLoading();
  }

  try {
    const data = await fetchUsage(apiKey, getAcceptLanguage(config.language));
    lastData = data;
    lastRefreshOk = true;
    errorNotified = false;
    for (const e of data.endpointErrors) {
      outputChannel.warn(`Partial data — endpoint ${e.endpoint} failed: ${e.message}`);
    }
    indicator.updateUsage(data);
    checkNotifications(data);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const errCode = err instanceof ZaiApiError && err.code ? ` [${err.code}]` : '';
    const msg = localizeApiError(err, strings);
    lastRefreshOk = false;
    outputChannel.error(`Refresh failed: ${rawMsg}${errCode}`);
    // Keep the last known usage visible when we have it.
    indicator.showError(msg, lastData);

    // Only interrupt the user for manual refreshes or a fresh ok→error
    // transition; background failures stay visible in the status bar.
    if (options.manual || !errorNotified) {
      errorNotified = true;
      const action = await vscode.window.showErrorMessage(
        `Z.ai Quota Monitor: ${msg}`,
        strings.actions.openSettings,
        strings.actions.retry,
      );
      if (action === strings.actions.openSettings) {
        void vscode.commands.executeCommand('zaiQuota.configure');
      } else if (action === strings.actions.retry) {
        void doRefresh(context, { manual: true });
      }
    }
  }
}

/** Refresh usage data; concurrent calls share the in-flight request. */
function refreshUsage(context: vscode.ExtensionContext, options: { manual?: boolean } = {}): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = doRefresh(context, options).finally(() => {
    refreshInFlight = undefined;
  });
  return refreshInFlight;
}

/** Check if we should show a notification about quota state changes */
function checkNotifications(data: UsageData): void {
  const config = getConfig();
  const strings = getStrings(config.language);
  const localeTag = getLocaleTag(config.language);

  for (const quota of data.quotas) {
    if (quota.type !== 'token' && quota.type !== 'weekly') continue;
    const isWeekly = quota.type === 'weekly';
    const state = notificationState[quota.type];
    const pct = quota.percentage;
    const resetInfo = quota.nextResetTime
      ? strings.notifications.resetAt(quota.nextResetTime.toLocaleTimeString(localeTag))
      : '';

    // Quota exhausted
    if (pct >= 100 && !state.exhausted) {
      state.exhausted = true;
      state.low = true; // no need for low warning too
      vscode.window.showWarningMessage(
        isWeekly
          ? strings.notifications.quotaExhaustedWeekly(resetInfo)
          : strings.notifications.quotaExhausted(resetInfo),
      );
      continue;
    }

    // Quota running low
    if (pct >= config.warnThreshold && pct < 100 && !state.low) {
      state.low = true;
      vscode.window.showInformationMessage(
        isWeekly
          ? strings.notifications.quotaLowWeekly(pct.toFixed(0), resetInfo)
          : strings.notifications.quotaLow(pct.toFixed(0), resetInfo),
      );
      continue;
    }

    // Reset notification flags when quota is healthy
    if (pct < config.warnThreshold) {
      state.low = false;
      state.exhausted = false;
    }
  }
}

/** Start or restart the auto-refresh timer */
function startRefreshTimer(context: vscode.ExtensionContext): void {
  stopRefreshTimer();
  const config = getConfig();
  refreshTimer = setInterval(() => void refreshUsage(context), config.refreshInterval * 60_000);
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
    action: 'apiKey' | 'clearApiKey' | 'refreshInterval' | 'warnThreshold' | 'language';
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
      label: strings.configure.clearApiKeyLabel,
      description: strings.configure.clearApiKeyDescription,
      detail: strings.configure.clearApiKeyDetail,
      action: 'clearApiKey',
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
      void vscode.env.openExternal(vscode.Uri.parse('https://z.ai/manage-apikey'));
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
      await context.secrets.store(SECRET_KEY, key.trim());
      vscode.window.showInformationMessage(strings.configure.apiKeyStored);
      // The secrets.onDidChange listener reacts by refreshing and
      // (re)starting the auto-refresh timer.
    }
  } else if (selected.action === 'clearApiKey') {
    const confirm = await vscode.window.showWarningMessage(
      strings.configure.clearApiKeyConfirm,
      strings.configure.clearApiKeyConfirmYes,
      strings.configure.clearApiKeyConfirmNo,
    );
    if (confirm === strings.configure.clearApiKeyConfirmYes) {
      await context.secrets.delete(SECRET_KEY);
      vscode.window.showInformationMessage(strings.notifications.apiKeyCleared);
      // The secrets.onDidChange listener reacts by stopping the timer and
      // resetting the status bar.
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
      renderCurrentState(context);
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

  // Serve cached data only when reasonably fresh
  const maxAgeMs = Math.max(getConfig().refreshInterval, 5) * 60_000 * 2;
  if (!lastData || Date.now() - lastData.fetchedAt.getTime() > maxAgeMs) {
    await refreshUsage(context, { manual: true });
  }
  if (lastData) {
    await indicator.showQuickPick(lastData);
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

/** Async initialization — kept out of activate() so activation never blocks. */
async function initialize(context: vscode.ExtensionContext): Promise<void> {
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
      void vscode.commands.executeCommand('zaiQuota.configure');
    }
  } else {
    await refreshUsage(context);
    startRefreshTimer(context);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('Z.ai Quota Monitor', { log: true });
  indicator = new QuotaIndicator(getConfig());

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('zaiQuota.refresh', () => void refreshUsage(context, { manual: true })),
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
        renderCurrentState(context);
      }
    }),
  );

  // React to API key changes (own window or another one): this is what
  // (re)starts monitoring after the first-run key setup.
  context.subscriptions.push(
    context.secrets.onDidChange((e) => {
      if (e.key !== SECRET_KEY) return;
      void getApiKey(context).then((apiKey) => {
        resetNotificationState();
        if (apiKey) {
          void refreshUsage(context);
          startRefreshTimer(context);
        } else {
          stopRefreshTimer();
          lastData = undefined;
          lastRefreshOk = true;
          indicator.showNotConfigured();
        }
      });
    }),
  );

  // Local re-render ticker: keeps the countdown and "last updated" age
  // accurate between network refreshes (no requests involved).
  const ticker = setInterval(() => {
    if (lastData && lastRefreshOk) {
      indicator.updateUsage(lastData);
    }
  }, UI_TICKER_MS);
  context.subscriptions.push({ dispose: () => clearInterval(ticker) });

  // Dispose on deactivate
  context.subscriptions.push(indicator);
  context.subscriptions.push(outputChannel);

  void initialize(context);
}

export function deactivate(): void {
  stopRefreshTimer();
}
