import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Pause, Play, Square } from 'lucide-react'
import { advanceExercisePlayback, advanceExerciseRest, createExercisePlaybackState } from './exercisePlayback'
import { exerciseAnimations } from './exerciseAnimations'

export default function ExercisePlayer({ exercise, configuration, onBack, onFinish }) {
  const animation = exerciseAnimations[exercise.id]
  const [progress, setProgress] = useState(createExercisePlaybackState)
  const [isPaused, setIsPaused] = useState(false)
  const [playbackError, setPlaybackError] = useState('')
  const videoRef = useRef(null)
  const videoEndedRef = useRef(false)

  useEffect(() => {
    if (!configuration) return undefined
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
  }, [animation, configuration, isPaused, progress.phase, progress.repetition, progress.series])

  useEffect(() => {
    if (progress.phase !== 'rest' || isPaused) return undefined
    const timerId = window.setInterval(() => {
      setProgress((current) => advanceExerciseRest(current))
    }, 1000)
    return () => window.clearInterval(timerId)
  }, [isPaused, progress.phase])

  useEffect(() => () => {
    if (videoRef.current) videoRef.current.pause()
  }, [])

  const resume = () => {
    setPlaybackError('')
    setIsPaused(false)
  }

  const pause = () => {
    if (progress.phase === 'playing') videoRef.current?.pause()
    setIsPaused(true)
  }

  const handleVideoEnded = () => {
    if (videoEndedRef.current || progress.phase !== 'playing') return
    videoEndedRef.current = true
    setProgress((current) => advanceExercisePlayback(current, configuration))
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
      <button type="button" className="guest-back" onClick={onBack}>← Volver a categorías</button>
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
              onPlay={() => { videoEndedRef.current = false }}
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
            <button type="button" className="primary-button" onClick={isPaused ? resume : pause}>
              {isPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
              {isPaused ? 'Reanudar' : 'Pausar'}
            </button>
          )}
          <button type="button" className="exercise-finish-button" onClick={onFinish}>
            <Square aria-hidden="true" />
            {progress.phase === 'complete' ? 'Volver a mis ejercicios' : 'Finalizar ejercicio'}
          </button>
        </div>
      </section>
    </div>
  )
}
