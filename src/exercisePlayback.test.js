import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  advanceExercisePlayback,
  advanceExerciseRest,
  createExercisePlaybackState,
} from './exercisePlayback.js'

test('counts exactly five complete repetitions in each of three series', () => {
  const configuration = { repetitions: 5, series: 3, restSeconds: 30 }
  let state = createExercisePlaybackState()
  let completedCount = 0
  let restCount = 0

  while (state.phase !== 'complete') {
    if (state.phase === 'rest') {
      assert.equal(state.remainingSeconds, 30)
      restCount += 1
      for (let second = 0; second < 30; second += 1) state = advanceExerciseRest(state)
      continue
    }
    const previousCount = state.completedRepetitions
    state = advanceExercisePlayback(state, configuration)
    if (state.completedRepetitions > previousCount) completedCount += 1
  }

  assert.equal(completedCount, 15)
  assert.equal(state.completedRepetitions, 15)
  assert.equal(restCount, 2)
  assert.equal(state.series, 3)
  assert.equal(state.repetition, 5)
})

test('does not count video events during rest or after completion', () => {
  const configuration = { repetitions: 1, series: 2, restSeconds: 1 }
  const firstRep = advanceExercisePlayback(createExercisePlaybackState(), configuration)
  assert.equal(firstRep.phase, 'rest')
  assert.equal(advanceExercisePlayback(firstRep, configuration), firstRep)
  const secondSeries = advanceExerciseRest(firstRep)
  const completed = advanceExercisePlayback(secondSeries, configuration)
  assert.equal(completed.phase, 'complete')
  assert.equal(advanceExercisePlayback(completed, configuration), completed)
})

test('starts the next series immediately when no rest is configured', () => {
  const configuration = { repetitions: 2, series: 2, restSeconds: 0 }
  const first = advanceExercisePlayback(createExercisePlaybackState(), configuration)
  const nextRep = advanceExercisePlayback(first, configuration)
  assert.deepEqual(nextRep, {
    series: 2,
    repetition: 1,
    completedRepetitions: 2,
    phase: 'playing',
    remainingSeconds: 0,
  })
})
