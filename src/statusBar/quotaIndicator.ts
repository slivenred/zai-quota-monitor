/**
 * Status Bar Indicator — Quota display, tooltip, and Quick Pick menu.
 */

import * as vscode from 'vscode';
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

/** Format a human-readable file size (tokens → K / M / B) */
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
function fmtCountdown(target: Date): string {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return '即將重置';

  const totalMin = Math.floor(diff / 60000);
  if (totalMin >= 24 * 60) {
    const days = Math.floor(totalMin / 1440);
    const hrs = Math.floor((totalMin % 1440) / 60);
    return `${days} 天 ${hrs} 小時後`;
  }
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs > 0) return `${hrs} 小時 ${mins} 分鐘後`;
  return `${mins} 分鐘後`;
}

/** Format a short countdown for status bar (compact) */
function fmtShortCountdown(target: Date): string {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return '即將重置';

  const totalMin = Math.floor(diff / 60000);
  if (totalMin >= 24 * 60) {
    const days = Math.floor(totalMin / 1440);
    const hrs = Math.floor((totalMin % 1440) / 60);
    return `${days}d ${hrs}h`;
  }
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
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

  /** Update configuration */
  updateConfig(config: ExtensionConfig): void {
    this._config = config;
  }

  // -- State Transitions --

  showNotConfigured(): void {
    this.statusBarItem.text = '$(key) Z.ai 設定';
    this.statusBarItem.tooltip = 'Z.ai Quota Monitor - 點擊設定 API Key';
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  showLoading(): void {
    this.statusBarItem.text = '$(sync~spin) Z.ai 更新中';
    this.statusBarItem.tooltip = '正在更新 Z.ai 配額資料';
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  showError(message: string): void {
    this.statusBarItem.text = '$(error) Z.ai 錯誤';
    this.statusBarItem.tooltip = `Z.ai 配額更新失敗: ${message}\n\n點擊開啟設定或重試`;
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
    if (!tokenQuota) {
      this.statusBarItem.text = '$(pulse) Z.ai --';
      return;
    }

    const pct = Math.round(clampPct(tokenQuota.percentage));

    if (pct >= 100) {
      this.statusBarItem.text = '$(error) Z.ai 已用盡';
      return;
    }

    let text = `$(pulse) Z.ai ${pct}%`;

    // Append countdown if enabled and reset time exists
    if (this._config.showCountdown && tokenQuota.nextResetTime) {
      const countdown = fmtShortCountdown(tokenQuota.nextResetTime);
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
    const md = new vscode.MarkdownString(undefined, true);

    md.appendMarkdown('### Z.ai Quota Monitor\n\n');
    if (data.planName) {
      md.appendMarkdown(`**方案:** ${data.planName}\n\n`);
    }

    // -- 5-hour token quota --
    if (tokenQuota) {
      this.appendQuotaSection(md, '5 小時 Token 配額', tokenQuota, {
        valueFormatter: fmtTokens,
        unit: 'tokens',
        resetFormatter: fmtTime,
      });
    }

    // -- Weekly quota --
    if (weeklyQuota) {
      md.appendMarkdown('---\n\n');
      this.appendQuotaSection(md, '週 Token 配額', weeklyQuota, {
        resetFormatter: fmtDateTime,
      });
    }

    // -- MCP quota --
    if (mcpQuota) {
      md.appendMarkdown('---\n\n');
      this.appendQuotaSection(md, 'MCP 月用量', mcpQuota);
      if (mcpQuota.usageDetails && mcpQuota.usageDetails.length > 0) {
        md.appendMarkdown('**工具明細**\n\n');
        for (const d of mcpQuota.usageDetails) {
          md.appendMarkdown(`- \`${d.modelCode}\`: ${fmtNum(d.usage)}\n`);
        }
        md.appendMarkdown('\n');
      }
    }

    // -- Model usage --
    if (data.modelUsage || data.toolUsage) {
      md.appendMarkdown('---\n\n');
      md.appendMarkdown('#### 24 小時活動\n\n');

      if (data.modelUsage) {
        md.appendMarkdown(`- 模型呼叫: **${fmtNum(data.modelUsage.totalCalls)}**\n`);
        md.appendMarkdown(`- Token 用量: **${fmtNum(data.modelUsage.totalTokens)}**\n`);
      }

      if (data.toolUsage) {
        const parts: string[] = [];
        if (data.toolUsage.networkSearches) parts.push(`搜尋 ${fmtNum(data.toolUsage.networkSearches)}`);
        if (data.toolUsage.webReads) parts.push(`網頁讀取 ${fmtNum(data.toolUsage.webReads)}`);
        if (data.toolUsage.zreadCalls) parts.push(`ZRead ${fmtNum(data.toolUsage.zreadCalls)}`);
        md.appendMarkdown(`- MCP 工具: **${parts.length > 0 ? parts.join(' · ') : '無使用紀錄'}**\n`);
      }

      md.appendMarkdown('\n');
    }

    // -- Footer --
    md.appendMarkdown('---\n\n');
    const ago = Math.round((Date.now() - data.fetchedAt.getTime()) / 60000);
    md.appendMarkdown(`已連線 · 最後更新 ${ago} 分鐘前\n\n`);
    md.appendMarkdown('點擊開啟配額總覽與操作選單');

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
    const valueFormatter = options.valueFormatter ?? fmtNum;
    const resetFormatter = options.resetFormatter ?? fmtDateTime;
    const status = this.formatQuotaStatus(quota.percentage);
    const usage = fmtUsage(quota, valueFormatter, options.unit);
    const remaining = fmtRemaining(quota, valueFormatter, options.unit);

    md.appendMarkdown(`#### ${title}\n\n`);
    md.appendMarkdown(`${progressBar(quota.percentage)} **${fmtPct(quota.percentage)}** · ${status}\n\n`);

    if (usage) {
      md.appendMarkdown(`- 已用: **${usage}**\n`);
    }
    if (remaining) {
      md.appendMarkdown(`- 剩餘: **${remaining}**\n`);
    }
    if (quota.nextResetTime) {
      md.appendMarkdown(`- 重置倒數: **${fmtCountdown(quota.nextResetTime)}**\n`);
      md.appendMarkdown(`- 重置時間: **${resetFormatter(quota.nextResetTime)}**\n`);
    }
    md.appendMarkdown('\n');
  }

  private formatQuotaStatus(pct: number): string {
    const clamped = clampPct(pct);
    if (clamped >= 100) return '已用盡';
    if (clamped >= this._config.warnThreshold) return '接近上限';
    return '正常';
  }

  /** Show Quick Pick detail menu */
  async showQuickPick(data: UsageData): Promise<void> {
    const tokenQuota = findQuota(data.quotas, 'token');
    const weeklyQuota = findQuota(data.quotas, 'weekly');
    const mcpQuota = findQuota(data.quotas, 'mcp');

    const items: vscode.QuickPickItem[] = [];

    // -- Quota items --
    items.push({ label: '配額狀態', kind: vscode.QuickPickItemKind.Separator });
    let hasQuotaItems = false;

    if (tokenQuota) {
      hasQuotaItems = true;
      const countdown = tokenQuota.nextResetTime ? fmtCountdown(tokenQuota.nextResetTime) : '';
      items.push({
        label: '$(watch) 5 小時 Token 配額',
        description: `已用 ${fmtPct(tokenQuota.percentage)}`,
        detail: tokenQuota.nextResetTime
          ? `重置倒數 ${countdown} · 重置時間 ${fmtTime(tokenQuota.nextResetTime)}`
          : undefined,
      });
    }

    if (weeklyQuota) {
      hasQuotaItems = true;
      const countdown = weeklyQuota.nextResetTime ? fmtCountdown(weeklyQuota.nextResetTime) : '';
      items.push({
        label: '$(calendar) 週 Token 配額',
        description: `已用 ${fmtPct(weeklyQuota.percentage)}`,
        detail: weeklyQuota.nextResetTime
          ? `重置倒數 ${countdown} · 重置時間 ${fmtDateTime(weeklyQuota.nextResetTime)}`
          : undefined,
      });
    }

    if (mcpQuota) {
      hasQuotaItems = true;
      const usage = fmtUsage(mcpQuota);
      items.push({
        label: '$(plug) MCP 月用量',
        description: `已用 ${fmtPct(mcpQuota.percentage)}`,
        detail: usage ? `用量 ${usage}` : undefined,
      });
    }

    if (!hasQuotaItems) {
      items.push({
        label: '$(info) 尚無配額資料',
        description: '請重新整理或檢查 API 回應',
      });
    }

    // -- Separator --
    if (data.modelUsage || data.toolUsage) {
      items.push({ label: '24 小時活動', kind: vscode.QuickPickItemKind.Separator });
    }

    // -- Usage items --
    if (data.modelUsage) {
      items.push({
        label: '$(graph-line) 模型用量',
        description: `${fmtNum(data.modelUsage.totalCalls)} 次呼叫`,
        detail: `Token 用量 ${fmtNum(data.modelUsage.totalTokens)}`,
      });
    }

    if (data.toolUsage) {
      const parts: string[] = [];
      if (data.toolUsage.networkSearches) parts.push(`${data.toolUsage.networkSearches} 搜尋`);
      if (data.toolUsage.webReads) parts.push(`${data.toolUsage.webReads} 讀取`);
      if (data.toolUsage.zreadCalls) parts.push(`${data.toolUsage.zreadCalls} ZRead`);
      items.push({
        label: '$(tools) MCP 工具用量',
        description: parts.length > 0 ? parts.join(' · ') : '無使用紀錄',
      });
    }

    // -- Separator --
    items.push({ label: '操作', kind: vscode.QuickPickItemKind.Separator });

    // -- Actions --
    items.push({ label: '$(refresh) 重新整理配額', description: '立即更新最新用量' });
    items.push({ label: '$(gear) 開啟設定', description: 'API Key、刷新間隔、警告閾值' });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: '查看配額狀態或選擇操作',
      title: 'Z.ai Quota Monitor',
    });

    if (!selected) return;

    if (selected.label.includes('重新整理')) {
      vscode.commands.executeCommand('zaiQuota.refresh');
    } else if (selected.label.includes('設定')) {
      vscode.commands.executeCommand('zaiQuota.configure');
    }
  }

  /** Dispose the status bar item */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
