# DHS API Usage — DeepSeek Harness plugin

**English** | [简体中文](./README.zh-CN.md)

After installation, open **Settings → API Usage** in [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) to view your DeepSeek API usage. The page shows your account balance, estimated spend, token counts, and API request count over the last 24 hours, rendered as a timeline bar chart similar to the official DeepSeek platform usage page.

## Features

- 💰 **Balance card** — total balance with granted / topped-up split, plus an availability badge, fetched from the official [`GET /user/balance`](https://api-docs.deepseek.com/api/get-user-balance/) endpoint.
- 📊 **Metric cards** — 24h estimated spend (CNY), token counts (input / output split), and API request count.
- 📈 **Timeline chart** — hourly bars of estimated spend over the last 24 hours (hover for exact values).
- 🔄 **Live refresh** — balance refreshes every 60 s on the host; the page polls every 30 s and has a manual refresh button.
- 🔑 **No extra key setup** — reuses the deployment's existing `DEEPSEEK_API_KEY` credential through the harness `credentials` service.

## Architecture

```
┌─────────────────────────────── Host (Node.js) ───────────────────────────────┐
│ src/index.js                                                                 │
│  • ctx.on('llm/stream', ...)  ← waterfall: folds every real model call's     │
│      provider-reported TokenUsage (input/output/cache-hit/cache-miss,        │
│      already disjoint, matching DeepSeek billing vocabulary)                 │
│      into in-memory hourly + daily buckets                                   │
│  • fetchBalance()             ← credentials.resolve('DEEPSEEK_API_KEY')      │
│      → subprocess curl → https://api.deepseek.com/user/balance               │
│      (web.fetch cannot send an Authorization header, hence curl)             │
│  • harness.handle('dsapi:snapshot')  ← package-private RPC for the client    │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │ host.call('dsapi:snapshot')
                                    ▼
┌────────────────────────────── Client (browser) ─────────────────────────────┐
│ client/index.js                                                             │
│  • slots.inject('settings.section')  → new settings page "API用量"             │
│  • balance card + 3 metric cards + 24h timeline bar chart                   │
│  • auto-refresh every 30 s via ctx.interval                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data notes

- **Token counts are real** — they come from the `usage` chunk of every streaming model call (`StreamChunk` with `type: 'usage'`, `TokenUsage`), the same provider-reported numbers the harness itself uses for session stats.
- **Cost is an estimate** — CNY is computed from DeepSeek's public list prices (Chinese docs, [模型 & 价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)) in `PRICING` (`src/index.js`), applied per model:
  - cache hit input → `hit` price
  - cache miss input → `miss` price
  - output → `output` price
  - cache write is not billed separately by DeepSeek and is excluded.
- **In-memory only** — hourly buckets keep 48 h, daily keep 14 d; all data resets when the plugin (re)starts. No persistence is added on purpose: the harness has its own durable token-usage projection for sessions; this plugin is a live dashboard.

## Installation

### As a dynamic plugin (dev / session-scoped)

The original is a dynamic Cordis plugin, created per session with `cordis_define` / `cordis_run` (see the [DeepSeek Harness docs](https://github.com/deepseek-ai/DeepSeek-Harness)). The `code.host` body is `src/index.js` minus the `module.exports` wrapper; the `code.client` body is `client/index.js` minus the wrapper.

### As a composition plugin (persistent)

Add a row to the host composition (`cordis.yml`) pointing at this package, for example:

```yaml
- id: ds-api-usage
  name: './plugins/ds-api-usage'
```

or, after publishing, by npm package name. The plugin is *host-plane*: it reads the host `credentials`, `subprocess`, and `timer` services and registers the client settings page in the root-scoped `settings.section` slot, so it should live in the **host composition**, not inside an agent preset.

### Requirements

- DeepSeek Harness with the DeepSeek LLM adapter configured (`DEEPSEEK_API_KEY` credential resolvable via the `credentials` service)
- `curl` available on the host for the balance endpoint
- A browser client with the settings sidebar (for the UI)

## Development

```bash
npm run check   # syntax-check both halves
```

- Prices may drift: update `PRICING` in `src/index.js` when DeepSeek changes list prices (the constant is annotated with its snapshot date).
- The client currently hard-codes English labels; localize via the `locale` service if contributed back.

## License

[MIT](./LICENSE)
