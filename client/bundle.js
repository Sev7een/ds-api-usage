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
      ".dsau-title { font-size:15px; font-weight:600; margin:0; }",
      ".dsau-btn { border:1px solid var(--ds-border, #444); border-radius:6px; background:transparent; color:inherit; padding:4px 10px; font-size:12px; cursor:pointer; }",
      ".dsau-btn:disabled { opacity:.5; cursor:default; }",
      ".dsau-meta { font-size:11px; opacity:.6; }",
      ".dsau-balance { display:flex; align-items:center; justify-content:space-between; border:1px solid var(--ds-border, #444); border-radius:10px; padding:14px 16px; }",
      ".dsau-balance-num { font-size:26px; font-weight:700; line-height:1.1; }",
      ".dsau-balance-sub { font-size:11px; opacity:.65; margin-top:4px; }",
      ".dsau-badge { border-radius:999px; padding:2px 10px; font-size:11px; font-weight:600; }",
      ".dsau-badge-ok { background:rgba(34,197,94,.15); color:#22c55e; }",
      ".dsau-badge-bad { background:rgba(239,68,68,.15); color:#ef4444; }",
      ".dsau-metrics { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }",
      ".dsau-metric { border:1px solid var(--ds-border, #444); border-radius:10px; padding:10px 12px; }",
      ".dsau-metric-label { font-size:11px; opacity:.6; }",
      ".dsau-metric-value { font-size:17px; font-weight:600; margin-top:2px; }",
      ".dsau-metric-sub { font-size:10px; opacity:.55; margin-top:2px; }",
      ".dsau-chart { display:flex; align-items:flex-end; gap:3px; height:150px; padding-top:8px; border-bottom:1px solid var(--ds-border, #444); }",
      ".dsau-col { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; min-width:0; }",
      ".dsau-bar { width:100%; max-width:22px; background:linear-gradient(180deg, var(--ds-accent, #4f8cff), rgba(79,140,255,.45)); border-radius:3px 3px 0 0; }",
      ".dsau-x { font-size:9px; opacity:.55; margin-top:4px; white-space:nowrap; }",
      ".dsau-err { border:1px solid rgba(239,68,68,.5); background:rgba(239,68,68,.08); border-radius:8px; padding:8px 12px; font-size:12px; color:#ef4444; }",
      ".dsau-note { font-size:10px; opacity:.5; }"
    ].join("\n")

    function fmtCny(v) {
      if (v === null || v === undefined || isNaN(v)) return "—"
      if (v > 0 && v < 0.01) return "¥" + v.toFixed(4)
      return "¥" + v.toFixed(2)
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
      return (d.getMonth() + 1) + "/" + d.getDate()
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
        var dispose = ctx.interval(function () { load(false) }, 30000)
        return function () { dispose() }
      }, [])

      var buckets = snap ? snap.hourly : []
      var totals = snap ? snap.totals : null
      var balance = snap ? snap.balance : null
      var max = buckets.reduce(function (m, b) { return Math.max(m, b.costCny) }, 0) || 1

      return React.createElement("div", { className: "dsau-root" },
        React.createElement("div", { className: "dsau-head" },
          React.createElement("h3", { className: "dsau-title" }, "API用量"),
          React.createElement("button", { className: "dsau-btn", disabled: busy, onClick: function () { load(true) } }, busy ? "刷新中…" : "刷新余额")
        ),
        snap && React.createElement("div", { className: "dsau-meta" },
          "统计自 " + fmtTime(snap.startedAt) + (balance && balance.ok ? " · 余额更新于 " + fmtTime(balance.fetchedAt) : "")
        ),
        error && React.createElement("div", { className: "dsau-err" }, error),
        balance && (balance.ok
          ? React.createElement("div", { className: "dsau-balance" },
              React.createElement("div", null,
                React.createElement("div", { className: "dsau-balance-num" }, (balance.currency === "CNY" ? "¥" : "$") + balance.total),
                React.createElement("div", { className: "dsau-balance-sub" },
                  "赠送余额 " + (balance.currency === "CNY" ? "¥" : "$") + balance.granted + " · 充值余额 " + (balance.currency === "CNY" ? "¥" : "$") + balance.toppedUp
                )
              ),
              React.createElement("span", { className: balance.isAvailable ? "dsau-badge dsau-badge-ok" : "dsau-badge dsau-badge-bad" }, balance.isAvailable ? "可用" : "余额不足")
            )
          : React.createElement("div", { className: "dsau-err" }, "余额：" + balance.error)
        ),
        totals && React.createElement("div", { className: "dsau-metrics" },
          React.createElement("div", { className: "dsau-metric" },
            React.createElement("div", { className: "dsau-metric-label" }, "今日消费"),
            React.createElement("div", { className: "dsau-metric-value" }, fmtCny(totals.costCny)),
            React.createElement("div", { className: "dsau-metric-sub" }, "24h 估算（CNY）")
          ),
          React.createElement("div", { className: "dsau-metric" },
            React.createElement("div", { className: "dsau-metric-label" }, "今日 Tokens"),
            React.createElement("div", { className: "dsau-metric-value" }, fmtTokens(totals.inputTokens + totals.outputTokens)),
            React.createElement("div", { className: "dsau-metric-sub" }, "输入 " + fmtTokens(totals.inputTokens) + " · 输出 " + fmtTokens(totals.outputTokens))
          ),
          React.createElement("div", { className: "dsau-metric" },
            React.createElement("div", { className: "dsau-metric-label" }, "API 请求"),
            React.createElement("div", { className: "dsau-metric-value" }, String(totals.requests)),
            React.createElement("div", { className: "dsau-metric-sub" }, "24h 内模型调用")
          )
        ),
        React.createElement("div", { className: "dsau-head" },
          React.createElement("span", { className: "dsau-title" }, "Timeline（24h · 消费金额）")
        ),
        buckets.length === 0
          ? React.createElement("div", { className: "dsau-meta" }, "暂无用量数据——插件启动后发生的每次模型调用都会出现在这里。")
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

    var inject = ["timer", "slots"]

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
          { name: "settings.section", id: "ds-api-usage", order: 25, label: "API用量" },
          function () { return React.createElement(Panel) }
        )
      })
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  }
})
