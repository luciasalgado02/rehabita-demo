import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Pause, Play, Square } from 'lucide-react'
import { apiRequest } from './api'
import { closeActivityInterval, getActivityMilliseconds } from './exerciseActivity'
import { advanceExercisePlayback, advanceExerciseRest, createExercisePlaybackState } from './exercisePlayback'
import { exerciseAnimations } from './exerciseAnimations'

export default function ExercisePlayer({ exercise, configuration, onBack, onFinish }) {
  const animation = exerciseAnimations[exercise.id]
  const [progress, setProgress] = useState(createExercisePlaybackState)
  const [isPaused, setIsPaused] = useState(false)
  const [playbackError, setPlaybackError] = useState('')
  const [sessionId, setSessionId] = useState(null)
  const [isSessionLoading, setIsSessionLoading] = useState(Boolean(configuration))
  const videoRef = useRef(null)
  const videoEndedRef = useRef(false)
  const progressRef = useRef(progress)
  const sessionIdRef = useRef(null)
  const accumulatedActivityRef = useRef(0)
  const playbackStartedAtRef = useRef(null)
  const sessionWriteQueueRef = useRef(Promise.resolve())
  const sessionCreationPromiseRef = useRef(null)
  const sessionEffectIdRef = useRef(0)
  const persistProgressRef = useRef(null)
  const mountedRef = useRef(true)

  const persistProgress = useCallback((state = progressRef.current, ended = false, closePlayback = false) => {
    const currentTime = performance.now()
    if (closePlayback) {
      const closedInterval = closeActivityInterval(
        accumulatedActivityRef.current,
        playbackStartedAtRef.current,
        currentTime
      )
      accumulatedActivityRef.current = closedInterval.accumulatedMilliseconds
      playbackStartedAtRef.current = closedInterval.playbackStartedAt
    }
    const activeMilliseconds = getActivityMilliseconds(
      accumulatedActivityRef.current,
      playbackStartedAtRef.current,
      currentTime
    )
    const completed = state.phase === 'complete'
    const request = {
      completedRepetitions: state.completedRepetitions,
      completedSeries: Math.floor(state.completedRepetitions / configuration.repetitions),
      activeSeconds: Math.floor(activeMilliseconds / 1000),
      completed,
      ended: ended || completed,
    }
    const id = sessionIdRef.current
    if (!id) return Promise.resolve()

    const save = sessionWriteQueueRef.current.catch(() => {}).then(() =>
      apiRequest(`/api/patient/exercise-sessions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: request,
      })
    )
    sessionWriteQueueRef.current = save
    save.catch((requestError) => {
      if (mountedRef.current) setPlaybackError(requestError.message)
    })
    return save
  }, [configuration])

  useEffect(() => {
    persistProgressRef.current = persistProgress
  }, [persistProgress])

  useEffect(() => {
    mountedRef.current = true
    if (!configuration) return undefined

    let active = true
    const effectId = ++sessionEffectIdRef.current
    sessionCreationPromiseRef.current ||= apiRequest('/api/patient/exercise-sessions', {
      method: 'POST',
      body: { exerciseId: exercise.id },
    }).then(({ session }) => session)
    sessionCreationPromiseRef.current
      .then((session) => {
        if (!active) {
          if (sessionEffectIdRef.current === effectId) {
            return apiRequest(`/api/patient/exercise-sessions/${encodeURIComponent(session.id)}`, {
              method: 'PATCH',
              body: {
                completedRepetitions: 0,
                completedSeries: 0,
                activeSeconds: 0,
                completed: false,
                ended: true,
              },
            })
          }
          return undefined
        }
        sessionIdRef.current = session.id
        setSessionId(session.id)
        setIsSessionLoading(false)
        return undefined
      })
      .catch((requestError) => {
        if (active) {
          setPlaybackError(requestError.message)
          setIsPaused(true)
          setIsSessionLoading(false)
        }
      })
    return () => { active = false }
  }, [configuration, exercise.id])

  useEffect(() => {
    if (!configuration || !sessionId) return undefined
    if (progress.phase !== 'playing' || isPaused) return undefined
    const video = videoRef.current
    if (!video) return undefined
    video.playbackRate = animation.speedRates[configuration.speed] || 1
    const playRequest = video.play()
    playRequest?.catch(() => {
      setPlaybackError('No se pudo iniciar el video. Presioná Reanudar para volver a intentar.')
      setIsPaused(true)
    })
    return undefined
  }, [animation, configuration, isPaused, progress.phase, progress.repetition, progress.series, sessionId])

  useEffect(() => {
    if (progress.phase !== 'rest' || isPaused) return undefined
    const timerId = window.setInterval(() => {
      const next = advanceExerciseRest(progressRef.current)
      progressRef.current = next
      setProgress(next)
    }, 1000)
    return () => window.clearInterval(timerId)
  }, [isPaused, progress.phase])

  useEffect(() => {
    if (!sessionId || !configuration || progress.phase !== 'playing' || isPaused) return undefined
    const timerId = window.setInterval(() => {
      if (playbackStartedAtRef.current !== null) {
        void persistProgressRef.current?.().catch(() => {})
      }
    }, 3000)
    return () => window.clearInterval(timerId)
  }, [configuration, isPaused, progress.phase, sessionId])

  useEffect(() => () => {
    mountedRef.current = false
    if (videoRef.current) videoRef.current.pause()
    if (sessionIdRef.current) {
      void persistProgressRef.current?.(progressRef.current, true, true).catch(() => {})
    }
  }, [])

  const resume = () => {
    setPlaybackError('')
    setIsPaused(false)
  }

  const pause = () => {
    if (progress.phase === 'playing') videoRef.current?.pause()
    setIsPaused(true)
  }

  const exitExercise = async () => {
    videoRef.current?.pause()
    try {
      await persistProgress(progressRef.current, true, true)
      onBack()
    } catch {
      return
    }
  }

  const finishExercise = async () => {
    videoRef.current?.pause()
    try {
      await persistProgress(progressRef.current, true, true)
      onFinish()
    } catch {
      return
    }
  }

  const handleVideoPlay = () => {
    videoEndedRef.current = false
    if (playbackStartedAtRef.current === null) playbackStartedAtRef.current = performance.now()
  }

  const handleVideoPause = (event) => {
    if (event.currentTarget.ended || progressRef.current.phase !== 'playing') return
    void persistProgressRef.current?.(progressRef.current, false, true).catch(() => {})
  }

  const handleVideoEnded = () => {
    if (videoEndedRef.current || progressRef.current.phase !== 'playing') return
    videoEndedRef.current = true
    const next = advanceExercisePlayback(progressRef.current, configuration)
    progressRef.current = next
    setProgress(next)
    void persistProgressRef.current?.(next, next.phase === 'complete', true).catch(() => {})
  }


  if (!configuration) {
    return (
      <div className="exercise-detail-view">
        <button type="button" className="guest-back" onClick={onBack}>← Volver a categorías</button>
        <section className="exercise-detail-card exercise-player-card">
          <p className="eyebrow">EJERCICIO</p>
          <h1>{animation.name}</h1>
          <p className="exercise-detail-message">Este ejercicio todavía no tiene parámetros configurados por tu terapeuta.</p>
          <div className="exercise-preview-wrap">
            <video
              className="exercise-preview-video"
              src={animation.videoSrc}
              controls
              playsInline
              preload="metadata"
              aria-label={`Vista previa de ${animation.name}`}
              onError={() => setPlaybackError('No se pudo cargar el video. Verificá que el archivo MP4 esté en public/videos/ejercicios/.')}
            />
          </div>
          {playbackError && <p className="form-message error-message" role="alert">{playbackError}</p>}
        </section>
      </div>
    )
  }

  const totalRepetitions = configuration.repetitions * configuration.series
  const progressPercent = Math.round(progress.completedRepetitions / totalRepetitions * 100)

  return (
    <div className="exercise-detail-view exercise-player-view">
      <button type="button" className="guest-back" onClick={exitExercise}>← Volver a categorías</button>
      <section className="exercise-detail-card exercise-player-card" aria-labelledby="exercise-player-title">
        <p className="eyebrow">EJERCICIO ASIGNADO</p>
        <h1 id="exercise-player-title">{animation.name}</h1>
        <div className="exercise-player-video-wrap">
          {progress.phase === 'rest' && (
            <div className="exercise-rest-overlay" role="status" aria-live="polite">
              <p>Descanso entre series</p>
              <strong>{progress.remainingSeconds}</strong>
              <span>segundos</span>
            </div>
          )}
          {progress.phase === 'complete' ? (
            <div className="exercise-complete-state" role="status">
              <CheckCircle2 aria-hidden="true" />
              <h2>¡Ejercicio completado!</h2>
              <p>Completaste las {configuration.series} series.</p>
            </div>
          ) : (
            <video
              key={`${progress.series}-${progress.repetition}`}
              ref={videoRef}
              className={progress.phase === 'rest' ? 'exercise-player-video is-resting' : 'exercise-player-video'}
              src={animation.videoSrc}
              muted
              playsInline
              preload="auto"
              onPlay={handleVideoPlay}
              onPlaying={handleVideoPlay}
              onPause={handleVideoPause}
              onWaiting={handleVideoPause}
              onEnded={handleVideoEnded}
              onError={() => {
                setPlaybackError('No se pudo cargar el video. Verificá que el archivo MP4 esté en public/videos/ejercicios/.')
                setIsPaused(true)
              }}
              aria-label={`Video de ${animation.name}`}
            />
          )}
        </div>

        <div className="exercise-player-progress">
          <div className="exercise-player-counters" aria-live="polite">
            <strong>Serie {progress.series} de {configuration.series}</strong>
            <strong>Repetición {progress.repetition} de {configuration.repetitions}</strong>
          </div>
          <div
            className="exercise-progress-track"
            role="progressbar"
            aria-label="Progreso del ejercicio"
            aria-valuemin="0"
            aria-valuemax={totalRepetitions}
            aria-valuenow={progress.completedRepetitions}
          >
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <p>{progress.completedRepetitions} de {totalRepetitions} repeticiones completadas</p>
        </div>

        {playbackError && <p className="form-message error-message" role="alert">{playbackError}</p>}
        <div className="exercise-player-actions">
          {progress.phase !== 'complete' && (
            <button type="button" className="primary-button" onClick={isPaused ? resume : pause} disabled={!sessionId}>
              {isPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
              {isPaused ? 'Reanudar' : 'Pausar'}
            </button>
          )}
          <button type="button" className="exercise-finish-button" onClick={finishExercise} disabled={isSessionLoading}>
            <Square aria-hidden="true" />
            {progress.phase === 'complete' ? 'Volver a mis ejercicios' : 'Finalizar ejercicio'}
          </button>
        </div>
        {isSessionLoading && <p className="exercise-session-status" role="status">Preparando el registro de la sesión…</p>}
        <aside className="guest-note exercise-safety-notice" aria-label="Aviso de seguridad">
          <div>
            <span aria-hidden="true">!</span>
            <strong>Si un movimiento resulta incómodo</strong>
            <p>Detené el ejercicio y descansá. No fuerces el cuerpo ni continúes si sentís dolor, mareo o falta de aire.</p>
            <p>Para retomar, esperá a sentirte bien y hacé el movimiento más despacio. Si la molestia continúa, hablá con tu terapeuta.</p>
          </div>
        </aside>
      </section>
    </div>
  )
}
