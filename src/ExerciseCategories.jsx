import { canGuestAccessExercise } from './exerciseAccess'
import { exerciseCategories } from '../shared/exercises'

export default function ExerciseCategories({
  mode = 'guest',
  openCategory,
  setOpenCategory,
  selectedExerciseIds = [],
  onSelectExercise,
  onToggleExercise,
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
                      const label = mode === 'selection'
                        ? isSelected ? 'Asignado al paciente' : 'No asignado'
                        : isAvailable
                          ? mode === 'patient' ? 'Disponible en tu plan' : 'Disponible para invitados'
                          : mode === 'guest' ? 'No disponible para invitados' : 'No asignado a tu plan'
                      const className = [
                        'exercise-option',
                        mode === 'selection' && isSelected ? 'selected' : '',
                        !isAvailable ? 'restricted' : '',
                      ].filter(Boolean).join(' ')

                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={className}
                            onClick={() => {
                              if (mode === 'selection') onToggleExercise(item)
                              else if (isAvailable) onSelectExercise(item)
                            }}
                            disabled={disabled || (mode !== 'selection' && !isAvailable)}
                            aria-pressed={mode === 'selection' ? isSelected : undefined}
                            aria-label={`${item.name}: ${label}`}
                          >
                            <span>{item.name}</span>
                            <small>{label}</small>
                          </button>
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
