# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-08-29

### Fixed

- Transient transport failures (connection resets, DNS blips, timeouts,
  HTTP 429/5xx) are now retried automatically with short exponential backoff,
  so occasional network blips between the machine and `api.z.ai` no longer
  surface as "Request failed" errors. Underlying error codes (e.g.
  `ECONNRESET`) are logged for diagnosis.

## [1.0.1] - 2026-08-15

### Fixed

- Auto-refresh now starts correctly when the API key is set after activation
  (previously the first-run setup left the session without periodic monitoring).
- The status bar countdown no longer goes stale between refreshes — it is
  re-rendered locally every 30 seconds without extra API calls.
- Errors no longer raise a notification toast on every background refresh
  cycle; the actionable toast now appears for manual refreshes and on the
  first failure of an outage. The last known usage stays visible (with an
  error background) while data is unavailable.
- The 24-hour usage window sent to the API is now exactly 24 hours ending at
  the current time (previously it could span up to ~25 hours).
- A stalled or prematurely closed HTTPS response can no longer hang a quota
  request; a hard deadline now settles every request.
- `zaiQuota.refreshInterval` values below 1 (or non-numeric) in `settings.json`
  are clamped instead of producing a request storm.
- Activation no longer blocks on the first-run prompt or the initial network
  fetch.

### Added

- Weekly quota support in notifications and the status bar for plans without
  a 5-hour quota (previously these showed `Z.ai --` and never notified).
- Typed API errors: auth (401/403), timeout, and network failures are now
  reported with distinct, localized messages instead of a generic
  "check your API key".
- Partial-failure awareness: when some endpoints fail, the tooltip warns that
  data may be incomplete and details are written to the output channel.
- "Clear API Key" action in the configuration menu to remove the stored
  credential and stop monitoring.
- Status bar reacts immediately to API key changes made in another window.
- Unit tests for the API-layer pure functions (`npm test`).
- Workspace trust declaration so the extension works in Restricted Mode.

### Changed

- Output channel is now a proper log channel and records refresh failures.
- Traditional Chinese (zh-TW) UI terminology consistency (重設, 重新整理, 警示門檻).
- Status bar compact countdown strings are localized through the i18n layer.
- API-derived values (plan name, tool codes) are escaped in the markdown tooltip.
- Packaging: the `.vsix` no longer ships the standalone CLI script, translated
  READMEs, or `package-lock.json`.
- Command titles and settings descriptions are localized via `package.nls`
  files (English, Simplified Chinese, Traditional Chinese).
- The standalone `zai-quota.mjs` script now imports the compiled API client
  from `out/`, so the CLI and the extension can no longer drift apart
  (requires a one-time `npm install && npm run compile`).
- CI workflow: compile, test, and package on every push and pull request.

## [1.0.0]

- Initial release: status bar quota monitoring, rich tooltip, Quick Pick
  overview, auto refresh, secure API key storage, en/zh-CN/zh-TW UI.
