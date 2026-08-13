# DS API Usage — DeepSeek Harness 插件

[English](./README.md) | **简体中文**

安装后，打开 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) 的**设置 → API用量**页面，即可查看 DeepSeek API 用量。页面展示账户余额、最近 24 小时的估算消费金额、Token 数量与 API 请求次数，并以类似 DeepSeek 官方平台用量页的时间线柱状图呈现。

## 功能特性

- 💰 **余额卡片** — 总余额（赠送 / 充值分项）+ 可用状态徽标，数据来自官方 [`GET /user/balance`](https://api-docs.deepseek.com/api/get-user-balance/) 接口。
- 📊 **指标卡片** — 24h 估算消费（人民币 CNY）、Token 数量（输入 / 输出分项）、API 请求次数。
- 📈 **时间线图表** — 最近 24 小时按小时聚合的消费金额柱状图（悬停查看精确数值）。
- 🔄 **实时刷新** — Host 端每 60 秒刷新余额；页面每 30 秒轮询，并提供手动刷新按钮。
- 🔑 **无需额外配置密钥** — 复用部署中已有的 `DEEPSEEK_API_KEY` 凭证（通过 harness 的 `credentials` 服务）。

## 架构

```
┌─────────────────────────────── Host（Node.js）───────────────────────────────┐
│ src/index.js                                                                 │
│  • ctx.on('llm/stream', ...)  ← waterfall：将每次真实模型调用的               │
│      provider 上报的 TokenUsage（输入/输出/缓存命中/缓存未命中，              │
│      已是互斥分项，与 DeepSeek 计费口径一致）                                 │
│      折叠进内存中的按小时 + 按天桶                                           │
│  • fetchBalance()             ← credentials.resolve('DEEPSEEK_API_KEY')      │
│      → subprocess curl → https://api.deepseek.com/user/balance               │
│      （web.fetch 无法携带 Authorization 头，故用 curl）                       │
│  • harness.handle('dsapi:snapshot')  ← 供 Client 调用的私有 RPC               │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │ host.call('dsapi:snapshot')
                                    ▼
┌────────────────────────────── Client（浏览器）───────────────────────────────┐
│ client/index.js                                                             │
│  • slots.inject('settings.section')  → 新增设置页「API用量」                   │
│  • 余额卡片 + 3 张指标卡 + 24h 时间线柱状图                                  │
│  • 每 30 秒通过 ctx.interval 自动刷新                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 数据说明

- **Token 数量是真实的** — 来自每次流式模型调用的 `usage` chunk（`StreamChunk` 的 `type: 'usage'`、`TokenUsage`），与 harness 自身用于会话统计的 provider 上报数据完全一致。
- **消费金额为估算** — 人民币（CNY）按 DeepSeek 官方公开价（中文文档，[模型 & 价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)）在 `PRICING`（`src/index.js`）中按模型计算：
  - 缓存命中输入 → `hit` 单价
  - 缓存未命中输入 → `miss` 单价
  - 输出 → `output` 单价
  - DeepSeek 不单独对缓存写入计费，故未计入。
- **仅内存存储** — 按小时桶保留 48 小时，按天桶保留 14 天；插件（重新）启动时数据清零。有意不做持久化：harness 本身对会话已有持久化的 token 用量投影；本插件定位为实时仪表盘。

## 安装

### 作为动态插件（开发 / 会话级）

原版是会话级动态 Cordis 插件，通过 `cordis_define` / `cordis_run` 创建（参见 [DeepSeek Harness 文档](https://github.com/deepseek-ai/DeepSeek-Harness)）。`code.host` 的函数体即 `src/index.js` 去掉 `module.exports` 包装；`code.client` 的函数体即 `client/index.js` 去掉包装。

### 作为组合插件（持久化）

在宿主组合（`cordis.yml`）中添加指向本包的一行，例如：

```yaml
- id: ds-api-usage
  name: './plugins/ds-api-usage'
```

或发布到 npm 后按包名引用。本插件属于 **Host 平面**：它读取 Host 的 `credentials`、`subprocess`、`timer` 服务，并将客户端设置页注册到根作用域的 `settings.section` 插槽，因此应放在**宿主组合**中，而不是某个 agent preset 内。

### 依赖要求

- 已配置 DeepSeek LLM 适配器的 DeepSeek Harness（`DEEPSEEK_API_KEY` 凭证可通过 `credentials` 服务解析）
- Host 上可用 `curl`（用于余额接口）
- 带设置侧边栏的浏览器客户端（用于 UI）

## 开发

```bash
npm run check   # 语法检查两个半端
```

- 价格可能变动：DeepSeek 调整公开价时请更新 `src/index.js` 中的 `PRICING`（常量已注明快照日期）。
- Client 目前硬编码中文标签；若回馈上游，可通过 `locale` 服务做国际化。

## 许可证

[MIT](./LICENSE)
