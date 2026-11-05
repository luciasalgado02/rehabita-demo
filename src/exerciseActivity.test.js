import assert from 'node:assert/strict'
import { test } from 'node:test'
import { closeActivityInterval, getActivityMilliseconds } from './exerciseActivity.js'

test('activity time includes only intervals when the animation is playing', () => {
  const firstInterval = closeActivityInterval(0, 1000, 61000)
  const afterPause = getActivityMilliseconds(firstInterval.accumulatedMilliseconds, firstInterval.playbackStartedAt, 180000)
  const secondInterval = closeActivityInterval(firstInterval.accumulatedMilliseconds, 181000, 241000)

  assert.equal(afterPause, 60_000)
  assert.equal(secondInterval.accumulatedMilliseconds, 120_000)
  assert.equal(Math.floor(secondInterval.accumulatedMilliseconds / 1000), 120)
})

test('activity time can be snapshotted without stopping playback', () => {
  assert.equal(getActivityMilliseconds(30_000, 70_000, 85_000), 45_000)
  assert.equal(getActivityMilliseconds(45_000, null, 100_000), 45_000)
})
