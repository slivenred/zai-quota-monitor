# Z.ai Quota Monitor

VS Code 擴展，即時監控 Z.ai GLM Coding Plan 配額，直接在狀態欄顯示用量百分比和重置倒數。

## 功能

- ⚡ **狀態欄即時顯示** — 百分比 + 重置倒數（例：`⚡ 83% • 3h 17m`）
- ⏰ **重置時間** — 懸停 tooltip 顯示 5 小時、週配額、MCP 的精確重置時間
- 🎨 **顏色警告** — 用量超過閾值時狀態欄變黃，耗盡時變紅
- 📊 **完整配額面板** — 點擊狀態欄查看 Quick Pick 選單
- 🔄 **自動刷新** — 可設定間隔（預設 5 分鐘）
- 🔐 **安全儲存** — API Key 使用 VS Code SecretStorage 加密
- 🛠️ **MCP 工具明細** — 網頁搜尋、Web Read、ZRead 用量
- 🐛 **除錯模式** — 查看原始 API 回應

## 安裝

### 從 VSIX 安裝（推薦）

1. 下載 `zai-quota-monitor-1.0.0.vsix`
2. 在 VS Code 中執行 `Extensions: Install from VSIX...`
3. 選擇下載的 `.vsix` 檔案

### 手動建置

```bash
npm install
npm run compile
# 按 F5 在 Extension Development Host 中除錯
# 或打包：
npm run package
```

## 使用方式

1. 安裝後，VS Code 會提示設定 API Key
2. 輸入你的 Z.ai API Key（從 https://z.ai/manage-apikey 取得）
3. 狀態欄會自動顯示配額百分比和重置倒數
4. 懸停查看完整 tooltip，點擊查看 Quick Pick 選單

## 命令

| 命令 | 說明 |
|------|------|
| `Z.ai Quota: Refresh Quota` | 重新整理配額 |
| `Z.ai Quota: Configure Settings` | 設定 API Key、刷新間隔 |
| `Z.ai Quota: Show Detail Panel` | 顯示完整配額面板 |
| `Z.ai Quota: Debug: Show Raw API Responses` | 除錯：顯示原始 API 回應 |

## 設定

| 設定 | 類型 | 預設 | 說明 |
|------|------|------|------|
| `zaiQuota.refreshInterval` | number | 5 | 自動刷新間隔（分鐘）|
| `zaiQuota.warnThreshold` | number | 85 | 狀態欄變黃的百分比閾值 |
| `zaiQuota.showCountdown` | boolean | true | 狀態欄顯示重置倒數 |

## 獨立腳本

如果不想安裝擴展，也可以使用獨立腳本：

```bash
export ZAI_API_KEY="your-api-key"
node zai-quota.mjs
```

## 技術

- TypeScript，零運行時依賴
- 使用 Node.js 內建 `https` 模組
- API Key 存儲在 VS Code SecretStorage（加密）

## 授權

MIT
