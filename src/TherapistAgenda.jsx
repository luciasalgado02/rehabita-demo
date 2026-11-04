import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus, Trash2, X } from 'lucide-react'
import { apiRequest } from './api'
import './TherapistAgenda.css'

const COLORS = [
  { value: '#cdeee6', label: 'Verde agua' },
  { value: '#dbeafe', label: 'Celeste' },
  { value: '#fce7c8', label: 'Durazno' },
  { value: '#eadcf8', label: 'Lavanda' },
  { value: '#f8d7da', label: 'Rosa' },
]
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const HALF_HOUR_MINUTES = 30
const SLOT_HEIGHT = 32
const TODAY_DATE = dateKey(new Date())

function dateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function startOfWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7))
  return result
}

function addMinutes(value, minutes) {
  const [hours, mins] = value.split(':').map(Number)
  const total = Math.min(23 * 60 + 59, hours * 60 + mins + minutes)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function formatDate(value, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return new Intl.DateTimeFormat('es-AR', options).format(parseDate(value))
}

function getVisibleRange(view, anchorDate) {
  if (view === 'day') {
    const key = dateKey(anchorDate)
    return { from: key, to: key, days: [anchorDate] }
  }
  if (view === 'week') {
    const first = startOfWeek(anchorDate)
    const days = Array.from({ length: 7 }, (_, index) => addDays(first, index))
    return { from: dateKey(days[0]), to: dateKey(days[6]), days }
  }

  const firstOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
  const gridStart = addDays(firstOfMonth, -((firstOfMonth.getDay() + 6) % 7))
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
  return { from: dateKey(days[0]), to: dateKey(days[41]), days }
}

function sortAppointments(appointments) {
  return [...appointments].sort((a, b) =>
    a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
  )
}

export default function TherapistAgenda({ patients, isLoadingPatients }) {
  const [view, setView] = useState('week')
  const [anchorDate, setAnchorDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  })
  const [appointments, setAppointments] = useState([])
  const [loadedRange, setLoadedRange] = useState('')
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState(null)
  const [draft, setDraft] = useState(null)
  const [patientQuery, setPatientQuery] = useState('')
  const [showPatientOptions, setShowPatientOptions] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const range = useMemo(() => getVisibleRange(view, anchorDate), [view, anchorDate])
  const rangeKey = `${range.from}:${range.to}`
  const isLoading = loadedRange !== rangeKey

  useEffect(() => {
    let active = true
    apiRequest(`/api/therapist/appointments?from=${range.from}&to=${range.to}`)
      .then(({ appointments: result }) => {
        if (active) {
          setAppointments(result)
          setError('')
          setLoadedRange(rangeKey)
        }
      })
      .catch((requestError) => {
        if (active) {
          setAppointments([])
          setError(requestError.message)
          setLoadedRange(rangeKey)
        }
      })
    return () => { active = false }
  }, [range.from, range.to, rangeKey])

  useEffect(() => {
    if (!dialog) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isSaving) setDialog(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dialog, isSaving])

  const appointmentsByDate = useMemo(() => {
    const grouped = new Map()
    for (const appointment of appointments) {
      const current = grouped.get(appointment.date) || []
      current.push(appointment)
      grouped.set(appointment.date, current)
    }
    return grouped
  }, [appointments])

  const openCreateDialog = (date, startTime = '09:00') => {
    setAnchorDate(parseDate(date))
    setDraft({
      patientId: '',
      date,
      startTime,
      endTime: addMinutes(startTime, HALF_HOUR_MINUTES),
      color: COLORS[0].value,
      observations: '',
    })
    setPatientQuery('')
    setShowPatientOptions(false)
    setError('')
    setDialog({ mode: 'create' })
  }

  const openEditDialog = (appointment) => {
    setDraft({
      patientId: appointment.patientId,
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      color: appointment.color,
      observations: appointment.observations,
    })
    setPatientQuery(`${appointment.patientFirstName} ${appointment.patientLastName}`)
    setShowPatientOptions(false)
    setError('')
    setDialog({ mode: 'edit', appointment })
  }

  const moveDate = (direction) => {
    setAnchorDate((current) => {
      if (view === 'month') return new Date(current.getFullYear(), current.getMonth() + direction, 1)
      return addDays(current, direction * (view === 'week' ? 7 : 1))
    })
  }

  const changeView = (nextView) => {
    setView(nextView)
  }

  const submitAppointment = async (event) => {
    event.preventDefault()
    if (!draft?.patientId) {
      setError('Elegí un paciente de la lista para continuar.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const isEditing = dialog.mode === 'edit'
      const path = isEditing
        ? `/api/therapist/appointments/${encodeURIComponent(dialog.appointment.id)}`
        : '/api/therapist/appointments'
      const { appointment } = await apiRequest(path, {
        method: isEditing ? 'PUT' : 'POST',
        body: draft,
      })
      setAppointments((current) => sortAppointments([
        ...current.filter(({ id }) => id !== appointment.id),
        appointment,
      ].filter(({ date }) => date >= range.from && date <= range.to)))
      setDialog(null)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSaving(false)
    }
  }

  const deleteAppointment = async () => {
    if (dialog?.mode !== 'confirm-delete' || isSaving) return
    setIsSaving(true)
    setError('')
    try {
      await apiRequest(`/api/therapist/appointments/${encodeURIComponent(dialog.appointment.id)}`, { method: 'DELETE' })
      setAppointments((current) => current.filter(({ id }) => id !== dialog.appointment.id))
      setDialog(null)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSaving(false)
    }
  }

  const heading = view === 'month'
    ? new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(anchorDate)
    : view === 'day'
      ? formatDate(dateKey(anchorDate))
      : `${formatDate(range.from, { day: 'numeric', month: 'short' })} – ${formatDate(range.to)}`
  const today = TODAY_DATE
  const timeSlots = Array.from({ length: 48 }, (_, index) => {
    const total = index * HALF_HOUR_MINUTES
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  })
  const matchingPatients = patients.filter((patient) =>
    `${patient.firstName} ${patient.lastName}`.toLocaleLowerCase().includes(patientQuery.trim().toLocaleLowerCase())
  ).slice(0, 6)

  return (
    <section className="agenda-screen" aria-labelledby="agenda-title">
      <header className="agenda-heading">
        <div>
          <p className="eyebrow">ESPACIO DE TRABAJO</p>
          <h1 id="agenda-title">Agenda</h1>
          <p>Organizá los turnos de tus pacientes.</p>
        </div>
        <button type="button" className="primary-button agenda-create-button" onClick={() => openCreateDialog(dateKey(anchorDate))}>
          <Plus aria-hidden="true" /> Nueva cita
        </button>
      </header>

      <section className="agenda-card" aria-label="Calendario de turnos">
        <div className="agenda-toolbar">
          <div className="agenda-date-navigation">
            <button type="button" className="agenda-icon-button" aria-label="Período anterior" onClick={() => moveDate(-1)}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <button type="button" className="agenda-icon-button" aria-label="Período siguiente" onClick={() => moveDate(1)}>
              <ChevronRight aria-hidden="true" />
            </button>
            <button type="button" className="agenda-today-button" onClick={() => setAnchorDate(new Date())}>Hoy</button>
            <h2>{heading}</h2>
          </div>
          <div className="agenda-view-switch" role="group" aria-label="Vista del calendario">
            {[['month', 'Mes'], ['week', 'Semana'], ['day', 'Día']].map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={view === value ? 'active' : ''}
                aria-pressed={view === value}
                onClick={() => changeView(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && !dialog && <p className="form-message error-message agenda-error" role="alert">{error}</p>}
        {isLoading && <p className="agenda-loading" role="status">Cargando turnos…</p>}
        {!isLoading && view === 'month' && (
          <div className="agenda-month-scroll">
            <div className="agenda-month-grid" role="grid" aria-label={heading}>
              {WEEKDAYS.map((day) => <div className="agenda-weekday" role="columnheader" key={day}>{day}</div>)}
              {range.days.map((date) => {
                const key = dateKey(date)
                const dayAppointments = appointmentsByDate.get(key) || []
                return (
                  <div
                    className={`agenda-month-cell${date.getMonth() === anchorDate.getMonth() ? '' : ' outside-month'}${key === today ? ' today' : ''}${key === dateKey(anchorDate) ? ' selected-day' : ''}`}
                    role="gridcell"
                    key={key}
                    aria-label={`${formatDate(key)}, ${dayAppointments.length} ${dayAppointments.length === 1 ? 'cita' : 'citas'}`}
                  >
                    <button type="button" className="agenda-day-number" onClick={() => openCreateDialog(key)} aria-label={`Crear cita el ${formatDate(key)}`}>
                      {date.getDate()}
                    </button>
                    <div className="agenda-month-appointments">
                      {dayAppointments.slice(0, 3).map((appointment) => (
                        <AppointmentChip key={appointment.id} appointment={appointment} onClick={() => openEditDialog(appointment)} />
                      ))}
                      {dayAppointments.length > 3 && <span className="agenda-more">+{dayAppointments.length - 3} más</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!isLoading && view !== 'month' && (
          <div className="agenda-timeline-scroll">
            <div className="agenda-timeline" style={{ '--agenda-days': range.days.length }}>
              <div className="agenda-time-axis">
                <div className="agenda-axis-header"><Clock3 aria-hidden="true" /></div>
                {timeSlots.filter((_, index) => index % 2 === 0).map((time) => (
                  <div className="agenda-hour-label" key={time}>{time}</div>
                ))}
              </div>
              {range.days.map((date) => {
                const key = dateKey(date)
                const dayAppointments = appointmentsByDate.get(key) || []
                return (
                  <div className={`agenda-day-column${key === today ? ' today' : ''}`} key={key}>
                    <button type="button" className="agenda-column-heading" onClick={() => openCreateDialog(key)}>
                      <span>{WEEKDAYS[(date.getDay() + 6) % 7]}</span>
                      <strong>{date.getDate()}</strong>
                    </button>
                    <div className="agenda-day-slots">
                      {timeSlots.map((time) => (
                        <button
                          type="button"
                          className="agenda-time-slot"
                          key={time}
                          aria-label={`Crear cita el ${formatDate(key)} a las ${time}`}
                          onClick={() => openCreateDialog(key, time)}
                        />
                      ))}
                      {dayAppointments.map((appointment) => (
                        <TimelineAppointment
                          key={appointment.id}
                          appointment={appointment}
                          onClick={() => openEditDialog(appointment)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!isLoading && appointments.length === 0 && (
          <p className="agenda-empty"><CalendarDays aria-hidden="true" /> No hay citas en este período. Seleccioná un día u horario para crear una.</p>
        )}
      </section>

      {dialog && (
        <AppointmentDialog
          dialog={dialog}
          draft={draft}
          setDraft={setDraft}
          patients={patients}
          isLoadingPatients={isLoadingPatients}
          patientQuery={patientQuery}
          setPatientQuery={setPatientQuery}
          onPatientQueryChange={(value) => {
            setPatientQuery(value)
            setDraft((current) => ({ ...current, patientId: '' }))
            setShowPatientOptions(true)
          }}
          matchingPatients={matchingPatients}
          showPatientOptions={showPatientOptions}
          setShowPatientOptions={setShowPatientOptions}
          error={error}
          isSaving={isSaving}
          onSubmit={submitAppointment}
          onCancel={() => { if (!isSaving) setDialog(null) }}
          onConfirmDelete={deleteAppointment}
          onRequestDelete={() => setDialog({ mode: 'confirm-delete', appointment: dialog.appointment })}
        />
      )}
    </section>
  )
}

function AppointmentChip({ appointment, onClick }) {
  return (
    <button
      type="button"
      className="agenda-appointment-chip"
      style={{ '--appointment-color': appointment.color }}
      title={`${appointment.startTime}–${appointment.endTime} · ${appointment.patientFirstName} ${appointment.patientLastName}`}
      onClick={(event) => { event.stopPropagation(); onClick() }}
    >
      <time>{appointment.startTime}</time> {appointment.patientFirstName} {appointment.patientLastName}
    </button>
  )
}

function TimelineAppointment({ appointment, onClick }) {
  const [startHour, startMinute] = appointment.startTime.split(':').map(Number)
  const [endHour, endMinute] = appointment.endTime.split(':').map(Number)
  const start = startHour * 60 + startMinute
  const duration = endHour * 60 + endMinute - start
  return (
    <button
      type="button"
      className="agenda-timeline-appointment"
      style={{
        '--appointment-color': appointment.color,
        top: `${(start / HALF_HOUR_MINUTES) * SLOT_HEIGHT}px`,
        height: `${Math.max(18, (duration / HALF_HOUR_MINUTES) * SLOT_HEIGHT - 2)}px`,
      }}
      title={`${appointment.startTime}–${appointment.endTime} · ${appointment.patientFirstName} ${appointment.patientLastName}`}
      onClick={onClick}
    >
      <time>{appointment.startTime}</time> · {appointment.patientFirstName} {appointment.patientLastName}
    </button>
  )
}

function AppointmentDialog({
  dialog, draft, setDraft, patients, isLoadingPatients, patientQuery, setPatientQuery, onPatientQueryChange,
  matchingPatients, showPatientOptions, setShowPatientOptions, error, isSaving, onSubmit,
  onCancel, onConfirmDelete, onRequestDelete,
}) {
  const appointment = dialog.appointment
  const isEditing = dialog.mode === 'edit'
  const isConfirmingDelete = dialog.mode === 'confirm-delete'
  const selectedPatient = patients.find(({ id }) => id === draft?.patientId)

  if (isConfirmingDelete) {
    return (
      <div className="modal-backdrop agenda-modal-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onCancel()
      }}>
        <section className="agenda-dialog agenda-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="agenda-delete-title">
          <button type="button" className="agenda-close-button" aria-label="Cerrar" onClick={onCancel}><X aria-hidden="true" /></button>
          <p className="eyebrow">CONFIRMAR ELIMINACIÓN</p>
          <h2 id="agenda-delete-title">Eliminar cita</h2>
          <p>¿Querés eliminar el turno de {appointment.patientFirstName} {appointment.patientLastName} del {formatDate(appointment.date)}?</p>
          {error && <p className="form-message error-message" role="alert">{error}</p>}
          <div className="agenda-dialog-actions">
            <button type="button" className="agenda-secondary-button" onClick={onCancel} disabled={isSaving}>Cancelar</button>
            <button type="button" className="agenda-danger-button" onClick={onConfirmDelete} disabled={isSaving}>
              {isSaving ? 'Eliminando…' : 'Sí, eliminar'}
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="modal-backdrop agenda-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isSaving) onCancel()
    }}>
      <section className="agenda-dialog" role="dialog" aria-modal="true" aria-labelledby="agenda-dialog-title">
        <button type="button" className="agenda-close-button" aria-label="Cerrar" onClick={onCancel}><X aria-hidden="true" /></button>
        <p className="eyebrow">{isEditing ? 'DETALLES DEL TURNO' : 'NUEVO TURNO'}</p>
        <h2 id="agenda-dialog-title">{isEditing ? 'Editar cita' : 'Crear cita'}</h2>
        {isLoadingPatients ? <p role="status">Cargando pacientes…</p> : patients.length === 0 ? (
          <div className="agenda-no-patients">
            <p>Aún no tenés pacientes para agendar.</p>
            <p>Registrá un paciente desde la sección «Nuevo paciente» y volvé a la Agenda.</p>
          </div>
        ) : (
          <form className="agenda-appointment-form" onSubmit={onSubmit}>
            <div className="agenda-patient-field">
              <label htmlFor="agenda-patient-search">Paciente</label>
              <input
                id="agenda-patient-search"
                type="search"
                role="combobox"
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={showPatientOptions}
                aria-controls="agenda-patient-options"
                placeholder="Buscar por nombre o apellido…"
                value={patientQuery}
                onFocus={() => setShowPatientOptions(true)}
                onChange={(event) => onPatientQueryChange(event.target.value)}
              />
              {selectedPatient && <span className="agenda-selected-patient">Seleccionado: {selectedPatient.firstName} {selectedPatient.lastName}</span>}
              {showPatientOptions && (
                <ul className="agenda-patient-options" id="agenda-patient-options" role="listbox" aria-label="Pacientes encontrados">
                  {matchingPatients.map((patient) => (
                    <li key={patient.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={draft.patientId === patient.id}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setDraft((current) => ({ ...current, patientId: patient.id }))
                          setPatientQuery(`${patient.firstName} ${patient.lastName}`)
                          setShowPatientOptions(false)
                        }}
                      >
                        {patient.firstName} {patient.lastName}
                      </button>
                    </li>
                  ))}
                  {matchingPatients.length === 0 && <li className="agenda-no-patient-match">{patientQuery.trim() ? 'No se encontraron pacientes.' : 'Escribí para buscar pacientes.'}</li>}
                </ul>
              )}
            </div>

            <div className="agenda-form-row">
              <label>Fecha<input type="date" required value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} /></label>
              <label>Color
                <select value={draft.color} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))}>
                  {COLORS.map((color) => <option key={color.value} value={color.value}>{color.label}</option>)}
                </select>
              </label>
            </div>
            <div className="agenda-form-row agenda-time-row">
              <label>Hora de inicio<input type="time" required value={draft.startTime} onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))} /></label>
              <label>Hora de finalización<input type="time" required value={draft.endTime} onChange={(event) => setDraft((current) => ({ ...current, endTime: event.target.value }))} /></label>
            </div>
            <label className="agenda-color-picker">Identificación visual
              <span>
                {COLORS.map((color) => (
                  <button
                    type="button"
                    key={color.value}
                    className={draft.color === color.value ? 'agenda-color-swatch selected' : 'agenda-color-swatch'}
                    style={{ '--appointment-color': color.value }}
                    aria-label={color.label}
                    aria-pressed={draft.color === color.value}
                    onClick={() => setDraft((current) => ({ ...current, color: color.value }))}
                  />
                ))}
              </span>
            </label>
            <label>Observaciones (opcional)
              <textarea rows="3" maxLength="2000" value={draft.observations} onChange={(event) => setDraft((current) => ({ ...current, observations: event.target.value }))} />
            </label>
            {error && <p className="form-message error-message" role="alert">{error}</p>}
            <div className="agenda-dialog-actions">
              {isEditing && (
                <button type="button" className="agenda-delete-link" onClick={onRequestDelete} disabled={isSaving}>
                  <Trash2 aria-hidden="true" /> Eliminar
                </button>
              )}
              <button type="button" className="agenda-secondary-button" onClick={onCancel} disabled={isSaving}>Cancelar</button>
              <button type="submit" className="primary-button" disabled={isSaving || !draft.patientId}>
                {isSaving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear cita'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
