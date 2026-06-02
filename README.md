# Z.ai Quota Monitor

Language: **English** | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md)

A VS Code extension that monitors Z.ai GLM Coding Plan quota and shows a clean status bar overview with usage percentage and reset countdown.

## Features

- **Status bar overview** - Shows usage percentage and reset countdown, for example `Z.ai 83% · 3h 17m`
- **Rich tooltip panel** - Displays 5-hour quota, weekly quota, MCP usage, and reset times
- **Status color warnings** - Uses warning color above the configured threshold and error color when quota is exhausted
- **Quota overview menu** - Click the status bar item to open a Quick Pick overview and actions
- **Auto refresh** - Configurable update interval, default 5 minutes
- **Secure storage** - API key is stored in VS Code SecretStorage
- **MCP usage details** - Shows network search, Web Read, and ZRead usage
- **Language switching** - Extension UI supports English, Simplified Chinese, and Traditional Chinese
- **Debug mode** - Opens raw API responses for troubleshooting

## Installation

### Install from VSIX

1. Download `zai-quota-monitor-1.0.0.vsix`
2. In VS Code, run `Extensions: Install from VSIX...`
3. Select the downloaded `.vsix` file

### Build manually

```bash
npm install
npm run compile
# Press F5 to debug in Extension Development Host
# Or package the extension:
npm run package
```

## Usage

1. After installation, VS Code prompts you to set an API key
2. Enter your Z.ai API key from https://z.ai/manage-apikey
3. The status bar automatically shows quota percentage and reset countdown
4. Hover to view the full tooltip, or click to open the Quick Pick overview

## Commands

| Command | Description |
|---|---|
| `Z.ai Quota: Refresh Usage` | Refresh quota data |
| `Z.ai Quota: Configure Monitor` | Configure API key, refresh interval, warning threshold, and language |
| `Z.ai Quota: Open Usage Overview` | Open the quota overview menu |
| `Z.ai Quota: Debug: Open Raw API Responses` | Open raw API responses for debugging |

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `zaiQuota.refreshInterval` | number | `5` | Auto-refresh interval in minutes |
| `zaiQuota.warnThreshold` | number | `85` | Status bar warning threshold percentage |
| `zaiQuota.showCountdown` | boolean | `true` | Show reset countdown in status bar text |
| `zaiQuota.language` | string | `en` | Display language: `en`, `zh-CN`, or `zh-TW` |

## Standalone Script

If you do not want to install the extension, you can also use the standalone script:

```bash
export ZAI_API_KEY="your-api-key"
node zai-quota.mjs
```

## Privacy

The extension stores your Z.ai API key in VS Code SecretStorage and uses it to call Z.ai quota monitoring endpoints. The key is not written to workspace files.

## Tech

- TypeScript with zero runtime dependencies
- Uses Node.js built-in `https` module
- API key is stored in VS Code SecretStorage

## License

MIT
