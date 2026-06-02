/**
 * UI copy for runtime language switching.
 */

export const LANGUAGE_VALUES = ['en', 'zh-CN', 'zh-TW'] as const;
export type Language = typeof LANGUAGE_VALUES[number];

export const DEFAULT_LANGUAGE: Language = 'en';

interface LanguageOption {
  label: string;
  description: string;
}

export interface LocaleStrings {
  languageOptions: Record<Language, LanguageOption>;
  actions: {
    openSettings: string;
    retry: string;
  };
  notifications: {
    resetAt: (time: string) => string;
    quotaExhausted: (resetInfo: string) => string;
    quotaLow: (percentage: string, resetInfo: string) => string;
    firstRunPrompt: string;
    configureApiKey: string;
    debugRequiresApiKey: string;
    rawFetchFailed: (message: string) => string;
  };
  configure: {
    placeholder: string;
    apiKeyLabel: string;
    apiKeyDescription: string;
    apiKeyDetail: string;
    refreshIntervalLabel: string;
    refreshIntervalDescription: string;
    refreshIntervalDetail: string;
    warnThresholdLabel: string;
    warnThresholdDescription: string;
    warnThresholdDetail: string;
    languageLabel: string;
    languageDescription: string;
    languageDetail: string;
    apiKeyInfo: string;
    openApiKeyPage: string;
    enterApiKey: string;
    apiKeyPrompt: string;
    apiKeyTooShort: string;
    apiKeyStored: string;
    refreshIntervalPrompt: string;
    refreshIntervalInvalid: string;
    warnThresholdPrompt: string;
    warnThresholdInvalid: string;
    languagePlaceholder: string;
    languageChanged: (language: string) => string;
  };
  status: {
    notConfiguredText: string;
    notConfiguredTooltip: string;
    loadingText: string;
    loadingTooltip: string;
    errorText: string;
    errorTooltip: (message: string) => string;
    exhaustedText: string;
  };
  quota: {
    token5h: string;
    weeklyToken: string;
    mcpMonthly: string;
    exhausted: string;
    nearLimit: string;
    healthy: string;
    used: string;
    remaining: string;
    resetCountdown: string;
    resetTime: string;
    plan: string;
    toolDetails: string;
    tokensUnit: string;
  };
  countdown: {
    resettingSoon: string;
    daysHours: (days: number, hours: number) => string;
    hoursMinutes: (hours: number, minutes: number) => string;
    minutes: (minutes: number) => string;
  };
  tooltip: {
    activity24h: string;
    modelCalls: string;
    tokenUsage: string;
    mcpTools: string;
    networkSearches: (count: string) => string;
    webReads: (count: string) => string;
    zread: (count: string) => string;
    noUsageRecord: string;
    connectedAgo: (minutes: number) => string;
    openOverview: string;
  };
  quickPick: {
    quotaStatus: string;
    usedPercentage: (percentage: string) => string;
    resetDetail: (countdown: string, resetTime: string) => string;
    mcpUsageDetail: (usage: string) => string;
    noQuotaData: string;
    noQuotaDataDescription: string;
    activity24h: string;
    modelUsage: string;
    modelCallsDescription: (count: string) => string;
    tokenUsageDetail: (count: string) => string;
    toolUsage: string;
    searchCount: (count: number) => string;
    readCount: (count: number) => string;
    noUsageRecord: string;
    actions: string;
    refreshQuota: string;
    refreshQuotaDescription: string;
    openSettings: string;
    openSettingsDescription: string;
    placeholder: string;
  };
}

export const STRINGS: Record<Language, LocaleStrings> = {
  en: {
    languageOptions: {
      en: { label: 'English', description: 'Use English for extension UI.' },
      'zh-CN': { label: '简体中文', description: '使用简体中文显示扩展界面。' },
      'zh-TW': { label: '繁體中文', description: '使用繁體中文顯示擴充功能介面。' },
    },
    actions: {
      openSettings: 'Open Settings',
      retry: 'Retry',
    },
    notifications: {
      resetAt: (time) => `, resets at ${time}`,
      quotaExhausted: (resetInfo) => `Z.ai Quota Monitor: 5-hour quota is exhausted${resetInfo}.`,
      quotaLow: (percentage, resetInfo) => `Z.ai Quota Monitor: 5-hour quota has reached ${percentage}%${resetInfo}.`,
      firstRunPrompt: 'Z.ai Quota Monitor needs an API key to enable quota monitoring.',
      configureApiKey: 'Set API Key',
      debugRequiresApiKey: 'Please set an API key first.',
      rawFetchFailed: (message) => `Z.ai Quota Monitor: Failed to fetch raw API responses. ${message}`,
    },
    configure: {
      placeholder: 'Choose a setting to update',
      apiKeyLabel: '$(key) API Key',
      apiKeyDescription: 'Update authorization credential',
      apiKeyDetail: 'The API key is stored in VS Code SecretStorage.',
      refreshIntervalLabel: '$(sync) Auto-refresh interval',
      refreshIntervalDescription: 'Adjust background update frequency',
      refreshIntervalDetail: 'Measured in minutes, minimum 1 minute.',
      warnThresholdLabel: '$(warning) Warning threshold',
      warnThresholdDescription: 'Adjust status bar warning timing',
      warnThresholdDetail: 'The status bar switches to warning color when 5-hour quota usage reaches this percentage.',
      languageLabel: '$(globe) Language',
      languageDescription: 'Change display language',
      languageDetail: 'Choose English, Simplified Chinese, or Traditional Chinese.',
      apiKeyInfo: 'Open the Z.ai management page to get an API key, then return to VS Code and paste it.',
      openApiKeyPage: 'Open API Key Page',
      enterApiKey: 'Enter API Key',
      apiKeyPrompt: 'Enter Z.ai API Key',
      apiKeyTooShort: 'API key is too short. Please check it.',
      apiKeyStored: 'Z.ai API key was stored securely.',
      refreshIntervalPrompt: 'Set auto-refresh interval in minutes',
      refreshIntervalInvalid: 'Enter a number greater than or equal to 1.',
      warnThresholdPrompt: 'Set status bar warning threshold percentage',
      warnThresholdInvalid: 'Enter a number between 50 and 100.',
      languagePlaceholder: 'Choose display language',
      languageChanged: (language) => `Display language changed to ${language}.`,
    },
    status: {
      notConfiguredText: '$(key) Z.ai Setup',
      notConfiguredTooltip: 'Z.ai Quota Monitor - Click to set API Key',
      loadingText: '$(sync~spin) Z.ai Updating',
      loadingTooltip: 'Updating Z.ai quota data',
      errorText: '$(error) Z.ai Error',
      errorTooltip: (message) => `Z.ai quota update failed: ${message}\n\nClick to open settings or retry`,
      exhaustedText: '$(error) Z.ai Exhausted',
    },
    quota: {
      token5h: '5-hour Token Quota',
      weeklyToken: 'Weekly Token Quota',
      mcpMonthly: 'Monthly MCP Usage',
      exhausted: 'Exhausted',
      nearLimit: 'Near limit',
      healthy: 'Healthy',
      used: 'Used',
      remaining: 'Remaining',
      resetCountdown: 'Reset countdown',
      resetTime: 'Reset time',
      plan: 'Plan',
      toolDetails: 'Tool details',
      tokensUnit: 'tokens',
    },
    countdown: {
      resettingSoon: 'Resetting soon',
      daysHours: (days, hours) => `in ${days}d ${hours}h`,
      hoursMinutes: (hours, minutes) => `in ${hours}h ${minutes}m`,
      minutes: (minutes) => `in ${minutes}m`,
    },
    tooltip: {
      activity24h: '24-hour Activity',
      modelCalls: 'Model calls',
      tokenUsage: 'Token usage',
      mcpTools: 'MCP tools',
      networkSearches: (count) => `Search ${count}`,
      webReads: (count) => `Web read ${count}`,
      zread: (count) => `ZRead ${count}`,
      noUsageRecord: 'No usage record',
      connectedAgo: (minutes) => `Connected · Last updated ${minutes} minute${minutes === 1 ? '' : 's'} ago`,
      openOverview: 'Click to open quota overview and actions',
    },
    quickPick: {
      quotaStatus: 'Quota Status',
      usedPercentage: (percentage) => `Used ${percentage}`,
      resetDetail: (countdown, resetTime) => `Reset countdown ${countdown} · Reset time ${resetTime}`,
      mcpUsageDetail: (usage) => `Usage ${usage}`,
      noQuotaData: '$(info) No quota data',
      noQuotaDataDescription: 'Refresh or check the API response.',
      activity24h: '24-hour Activity',
      modelUsage: '$(graph-line) Model Usage',
      modelCallsDescription: (count) => `${count} calls`,
      tokenUsageDetail: (count) => `Token usage ${count}`,
      toolUsage: '$(tools) MCP Tool Usage',
      searchCount: (count) => `${count} search`,
      readCount: (count) => `${count} read`,
      noUsageRecord: 'No usage record',
      actions: 'Actions',
      refreshQuota: '$(refresh) Refresh Quota',
      refreshQuotaDescription: 'Update latest usage now',
      openSettings: '$(gear) Open Settings',
      openSettingsDescription: 'API key, refresh interval, warning threshold, language',
      placeholder: 'Review quota status or choose an action',
    },
  },
  'zh-CN': {
    languageOptions: {
      en: { label: 'English', description: 'Use English for extension UI.' },
      'zh-CN': { label: '简体中文', description: '使用简体中文显示扩展界面。' },
      'zh-TW': { label: '繁體中文', description: '使用繁體中文顯示擴充功能介面。' },
    },
    actions: {
      openSettings: '打开设置',
      retry: '重试',
    },
    notifications: {
      resetAt: (time) => `，将在 ${time} 重置`,
      quotaExhausted: (resetInfo) => `Z.ai Quota Monitor：5 小时配额已用尽${resetInfo}。`,
      quotaLow: (percentage, resetInfo) => `Z.ai Quota Monitor：5 小时配额已使用 ${percentage}%${resetInfo}。`,
      firstRunPrompt: 'Z.ai Quota Monitor 需要 API Key 才能启用配额监控。',
      configureApiKey: '设置 API Key',
      debugRequiresApiKey: '请先设置 API Key。',
      rawFetchFailed: (message) => `Z.ai Quota Monitor：原始 API 响应获取失败。${message}`,
    },
    configure: {
      placeholder: '选择要调整的设置项目',
      apiKeyLabel: '$(key) API Key',
      apiKeyDescription: '更新授权凭证',
      apiKeyDetail: 'API Key 会储存在 VS Code SecretStorage 中。',
      refreshIntervalLabel: '$(sync) 自动刷新间隔',
      refreshIntervalDescription: '调整后台更新频率',
      refreshIntervalDetail: '以分钟为单位，至少 1 分钟。',
      warnThresholdLabel: '$(warning) 警告阈值',
      warnThresholdDescription: '调整状态栏警示时机',
      warnThresholdDetail: '当 5 小时配额使用率达到此百分比时，状态栏会切换为警示色。',
      languageLabel: '$(globe) 语言',
      languageDescription: '切换显示语言',
      languageDetail: '可选择英文、简体中文或繁体中文。',
      apiKeyInfo: '请前往 Z.ai 管理页面取得 API Key，完成后回到 VS Code 粘贴。',
      openApiKeyPage: '打开 API Key 页面',
      enterApiKey: '输入 API Key',
      apiKeyPrompt: '输入 Z.ai API Key',
      apiKeyTooShort: 'API Key 太短，请检查。',
      apiKeyStored: 'Z.ai API Key 已安全储存。',
      refreshIntervalPrompt: '设置自动刷新间隔（分钟）',
      refreshIntervalInvalid: '请输入大于或等于 1 的数字。',
      warnThresholdPrompt: '设置状态栏警告阈值百分比',
      warnThresholdInvalid: '请输入 50 到 100 之间的数字。',
      languagePlaceholder: '选择显示语言',
      languageChanged: (language) => `显示语言已切换为 ${language}。`,
    },
    status: {
      notConfiguredText: '$(key) Z.ai 设置',
      notConfiguredTooltip: 'Z.ai Quota Monitor - 点击设置 API Key',
      loadingText: '$(sync~spin) Z.ai 更新中',
      loadingTooltip: '正在更新 Z.ai 配额数据',
      errorText: '$(error) Z.ai 错误',
      errorTooltip: (message) => `Z.ai 配额更新失败：${message}\n\n点击打开设置或重试`,
      exhaustedText: '$(error) Z.ai 已用尽',
    },
    quota: {
      token5h: '5 小时 Token 配额',
      weeklyToken: '周 Token 配额',
      mcpMonthly: 'MCP 月用量',
      exhausted: '已用尽',
      nearLimit: '接近上限',
      healthy: '正常',
      used: '已用',
      remaining: '剩余',
      resetCountdown: '重置倒计时',
      resetTime: '重置时间',
      plan: '方案',
      toolDetails: '工具明细',
      tokensUnit: 'tokens',
    },
    countdown: {
      resettingSoon: '即将重置',
      daysHours: (days, hours) => `${days} 天 ${hours} 小时后`,
      hoursMinutes: (hours, minutes) => `${hours} 小时 ${minutes} 分钟后`,
      minutes: (minutes) => `${minutes} 分钟后`,
    },
    tooltip: {
      activity24h: '24 小时活动',
      modelCalls: '模型调用',
      tokenUsage: 'Token 用量',
      mcpTools: 'MCP 工具',
      networkSearches: (count) => `搜索 ${count}`,
      webReads: (count) => `网页读取 ${count}`,
      zread: (count) => `ZRead ${count}`,
      noUsageRecord: '无使用记录',
      connectedAgo: (minutes) => `已连接 · 最后更新 ${minutes} 分钟前`,
      openOverview: '点击打开配额总览与操作菜单',
    },
    quickPick: {
      quotaStatus: '配额状态',
      usedPercentage: (percentage) => `已用 ${percentage}`,
      resetDetail: (countdown, resetTime) => `重置倒计时 ${countdown} · 重置时间 ${resetTime}`,
      mcpUsageDetail: (usage) => `用量 ${usage}`,
      noQuotaData: '$(info) 暂无配额数据',
      noQuotaDataDescription: '请重新整理或检查 API 响应。',
      activity24h: '24 小时活动',
      modelUsage: '$(graph-line) 模型用量',
      modelCallsDescription: (count) => `${count} 次调用`,
      tokenUsageDetail: (count) => `Token 用量 ${count}`,
      toolUsage: '$(tools) MCP 工具用量',
      searchCount: (count) => `${count} 搜索`,
      readCount: (count) => `${count} 读取`,
      noUsageRecord: '无使用记录',
      actions: '操作',
      refreshQuota: '$(refresh) 重新整理配额',
      refreshQuotaDescription: '立即更新最新用量',
      openSettings: '$(gear) 打开设置',
      openSettingsDescription: 'API Key、刷新间隔、警告阈值、语言',
      placeholder: '查看配额状态或选择操作',
    },
  },
  'zh-TW': {
    languageOptions: {
      en: { label: 'English', description: 'Use English for extension UI.' },
      'zh-CN': { label: '简体中文', description: '使用简体中文显示扩展界面。' },
      'zh-TW': { label: '繁體中文', description: '使用繁體中文顯示擴充功能介面。' },
    },
    actions: {
      openSettings: '開啟設定',
      retry: '重試',
    },
    notifications: {
      resetAt: (time) => `，將在 ${time} 重置`,
      quotaExhausted: (resetInfo) => `Z.ai Quota Monitor：5 小時配額已用盡${resetInfo}。`,
      quotaLow: (percentage, resetInfo) => `Z.ai Quota Monitor：5 小時配額已使用 ${percentage}%${resetInfo}。`,
      firstRunPrompt: 'Z.ai Quota Monitor 需要 API Key 才能啟用配額監控。',
      configureApiKey: '設定 API Key',
      debugRequiresApiKey: '請先設定 API Key。',
      rawFetchFailed: (message) => `Z.ai Quota Monitor：原始 API 回應擷取失敗。${message}`,
    },
    configure: {
      placeholder: '選擇要調整的設定項目',
      apiKeyLabel: '$(key) API Key',
      apiKeyDescription: '更新授權憑證',
      apiKeyDetail: 'API Key 會儲存在 VS Code SecretStorage 中。',
      refreshIntervalLabel: '$(sync) 自動刷新間隔',
      refreshIntervalDescription: '調整背景更新頻率',
      refreshIntervalDetail: '以分鐘為單位，至少 1 分鐘。',
      warnThresholdLabel: '$(warning) 警告閾值',
      warnThresholdDescription: '調整狀態列警示時機',
      warnThresholdDetail: '當 5 小時配額使用率達到此百分比時，狀態列會切換為警示色。',
      languageLabel: '$(globe) 語言',
      languageDescription: '切換顯示語言',
      languageDetail: '可選擇英文、簡體中文或繁體中文。',
      apiKeyInfo: '請前往 Z.ai 管理頁面取得 API Key，完成後回到 VS Code 貼上。',
      openApiKeyPage: '開啟 API Key 頁面',
      enterApiKey: '輸入 API Key',
      apiKeyPrompt: '輸入 Z.ai API Key',
      apiKeyTooShort: 'API Key 太短，請檢查。',
      apiKeyStored: 'Z.ai API Key 已安全儲存。',
      refreshIntervalPrompt: '設定自動刷新間隔（分鐘）',
      refreshIntervalInvalid: '請輸入大於或等於 1 的數字。',
      warnThresholdPrompt: '設定狀態列警告閾值百分比',
      warnThresholdInvalid: '請輸入 50 到 100 之間的數字。',
      languagePlaceholder: '選擇顯示語言',
      languageChanged: (language) => `顯示語言已切換為 ${language}。`,
    },
    status: {
      notConfiguredText: '$(key) Z.ai 設定',
      notConfiguredTooltip: 'Z.ai Quota Monitor - 點擊設定 API Key',
      loadingText: '$(sync~spin) Z.ai 更新中',
      loadingTooltip: '正在更新 Z.ai 配額資料',
      errorText: '$(error) Z.ai 錯誤',
      errorTooltip: (message) => `Z.ai 配額更新失敗：${message}\n\n點擊開啟設定或重試`,
      exhaustedText: '$(error) Z.ai 已用盡',
    },
    quota: {
      token5h: '5 小時 Token 配額',
      weeklyToken: '週 Token 配額',
      mcpMonthly: 'MCP 月用量',
      exhausted: '已用盡',
      nearLimit: '接近上限',
      healthy: '正常',
      used: '已用',
      remaining: '剩餘',
      resetCountdown: '重置倒數',
      resetTime: '重置時間',
      plan: '方案',
      toolDetails: '工具明細',
      tokensUnit: 'tokens',
    },
    countdown: {
      resettingSoon: '即將重置',
      daysHours: (days, hours) => `${days} 天 ${hours} 小時後`,
      hoursMinutes: (hours, minutes) => `${hours} 小時 ${minutes} 分鐘後`,
      minutes: (minutes) => `${minutes} 分鐘後`,
    },
    tooltip: {
      activity24h: '24 小時活動',
      modelCalls: '模型呼叫',
      tokenUsage: 'Token 用量',
      mcpTools: 'MCP 工具',
      networkSearches: (count) => `搜尋 ${count}`,
      webReads: (count) => `網頁讀取 ${count}`,
      zread: (count) => `ZRead ${count}`,
      noUsageRecord: '無使用紀錄',
      connectedAgo: (minutes) => `已連線 · 最後更新 ${minutes} 分鐘前`,
      openOverview: '點擊開啟配額總覽與操作選單',
    },
    quickPick: {
      quotaStatus: '配額狀態',
      usedPercentage: (percentage) => `已用 ${percentage}`,
      resetDetail: (countdown, resetTime) => `重置倒數 ${countdown} · 重置時間 ${resetTime}`,
      mcpUsageDetail: (usage) => `用量 ${usage}`,
      noQuotaData: '$(info) 尚無配額資料',
      noQuotaDataDescription: '請重新整理或檢查 API 回應。',
      activity24h: '24 小時活動',
      modelUsage: '$(graph-line) 模型用量',
      modelCallsDescription: (count) => `${count} 次呼叫`,
      tokenUsageDetail: (count) => `Token 用量 ${count}`,
      toolUsage: '$(tools) MCP 工具用量',
      searchCount: (count) => `${count} 搜尋`,
      readCount: (count) => `${count} 讀取`,
      noUsageRecord: '無使用紀錄',
      actions: '操作',
      refreshQuota: '$(refresh) 重新整理配額',
      refreshQuotaDescription: '立即更新最新用量',
      openSettings: '$(gear) 開啟設定',
      openSettingsDescription: 'API Key、刷新間隔、警告閾值、語言',
      placeholder: '查看配額狀態或選擇操作',
    },
  },
};

export function normalizeLanguage(value: unknown): Language {
  return LANGUAGE_VALUES.includes(value as Language) ? value as Language : DEFAULT_LANGUAGE;
}

export function getStrings(language: Language): LocaleStrings {
  return STRINGS[language] ?? STRINGS[DEFAULT_LANGUAGE];
}

export function getLocaleTag(language: Language): string {
  if (language === 'zh-CN') return 'zh-CN';
  if (language === 'zh-TW') return 'zh-TW';
  return 'en-US';
}

export function getAcceptLanguage(language: Language): string {
  if (language === 'zh-CN') return 'zh-CN,zh;q=0.9,en;q=0.8';
  if (language === 'zh-TW') return 'zh-TW,zh;q=0.9,en;q=0.8';
  return 'en-US,en;q=0.9';
}
