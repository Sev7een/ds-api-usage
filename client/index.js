'use strict'

/**
 * DS API Usage — Client half
 *
 * Registers a new settings page ("API用量") that renders:
 *  - a balance card (total / granted / topped-up, availability badge),
 *  - three metric cards (24h estimated cost in CNY, tokens, request count),
 *  - a 24h timeline bar chart of estimated spend (cost view only).
 *
 * Data arrives from the Host half through the package-private RPC method
 * `dsapi:snapshot` (host.call). The page auto-refreshes every 30s.
 */

module.exports = {
  name: 'ds-api-usage-client',
  inject: ['timer'],

  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    styles.insert(`
.dsau-root { display:flex; flex-direction:column; gap:14px; padding:6px 2px; font-family: inherit; }
.dsau-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.dsau-title { font-size:15px; font-weight:600; margin:0; }
.dsau-btn { border:1px solid var(--ds-border, #444); border-radius:6px; background:transparent; color:inherit; padding:4px 10px; font-size:12px; cursor:pointer; }
.dsau-btn:disabled { opacity:.5; cursor:default; }
.dsau-meta { font-size:11px; opacity:.6; }
.dsau-balance { display:flex; align-items:center; justify-content:space-between; border:1px solid var(--ds-border, #444); border-radius:10px; padding:14px 16px; }
.dsau-balance-num { font-size:26px; font-weight:700; line-height:1.1; }
.dsau-balance-sub { font-size:11px; opacity:.65; margin-top:4px; }
.dsau-badge { border-radius:999px; padding:2px 10px; font-size:11px; font-weight:600; }
.dsau-badge-ok { background:rgba(34,197,94,.15); color:#22c55e; }
.dsau-badge-bad { background:rgba(239,68,68,.15); color:#ef4444; }
.dsau-metrics { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
.dsau-metric { border:1px solid var(--ds-border, #444); border-radius:10px; padding:10px 12px; }
.dsau-metric-label { font-size:11px; opacity:.6; }
.dsau-metric-value { font-size:17px; font-weight:600; margin-top:2px; }
.dsau-metric-sub { font-size:10px; opacity:.55; margin-top:2px; }
.dsau-chart { display:flex; align-items:flex-end; gap:3px; height:150px; padding-top:8px; border-bottom:1px solid var(--ds-border, #444); }
.dsau-col { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; min-width:0; }
.dsau-bar { width:100%; max-width:22px; background:linear-gradient(180deg, var(--ds-accent, #4f8cff), rgba(79,140,255,.45)); border-radius:3px 3px 0 0; }
.dsau-x { font-size:9px; opacity:.55; margin-top:4px; white-space:nowrap; }
.dsau-err { border:1px solid rgba(239,68,68,.5); background:rgba(239,68,68,.08); border-radius:8px; padding:8px 12px; font-size:12px; color:#ef4444; }
.dsau-note { font-size:10px; opacity:.5; }
`)

    function fmtCny(v) {
      if (v === null || v === undefined || isNaN(v)) return '—'
      if (v > 0 && v < 0.01) return '¥' + v.toFixed(4)
      return '¥' + v.toFixed(2)
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
      return (d.getMonth() + 1) + '/' + d.getDate()
    }

    function Panel() {
      const [snap, setSnap] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)

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

      const buckets = snap ? snap.hourly : []
      const totals = snap ? snap.totals : null
      const balance = snap ? snap.balance : null
      const max = buckets.reduce((m, b) => Math.max(m, b.costCny), 0) || 1

      return React.createElement('div', { className: 'dsau-root' },
        React.createElement('div', { className: 'dsau-head' },
          React.createElement('h3', { className: 'dsau-title' }, 'API用量'),
          React.createElement('button', { className: 'dsau-btn', disabled: busy, onClick: () => load(true) }, busy ? 'refreshing…' : 'refresh balance')
        ),
        snap && React.createElement('div', { className: 'dsau-meta' },
          'tracking since ' + fmtTime(snap.startedAt) + (balance && balance.ok ? ' · balance updated ' + fmtTime(balance.fetchedAt) : '')
        ),
        error && React.createElement('div', { className: 'dsau-err' }, error),
        balance && (balance.ok
          ? React.createElement('div', { className: 'dsau-balance' },
              React.createElement('div', null,
                React.createElement('div', { className: 'dsau-balance-num' }, (balance.currency === 'CNY' ? '¥' : '$') + balance.total),
                React.createElement('div', { className: 'dsau-balance-sub' },
                  'granted ' + (balance.currency === 'CNY' ? '¥' : '$') + balance.granted + ' · topped-up ' + (balance.currency === 'CNY' ? '¥' : '$') + balance.toppedUp
                )
              ),
              React.createElement('span', { className: balance.isAvailable ? 'dsau-badge dsau-badge-ok' : 'dsau-badge dsau-badge-bad' }, balance.isAvailable ? 'available' : 'insufficient')
            )
          : React.createElement('div', { className: 'dsau-err' }, 'balance: ' + balance.error)
        ),
        totals && React.createElement('div', { className: 'dsau-metrics' },
          React.createElement('div', { className: 'dsau-metric' },
            React.createElement('div', { className: 'dsau-metric-label' }, '24h cost (CNY)'),
            React.createElement('div', { className: 'dsau-metric-value' }, fmtCny(totals.costCny)),
            React.createElement('div', { className: 'dsau-metric-sub' }, 'estimated')
          ),
          React.createElement('div', { className: 'dsau-metric' },
            React.createElement('div', { className: 'dsau-metric-label' }, '24h tokens'),
            React.createElement('div', { className: 'dsau-metric-value' }, fmtTokens(totals.inputTokens + totals.outputTokens)),
            React.createElement('div', { className: 'dsau-metric-sub' }, 'in ' + fmtTokens(totals.inputTokens) + ' · out ' + fmtTokens(totals.outputTokens))
          ),
          React.createElement('div', { className: 'dsau-metric' },
            React.createElement('div', { className: 'dsau-metric-label' }, 'API requests'),
            React.createElement('div', { className: 'dsau-metric-value' }, String(totals.requests)),
            React.createElement('div', { className: 'dsau-metric-sub' }, 'last 24h')
          )
        ),
        React.createElement('div', { className: 'dsau-head' },
          React.createElement('span', { className: 'dsau-title' }, 'Timeline (24h · cost)')
        ),
        buckets.length === 0
          ? React.createElement('div', { className: 'dsau-meta' }, 'No usage data yet — every model call after plugin start appears here.')
          : React.createElement('div', { className: 'dsau-chart' },
              buckets.map((b) => {
                const h = Math.max(2, Math.round((b.costCny / max) * 120))
                return React.createElement('div', {
                  key: String(b.ts),
                  className: 'dsau-col',
                  title: fmtDay(b.ts) + ' ' + fmtTime(b.ts) + ' · ' + fmtCny(b.costCny),
                },
                  React.createElement('div', { className: 'dsau-bar', style: { height: h + 'px' } }),
                  React.createElement('div', { className: 'dsau-x' }, fmtTime(b.ts))
                )
              })
            ),
        snap && React.createElement('div', { className: 'dsau-note' }, snap.pricingNote)
      )
    }

    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'ds-api-usage', order: 25, label: 'API用量' },
      () => React.createElement(Panel)
    ))
  },
}
