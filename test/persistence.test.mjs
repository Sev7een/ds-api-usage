import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { __test } = require('../src/index.js')
const { serializeBuckets, parseBuckets, mergeMaps, pruneMaps, bucketsFilePath } = __test

const bucket = (ts, over = {}) => ({
  ts,
  requests: 1,
  inputTokens: 2,
  outputTokens: 3,
  cacheReadTokens: 4,
  cacheWriteTokens: 5,
  reasoningTokens: 6,
  costCny: 0.5,
  ...over,
})

test('serialize → parse round-trip preserves buckets', () => {
  const hourly = new Map([[1000, bucket(1000)], [2000, bucket(2000, { requests: 7 })]])
  const daily = new Map([[1000, bucket(1000)]])
  const parsed = parseBuckets(serializeBuckets(hourly, daily))
  assert.deepEqual([...parsed.hourly.entries()], [...hourly.entries()])
  assert.deepEqual([...parsed.daily.entries()], [...daily.entries()])
})

test('parseBuckets rejects wrong shape and filters invalid entries', () => {
  assert.equal(parseBuckets(null), null)
  assert.equal(parseBuckets({ v: 2, hourly: [] }), null)
  const parsed = parseBuckets({ v: 1, hourly: [bucket(1), { ts: 'x' }], daily: 'nope' })
  assert.equal(parsed.hourly.size, 1)
  assert.equal(parsed.daily.size, 0)
})

test('mergeMaps only fills missing keys (in-memory data wins)', () => {
  const target = new Map([[1, bucket(1, { requests: 99 })]])
  mergeMaps(target, new Map([[1, bucket(1, { requests: 1 })], [2, bucket(2)]]))
  assert.equal(target.size, 2)
  assert.equal(target.get(1).requests, 99)
  assert.equal(target.get(2).requests, 1)
})

test('pruneMaps drops buckets outside the retention windows', () => {
  const now = 1000 * 3600 * 1000
  const hourly = new Map([
    [now - 47 * 3600 * 1000, bucket(0)], // kept (47 h)
    [now - 49 * 3600 * 1000, bucket(0)], // dropped (49 h > 48 h)
  ])
  const daily = new Map([
    [now - 13 * 86400 * 1000, bucket(0)], // kept (13 d)
    [now - 15 * 86400 * 1000, bucket(0)], // dropped (15 d > 14 d)
  ])
  pruneMaps(hourly, daily, now)
  assert.equal(hourly.size, 1)
  assert.equal(daily.size, 1)
})

test('bucketsFilePath resolves under the harness home', () => {
  const prev = process.env.DSH_HOME
  process.env.DSH_HOME = '/tmp/dsh-test-home'
  try {
    const p = bucketsFilePath()
    assert.ok(p.startsWith('/tmp/dsh-test-home'))
    assert.ok(p.endsWith('storages/ds-api-usage.json'))
  } finally {
    if (prev === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prev
  }
})
