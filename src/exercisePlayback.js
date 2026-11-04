export function createExercisePlaybackState() {
  return {
    series: 1,
    repetition: 1,
    completedRepetitions: 0,
    phase: 'playing',
    remainingSeconds: 0,
  }
}

export function advanceExercisePlayback(state, configuration) {
  if (state.phase !== 'playing') return state

  const completedRepetitions = state.completedRepetitions + 1
  if (state.repetition < configuration.repetitions) {
    return {
      ...state,
      repetition: state.repetition + 1,
      completedRepetitions,
    }
  }
  if (state.series >= configuration.series) {
    return {
      ...state,
      completedRepetitions,
      phase: 'complete',
    }
  }
  if (configuration.restSeconds > 0) {
    return {
      ...state,
      completedRepetitions,
      phase: 'rest',
      remainingSeconds: configuration.restSeconds,
    }
  }
  return {
    ...state,
    series: state.series + 1,
    repetition: 1,
    completedRepetitions,
  }
}

export function advanceExerciseRest(state) {
  if (state.phase !== 'rest') return state
  if (state.remainingSeconds > 1) {
    return { ...state, remainingSeconds: state.remainingSeconds - 1 }
  }
  return {
    ...state,
    series: state.series + 1,
    repetition: 1,
    phase: 'playing',
    remainingSeconds: 0,
  }
}
