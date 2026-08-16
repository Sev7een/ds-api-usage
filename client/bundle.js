/* DHS API Usage — Client half (web bundle, built by hand to match the
 * client-modules bundle protocol: window.__ModuleLoader__.load registers a
 * factory that receives a CommonJS require). This file is the `./client`
 * exports subpath declared in package.json.
 *
 * The bundle runs in the REAL page (no sandbox), so it uses native browser
 * APIs: `fetch` for the host snapshot route, `document` for styles. React is
 * resolved through require("react") like every other web plugin bundle.
 *
 * Source of truth for dynamic-package use remains client/index.js; this file
 * is the static-install artifact and must be regenerated when that source
 * changes (build script: keep both in sync manually or via a bundler).
 */
window.__ModuleLoader__.load({
  id: "dsh-plugin-ds-api-usage",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })
    var React = require("react")

    var SNAPSHOT_URL = "/ds-api-usage/snapshot"

    var CSS = [
      ".dsau-root { display:flex; flex-direction:column; gap:14px; padding:6px 2px; font-family: inherit; }",
      ".dsau-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }",
      ".dsau-title { font-size:18px; font-weight:600; margin:0; }",
      ".dsau-subtitle { font-size:14px; font-weight:600; margin:0; }",
      ".dsau-btn { color:var(--dsw-alias-label-secondary, #bbb); font:inherit; cursor:pointer; background:transparent; border:none; border-radius:7px; padding:5px 8px; font-size:12.5px; }",
      ".dsau-btn:hover:not(:disabled) { background:var(--dsw-alias-bg-layer-1, rgba(128,128,128,.08)); }",
      ".dsau-btn:disabled { opacity:.5; cursor:default; }",
      ".dsau-meta { font-size:12px; color:var(--dsw-alias-label-tertiary, #999); }",
      ".dsau-balance { display:flex; align-items:center; justify-content:space-between; border:1px solid var(--dsw-alias-border-l2, #444); border-radius:10px; padding:14px 16px; }",
      ".dsau-balance-num { font-size:26px; font-weight:700; line-height:1.1; }",
      ".dsau-balance-sub { font-size:12px; color:var(--dsw-alias-label-secondary, #bbb); margin-top:4px; }",
      ".dsau-badge { white-space:nowrap; border-radius:999px; padding:1px 8px; font-size:11px; font-weight:500; line-height:17px; border:1px solid var(--dsw-alias-border-l2, #555); color:var(--dsw-alias-label-tertiary, #999); }",
      ".dsau-badge-bad { background:var(--dsw-alias-state-error-primary, #ef4444); border-color:var(--dsw-alias-state-error-primary, #ef4444); color:var(--dsw-alias-bg-layer-3, #fff); }",
      ".dsau-metrics { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }",
      ".dsau-metric { border:1px solid var(--dsw-alias-border-l2, #444); border-radius:10px; padding:10px 12px; }",
      ".dsau-metric-label { font-size:12px; font-weight:500; color:var(--dsw-alias-label-secondary, #bbb); }",
      ".dsau-metric-value { font-size:17px; font-weight:600; margin-top:2px; }",
      ".dsau-metric-sub { font-size:11px; color:var(--dsw-alias-label-tertiary, #999); margin-top:2px; }",
      ".dsau-chart { display:flex; align-items:flex-end; gap:3px; height:150px; padding-top:8px; border-bottom:1px solid var(--dsw-alias-border-l2, #444); }",
      ".dsau-col { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; min-width:0; }",
      ".dsau-bar { width:100%; max-width:22px; background:linear-gradient(180deg, var(--dsw-alias-brand-primary, #4f8cff), rgba(79,140,255,.45)); border-radius:3px 3px 0 0; }",
      ".dsau-x { font-size:9px; color:var(--dsw-alias-label-tertiary, #999); margin-top:4px; white-space:nowrap; }",
      ".dsau-err { border:1px solid var(--dsw-alias-state-error-primary, rgba(239,68,68,.5)); background:var(--dsw-alias-state-error-secondary, rgba(239,68,68,.08)); border-radius:8px; padding:8px 12px; font-size:12px; color:var(--dsw-alias-state-error-primary, #ef4444); }",
      ".dsau-note { font-size:11px; color:var(--dsw-alias-label-tertiary, #999); }"
    ].join("\n")

    function fmtCny(v) {
      if (v === null || v === undefined || isNaN(v)) return "—"
      if (v > 0 && v < 0.01) return "¥" + v.toFixed(4)
      return "¥" + v.toFixed(2)
    }
    // Balance values come from the API with their own currency code
    // (only "CNY" or "USD" per the official docs), so show the code as-is.
    function fmtMoney(currency, v) {
      return currency + " " + v
    }
    function fmtTokens(n) {
      if (n === null || n === undefined || isNaN(n)) return "—"
      if (n >= 1e6) return (n / 1e6).toFixed(2) + "M"
      if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"
      return String(Math.round(n))
    }
    function fmtTime(ts) {
      var d = new Date(ts)
      var p = function (x) { return String(x).padStart(2, "0") }
      return p(d.getHours()) + ":" + p(d.getMinutes())
    }
    function fmtDay(ts) {
      var d = new Date(ts)
      return d.getDate() + "/" + (d.getMonth() + 1)
    }

    function Panel() {
      var state = React.useState(null)
      var snap = state[0]
      var setSnap = state[1]
      var busyState = React.useState(false)
      var busy = busyState[0]
      var setBusy = busyState[1]
      var errState = React.useState(null)
      var error = errState[0]
      var setError = errState[1]

      var load = function (force) {
        setBusy(true)
        fetch(SNAPSHOT_URL + (force ? "?force=1" : ""), { cache: "no-store" })
          .then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status)
            return res.json()
          })
          .then(function (data) {
            setSnap(data)
            setError(null)
          })
          .catch(function (e) {
            setError(String((e && e.message) || e))
          })
          .then(function () { setBusy(false) })
      }

      React.useEffect(function () {
        load(false)
        var id = setInterval(function () { load(false) }, 30000)
        return function () { clearInterval(id) }
      }, [])

      var buckets = snap ? snap.hourly : []
      var totals = snap ? snap.totals : null
      var balance = snap ? snap.balance : null
      var max = buckets.reduce(function (m, b) { return Math.max(m, b.costCny) }, 0) || 1

      return React.createElement("div", { className: "dsau-root" },
        React.createElement("div", { className: "dsau-head" },
          React.createElement("h3", { className: "dsau-title" }, "Uso da API"),
          React.createElement("button", { className: "dsau-btn", disabled: busy, onClick: function () { load(true) } }, busy ? "atualizando…" : "atualizar saldo")
        ),
        snap && React.createElement("div", { className: "dsau-meta" },
          "monitorando desde " + fmtTime(snap.startedAt) + (balance && balance.ok ? " · saldo atualizado em " + fmtTime(balance.fetchedAt) : "")
        ),
        error && React.createElement("div", { className: "dsau-err" }, error),
        balance && (balance.ok
          ? React.createElement("div", { className: "dsau-balance" },
              React.createElement("div", null,
                React.createElement("div", { className: "dsau-balance-num" }, fmtMoney(balance.currency, balance.total)),
                React.createElement("div", { className: "dsau-balance-sub" },
                  "concedido " + fmtMoney(balance.currency, balance.granted) + " · recarregado " + fmtMoney(balance.currency, balance.toppedUp)
                )
              ),
              React.createElement("span", { className: balance.isAvailable ? "dsau-badge" : "dsau-badge dsau-badge-bad" }, balance.isAvailable ? "disponível" : "insuficiente")
            )
          : React.createElement("div", { className: "dsau-err" }, "saldo: " + balance.error)
        ),
        totals && React.createElement("div", { className: "dsau-metrics" },
          React.createElement("div", { className: "dsau-metric" },
            React.createElement("div", { className: "dsau-metric-label" }, "custo 24h (CNY)"),
            React.createElement("div", { className: "dsau-metric-value" }, fmtCny(totals.costCny)),
            React.createElement("div", { className: "dsau-metric-sub" }, "estimado")
          ),
          React.createElement("div", { className: "dsau-metric" },
            React.createElement("div", { className: "dsau-metric-label" }, "tokens 24h"),
            React.createElement("div", { className: "dsau-metric-value" }, fmtTokens(totals.inputTokens + totals.outputTokens)),
            React.createElement("div", { className: "dsau-metric-sub" }, "entrada " + fmtTokens(totals.inputTokens) + " · saída " + fmtTokens(totals.outputTokens))
          ),
          React.createElement("div", { className: "dsau-metric" },
            React.createElement("div", { className: "dsau-metric-label" }, "requisições de API"),
            React.createElement("div", { className: "dsau-metric-value" }, String(totals.requests)),
            React.createElement("div", { className: "dsau-metric-sub" }, "últimas 24h")
          )
        ),
        React.createElement("div", { className: "dsau-head" },
          React.createElement("span", { className: "dsau-subtitle" }, "Linha do tempo (24h · custo)")
        ),
        buckets.length === 0
          ? React.createElement("div", { className: "dsau-meta" }, "Ainda sem dados de uso — toda chamada de modelo após o início do plugin aparecerá aqui.")
          : React.createElement("div", { className: "dsau-chart" },
              buckets.map(function (b) {
                var h = Math.max(2, Math.round((b.costCny / max) * 120))
                return React.createElement("div", {
                  key: String(b.ts),
                  className: "dsau-col",
                  title: fmtDay(b.ts) + " " + fmtTime(b.ts) + " · " + fmtCny(b.costCny)
                },
                  React.createElement("div", { className: "dsau-bar", style: { height: h + "px" } }),
                  React.createElement("div", { className: "dsau-x" }, fmtTime(b.ts))
                )
              })
            ),
        snap && React.createElement("div", { className: "dsau-note" }, snap.pricingNote)
      )
    }

    var inject = ["slots"]

    function apply(ctx) {
      // styles: bundle runs in the real page — inject a style element and
      // remove it when the plugin is disposed
      var style = document.createElement("style")
      style.setAttribute("data-plugin", "dsh-plugin-ds-api-usage")
      style.textContent = CSS
      document.head.append(style)
      ctx.effect(function () {
        return function () {
          if (style.parentNode) style.parentNode.removeChild(style)
        }
      })

      var slots = ctx.get("slots")
      if (slots === undefined) return
      slots.inject("settings.section", function () {
        return slots.register(
          { name: "settings.section", id: "ds-api-usage", order: 25, label: "Uso da API" },
          function () { return React.createElement(Panel) }
        )
      })
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  }
})
