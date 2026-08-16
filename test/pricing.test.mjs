import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import {
  buildFromHtml,
  parsePeakHoursUtc,
  validateRates,
  readCurrentBlock,
  blockFor,
} from '../.github/scripts/update-pricing.mjs'

const require = createRequire(import.meta.url)
const plugin = require('../src/index.js')

// Fixtures are frozen snapshots of the official DeepSeek pricing pages
// (test/fixtures/, captured 2026-08-16). When DeepSeek changes prices, update
// the fixtures (re-run the capture) — a failing test here is an alert, not a bug.
const zh = readFileSync(new URL('./fixtures/zh-pricing.html', import.meta.url), 'utf8')
const en = readFileSync(new URL('./fixtures/en-pricing.html', import.meta.url), 'utf8')

test('parses flat + peak/off-peak rates from the zh fixture', () => {
  const next = buildFromHtml(zh, en, null)
  assert.equal(next.currency, 'CNY')
  assert.deepEqual(next.peakHoursUtc, [[1, 4], [6, 10]])

  const flash = next.rates['deepseek-v4-flash']
  assert.deepEqual(flash.flat, { hit: 0.02, miss: 1, output: 2 })
  assert.deepEqual(flash.offPeak, { hit: 0.05, miss: 1.5, output: 4.5 })
  assert.deepEqual(flash.peak, { hit: 0.1, miss: 3, output: 9 })

  const pro = next.rates['deepseek-v4-pro']
  assert.deepEqual(pro.flat, { hit: 0.025, miss: 3, output: 6 })
  assert.deepEqual(pro.offPeak, { hit: 0.15, miss: 4.5, output: 13.5 })
  assert.deepEqual(pro.peak, { hit: 0.3, miss: 9, output: 27 })
})

test('carries over models absent from the page (legacy models)', () => {
  const prev = {
    source: 'x',
    currency: 'CNY',
    peakHoursUtc: [[1, 4], [6, 10]],
    rates: { 'deepseek-chat': { flat: { hit: 0.5, miss: 2, output: 8 } } },
  }
  const next = buildFromHtml(zh, en, prev)
  assert.ok(next.rates['deepseek-chat'], 'legacy model must be preserved')
  assert.equal(next.rates['deepseek-chat'].carriedOver, true)
  assert.deepEqual(next.rates['deepseek-chat'].flat, { hit: 0.5, miss: 2, output: 8 })
})

test('rebuilding from fixtures is idempotent against the committed block', () => {
  const current = readCurrentBlock()
  assert.ok(current, 'src/index.js must contain a generated PRICING block')
  const rebuilt = buildFromHtml(zh, en, current)
  assert.deepEqual(rebuilt, current, 're-parse of current pages must not change the block')
})

test('peak hours parsed from EN (UTC) and ZH (Beijing −8h), null on garbage', () => {
  assert.deepEqual(parsePeakHoursUtc(zh, en), [[1, 4], [6, 10]])
  const zhOnly = '<p>高峰时段为北京时间 9:00 - 12:00、14:00 - 18:00（其余为空闲时段）</p>'
  assert.deepEqual(parsePeakHoursUtc(zhOnly, ''), [[1, 4], [6, 10]])
  assert.equal(parsePeakHoursUtc('<p>nada aqui</p>', '<p>nothing here</p>'), null)
})

test('validation rejects missing models and out-of-range prices', () => {
  assert.throws(() => validateRates(null, null))
  assert.throws(() => validateRates(
    { 'deepseek-v4-flash': { flat: { hit: 0, miss: 1, output: 2 } } },
    null,
  ))
  assert.throws(() => validateRates(
    { 'deepseek-v4-flash': { flat: { hit: 0.02, miss: 1, output: 2 } } },
    null,
  )) // deepseek-v4-pro missing
})

test('block round-trip: blockFor output is parseable JSON and matches input', () => {
  const obj = {
    source: 'x',
    currency: 'CNY',
    peakHoursUtc: [[1, 4], [6, 10]],
    rates: { m: { flat: { hit: 1, miss: 2, output: 3 } } },
  }
  const block = blockFor(obj)
  const m = block.match(/const PRICING = (\{[\s\S]*?\})\n\/\/ __PRICING_END__/)
  assert.ok(m, 'block must carry the closing marker')
  assert.deepEqual(JSON.parse(m[1]), obj)
})

test('rateFor picks peak/off-peak by UTC hour, flat for legacy, default for unknown', () => {
  const { rateFor, DEFAULT_RATE } = plugin.__test
  const at = (h, m = 0) => Date.UTC(2026, 7, 16, h, m)

  assert.deepEqual(rateFor('deepseek-v4-flash', at(1, 30)), { hit: 0.1, miss: 3, output: 9 })      // peak
  assert.deepEqual(rateFor('deepseek-v4-flash', at(4, 0)), { hit: 0.05, miss: 1.5, output: 4.5 })  // off-peak
  assert.deepEqual(rateFor('deepseek-v4-flash', at(9, 59)), { hit: 0.1, miss: 3, output: 9 })      // peak
  assert.deepEqual(rateFor('deepseek-v4-flash', at(10, 0)), { hit: 0.05, miss: 1.5, output: 4.5 }) // off-peak
  assert.deepEqual(rateFor('deepseek-chat', at(1, 30)), { hit: 0.5, miss: 2, output: 8 })          // flat fallback
  assert.deepEqual(rateFor('unknown-model', at(1, 30)), DEFAULT_RATE)                               // unknown → default
})
