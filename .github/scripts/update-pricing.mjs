#!/usr/bin/env node
'use strict'

/**
 * update-pricing.mjs — fetch DeepSeek's official pricing pages, parse the
 * price tables, validate them, and update the generated PRICING block in
 * src/index.js (between the __PRICING_BEGIN__ / __PRICING_END__ markers).
 *
 * Usage:
 *   node .github/scripts/update-pricing.mjs            # dry-run: compare + report
 *   node .github/scripts/update-pricing.mjs --apply    # write the new block
 *   node .github/scripts/update-pricing.mjs --print    # print the block only
 *
 * Sources:
 *   - rates (CNY): https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
 *   - peak window (UTC): https://api-docs.deepseek.com/quick_start/pricing/
 *
 * Safety: every parsed value is validated (finite, positive, sane range) and
 * the two v4 models must be present; on any parse/validation failure the
 * script exits non-zero and NEVER touches src/index.js, so a restyled docs
 * page fails loudly instead of producing a garbage PR.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const INDEX = join(ROOT, 'src', 'index.js')

const ZN_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/'
const EN_URL = 'https://api-docs.deepseek.com/quick_start/pricing/'
const DEFAULT_PEAK_HOURS_UTC = [[1, 4], [6, 10]]
const MODEL_RE = /^deepseek-[a-z0-9-]+$/
const BEGIN = '// __PRICING_BEGIN__'
const END = '// __PRICING_END__'

// ── helpers ─────────────────────────────────────────────────────────────────

async function fetchText(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (update-pricing.mjs)' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    const buf = Buffer.from(await res.arrayBuffer())
    let body = buf
    if (body[0] === 0x1f && body[1] === 0x8b) body = gunzipSync(body)
    else if (body[0] === 0x78 && [0x01, 0x9c, 0xda].includes(body[1])) body = inflateSync(body)
    else if (body[0] === 0x62 && body[1] === 0x72 && body[2] === 0x6f) body = brotliDecompressSync(body)
    let text = body.toString('utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // strip BOM
    return text
  } catch (e) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * attempt))
      return fetchText(url, attempt + 1)
    }
    throw new Error(`failed to fetch ${url}: ${e.message}`)
  }
}

export { fetchText }

function cleanCell(raw) {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTables(html) {
  const tables = []
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi
  let tm
  while ((tm = tableRe.exec(html))) {
    const rows = []
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let rm
    while ((rm = rowRe.exec(tm[1]))) {
      const cells = []
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
      let cm
      while ((cm = cellRe.exec(rm[1]))) cells.push(cleanCell(cm[1]))
      if (cells.length) rows.push(cells)
    }
    tables.push(rows)
  }
  return tables
}

function parseNum(s) {
  const n = parseFloat(String(s).replace(/[,¥￥$元]/g, '').trim())
  return Number.isFinite(n) ? n : NaN
}

/** Flat prices live in the main model-details table (transposed: models are columns). */
export function parseFlat(rows) {
  const models = []
  for (const row of rows) {
    const cand = row.slice(1).filter((c) => MODEL_RE.test(c.trim()))
    if (cand.length >= 2) {
      models.push(...cand)
      break
    }
  }
  let start = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length >= 2 && /价格|pricing/i.test(rows[i][0] || '')) {
      start = i
      break
    }
  }
  if (!models.length || start < 0) return null
  const rates = {}
  for (let i = start; i < rows.length; i++) {
    const row = rows[i]
    const isSection = i === start
    // The section row carries the FIRST metric label in cell 1
    // ([价格(1), <label>, v1, v2, ...]); follow-up rows put it in cell 0.
    const label = (isSection ? row[1] || '' : row[0] || '').trim()
    const values = (isSection ? row.slice(2) : row.slice(1)).map(parseNum)
    if (/并发|concurrency/i.test(label)) break
    if (values.length < models.length || values.some(Number.isNaN)) continue
    let metric = null
    if (/缓存命中|cache hit/i.test(label)) metric = 'hit'
    else if (/缓存未命中|cache miss/i.test(label)) metric = 'miss'
    else if (/输出|output/i.test(label)) metric = 'output'
    if (!metric) continue
    models.forEach((model, j) => {
      rates[model] = rates[model] || { flat: {} }
      rates[model].flat[metric] = values[j]
    })
  }
  return rates
}

/**
 * Peak/off-peak prices live in the footnote table (models as rows, with
 * continuation rows that drop the model cell: [period, hit, miss, output]).
 */
export function parsePeakOffPeak(rows) {
  const out = {}
  let current = null
  const set = (model, period, values) => {
    if (values.length < 3 || values.some(Number.isNaN)) return
    const slot = /空闲时段|off-peak/i.test(period) ? 'offPeak' : /高峰时段|peak/i.test(period) ? 'peak' : null
    if (!slot) return
    out[model] = out[model] || {}
    out[model][slot] = { hit: values[0], miss: values[1], output: values[2] }
  }
  for (const row of rows) {
    const first = (row[0] || '').trim()
    if (MODEL_RE.test(first)) {
      current = first
      set(current, (row[1] || '').trim(), row.slice(2).map(parseNum))
    } else if (current && /空闲时段|off-peak|高峰时段|peak/i.test(first) && row.length >= 4) {
      set(current, first, row.slice(1).map(parseNum))
    }
  }
  return Object.keys(out).length ? out : null
}

/** Prefer the EN page (already UTC); fall back to the ZH page (Beijing time, -8 h). */
export function parsePeakHoursUtc(zhHtml, enHtml) {
  let m = enHtml.match(/Peak hours are\s*(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})\s*and\s*(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})\s*UTC/i)
  if (m) return [[+m[1], +m[3]], [+m[5], +m[7]]]
  m = zhHtml.match(/高峰时段为[^。]*?(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})[、，,]\s*(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/)
  if (m) {
    const w = [[+m[1] - 8, +m[3] - 8], [+m[5] - 8, +m[7] - 8]] // Beijing → UTC
    if (w.every(([a, b]) => a >= 0 && b <= 24 && a < b)) return w
  }
  return null
}

export function validateRates(flat, peakOp) {
  const present = (m) => !!(flat && flat[m]) || !!(peakOp && peakOp[m])
  if (!present('deepseek-v4-flash')) throw new Error('deepseek-v4-flash missing from the pricing page')
  if (!present('deepseek-v4-pro')) throw new Error('deepseek-v4-pro missing from the pricing page')
  for (const table of [flat, peakOp]) {
    if (!table) continue
    for (const [model, entry] of Object.entries(table)) {
      for (const [slot, r] of Object.entries(entry)) {
        if (!r || !['hit', 'miss', 'output'].every((k) => Number.isFinite(r[k]) && r[k] > 0 && r[k] < 1000)) {
          throw new Error(`invalid price for ${model}.${slot}: ${JSON.stringify(r)}`)
        }
      }
    }
  }
}

/** JSON.parse the current generated block in src/index.js, or null. */
export function readCurrentBlock() {
  try {
    const src = readFileSync(INDEX, 'utf8')
    const m = src.match(/const PRICING = (\{[\s\S]*?\})\n\/\/ __PRICING_END__/)
    return m ? JSON.parse(m[1]) : null
  } catch {
    return null
  }
}

export function blockFor(obj) {
  return `${BEGIN}\nconst PRICING = ${JSON.stringify(obj, null, 2)}\n${END}`
}

export function writeBlock(obj) {
  const src = readFileSync(INDEX, 'utf8')
  const re = new RegExp(`${BEGIN}\\n[\\s\\S]*?${END}`)
  if (!re.test(src)) throw new Error(`markers ${BEGIN}/${END} not found in src/index.js`)
  writeFileSync(INDEX, src.replace(re, blockFor(obj)))
}


// Build the next pricing table from page HTML (pure — used by the CLI and tests).
export function buildFromHtml(zhHtml, enHtml, prev) {
  const zhTables = extractTables(zhHtml)
  let flat = null
  let peakOp = null
  for (const rows of zhTables) {
    if (!flat) flat = parseFlat(rows)
    if (!peakOp) peakOp = parsePeakOffPeak(rows)
  }
  // A restyled page usually kills BOTH tables; a missing flat table alone is
  // tolerated (new billing scheme may drop it) as long as peak/off-peak parsed.
  if (!flat && !peakOp) throw new Error('could not parse any price table from the DeepSeek pricing page')
  if (!flat) console.warn('[warn] flat price table not found on the page; keeping entries from the previous block only')
  validateRates(flat, peakOp)

  const peakHoursUtc = parsePeakHoursUtc(zhHtml, enHtml)
  if (!peakHoursUtc) {
    console.warn(`[warn] could not parse peak hours from the pages; using default ${JSON.stringify(DEFAULT_PEAK_HOURS_UTC)}`)
  }

  const rates = {}
  for (const model of Object.keys(flat || {}).sort()) rates[model] = { ...flat[model] }
  for (const model of Object.keys(peakOp || {}).sort()) {
    rates[model] = { ...(rates[model] || {}), ...peakOp[model] }
  }
  // Carry over models that left the page (e.g. legacy deepseek-chat / deepseek-reasoner).
  if (prev && prev.rates) {
    for (const [model, entry] of Object.entries(prev.rates)) {
      if (!rates[model]) {
        rates[model] = { ...entry, carriedOver: true }
        console.warn(`[warn] ${model} no longer on the pricing page; keeping its previous rates`)
      }
    }
  }
  return {
    source: ZN_URL,
    currency: 'CNY',
    peakHoursUtc: peakHoursUtc || DEFAULT_PEAK_HOURS_UTC,
    rates,
  }
}

function summarize(rates) {
  const lines = []
  for (const [model, entry] of Object.entries(rates)) {
    const parts = []
    if (entry.flat) parts.push(`flat ${JSON.stringify(entry.flat)}`)
    if (entry.peak) parts.push(`peak ${JSON.stringify(entry.peak)}`)
    if (entry.offPeak) parts.push(`offPeak ${JSON.stringify(entry.offPeak)}`)
    if (entry.carriedOver) parts.push('(carried over from previous table)')
    lines.push(`  ${model}: ${parts.join(' | ')}`)
  }
  return lines.join('\n')
}

// ── CLI (skipped when this file is imported by tests) ────────────────────────
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const args = new Set(process.argv.slice(2))
  const apply = args.has('--apply')
  const printOnly = args.has('--print')

  const [zhHtml, enHtml] = await Promise.all([fetchText(ZN_URL), fetchText(EN_URL)])
  const next = buildFromHtml(zhHtml, enHtml, readCurrentBlock())
  const changed = JSON.stringify(readCurrentBlock()) !== JSON.stringify(next)

  console.log('── parsed pricing table ──')
  console.log(summarize(next.rates))
  console.log(`peak hours UTC: ${JSON.stringify(next.peakHoursUtc)}`)
  console.log(`result: ${changed ? 'CHANGED' : 'no change'}`)

  if (printOnly) {
    console.log(blockFor(next))
    process.exit(0)
  }
  if (!changed) process.exit(0)

  if (!apply) {
    console.log('(dry-run — run with --apply to write src/index.js)')
    process.exit(0)
  }
  writeBlock(next)
  console.log('wrote src/index.js')
}
