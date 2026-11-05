export function getActivityMilliseconds(accumulatedMilliseconds, playbackStartedAt, now) {
  if (playbackStartedAt === null) return accumulatedMilliseconds
  return accumulatedMilliseconds + Math.max(0, now - playbackStartedAt)
}

export function closeActivityInterval(accumulatedMilliseconds, playbackStartedAt, now) {
  return {
    accumulatedMilliseconds: getActivityMilliseconds(accumulatedMilliseconds, playbackStartedAt, now),
    playbackStartedAt: null,
  }
}
