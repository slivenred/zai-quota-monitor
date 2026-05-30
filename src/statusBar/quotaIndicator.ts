/**
 * Status Bar Indicator — Quota display, tooltip, and Quick Pick menu.
 */

import * as vscode from 'vscode';
import type { UsageData, QuotaLimit, ConnectionState, ExtensionConfig } from '../types';

// ============================================================================
// Constants
// ============================================================================

const PROGRESS_WIDTH = 20;

// ============================================================================
// Helpers
// ============================================================================

/** Format number with locale-aware thousand separators */
function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

/** Format a human-readable file size (tokens → K / M / B) */
function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Build a Unicode progress bar */
function progressBar(pct: number): string {
  const clamped = Math.min(100, Math.max(0, pct));
  const filled = Math.round((clamped / 100) * PROGRESS_WIDTH);
  return '█'.repeat(filled) + '░'.repeat(PROGRESS_WIDTH - filled);
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
  if (diff <= 0) return 'resetting';

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
    this.statusBarItem.text = '$(key) Setup API Key';
    this.statusBarItem.tooltip = 'Z.ai Quota Monitor — 點擊設定 API Key';
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  showLoading(): void {
    this.statusBarItem.text = '$(sync~spin) Loading...';
    this.statusBarItem.tooltip = '正在查詢 Z.ai 配額...';
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  showError(message: string): void {
    this.statusBarItem.text = '$(error) Quota Error';
    this.statusBarItem.tooltip = `❌ 錯誤: ${message}\n\n點擊設定或重試`;
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
      this.statusBarItem.text = '$(zap) --%';
      return;
    }

    const pct = Math.round(tokenQuota.percentage);

    if (pct >= 100) {
      this.statusBarItem.text = '$(error) Quota Used';
      return;
    }

    let text = `$(zap) ${pct}%`;

    // Append countdown if enabled and reset time exists
    if (this._config.showCountdown && tokenQuota.nextResetTime) {
      const countdown = fmtShortCountdown(tokenQuota.nextResetTime);
      text += ` • ${countdown}`;
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
    md.isTrusted = true;
    md.supportHtml = true;

    md.appendMarkdown('### ⚡ Z.ai 配額監控\n\n');
    md.appendMarkdown('---\n\n');

    // -- 5-hour token quota --
    if (tokenQuota) {
      md.appendMarkdown(`**⏱️ 5 小時配額**\n\n`);
      md.appendMarkdown(`\`${progressBar(tokenQuota.percentage)}\` **${tokenQuota.percentage.toFixed(1)}%**\n\n`);
      if (tokenQuota.currentValue !== undefined && tokenQuota.total) {
        md.appendMarkdown(`用量: ${fmtTokens(tokenQuota.currentValue)} / ${fmtTokens(tokenQuota.total)} tokens\n\n`);
      }
      if (tokenQuota.nextResetTime) {
        md.appendMarkdown(`⏰ **${fmtCountdown(tokenQuota.nextResetTime)}** 重置\n\n`);
        md.appendMarkdown(`🕐 重置時間: **${fmtTime(tokenQuota.nextResetTime)}**\n\n`);
      }
    }

    // -- Weekly quota --
    if (weeklyQuota) {
      md.appendMarkdown('---\n\n');
      md.appendMarkdown(`**📅 週配額**\n\n`);
      md.appendMarkdown(`\`${progressBar(weeklyQuota.percentage)}\` **${weeklyQuota.percentage.toFixed(1)}%**\n\n`);
      if (weeklyQuota.nextResetTime) {
        md.appendMarkdown(`⏰ **${fmtCountdown(weeklyQuota.nextResetTime)}** 重置\n\n`);
        md.appendMarkdown(`🕐 重置時間: **${fmtDateTime(weeklyQuota.nextResetTime)}**\n\n`);
      }
    }

    // -- MCP quota --
    if (mcpQuota) {
      md.appendMarkdown('---\n\n');
      md.appendMarkdown(`**🔌 MCP 用量 (月)**\n\n`);
      md.appendMarkdown(`\`${progressBar(mcpQuota.percentage)}\` **${mcpQuota.percentage.toFixed(1)}%**\n\n`);
      if (mcpQuota.currentValue !== undefined && mcpQuota.total) {
        md.appendMarkdown(`已用: ${fmtNum(mcpQuota.currentValue)} / ${fmtNum(mcpQuota.total)}\n\n`);
      }
      if (mcpQuota.nextResetTime) {
        md.appendMarkdown(`⏰ **${fmtCountdown(mcpQuota.nextResetTime)}** 重置\n\n`);
      }
      // MCP tool breakdown
      if (mcpQuota.usageDetails && mcpQuota.usageDetails.length > 0) {
        md.appendMarkdown('工具明細:\n');
        for (const d of mcpQuota.usageDetails) {
          md.appendMarkdown(`  - \`${d.modelCode}\`: ${d.usage}\n`);
        }
        md.appendMarkdown('\n');
      }
    }

    // -- Model usage --
    if (data.modelUsage) {
      md.appendMarkdown('---\n\n');
      md.appendMarkdown(`**🤖 模型用量 (24h)**\n\n`);
      md.appendMarkdown(`Tokens: ${fmtNum(data.modelUsage.totalTokens)}\n\n`);
      md.appendMarkdown(`呼叫次數: ${fmtNum(data.modelUsage.totalCalls)}\n\n`);
    }

    // -- Tool usage --
    if (data.toolUsage) {
      md.appendMarkdown('---\n\n');
      md.appendMarkdown(`**🛠️ MCP 工具 (24h)**\n\n`);
      const parts: string[] = [];
      if (data.toolUsage.networkSearches) parts.push(`搜尋: ${fmtNum(data.toolUsage.networkSearches)}`);
      if (data.toolUsage.webReads) parts.push(`網頁讀取: ${fmtNum(data.toolUsage.webReads)}`);
      if (data.toolUsage.zreadCalls) parts.push(`ZRead: ${fmtNum(data.toolUsage.zreadCalls)}`);
      if (parts.length > 0) {
        md.appendMarkdown(parts.join(' | ') + '\n\n');
      }
    }

    // -- Footer --
    md.appendMarkdown('---\n\n');
    const ago = Math.round((Date.now() - data.fetchedAt.getTime()) / 60000);
    md.appendMarkdown(`已連線 · ${ago} 分鐘前更新\n\n`);
    md.appendMarkdown('點擊查看更多選項');

    return md;
  }

  /** Show Quick Pick detail menu */
  async showQuickPick(data: UsageData): Promise<void> {
    const tokenQuota = findQuota(data.quotas, 'token');
    const weeklyQuota = findQuota(data.quotas, 'weekly');
    const mcpQuota = findQuota(data.quotas, 'mcp');

    const items: vscode.QuickPickItem[] = [];

    // -- Quota items --
    if (tokenQuota) {
      const countdown = tokenQuota.nextResetTime ? fmtCountdown(tokenQuota.nextResetTime) : '';
      items.push({
        label: `$(watch) 5 小時配額: ${tokenQuota.percentage.toFixed(1)}%`,
        description: countdown ? `⏰ ${countdown} 重置` : undefined,
        detail: tokenQuota.nextResetTime
          ? `重置時間: ${fmtTime(tokenQuota.nextResetTime)}`
          : undefined,
      });
    }

    if (weeklyQuota) {
      const countdown = weeklyQuota.nextResetTime ? fmtCountdown(weeklyQuota.nextResetTime) : '';
      items.push({
        label: `$(calendar) 週配額: ${weeklyQuota.percentage.toFixed(1)}%`,
        description: countdown ? `⏰ ${countdown} 重置` : undefined,
        detail: weeklyQuota.nextResetTime
          ? `重置時間: ${fmtDateTime(weeklyQuota.nextResetTime)}`
          : undefined,
      });
    }

    if (mcpQuota) {
      const usedStr = mcpQuota.currentValue !== undefined && mcpQuota.total
        ? ` (${mcpQuota.currentValue}/${mcpQuota.total})`
        : '';
      items.push({
        label: `$(plug) MCP 月用量: ${mcpQuota.percentage.toFixed(1)}%${usedStr}`,
      });
    }

    // -- Separator --
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });

    // -- Usage items --
    if (data.modelUsage) {
      items.push({
        label: `$(robot) 模型用量 (24h)`,
        description: `${fmtNum(data.modelUsage.totalCalls)} 次呼叫`,
        detail: `Tokens: ${fmtNum(data.modelUsage.totalTokens)}`,
      });
    }

    if (data.toolUsage) {
      const parts: string[] = [];
      if (data.toolUsage.networkSearches) parts.push(`${data.toolUsage.networkSearches} 搜尋`);
      if (data.toolUsage.webReads) parts.push(`${data.toolUsage.webReads} 讀取`);
      if (data.toolUsage.zreadCalls) parts.push(`${data.toolUsage.zreadCalls} ZRead`);
      items.push({
        label: `$(tools) 工具用量 (24h)`,
        description: parts.join(' | '),
      });
    }

    // -- Separator --
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });

    // -- Actions --
    items.push({ label: '$(refresh) 重新整理', description: '立即更新配額' });
    items.push({ label: '$(gear) 設定', description: 'API Key、刷新間隔等' });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Z.ai 配額監控',
      title: '⚡ Z.ai Quota Monitor',
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
