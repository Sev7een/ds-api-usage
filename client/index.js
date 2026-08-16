'use strict'

/**
 * DHS API Usage — Client half
 *
 * Registers a new settings page ("Uso da API") that renders:
 *  - a balance card (total / granted / topped-up, availability badge),
 *  - three metric cards (24h estimated cost in CNY, tokens, request count),
 *  - a 24h timeline bar chart of estimated spend (cost view only).
 *
 * Data arrives from the Host half through the package-private RPC method
 * `dsapi:snapshot` (host.call). The page auto-refreshes every 30s.
 *
 * UI text is localized through the harness `locale` service (namespace
 * `settings.ds-api-usage`): dictionaries ship for the harness's 'zh' and 'en'
 * locale ids plus a 'pt-BR' entry for future harness support, and the plugin
 * follows the harness's active locale (the service falls back per namespace
 * to 'zh' when a key is missing).
 */

const LOCALE_NS = 'settings.ds-api-usage'
const PT_BR = {
  title: 'Uso da API',
  refresh: 'atualizar saldo',
  refreshing: 'atualizando…',
  trackingSince: 'monitorando desde {time}',
  balanceUpdated: ' · saldo atualizado em {time}',
  grantedTopup: 'concedido {granted} · recarregado {toppedUp}',
  available: 'disponível',
  insufficient: 'insuficiente',
  balanceError: 'saldo: {error}',
  cost24h: 'custo 24h (CNY)',
  estimated: 'estimado',
  tokens24h: 'tokens 24h',
  inOut: 'entrada {input} · saída {output}',
  apiRequests: 'requisições de API',
  last24h: 'últimas 24h',
  timeline: 'Linha do tempo',
  metricCost: 'Custo',
  metricTokens: 'Tokens',
  metricRequests: 'Requisições',
  noData: 'Ainda sem dados de uso — toda chamada de modelo após o início do plugin aparecerá aqui.',
  pricingNote: 'Custo estimado em CNY a partir dos preços públicos da DeepSeek (cache hit / miss / saída; preços flat ou peak/off-peak conforme o horário UTC); apenas para referência.',
}
const ZH = {
  title: 'API用量',
  refresh: '刷新余额',
  refreshing: '刷新中…',
  trackingSince: '统计自 {time}',
  balanceUpdated: ' · 余额更新于 {time}',
  grantedTopup: '赠送 {granted} · 充值 {toppedUp}',
  available: '可用',
  insufficient: '余额不足',
  balanceError: '余额：{error}',
  cost24h: '24h 消费（CNY）',
  estimated: '估算',
  tokens24h: '24h Tokens',
  inOut: '输入 {input} · 输出 {output}',
  apiRequests: 'API 请求',
  last24h: '近 24h',
  timeline: '时间线',
  metricCost: '消费',
  metricTokens: 'Tokens',
  metricRequests: '请求',
  noData: '暂无用量数据——插件启动后发生的每次模型调用都会出现在这里。',
  pricingNote: 'CNY 消费估算基于 DeepSeek 公开价目（cache hit / miss / 输出；按 UTC 时段 flat 或 peak/off-peak 计价）；仅供参考。',
}
const EN = {
  title: 'API Usage',
  refresh: 'Refresh balance',
  refreshing: 'Refreshing…',
  trackingSince: 'Tracking since {time}',
  balanceUpdated: ' · balance updated {time}',
  grantedTopup: 'granted {granted} · topped-up {toppedUp}',
  available: 'available',
  insufficient: 'insufficient',
  balanceError: 'balance: {error}',
  cost24h: '24h cost (CNY)',
  estimated: 'estimated',
  tokens24h: '24h tokens',
  inOut: 'in {input} · out {output}',
  apiRequests: 'API requests',
  last24h: 'last 24h',
  timeline: 'Timeline',
  metricCost: 'Cost',
  metricTokens: 'Tokens',
  metricRequests: 'Requests',
  noData: 'No usage data yet — every model call after plugin start appears here.',
  pricingNote: 'Cost estimated in CNY from DeepSeek public list prices (cache hit / miss / output; flat or peak/off-peak by UTC hour); for reference only.',
}
// The locale service looks a key up in: active locale → 'zh' (per-namespace
// fallback) → 'common' → the key itself. Dictionaries follow the harness's
// shipped locale ids ('zh'/'en'); 'pt-BR' is registered ahead of future
// harness support for the locale.
const LOCALE_DICT = { 'pt-BR': PT_BR, zh: ZH, en: EN }

module.exports = {
  name: 'ds-api-usage-client',
  inject: ['timer', 'locale'],

  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    const t = ctx.locale.bind(LOCALE_NS)
    ctx.effect(() => ctx.locale.register(LOCALE_NS, LOCALE_DICT))

    styles.insert(`
.dsau-root { display:flex; flex-direction:column; gap:14px; padding:6px 2px; font-family: inherit; }
.dsau-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.dsau-title { font-size:18px; font-weight:600; margin:0; }
.dsau-subtitle { font-size:14px; font-weight:600; margin:0; }
.dsau-btn { color:var(--dsw-alias-label-secondary, #bbb); font:inherit; cursor:pointer; background:transparent; border:none; border-radius:7px; padding:5px 8px; font-size:12.5px; }
.dsau-btn:hover:not(:disabled) { background:var(--dsw-alias-bg-layer-1, rgba(128,128,128,.08)); }
.dsau-btn.active { background:var(--dsw-alias-bg-layer-1, rgba(128,128,128,.12)); color:var(--dsw-alias-label-primary, inherit); }
.dsau-btn:disabled { opacity:.5; cursor:default; }
.dsau-meta { font-size:12px; color:var(--dsw-alias-label-tertiary, #999); }
.dsau-balance { display:flex; align-items:center; justify-content:space-between; border:1px solid var(--dsw-alias-border-l2, #444); border-radius:10px; padding:14px 16px; }
.dsau-balance-num { font-size:26px; font-weight:700; line-height:1.1; }
.dsau-balance-sub { font-size:12px; color:var(--dsw-alias-label-secondary, #bbb); margin-top:4px; }
.dsau-badge { white-space:nowrap; border-radius:999px; padding:1px 8px; font-size:11px; font-weight:500; line-height:17px; border:1px solid var(--dsw-alias-border-l2, #555); color:var(--dsw-alias-label-tertiary, #999); }
.dsau-badge-bad { background:var(--dsw-alias-state-error-primary, #ef4444); border-color:var(--dsw-alias-state-error-primary, #ef4444); color:var(--dsw-alias-bg-layer-3, #fff); }
.dsau-metrics { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
.dsau-metric { border:1px solid var(--dsw-alias-border-l2, #444); border-radius:10px; padding:10px 12px; }
.dsau-metric-label { font-size:12px; font-weight:500; color:var(--dsw-alias-label-secondary, #bbb); }
.dsau-metric-value { font-size:17px; font-weight:600; margin-top:2px; }
.dsau-metric-sub { font-size:11px; color:var(--dsw-alias-label-tertiary, #999); margin-top:2px; }
.dsau-chart { display:flex; align-items:flex-end; gap:3px; height:150px; padding-top:8px; border-bottom:1px solid var(--dsw-alias-border-l2, #444); }
.dsau-col { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; min-width:0; }
.dsau-bar { width:100%; max-width:22px; background:linear-gradient(180deg, var(--dsw-alias-brand-primary, #4f8cff), rgba(79,140,255,.45)); border-radius:3px 3px 0 0; }
.dsau-x { font-size:9px; color:var(--dsw-alias-label-tertiary, #999); margin-top:4px; white-space:nowrap; }
.dsau-err { border:1px solid var(--dsw-alias-state-error-primary, rgba(239,68,68,.5)); background:var(--dsw-alias-state-error-secondary, rgba(239,68,68,.08)); border-radius:8px; padding:8px 12px; font-size:12px; color:var(--dsw-alias-state-error-primary, #ef4444); }
.dsau-note { font-size:11px; color:var(--dsw-alias-label-tertiary, #999); }
.dsau-tabs { border-bottom:1px solid var(--dsw-alias-border-l2, #444); display:flex; gap:2px; }
.dsau-tab { color:var(--dsw-alias-label-tertiary, #999); cursor:pointer; background:transparent; border:0; padding:0 10px 7px; font-size:13px; position:relative; }
.dsau-tab:hover { color:var(--dsw-alias-label-primary, inherit); }
.dsau-tab.active { color:var(--dsw-alias-state-business-primary, #4f8cff); }
`)

    function fmtCny(v) {
      if (v === null || v === undefined || isNaN(v)) return '—'
      if (v > 0 && v < 0.01) return '¥' + v.toFixed(4)
      return '¥' + v.toFixed(2)
    }
    // Balance values come from the API with their own currency code
    // (only 'CNY' or 'USD' per the official docs), so show the code as-is.
    function fmtMoney(currency, v) {
      return currency + ' ' + v
    }
    function fmtTokens(n) {
      if (n === null || n === undefined || isNaN(n)) return '—'
      if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
      return String(Math.round(n))
    }
    function fmtTime(ts) {
      const d = new Date(ts)
      const p = (x) => String(x).padStart(2, '0')
      return p(d.getHours()) + ':' + p(d.getMinutes())
    }
    function fmtDay(ts) {
      const d = new Date(ts)
      return d.getDate() + '/' + (d.getMonth() + 1)
    }

    function Panel() {
      const [snap, setSnap] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const [range, setRange] = React.useState('24h')
      const [metric, setMetric] = React.useState('cost')
      const [localeRev, setLocaleRev] = React.useState(0)

      const load = async (force) => {
        setBusy(true)
        try {
          const data = await host.call('dsapi:snapshot', { force: !!force })
          setSnap(data)
          setError(null)
        } catch (e) {
          setError(String((e && e.message) || e))
        }
        setBusy(false)
      }

      React.useEffect(() => {
        load(false)
        const dispose = ctx.interval(() => load(false), 30000)
        return () => { dispose() }
      }, [])

      // re-render whenever the harness locale or this dictionary changes
      React.useEffect(() => ctx.locale.subscribe(() => setLocaleRev((r) => r + 1)), [])

      const buckets = snap ? (range === '14d' ? snap.daily : snap.hourly) : []
      const totals = snap ? snap.totals : null
      const balance = snap ? snap.balance : null
      const metricValue = (b) => metric === 'tokens' ? b.inputTokens + b.outputTokens : metric === 'requests' ? b.requests : b.costCny
      const metricLabel = (v) => metric === 'tokens' ? fmtTokens(v) : metric === 'requests' ? String(v) : fmtCny(v)
      const max = buckets.reduce((m, b) => Math.max(m, metricValue(b)), 0) || 1

      return React.createElement('div', { className: 'dsau-root' },
        React.createElement('div', { className: 'dsau-head' },
          React.createElement('h3', { className: 'dsau-title' }, t('title')),
          React.createElement('button', { className: 'dsau-btn', disabled: busy, onClick: () => load(true) }, busy ? t('refreshing') : t('refresh'))
        ),
        snap && React.createElement('div', { className: 'dsau-meta' },
          t('trackingSince', { time: fmtTime(snap.startedAt) }) + (balance && balance.ok ? t('balanceUpdated', { time: fmtTime(balance.fetchedAt) }) : '')
        ),
        error && React.createElement('div', { className: 'dsau-err' }, error),
        balance && (balance.ok
          ? React.createElement('div', { className: 'dsau-balance' },
              React.createElement('div', null,
                React.createElement('div', { className: 'dsau-balance-num' }, fmtMoney(balance.currency, balance.total)),
                React.createElement('div', { className: 'dsau-balance-sub' },
                  t('grantedTopup', { granted: fmtMoney(balance.currency, balance.granted), toppedUp: fmtMoney(balance.currency, balance.toppedUp) })
                )
              ),
              React.createElement('span', { className: balance.isAvailable ? 'dsau-badge' : 'dsau-badge dsau-badge-bad' }, balance.isAvailable ? t('available') : t('insufficient'))
            )
          : React.createElement('div', { className: 'dsau-err' }, t('balanceError', { error: balance.error }))
        ),
        totals && React.createElement('div', { className: 'dsau-metrics' },
          React.createElement('div', { className: 'dsau-metric' },
            React.createElement('div', { className: 'dsau-metric-label' }, t('cost24h')),
            React.createElement('div', { className: 'dsau-metric-value' }, fmtCny(totals.costCny)),
            React.createElement('div', { className: 'dsau-metric-sub' }, t('estimated'))
          ),
          React.createElement('div', { className: 'dsau-metric' },
            React.createElement('div', { className: 'dsau-metric-label' }, t('tokens24h')),
            React.createElement('div', { className: 'dsau-metric-value' }, fmtTokens(totals.inputTokens + totals.outputTokens)),
            React.createElement('div', { className: 'dsau-metric-sub' }, t('inOut', { input: fmtTokens(totals.inputTokens), output: fmtTokens(totals.outputTokens) }))
          ),
          React.createElement('div', { className: 'dsau-metric' },
            React.createElement('div', { className: 'dsau-metric-label' }, t('apiRequests')),
            React.createElement('div', { className: 'dsau-metric-value' }, String(totals.requests)),
            React.createElement('div', { className: 'dsau-metric-sub' }, t('last24h'))
          )
        ),
        React.createElement('div', { className: 'dsau-head' },
          React.createElement('span', { className: 'dsau-subtitle' }, t('timeline')),
          React.createElement('div', { className: 'dsau-seg' },
            ['24h', '14d'].map((r) => React.createElement('button', {
              key: r,
              className: 'dsau-btn' + (range === r ? ' active' : ''),
              onClick: () => setRange(r),
            }, r))
          )
        ),
        React.createElement('div', { className: 'dsau-tabs' },
          [['cost', t('metricCost')], ['tokens', t('metricTokens')], ['requests', t('metricRequests')]].map(([m, label]) => React.createElement('button', {
            key: m,
            className: 'dsau-tab' + (metric === m ? ' active' : ''),
            onClick: () => setMetric(m),
          }, label))
        ),
        buckets.length === 0
          ? React.createElement('div', { className: 'dsau-meta' }, t('noData'))
          : React.createElement('div', { className: 'dsau-chart' },
              buckets.map((b) => {
                const v = metricValue(b)
                const h = Math.max(2, Math.round((v / max) * 120))
                return React.createElement('div', {
                  key: String(b.ts),
                  className: 'dsau-col',
                  title: (range === '14d' ? fmtDay(b.ts) : fmtDay(b.ts) + ' ' + fmtTime(b.ts)) + ' · ' + metricLabel(v),
                },
                  React.createElement('div', { className: 'dsau-bar', style: { height: h + 'px' } }),
                  React.createElement('div', { className: 'dsau-x' }, range === '14d' ? fmtDay(b.ts) : fmtTime(b.ts))
                )
              })
            ),
        snap && React.createElement('div', { className: 'dsau-note' }, t('pricingNote'))
      )
    }

    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'ds-api-usage', order: 25, label: () => t('title') },
      () => React.createElement(Panel)
    ))
  },
}
