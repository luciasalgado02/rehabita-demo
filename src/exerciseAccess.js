export const guestAllowedExerciseIds = Object.freeze([
  'hombro-elevacion-hacia-adelante',
  'antebrazo-supinacion',
  'muneca-flexoextension',
  'mano-puños'
])

export function canGuestAccessExercise(exerciseId, allowedExerciseIds = guestAllowedExerciseIds) {
  return typeof exerciseId === 'string' && allowedExerciseIds.includes(exerciseId)
}
