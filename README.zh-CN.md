# DHS API Usage — DeepSeek Harness 插件

[English](./README.md) | **简体中文** | [Português (Brasil)](./README.pt-BR.md)

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
│  • webServer.register('/ds-api-usage/snapshot')  ← 供 Client 读取的 JSON 端点 │
└──────────────────────────────────────────────────────────────────────────────┘
                              │ fetch('/ds-api-usage/snapshot')
                              ▼
┌────────────────────────────── Client（浏览器）───────────────────────────────┐
│ client/bundle.js（web bundle；client/index.js 为动态插件源码）               │
│  • slots.inject('settings.section')  → 新增设置页「API用量」                   │
│  • 余额卡片 + 3 张指标卡 + 24h 时间线柱状图                                  │
│  • 每 30 秒通过 ctx.interval 自动刷新                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 数据说明

- **Token 数量是真实的** — 来自每次流式模型调用的 `usage` chunk（`StreamChunk` 的 `type: 'usage'`、`TokenUsage`），与 harness 自身用于会话统计的 provider 上报数据完全一致。
- **消费金额为估算** — 人民币（CNY）按 DeepSeek 官方公开价（中文文档，[模型 & 价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)）在生成的 `PRICING` 表（`src/index.js`）中按模型计算：
  - 缓存命中输入 → `hit` 单价
  - 缓存未命中输入 → `miss` 单价
  - 输出 → `output` 单价
  - DeepSeek 不单独对缓存写入计费，故未计入。
  - 自 2026-08-16 起 DeepSeek 按高峰 / 空闲时段计费：带有 `peak` / `offPeak` 单价的模型按请求的 UTC 小时（`peakHoursUtc` 中的窗口：01:00–04:00 与 06:00–10:00 UTC）计费；其余模型使用 `flat` 单价。
- **仅内存存储** — 按小时桶保留 48 小时，按天桶保留 14 天；插件（重新）启动时数据清零。有意不做持久化：harness 本身对会话已有持久化的 token 用量投影；本插件定位为实时仪表盘。

## 安装

### 通过 `dsh plugin add` 安装（推荐，GitHub 或 npm）

直接从本 GitHub 仓库安装：

```bash
dsh plugin --profile web add github:Sev7een/ds-api-usage
```

或发布到 npm 后：

```bash
dsh plugin --profile web add dsh-plugin-ds-api-usage
```

`dsh plugin` 会在 profile 目录中转发给 pnpm，并将包调和进 profile 的 bundle 列表（`dsh.profile.bundles`）。包内 `cordis.patch.yml`（经 `package.json` 的 `dsh.bundle.patch` 声明）随后把插件行插入宿主组合；`dsh.client` 声明则让 web 外壳加载 `client/bundle.js` 作为设置页。

### 作为动态插件（开发 / 会话级）

原版是会话级动态 Cordis 插件，通过 `cordis_define` / `cordis_run` 创建（参见 [DeepSeek Harness 文档](https://github.com/deepseek-ai/DeepSeek-Harness)）。`code.host` 的函数体即 `src/index.js` 去掉 `module.exports` 包装；`code.client` 的函数体即 `client/index.js` 去掉包装。

> 注意：动态形态使用沙箱私有的 `harness.handle` / `host.call` 通道（`client/index.js`），而静态 bundle 形态（`client/bundle.js`）通过 HTTP 路由 `/ds-api-usage/snapshot` 与 Host 通信。修改协议时请保持两者同步。

### 作为组合插件（持久化，手动）

在你的 profile 的宿主组合（`cordis.patch.yml`）中添加：

```yaml
- insert:
    - id: ds-api-usage
      name: 'dsh-plugin-ds-api-usage'
```

或不安装包、以相对路径指向本仓库。本插件属于 **Host 平面**：它读取 Host 的 `credentials`、`subprocess`、`timer`、`webServer` 服务，并将客户端设置页注册到根作用域的 `settings.section` 插槽，因此应放在**宿主组合**中，而不是某个 agent preset 内。

### 依赖要求

- 已配置 DeepSeek LLM 适配器的 DeepSeek Harness（`DEEPSEEK_API_KEY` 凭证可通过 `credentials` 服务解析）
- Host 上可用 `curl`（用于余额接口）
- 带设置侧边栏的浏览器客户端（用于 UI）

## 开发

```bash
npm run check   # 语法检查两个半端
npm test        # 离线测试套件：定价解析器（fixtures）+ peak/off-peak 计费逻辑
```

- 价格自动跟踪：`.github/workflows/update-pricing.yml`（每日 cron + 手动触发）会重新解析官方定价页，表有变化时自动开启 PR；`npm run update:pricing` 可本地执行同样操作（`--apply` 写入 `src/index.js` 中的生成块）。请只通过脚本修改表格——`__PRICING_BEGIN__` / `__PRICING_END__` 标记之间的块为生成内容。
- Client 通过 harness 的 `locale` 服务本地化（命名空间 `settings.ds-api-usage`），并跟随 harness 的当前语言：提供 harness 的 `zh`/`en` 词典及 `pt-BR` 条目（为将来 harness 支持预留；当前语言缺少的键会回退到 `zh`）。

## CI / GitHub Actions

仓库自带两个工作流——无需任何密钥或 API key，唯一前提是仓库已启用 GitHub Actions（默认；可在 **Settings → Actions → General → Allow all actions** 确认）：

- **`ci.yml`** — 每次 push 与 pull request 都会运行：`npm run check`（两端语法检查）与 `npm test`（基于页面 fixtures 的离线测试套件）。
- **`update-pricing.yml`** — 每天（06:23 UTC cron）及手动触发（**Actions → update-pricing → Run workflow**）重新解析 DeepSeek 官方定价页；表格变化时自动开启 PR（工作流在默认 `GITHUB_TOKEN` 上声明了 `contents: write` 与 `pull-requests: write`，无需额外配置）。若文档页改版，解析校验会失败并让 job 响亮地失败，而不会开出错误的 PR。

首次 push 后，请手动运行一次 **Actions → update-pricing → Run workflow** 以端到端验证整个流程（价格未变时，`no change` 是预期的绿色结果）。

## 许可证

[MIT](./LICENSE)
