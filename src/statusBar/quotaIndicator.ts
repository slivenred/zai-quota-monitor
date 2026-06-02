/**
 * Status Bar Indicator — Quota display, tooltip, and Quick Pick menu.
 */

import * as vscode from 'vscode';
import { getStrings, type LocaleStrings } from '../i18n';
import type { UsageData, QuotaLimit, ExtensionConfig } from '../types';

// ============================================================================
// Constants
// ============================================================================

const PROGRESS_WIDTH = 12;

// ============================================================================
// Helpers
// ============================================================================

/** Format number with locale-aware thousand separators */
function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

/** Clamp quota percentages to a display-safe range */
function clampPct(pct: number): number {
  return Math.min(100, Math.max(0, pct));
}

/** Format quota percentage consistently */
function fmtPct(pct: number): string {
  return `${clampPct(pct).toFixed(1)}%`;
}

/** Format a human-readable file size (tokens -> K / M / B) */
function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Build a compact progress bar with matching-size glyphs. */
function progressBar(pct: number): string {
  const clamped = clampPct(pct);
  const filled = Math.round((clamped / 100) * PROGRESS_WIDTH);
  return '■'.repeat(filled) + '□'.repeat(PROGRESS_WIDTH - filled);
}

/** Format used / total usage when both values are available */
function fmtUsage(
  quota: QuotaLimit,
  formatValue: (n: number) => string = fmtNum,
  unit?: string,
): string | undefined {
  if (quota.currentValue === undefined || quota.total === undefined) return undefined;
  const suffix = unit ? ` ${unit}` : '';
  return `${formatValue(quota.currentValue)} / ${formatValue(quota.total)}${suffix}`;
}

/** Format remaining quota when both values are available */
function fmtRemaining(
  quota: QuotaLimit,
  formatValue: (n: number) => string = fmtNum,
  unit?: string,
): string | undefined {
  if (quota.currentValue === undefined || quota.total === undefined) return undefined;
  const remaining = Math.max(0, quota.total - quota.currentValue);
  const suffix = unit ? ` ${unit}` : '';
  return `${formatValue(remaining)}${suffix}`;
}

/** Format a countdown from now to a target Date */
function fmtCountdown(target: Date, strings: LocaleStrings): string {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return strings.countdown.resettingSoon;

  const totalMin = Math.floor(diff / 60000);
  if (totalMin >= 24 * 60) {
    const days = Math.floor(totalMin / 1440);
    const hrs = Math.floor((totalMin % 1440) / 60);
    return strings.countdown.daysHours(days, hrs);
  }
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs > 0) return strings.countdown.hoursMinutes(hrs, mins);
  return strings.countdown.minutes(mins);
}

/** Format a short countdown for status bar (compact) */
function fmtShortCountdown(target: Date, config: ExtensionConfig, strings: LocaleStrings): string {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return strings.countdown.resettingSoon;

  const totalMin = Math.floor(diff / 60000);
  if (totalMin >= 24 * 60) {
    const days = Math.floor(totalMin / 1440);
    const hrs = Math.floor((totalMin % 1440) / 60);
    if (config.language === 'zh-CN') return `${days}天 ${hrs}时`;
    if (config.language === 'zh-TW') return `${days}天 ${hrs}時`;
    return `${days}d ${hrs}h`;
  }
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs > 0) {
    if (config.language === 'zh-CN') return `${hrs}时 ${mins}分`;
    if (config.language === 'zh-TW') return `${hrs}時 ${mins}分`;
    return `${hrs}h ${mins}m`;
  }
  if (config.language === 'zh-CN' || config.language === 'zh-TW') return `${mins}分`;
  return `${mins}m`;
}

/** Format a Date as HH:mm:ss */
function fmtTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Format a Date as yyyy-MM-dd HH:mm */
function fmtDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Find a specific quota by type */
function findQuota(quotas: QuotaLimit[], type: QuotaLimit['type']): QuotaLimit | undefined {
  return quotas.find(q => q.type === type);
}

// ============================================================================
// QuotaIndicator Class
// ============================================================================

export class QuotaIndicator {
  private statusBarItem: vscode.StatusBarItem;
  private _config: ExtensionConfig;

  constructor(config: ExtensionConfig) {
    this._config = config;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = 'zaiQuota.showDetail';
    this.showNotConfigured();
  }

  private get strings(): LocaleStrings {
    return getStrings(this._config.language);
  }

  /** Update configuration */
  updateConfig(config: ExtensionConfig): void {
    this._config = config;
  }

  // -- State Transitions --

  showNotConfigured(): void {
    const strings = this.strings;
    this.statusBarItem.text = strings.status.notConfiguredText;
    this.statusBarItem.tooltip = strings.status.notConfiguredTooltip;
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  showLoading(): void {
    const strings = this.strings;
    this.statusBarItem.text = strings.status.loadingText;
    this.statusBarItem.tooltip = strings.status.loadingTooltip;
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  showError(message: string): void {
    const strings = this.strings;
    this.statusBarItem.text = strings.status.errorText;
    this.statusBarItem.tooltip = strings.status.errorTooltip(message);
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.statusBarItem.show();
  }

  /** Main update — display usage data in the status bar */
  updateUsage(data: UsageData): void {
    const tokenQuota = findQuota(data.quotas, 'token');
    const weeklyQuota = findQuota(data.quotas, 'weekly');
    const mcpQuota = findQuota(data.quotas, 'mcp');

    // -- Status bar text --
    this.updateStatusBarText(tokenQuota);

    // -- Tooltip --
    this.statusBarItem.tooltip = this.buildTooltip(data, tokenQuota, weeklyQuota, mcpQuota);

    // -- Background color based on threshold --
    const pct = tokenQuota?.percentage ?? 0;
    if (pct >= 100) {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (pct >= this._config.warnThreshold) {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.statusBarItem.backgroundColor = undefined;
    }

    this.statusBarItem.show();
  }

  /** Build status bar text */
  private updateStatusBarText(tokenQuota?: QuotaLimit): void {
    const strings = this.strings;
    if (!tokenQuota) {
      this.statusBarItem.text = '$(pulse) Z.ai --';
      return;
    }

    const pct = Math.round(clampPct(tokenQuota.percentage));

    if (pct >= 100) {
      this.statusBarItem.text = strings.status.exhaustedText;
      return;
    }

    let text = `$(pulse) Z.ai ${pct}%`;

    // Append countdown if enabled and reset time exists
    if (this._config.showCountdown && tokenQuota.nextResetTime) {
      const countdown = fmtShortCountdown(tokenQuota.nextResetTime, this._config, strings);
      text += ` · ${countdown}`;
    }

    this.statusBarItem.text = text;
  }

  /** Build rich markdown tooltip */
  private buildTooltip(
    data: UsageData,
    tokenQuota?: QuotaLimit,
    weeklyQuota?: QuotaLimit,
    mcpQuota?: QuotaLimit,
  ): vscode.MarkdownString {
    const strings = this.strings;
    const md = new vscode.MarkdownString(undefined, true);

    md.appendMarkdown('### Z.ai Quota Monitor\n\n');
    if (data.planName) {
      md.appendMarkdown(`**${strings.quota.plan}:** ${data.planName}\n\n`);
    }

    // -- 5-hour token quota --
    if (tokenQuota) {
      this.appendQuotaSection(md, strings.quota.token5h, tokenQuota, {
        valueFormatter: fmtTokens,
        unit: strings.quota.tokensUnit,
        resetFormatter: fmtTime,
      });
    }

    // -- Weekly quota --
    if (weeklyQuota) {
      md.appendMarkdown('---\n\n');
      this.appendQuotaSection(md, strings.quota.weeklyToken, weeklyQuota, {
        resetFormatter: fmtDateTime,
      });
    }

    // -- MCP quota --
    if (mcpQuota) {
      md.appendMarkdown('---\n\n');
      this.appendQuotaSection(md, strings.quota.mcpMonthly, mcpQuota);
      if (mcpQuota.usageDetails && mcpQuota.usageDetails.length > 0) {
        md.appendMarkdown(`**${strings.quota.toolDetails}**\n\n`);
        for (const d of mcpQuota.usageDetails) {
          md.appendMarkdown(`- \`${d.modelCode}\`: ${fmtNum(d.usage)}\n`);
        }
        md.appendMarkdown('\n');
      }
    }

    // -- Model usage --
    if (data.modelUsage || data.toolUsage) {
      md.appendMarkdown('---\n\n');
      md.appendMarkdown(`#### ${strings.tooltip.activity24h}\n\n`);

      if (data.modelUsage) {
        md.appendMarkdown(`- ${strings.tooltip.modelCalls}: **${fmtNum(data.modelUsage.totalCalls)}**\n`);
        md.appendMarkdown(`- ${strings.tooltip.tokenUsage}: **${fmtNum(data.modelUsage.totalTokens)}**\n`);
      }

      if (data.toolUsage) {
        const parts: string[] = [];
        if (data.toolUsage.networkSearches) {
          parts.push(strings.tooltip.networkSearches(fmtNum(data.toolUsage.networkSearches)));
        }
        if (data.toolUsage.webReads) {
          parts.push(strings.tooltip.webReads(fmtNum(data.toolUsage.webReads)));
        }
        if (data.toolUsage.zreadCalls) {
          parts.push(strings.tooltip.zread(fmtNum(data.toolUsage.zreadCalls)));
        }
        md.appendMarkdown(`- ${strings.tooltip.mcpTools}: **${parts.length > 0 ? parts.join(' · ') : strings.tooltip.noUsageRecord}**\n`);
      }

      md.appendMarkdown('\n');
    }

    // -- Footer --
    md.appendMarkdown('---\n\n');
    const ago = Math.round((Date.now() - data.fetchedAt.getTime()) / 60000);
    md.appendMarkdown(`${strings.tooltip.connectedAgo(ago)}\n\n`);
    md.appendMarkdown(strings.tooltip.openOverview);

    return md;
  }

  private appendQuotaSection(
    md: vscode.MarkdownString,
    title: string,
    quota: QuotaLimit,
    options: {
      valueFormatter?: (n: number) => string;
      unit?: string;
      resetFormatter?: (d: Date) => string;
    } = {},
  ): void {
    const strings = this.strings;
    const valueFormatter = options.valueFormatter ?? fmtNum;
    const resetFormatter = options.resetFormatter ?? fmtDateTime;
    const status = this.formatQuotaStatus(quota.percentage);
    const usage = fmtUsage(quota, valueFormatter, options.unit);
    const remaining = fmtRemaining(quota, valueFormatter, options.unit);

    md.appendMarkdown(`#### ${title}\n\n`);
    md.appendMarkdown(`${progressBar(quota.percentage)} **${fmtPct(quota.percentage)}** · ${status}\n\n`);

    if (usage) {
      md.appendMarkdown(`- ${strings.quota.used}: **${usage}**\n`);
    }
    if (remaining) {
      md.appendMarkdown(`- ${strings.quota.remaining}: **${remaining}**\n`);
    }
    if (quota.nextResetTime) {
      md.appendMarkdown(`- ${strings.quota.resetCountdown}: **${fmtCountdown(quota.nextResetTime, strings)}**\n`);
      md.appendMarkdown(`- ${strings.quota.resetTime}: **${resetFormatter(quota.nextResetTime)}**\n`);
    }
    md.appendMarkdown('\n');
  }

  private formatQuotaStatus(pct: number): string {
    const strings = this.strings;
    const clamped = clampPct(pct);
    if (clamped >= 100) return strings.quota.exhausted;
    if (clamped >= this._config.warnThreshold) return strings.quota.nearLimit;
    return strings.quota.healthy;
  }

  /** Show Quick Pick detail menu */
  async showQuickPick(data: UsageData): Promise<void> {
    type ActionItem = vscode.QuickPickItem & {
      action?: 'refresh' | 'settings';
    };

    const strings = this.strings;
    const tokenQuota = findQuota(data.quotas, 'token');
    const weeklyQuota = findQuota(data.quotas, 'weekly');
    const mcpQuota = findQuota(data.quotas, 'mcp');

    const items: ActionItem[] = [];

    // -- Quota items --
    items.push({ label: strings.quickPick.quotaStatus, kind: vscode.QuickPickItemKind.Separator });
    let hasQuotaItems = false;

    if (tokenQuota) {
      hasQuotaItems = true;
      const countdown = tokenQuota.nextResetTime ? fmtCountdown(tokenQuota.nextResetTime, strings) : '';
      items.push({
        label: `$(watch) ${strings.quota.token5h}`,
        description: strings.quickPick.usedPercentage(fmtPct(tokenQuota.percentage)),
        detail: tokenQuota.nextResetTime
          ? strings.quickPick.resetDetail(countdown, fmtTime(tokenQuota.nextResetTime))
          : undefined,
      });
    }

    if (weeklyQuota) {
      hasQuotaItems = true;
      const countdown = weeklyQuota.nextResetTime ? fmtCountdown(weeklyQuota.nextResetTime, strings) : '';
      items.push({
        label: `$(calendar) ${strings.quota.weeklyToken}`,
        description: strings.quickPick.usedPercentage(fmtPct(weeklyQuota.percentage)),
        detail: weeklyQuota.nextResetTime
          ? strings.quickPick.resetDetail(countdown, fmtDateTime(weeklyQuota.nextResetTime))
          : undefined,
      });
    }

    if (mcpQuota) {
      hasQuotaItems = true;
      const usage = fmtUsage(mcpQuota);
      items.push({
        label: `$(plug) ${strings.quota.mcpMonthly}`,
        description: strings.quickPick.usedPercentage(fmtPct(mcpQuota.percentage)),
        detail: usage ? strings.quickPick.mcpUsageDetail(usage) : undefined,
      });
    }

    if (!hasQuotaItems) {
      items.push({
        label: strings.quickPick.noQuotaData,
        description: strings.quickPick.noQuotaDataDescription,
      });
    }

    // -- Separator --
    if (data.modelUsage || data.toolUsage) {
      items.push({ label: strings.quickPick.activity24h, kind: vscode.QuickPickItemKind.Separator });
    }

    // -- Usage items --
    if (data.modelUsage) {
      items.push({
        label: strings.quickPick.modelUsage,
        description: strings.quickPick.modelCallsDescription(fmtNum(data.modelUsage.totalCalls)),
        detail: strings.quickPick.tokenUsageDetail(fmtNum(data.modelUsage.totalTokens)),
      });
    }

    if (data.toolUsage) {
      const parts: string[] = [];
      if (data.toolUsage.networkSearches) parts.push(strings.quickPick.searchCount(data.toolUsage.networkSearches));
      if (data.toolUsage.webReads) parts.push(strings.quickPick.readCount(data.toolUsage.webReads));
      if (data.toolUsage.zreadCalls) parts.push(`${data.toolUsage.zreadCalls} ZRead`);
      items.push({
        label: strings.quickPick.toolUsage,
        description: parts.length > 0 ? parts.join(' · ') : strings.quickPick.noUsageRecord,
      });
    }

    // -- Separator --
    items.push({ label: strings.quickPick.actions, kind: vscode.QuickPickItemKind.Separator });

    // -- Actions --
    items.push({
      label: strings.quickPick.refreshQuota,
      description: strings.quickPick.refreshQuotaDescription,
      action: 'refresh',
    });
    items.push({
      label: strings.quickPick.openSettings,
      description: strings.quickPick.openSettingsDescription,
      action: 'settings',
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: strings.quickPick.placeholder,
      title: 'Z.ai Quota Monitor',
    });

    if (!selected) return;

    if (selected.action === 'refresh') {
      vscode.commands.executeCommand('zaiQuota.refresh');
    } else if (selected.action === 'settings') {
      vscode.commands.executeCommand('zaiQuota.configure');
    }
  }

  /** Dispose the status bar item */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
