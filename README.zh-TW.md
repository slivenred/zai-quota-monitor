# Z.ai Quota Monitor

語言：[English](README.md) | [简体中文](README.zh-CN.md) | **繁體中文**

這是一個 VS Code 擴充功能，用來監控 Z.ai GLM Coding Plan 配額，並在狀態列顯示清晰的用量百分比與重置倒數。

## 功能

- **狀態列總覽** - 顯示用量百分比與重置倒數，例如 `Z.ai 83% · 3h 17m`
- **豐富 tooltip 面板** - 顯示 5 小時配額、週配額、MCP 用量與重置時間
- **狀態色警示** - 超過設定閾值時使用警示色，配額用盡時使用錯誤色
- **配額總覽選單** - 點擊狀態列項目即可開啟 Quick Pick 總覽與操作
- **自動刷新** - 可設定更新間隔，預設 5 分鐘
- **安全儲存** - API Key 使用 VS Code SecretStorage 儲存
- **MCP 用量明細** - 顯示網路搜尋、Web Read、ZRead 用量
- **語言切換** - 擴充功能介面支援英文、簡體中文、繁體中文
- **除錯模式** - 開啟原始 API 回應以便排查問題

## 安裝

### 從 VSIX 安裝

1. 下載 `zai-quota-monitor-1.0.0.vsix`
2. 在 VS Code 中執行 `Extensions: Install from VSIX...`
3. 選擇下載的 `.vsix` 檔案

### 手動建置

```bash
npm install
npm run compile
# 按 F5 在 Extension Development Host 中除錯
# 或打包擴充功能：
npm run package
```

## 使用方式

1. 安裝後，VS Code 會提示設定 API Key
2. 輸入你的 Z.ai API Key，可從 https://z.ai/manage-apikey 取得
3. 狀態列會自動顯示配額百分比和重置倒數
4. 懸停查看完整 tooltip，或點擊開啟 Quick Pick 總覽

## 命令

| 命令 | 說明 |
|---|---|
| `Z.ai Quota: Refresh Usage` | 重新整理配額資料 |
| `Z.ai Quota: Configure Monitor` | 設定 API Key、刷新間隔、警告閾值與語言 |
| `Z.ai Quota: Open Usage Overview` | 開啟配額總覽選單 |
| `Z.ai Quota: Debug: Open Raw API Responses` | 開啟原始 API 回應以便除錯 |

## 設定

| 設定 | 類型 | 預設值 | 說明 |
|---|---|---|---|
| `zaiQuota.refreshInterval` | number | `5` | 自動刷新間隔（分鐘） |
| `zaiQuota.warnThreshold` | number | `85` | 狀態列警告閾值百分比 |
| `zaiQuota.showCountdown` | boolean | `true` | 在狀態列文字中顯示重置倒數 |
| `zaiQuota.language` | string | `en` | 顯示語言：`en`、`zh-CN` 或 `zh-TW` |

## 獨立腳本

如果不想安裝擴充功能，也可以使用獨立腳本：

```bash
export ZAI_API_KEY="your-api-key"
node zai-quota.mjs
```

## 隱私

擴充功能會將你的 Z.ai API Key 儲存在 VS Code SecretStorage 中，並使用它呼叫 Z.ai 配額監控端點。API Key 不會寫入工作區檔案。

## 技術

- TypeScript，零執行階段依賴
- 使用 Node.js 內建 `https` 模組
- API Key 儲存在 VS Code SecretStorage

## 授權

MIT
