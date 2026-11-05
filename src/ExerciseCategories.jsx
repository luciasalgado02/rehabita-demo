import { canGuestAccessExercise } from './exerciseAccess'
import { exerciseCategories } from '../shared/exercises'
import { CheckCircle2, Settings2 } from 'lucide-react'

export default function ExerciseCategories({
  mode = 'guest',
  openCategory,
  setOpenCategory,
  selectedExerciseIds = [],
  exerciseConfigurations = {},
  completedExerciseIds = [],
  onSelectExercise,
  onToggleExercise,
  onConfigureExercise,
  disabled = false,
}) {
  return (
    <section className="category-board" aria-label="Lista de categorías y ejercicios">
      {exerciseCategories.map((category) => {
        const isOpen = openCategory === category.title

        return (
          <div
            key={category.id}
            className={isOpen ? 'exercise-category is-open' : 'exercise-category'}
          >
            <button
              type="button"
              className={isOpen ? 'category-toggle active' : 'category-toggle'}
              onClick={() => setOpenCategory((current) => current === category.title ? null : category.title)}
              aria-expanded={isOpen}
              aria-controls={`category-panel-${category.id}`}
            >
              <span>{category.title}</span>
              <span className="category-arrow" aria-hidden="true">{isOpen ? '−' : '+'}</span>
            </button>

            <div
              id={`category-panel-${category.id}`}
              className={isOpen ? 'category-panel open' : 'category-panel'}
              aria-hidden={!isOpen}
              inert={!isOpen}
            >
              <div className="category-panel-inner">
                {category.items.length > 0 ? (
                  <ul className="category-list">
                    {category.items.map((item) => {
                      const isSelected = selectedExerciseIds.includes(item.id)
                      const isAvailable = mode === 'guest'
                        ? canGuestAccessExercise(item.id)
                        : mode === 'patient'
                          ? isSelected
                          : true
                      const isCompletedToday = mode === 'patient' && completedExerciseIds.includes(item.id)
                      const label = mode === 'selection'
                        ? isSelected ? 'Asignado al paciente' : 'No asignado'
                        : isAvailable
                          ? mode === 'patient' ? 'Disponible en tu plan' : 'Disponible para invitados'
                          : mode === 'guest' ? 'No disponible para invitados' : 'No asignado a tu plan'
                      const className = [
                        'exercise-option',
                        mode === 'selection' && isSelected ? 'selected' : '',
                        isCompletedToday ? 'exercise-option-completed' : '',
                        !isAvailable ? 'restricted' : '',
                      ].filter(Boolean).join(' ')
                      const configuration = exerciseConfigurations[item.id]
                      const configurationSummary = configuration
                        ? `${configuration.repetitions} repeticiones · ${configuration.series} series · Velocidad ${configuration.speed} · Descanso ${configuration.restSeconds} s`
                        : ''

                      return (
                        <li key={item.id} className={mode === 'selection' ? 'exercise-entry configurable' : 'exercise-entry'}>
                          <button
                            type="button"
                            className={className}
                            onClick={() => {
                              if (mode === 'selection') onToggleExercise(item)
                              else if (isAvailable) onSelectExercise(item)
                            }}
                            disabled={disabled || (mode !== 'selection' && !isAvailable)}
                            aria-pressed={mode === 'selection' ? isSelected : undefined}
                            aria-label={`${item.name}: ${isCompletedToday ? 'Ya hiciste este ejercicio hoy' : label}`}
                          >
                            <span className="exercise-option-content">
                              <span>{item.name}</span>
                              <small>
                                {isCompletedToday ? (
                                  <span className="exercise-completed-indicator">
                                    <CheckCircle2 aria-hidden="true" />
                                    ¡Ya hiciste este ejercicio!
                                  </span>
                                ) : mode === 'selection' && configuration ? 'Configurado' : label}
                              </small>
                            </span>
                          </button>
                          {mode === 'selection' && (
                            <button
                              type="button"
                              className="exercise-configure-button"
                              onClick={() => onConfigureExercise(item)}
                              disabled={disabled || !isSelected}
                              aria-label={`Configurar ${item.name}`}
                            >
                              <Settings2 aria-hidden="true" />
                              Configurar
                            </button>
                          )}
                          {configuration && <p className="exercise-configuration-summary">{configurationSummary}</p>}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="empty-category">Sin ejercicios definidos por el momento</p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </section>
  )
}
