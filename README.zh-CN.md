# Z.ai Quota Monitor

语言：[English](README.md) | **简体中文** | [繁體中文](README.zh-TW.md)

这是一个 VS Code 扩展，用来监控 Z.ai GLM Coding Plan 配额，并在状态栏显示清晰的用量百分比与重置倒计时。

## 功能

- **状态栏总览** - 显示用量百分比与重置倒计时，例如 `Z.ai 83% · 3h 17m`
- **丰富 tooltip 面板** - 显示 5 小时配额、周配额、MCP 用量与重置时间
- **状态色警示** - 超过设定阈值时使用警示色，配额用尽时使用错误色
- **配额总览菜单** - 点击状态栏项目即可打开 Quick Pick 总览与操作
- **自动刷新** - 可设置更新间隔，默认 5 分钟
- **安全储存** - API Key 使用 VS Code SecretStorage 储存
- **MCP 用量明细** - 显示网络搜索、Web Read、ZRead 用量
- **语言切换** - 扩展界面支持英文、简体中文、繁体中文
- **调试模式** - 打开原始 API 响应以便排查问题

## 安装

### 从 VSIX 安装

1. 下载 `zai-quota-monitor-1.0.0.vsix`
2. 在 VS Code 中执行 `Extensions: Install from VSIX...`
3. 选择下载的 `.vsix` 文件

### 手动构建

```bash
npm install
npm run compile
# 按 F5 在 Extension Development Host 中调试
# 或打包扩展：
npm run package
```

## 使用方式

1. 安装后，VS Code 会提示设置 API Key
2. 输入你的 Z.ai API Key，可从 https://z.ai/manage-apikey 获取
3. 状态栏会自动显示配额百分比和重置倒计时
4. 悬停查看完整 tooltip，或点击打开 Quick Pick 总览

## 命令

| 命令 | 说明 |
|---|---|
| `Z.ai Quota: Refresh Usage` | 重新整理配额数据 |
| `Z.ai Quota: Configure Monitor` | 设置 API Key、刷新间隔、警告阈值与语言 |
| `Z.ai Quota: Open Usage Overview` | 打开配额总览菜单 |
| `Z.ai Quota: Debug: Open Raw API Responses` | 打开原始 API 响应以便调试 |

## 设置

| 设置 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `zaiQuota.refreshInterval` | number | `5` | 自动刷新间隔（分钟） |
| `zaiQuota.warnThreshold` | number | `85` | 状态栏警告阈值百分比 |
| `zaiQuota.showCountdown` | boolean | `true` | 在状态栏文字中显示重置倒计时 |
| `zaiQuota.language` | string | `en` | 显示语言：`en`、`zh-CN` 或 `zh-TW` |

## 独立脚本

如果不想安装扩展，也可以使用独立脚本：

```bash
export ZAI_API_KEY="your-api-key"
node zai-quota.mjs
```

## 隐私

扩展会将你的 Z.ai API Key 储存在 VS Code SecretStorage 中，并使用它调用 Z.ai 配额监控端点。API Key 不会写入工作区文件。

## 技术

- TypeScript，零运行时依赖
- 使用 Node.js 内置 `https` 模块
- API Key 储存在 VS Code SecretStorage

## 授权

MIT
