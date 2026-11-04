import { useEffect, useRef, useState } from 'react'
import { ClipboardList, HeartPulse, LogOut, Search, UserRoundPlus, UsersRound } from 'lucide-react'
import { canGuestAccessExercise } from './exerciseAccess'
import { apiRequest, getCsrfToken } from './api'
import ExerciseCategories from './ExerciseCategories'
import './App.css'

function App() {
  const [activeView, setActiveView] = useState('inicio')
  const [selectedExercise, setSelectedExercise] = useState(null)
  const [openCategory, setOpenCategory] = useState(null)
  const [authenticatedUser, setAuthenticatedUser] = useState(null)
  const [showProfile, setShowProfile] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [fontSize, setFontSize] = useState('normal')
  const [darkMode, setDarkMode] = useState(false)
  const [highContrast, setHighContrast] = useState(false)

  useEffect(() => {
    apiRequest('/api/auth/me')
      .then(({ user }) => {
        if (user) {
          setAuthenticatedUser(user)
          setActiveView(user.role)
        }
      })
      .catch(() => {})
  }, [])

  const goTo = (view) => {
    setActiveView(view)
    setShowProfile(false)
    setShowLogin(false)
  }

  const openExercise = (exercise) => {
    if (!canGuestAccessExercise(exercise?.id)) {
      return
    }

    setSelectedExercise(exercise)
    setActiveView('ejercicio')
  }

  const handleAuthenticated = (user) => {
    setAuthenticatedUser(user)
    setActiveView(user.role)
    setShowLogin(false)
  }

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' })
    setAuthenticatedUser(null)
    setActiveView('inicio')
    setShowLogin(false)
  }

  if (activeView === 'ejercicio') {
    if (!canGuestAccessExercise(selectedExercise?.id)) {
      return <main className={`home-shell font-${fontSize}${darkMode ? ' dark-mode' : ''}${highContrast ? ' high-contrast' : ''}`}><GuestModesView onBack={() => goTo('inicio')} onStart={openExercise} onLogin={() => setShowLogin(true)} openCategory={openCategory} setOpenCategory={setOpenCategory} /></main>
    }

    return <main className={`maintenance-shell font-${fontSize}${darkMode ? ' dark-mode' : ''}${highContrast ? ' high-contrast' : ''}`}><ExerciseDetailView exercise={selectedExercise} onBack={() => goTo('modos')} /></main>
  }

  if (activeView === 'therapist' && authenticatedUser?.role === 'therapist') {
    return <main className={`workspace-shell font-${fontSize}${darkMode ? ' dark-mode' : ''}${highContrast ? ' high-contrast' : ''}`}><TherapistWorkspace onLogout={handleLogout} /></main>
  }

  if (activeView === 'patient' && authenticatedUser?.role === 'patient') {
    return <main className={`workspace-shell font-${fontSize}${darkMode ? ' dark-mode' : ''}${highContrast ? ' high-contrast' : ''}`}><PatientWorkspace user={authenticatedUser} onLogout={handleLogout} /></main>
  }

  return (
    <main className={`${activeView === 'inicio' || activeView === 'modos' ? 'home-shell' : 'app-shell'} font-${fontSize}${darkMode ? ' dark-mode' : ''}${highContrast ? ' high-contrast' : ''}`}>
      {activeView === 'inicio' ? <HomeView onPlay={() => goTo('modos')} onLogin={() => setShowLogin(true)} onSettings={() => setShowProfile(true)} onHelp={() => setShowHelp(true)} onAbout={() => setShowAbout(true)} /> : activeView === 'modos' ? <GuestModesView onBack={() => goTo('inicio')} onStart={openExercise} onLogin={() => setShowLogin(true)} openCategory={openCategory} setOpenCategory={setOpenCategory} /> : <>
        <aside className="sidebar">
          <div className="brand-mark" aria-label="ReHabita"><span className="brand-symbol"><HeartPulse aria-hidden="true" /></span><span>ReHabita</span></div>
          <div className="profile-chip"><div className="avatar-small">LS</div><div><strong>Lucía</strong><span>Paciente</span></div></div>
          <nav className="main-nav" aria-label="Navegación principal">
            <button className={activeView === 'modos' ? 'nav-item active' : 'nav-item'} onClick={() => goTo('modos')}><span>⌂</span> Jugar</button>
            <button className={activeView === 'progreso' ? 'nav-item active' : 'nav-item'} onClick={() => goTo('progreso')}><span>↗</span> Mi progreso</button>
          </nav>
          <div className="sidebar-bottom"><button className="nav-item" onClick={() => setShowProfile(true)}><span>⚙</span> Configuración</button><button className="help-link" onClick={() => setShowHelp(true)}><span>?</span> ¿Necesitás ayuda?</button></div>
        </aside>
        <section className="content-area">
          <header className="topbar"><div className="breadcrumb"><span className="status-dot"></span> Práctica de hoy <span>/</span> {activeView === 'modos' ? 'Jugar' : activeView === 'ejercicio' ? 'Ejercicio' : 'Mi progreso'}</div><button className="therapist-button" onClick={() => setShowProfile(true)}><span>●</span> Modo terapeuta <b>›</b></button></header>
          <ProgressView />
        </section>
      </>}
      {showProfile && <SettingsModal onClose={() => setShowProfile(false)} fontSize={fontSize} setFontSize={setFontSize} darkMode={darkMode} setDarkMode={setDarkMode} highContrast={highContrast} setHighContrast={setHighContrast} />}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onAuthenticated={handleAuthenticated} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </main>
  )
}

function HomeView({ onPlay, onLogin, onSettings, onHelp, onAbout }) {
  return <section className="reference-home">
    <div className="home-blob blob-top"></div><div className="home-blob blob-bottom"></div>
    <button className="corner-action settings-action" type="button" onClick={onSettings}><span>⚙</span><small>Configuración</small></button>
    <button className="corner-action help-action" type="button" onClick={onHelp}><span>?</span><small>Ayuda</small></button>
    <div className="home-brand"><h1>ReHabita</h1><p>Ejercicios que te acompañan <span>♡</span></p></div>
    <div className="home-main"><div className="home-actions"><button className="home-card play-card" onClick={onPlay}><span className="home-card-icon">▶</span><strong>JUGAR COMO INVITADO</strong><small>Comenzar ejercicios</small></button><button className="home-card login-card" onClick={onLogin}><span className="home-card-icon login-icon">●</span><strong>INICIAR SESIÓN</strong><small>Guardar mis avances</small></button></div></div>
    <div className="guided-strip"><span className="bulb">●</span><div><strong>Movimientos guiados</strong><small>A tu ritmo, según tus necesidades</small></div><HeartPulse className="guided-heart-icon" aria-hidden="true" /></div>
    <div className="home-footer"><div className="current-profile guest-status"><span>●</span><small>Estás usando ReHabita</small><strong>como invitado</strong><p>Iniciá sesión para guardar tus avances.</p></div><button className="about-button" onClick={onAbout}>¿Qué es ReHabita?</button></div>
  </section>
}

function GuestModesView({ onBack, onStart, onLogin, openCategory, setOpenCategory }) {
  return (
    <section className="guest-modes-page">
      <button className="guest-back" onClick={onBack}>← Volver al inicio</button>
      <div className="guest-heading">
        <p className="eyebrow">PRÁCTICA DE INVITADO</p>
        <h1>Lista de categorías y ejercicios.</h1>
        <p className="guest-intro">Estás jugando como invitado. Tenés acceso limitado a los ejercicios disponibles</p>
      </div>

      <ExerciseCategories
        mode="guest"
        openCategory={openCategory}
        setOpenCategory={setOpenCategory}
        onSelectExercise={onStart}
      />

      <section className="guest-note">
        <div>
          <span>✦</span>
          <strong>¿Querés hacer más ejercicios?</strong>
          <p>Registrate como paciente para desbloquear todos los movimientos y guardar tus avances.</p>
        </div>
        <button className="primary-button" onClick={onLogin}>Iniciar sesión <span>→</span></button>
      </section>
    </section>
  )
}

function ExerciseDetailView({ exercise, onBack }) {
  const name = exercise?.name || 'Ejercicio'

  return <div className="exercise-detail-view"><button className="guest-back" onClick={onBack}>← Volver a categorías</button><div className="exercise-detail-card"><p className="eyebrow">EJERCICIO</p><h1>{name}</h1><div className="maintenance-status"><span>Estado</span><strong>Ejercicio en mantenimiento</strong></div><p className="exercise-detail-message">Estamos trabajando en esta funcionalidad. La demostración del movimiento estará disponible próximamente.</p><div className="exercise-demo-placeholder"><div className="demo-placeholder-icon">◌</div><p>Demostración del movimiento próximamente disponible</p></div><button className="primary-button" onClick={onBack}>Volver a la lista <span>→</span></button></div></div>
}

function ProgressView() { return <div className="page-content compact-page"><p className="eyebrow">MI PROGRESO</p><h1>Mi progreso <span>↗</span></h1><p className="intro">Cada práctica cuenta. Mirá todo lo que ya lograste.</p><div className="progress-summary"><div><span className="eyebrow">ESTE MES</span><strong>14</strong><span>sesiones completadas</span></div><div className="progress-bar-wrap"><div className="progress-label"><span>Meta del mes</span><b>70%</b></div><div className="progress-bar"><span></span></div><small>6 sesiones para alcanzar tu meta</small></div></div><div className="achievement"><span>✦</span><div><strong>¡Vas muy bien!</strong><p>Completaste ejercicios durante 3 semanas seguidas.</p></div></div></div> }

function SettingsModal({ onClose, fontSize, setFontSize, darkMode, setDarkMode, highContrast, setHighContrast }) { return <div className="modal-backdrop" onClick={onClose}><section className="settings-modal" onClick={(event) => event.stopPropagation()}><button className="close-button" onClick={onClose}>×</button><p className="eyebrow">ACCESIBILIDAD</p><h2>Configuración</h2><p>Personalizá la interfaz para que sea más cómoda.</p><fieldset className="settings-group"><legend>Tamaño de letra</legend><div className="font-options"><button type="button" className={fontSize === 'normal' ? 'font-option active' : 'font-option'} onClick={() => setFontSize('normal')}>Normal</button><button type="button" className={fontSize === 'large' ? 'font-option active' : 'font-option'} onClick={() => setFontSize('large')}>Grande</button><button type="button" className={fontSize === 'extra-large' ? 'font-option active' : 'font-option'} onClick={() => setFontSize('extra-large')}>Muy grande</button></div></fieldset><label className="setting-toggle"><span><strong>Modo oscuro</strong><small>Reduce el brillo de la pantalla</small></span><input type="checkbox" checked={darkMode} onChange={(event) => setDarkMode(event.target.checked)} /></label><label className="setting-toggle"><span><strong>Alto contraste</strong><small>Mejora la lectura de textos y controles</small></span><input type="checkbox" checked={highContrast} onChange={(event) => setHighContrast(event.target.checked)} /></label><button className="primary-button settings-save" onClick={onClose}>Guardar ajustes</button></section></div> }

function HelpModal({ onClose }) { return <div className="modal-backdrop" onClick={onClose}><section className="help-modal" onClick={(event) => event.stopPropagation()}><button className="close-button" onClick={onClose}>×</button><p className="eyebrow">AYUDA</p><h2>Estamos para ayudarte</h2><p className="help-intro">Usá estas indicaciones cuando tengas una duda durante el juego.</p><section className="help-section"><h3>Si un movimiento resulta incómodo</h3><p>Detené el ejercicio y descansá. No fuerces el cuerpo ni continúes si sentís dolor, mareo o falta de aire.</p><p>Para retomar, esperá a sentirte bien y hacé el movimiento más despacio. Si la molestia continúa, hablá con tu terapeuta.</p></section><section className="therapist-contact"><p className="eyebrow">CONTACTO DEL TERAPEUTA</p><h3>Adriana Boffelli</h3><a href="tel:+5492245477996">+54 9 2245 47-7996</a><address>Dolores, Buenos Aires<br />Calle Mar del Plata 47</address></section><button className="primary-button help-close" onClick={onClose}>Entendido</button></section></div> }

function AboutModal({ onClose }) {
  return <div className="modal-backdrop" onClick={onClose}><section className="about-modal" onClick={(event) => event.stopPropagation()}><button className="close-button" onClick={onClose}>×</button><p className="eyebrow">SOBRE REHABITA</p><h2>Una herramienta para acompañarte</h2><p className="about-intro">ReHabita es una herramienta digital de apoyo para realizar ejercicios de rehabilitación de los miembros superiores, como brazos, manos y hombros.</p><div className="about-points"><section><span>✦</span><div><h3>Un complemento para tu terapia</h3><p>Te acompaña a practicar las actividades indicadas por profesionales de terapia ocupacional. Usala siempre siguiendo las indicaciones de tu terapista ocupacional.</p></div></section><section><span>→</span><div><h3>No reemplaza la atención presencial</h3><p>ReHabita no reemplaza la evaluación, el seguimiento ni el tratamiento presencial de un profesional.</p></div></section><section><span>●</span><div><h3>¿Cómo empezar?</h3><p>Podés probar algunos ejercicios como invitado. Si iniciás sesión como paciente, vas a poder guardar tus avances y acceder a más opciones.</p></div></section></div><p className="about-note">Si sentís molestias o dolor, o tenés dificultades para hacer un movimiento, detené la actividad y consultá con tu profesional.</p><button className="primary-button about-close" onClick={onClose}>Entendido</button></section></div>
}

function LoginModal({ onClose, onAuthenticated }) {
  const [role, setRole] = useState('paciente')
  const [dni, setDni] = useState('')
  const [password, setPassword] = useState('')
  const [csrfToken, setCsrfToken] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getCsrfToken()
      .then(setCsrfToken)
      .catch(() => setError('No se pudo conectar con el servicio. Intentá nuevamente.'))
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (!dni.trim() || !password) {
      setError('Completá el DNI y la contraseña.')
      return
    }
    if (!/^\d{7,8}$/.test(dni)) {
      setError('Ingresá un DNI válido de 7 u 8 dígitos.')
      return
    }

    setIsLoading(true)
    try {
      const { user } = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { dni, password, role: role === 'paciente' ? 'patient' : 'therapist' },
        csrfToken,
      })
      onAuthenticated(user)
    } catch (requestError) {
      setError(requestError.message || 'No se pudo iniciar sesión. Intentá nuevamente.')
    } finally {
      setIsLoading(false)
      setPassword('')
    }
  }

  return <div className="modal-backdrop" onClick={onClose}><section className="login-modal" onClick={(event) => event.stopPropagation()}><button className="close-button" onClick={onClose} aria-label="Cerrar">×</button><p className="eyebrow">ACCESO A REHABITA</p><h2>Iniciar sesión</h2><p className="login-intro">Ingresá para guardar tu progreso y continuar tus ejercicios.</p><div className="role-tabs" role="group" aria-label="Tipo de cuenta"><button type="button" className={role === 'paciente' ? 'role-tab active' : 'role-tab'} onClick={() => { setRole('paciente'); setError('') }} aria-pressed={role === 'paciente'}>Paciente</button><button type="button" className={role === 'terapeuta' ? 'role-tab active therapist-tab' : 'role-tab therapist-tab'} onClick={() => { setRole('terapeuta'); setError('') }} aria-pressed={role === 'terapeuta'}>Terapeuta</button></div><form onSubmit={submit} noValidate><label>DNI<input type="text" inputMode="numeric" autoComplete="username" value={dni} onChange={(event) => setDni(event.target.value)} placeholder="Ingresá tu DNI" aria-describedby={error ? 'login-error' : undefined} required /></label><label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ingresá tu contraseña" required /></label>{error && <p className="form-message error-message" id="login-error" role="alert">{error}</p>}<button className="primary-button login-button" type="submit" disabled={isLoading || !csrfToken}>{isLoading ? 'Verificando…' : `Ingresar como ${role}`} {!isLoading && <span>→</span>}</button></form><button className="guest-button" onClick={onClose}>Continuar como invitado</button></section></div>
}

function TherapistWorkspace({ onLogout }) {
  const [patients, setPatients] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [patientListMessage, setPatientListMessage] = useState('')
  const [form, setForm] = useState({ firstName: '', lastName: '', dni: '', password: '', birthDate: '' })
  const [activeSection, setActiveSection] = useState(null)
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [planPatientId, setPlanPatientId] = useState('')
  const [deleteConfirmationPatient, setDeleteConfirmationPatient] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const planPatientIdRef = useRef(planPatientId)
  const [patientSearch, setPatientSearch] = useState('')
  const [exerciseIds, setExerciseIds] = useState([])
  const [planLoadedFor, setPlanLoadedFor] = useState(null)
  const [openCategory, setOpenCategory] = useState(null)

  const selectPlanPatientId = (patientId) => {
    planPatientIdRef.current = patientId
    setPlanPatientId(patientId)
  }

  const loadPatients = async () => {
    try {
      const result = await apiRequest('/api/therapist/patients')
      setPatients(result.patients)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    apiRequest('/api/therapist/patients')
      .then(({ patients: result }) => {
        if (active) {
          setPatients(result)
          setError('')
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (activeSection !== 'planning' || !planPatientId) return undefined
    let active = true
    apiRequest(`/api/therapist/patients/${encodeURIComponent(planPatientId)}/exercises`)
      .then(({ exerciseIds: result }) => {
        if (active) {
          setExerciseIds(result)
          setPlanLoadedFor(planPatientId)
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message)
          setPlanLoadedFor(planPatientId)
          if (requestError.status === 404) {
            selectPlanPatientId('')
            setExerciseIds([])
          }
        }
      })
    return () => { active = false }
  }, [activeSection, planPatientId])

  const openPatient = async (patient) => {
    setError('')
    setSelectedPatient(patient)
    try {
      const { patient: details } = await apiRequest(`/api/therapist/patients/${encodeURIComponent(patient.id)}`)
      setSelectedPatient(details)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const openPlan = (patient) => {
    selectPlanPatientId(patient.id)
    setSelectedPatient(patient)
    setActiveSection('planning')
    setExerciseIds([])
    setPlanLoadedFor(null)
    setError('')
    setOpenCategory(null)
    setPatientSearch('')
  }

  const createPatient = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsSaving(true)
    try {
      await apiRequest('/api/therapist/patients', {
        method: 'POST',
        body: { ...form, birthDate: form.birthDate || null },
      })
      setForm({ firstName: '', lastName: '', dni: '', password: '', birthDate: '' })
      setMessage('Cuenta y ficha de paciente creadas.')
      await loadPatients()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSaving(false)
    }
  }

  const toggleExercise = async (exercise) => {
    if (isSaving || !planPatientId) return
    const patientId = planPatientId
    const previousIds = exerciseIds
    const nextIds = previousIds.includes(exercise.id)
      ? previousIds.filter((id) => id !== exercise.id)
      : [...previousIds, exercise.id]
    setExerciseIds(nextIds)
    setError('')
    setIsSaving(true)
    try {
      const result = await apiRequest(
        `/api/therapist/patients/${encodeURIComponent(patientId)}/exercises`,
        { method: 'PUT', body: { exerciseIds: nextIds } }
      )
      if (planPatientIdRef.current === patientId) setExerciseIds(result.exerciseIds)
    } catch (requestError) {
      if (planPatientIdRef.current === patientId) {
        setExerciseIds(previousIds)
        setError(requestError.message)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const deletePatient = async () => {
    if (!deleteConfirmationPatient || isDeleting) return
    const patient = deleteConfirmationPatient
    setIsDeleting(true)
    setError('')
    try {
      await apiRequest(`/api/therapist/patients/${encodeURIComponent(patient.id)}`, { method: 'DELETE' })
      setPatients((current) => current.filter(({ id }) => id !== patient.id))
      setSelectedPatient(null)
      if (planPatientIdRef.current === patient.id) {
        selectPlanPatientId('')
        setExerciseIds([])
        setPlanLoadedFor(null)
      }
      setActiveSection('patients')
      setPatientListMessage(`${patient.firstName} ${patient.lastName} fue eliminado de la lista de pacientes.`)
      setDeleteConfirmationPatient(null)
    } catch (requestError) {
      setError(requestError.message)
      setDeleteConfirmationPatient(null)
    } finally {
      setIsDeleting(false)
    }
  }

  const logout = async () => {
    try {
      await onLogout()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const selectedPatientRecord = patients.find((patient) => patient.id === planPatientId) ||
    (selectedPatient?.id === planPatientId ? selectedPatient : null)
  const isPlanLoading = activeSection === 'planning' && Boolean(planPatientId) && planLoadedFor !== planPatientId
  const filteredPatients = patients.filter((patient) =>
    `${patient.firstName} ${patient.lastName}`.toLocaleLowerCase().includes(patientSearch.trim().toLocaleLowerCase())
  )

  return (
    <section className="therapist-layout">
      <aside className="therapist-sidebar">
        <div className="brand-mark" aria-label="ReHabita"><span className="brand-symbol"><HeartPulse aria-hidden="true" /></span><span>ReHabita</span></div>
        <nav className="therapist-nav" aria-label="Secciones del terapeuta">
          <button type="button" className={activeSection === 'patients' ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveSection('patients'); setSelectedPatient(null); setError('') }}>
            <UsersRound aria-hidden="true" /> Pacientes
          </button>
          <button type="button" className={activeSection === 'new-patient' ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveSection('new-patient'); setError(''); setMessage('') }}>
            <UserRoundPlus aria-hidden="true" /> Nuevo paciente
          </button>
          <button type="button" className={activeSection === 'planning' ? 'nav-item active' : 'nav-item'} onClick={() => { selectPlanPatientId(''); setExerciseIds([]); setPlanLoadedFor(null); setActiveSection('planning'); setError('') }}>
            <ClipboardList aria-hidden="true" /> Planificación
          </button>
        </nav>
        <button type="button" className="therapist-logout" onClick={logout}><LogOut aria-hidden="true" /> Cerrar sesión</button>
      </aside>

      <main className="therapist-main">
        {!activeSection ? (
          <div className="therapist-watermark" aria-hidden="true">REHABITA</div>
        ) : (
          <div className="therapist-section" key={`${activeSection}-${activeSection === 'planning' ? planPatientId || 'list' : selectedPatient?.id || ''}`}>
            {activeSection === 'patients' && (
              <>
                <p className="eyebrow">ESPACIO DE TRABAJO</p>
                {selectedPatient ? (
                  <section className="workspace-card patient-detail-card">
                    <button type="button" className="guest-back" onClick={() => { setSelectedPatient(null); setError('') }}>← Volver a pacientes</button>
                    {error && <p className="form-message error-message" role="alert">{error}</p>}
                    <p className="eyebrow">DATOS DEL PACIENTE</p>
                    <h1>{selectedPatient.firstName} {selectedPatient.lastName}</h1>
                    <dl className="patient-details">
                      <div><dt>Nombre y apellido</dt><dd>{selectedPatient.firstName} {selectedPatient.lastName}</dd></div>
                      {selectedPatient.dni && <div><dt>DNI</dt><dd>{selectedPatient.dni}</dd></div>}
                      {selectedPatient.age !== null && selectedPatient.age !== undefined && <div><dt>Edad</dt><dd>{selectedPatient.age} años</dd></div>}
                      {selectedPatient.birthDate && <div><dt>Fecha de nacimiento</dt><dd>{selectedPatient.birthDate}</dd></div>}
                    </dl>
                    <button type="button" className="primary-button create-plan-button" onClick={() => openPlan(selectedPatient)}>Crear plan <span>→</span></button>
                    <button
                      type="button"
                      className="patient-delete-button"
                      onClick={() => setDeleteConfirmationPatient(selectedPatient)}
                      disabled={isDeleting}
                    >
                      Eliminar paciente
                    </button>
                  </section>
                ) : (
                  <>
                    <h1>Pacientes</h1>
                    {error && <p className="form-message error-message" role="alert">{error}</p>}
                    {patientListMessage && <p className="form-message success-message" role="status">{patientListMessage}</p>}
                    <section className="workspace-card">
                      <h2>Pacientes registrados</h2>
                      {isLoading ? <p>Cargando pacientes…</p> : patients.length ? (
                        <ul className="patient-list patient-list-scroll">
                          {patients.map((patient) => (
                            <li key={patient.id}>
                              <button type="button" className="patient-list-button" onClick={() => openPatient(patient)}>
                                <span><strong>{patient.firstName} {patient.lastName}</strong>{patient.age !== null && <small>{patient.age} años</small>}</span>
                                <span aria-hidden="true">›</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : <p>Aún no hay pacientes registrados.</p>}
                    </section>
                  </>
                )}
              </>
            )}

            {activeSection === 'new-patient' && (
              <>
                <p className="eyebrow">ESPACIO DE TRABAJO</p>
                <h1>Nuevo paciente</h1>
                {error && <p className="form-message error-message" role="alert">{error}</p>}
                {message && (
                  <div className="patient-created-message" role="status">
                    <p>{message}</p>
                    <button type="button" onClick={() => { setActiveSection('patients'); setSelectedPatient(null) }}>Ir a Pacientes</button>
                  </div>
                )}
                <PatientCreationForm form={form} setForm={setForm} isSaving={isSaving} onSubmit={createPatient} />
              </>
            )}

            {activeSection === 'planning' && (
              <>
                {planPatientId ? (
                  <>
                    <div className="planning-detail-screen">
                      <button
                        type="button"
                        className="guest-back planning-back"
                        onClick={() => {
                          selectPlanPatientId('')
                          setExerciseIds([])
                          setPlanLoadedFor(null)
                          setOpenCategory(null)
                          setError('')
                        }}
                      >
                        ← Volver a pacientes
                      </button>
                      {selectedPatientRecord ? (
                        <>
                          <p className="eyebrow">PLANIFICACIÓN DEL PACIENTE</p>
                          <h1>{selectedPatientRecord.firstName} {selectedPatientRecord.lastName}</h1>
                          <div className="planning-patient-heading">
                            <span>{isSaving ? 'Guardando…' : 'Los cambios se guardan automáticamente'}</span>
                          </div>
                          {error && <p className="form-message error-message" role="alert">{error}</p>}
                          {isPlanLoading ? <p role="status">Cargando ejercicios asignados…</p> : (
                            <ExerciseCategories
                              mode="selection"
                              openCategory={openCategory}
                              setOpenCategory={setOpenCategory}
                              selectedExerciseIds={exerciseIds}
                              onToggleExercise={toggleExercise}
                              disabled={isSaving}
                            />
                          )}
                        </>
                      ) : (
                        <p role="status">El paciente ya no está disponible. Volvé a la lista para elegir otro.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="planning-list-screen">
                    <p className="eyebrow">PLANIFICACIÓN</p>
                    <h1>Planificación</h1>
                    <label className="patient-search">
                      <Search aria-hidden="true" />
                      <span className="sr-only">Buscar paciente por nombre o apellido</span>
                      <input
                        type="search"
                        placeholder="Buscar paciente por nombre o apellido..."
                        value={patientSearch}
                        onChange={(event) => setPatientSearch(event.target.value)}
                      />
                    </label>
                    {error && <p className="form-message error-message" role="alert">{error}</p>}
                    {isLoading ? <p role="status">Cargando pacientes…</p> : patients.length === 0 ? (
                      <div className="planning-empty">
                        <p>Aún no hay pacientes registrados.</p>
                        <button type="button" className="text-action" onClick={() => { setActiveSection('new-patient'); setError('') }}>Ir a Nuevo paciente</button>
                      </div>
                    ) : (
                      <ul className="planning-patient-list" aria-label="Seleccionar paciente">
                        {filteredPatients.map((patient) => (
                          <li key={patient.id}>
                            <button
                              type="button"
                              className={planPatientId === patient.id ? 'planning-patient-option selected' : 'planning-patient-option'}
                              onClick={() => {
                                selectPlanPatientId(patient.id)
                                setExerciseIds([])
                                setPlanLoadedFor(null)
                                setOpenCategory(null)
                                setError('')
                              }}
                              aria-pressed={planPatientId === patient.id}
                            >
                              <span><strong>{patient.firstName} {patient.lastName}</strong>{patient.age !== null && <small>{patient.age} años</small>}</span>
                              <span className={patient.hasPlan ? 'plan-status has-plan' : 'plan-status'}>
                                {patient.hasPlan ? 'Planificado' : 'Sin plan'}
                              </span>
                            </button>
                          </li>
                        ))}
                        {filteredPatients.length === 0 && <li className="no-patient-results">No se encontraron pacientes</li>}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
      {deleteConfirmationPatient && (
        <DeletePatientModal
          patient={deleteConfirmationPatient}
          isDeleting={isDeleting}
          onCancel={() => { if (!isDeleting) setDeleteConfirmationPatient(null) }}
          onConfirm={deletePatient}
        />
      )}
    </section>
  )
}

function DeletePatientModal({ patient, isDeleting, onCancel, onConfirm }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isDeleting) onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDeleting, onCancel])

  return (
    <div className="modal-backdrop delete-patient-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isDeleting) onCancel()
    }}>
      <section
        className="delete-confirmation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-patient-title"
        aria-describedby="delete-patient-message"
      >
        <p className="eyebrow">CONFIRMAR ELIMINACIÓN</p>
        <h2 id="delete-patient-title">Eliminar paciente</h2>
        <p id="delete-patient-message">
          ¿Confirmás que querés eliminar a {patient.firstName} {patient.lastName} de la lista de pacientes?
        </p>
        {isDeleting && <p role="status">Eliminando paciente…</p>}
        <div className="delete-confirmation-actions">
          <button type="button" className="delete-confirm-button" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Eliminando…' : 'Sí, eliminar'}
          </button>
          <button type="button" className="delete-cancel-button" onClick={onCancel} disabled={isDeleting} autoFocus>
            Cancelar
          </button>
        </div>
      </section>
    </div>
  )
}

function PatientCreationForm({ form, setForm, isSaving, onSubmit }) {
  const updateForm = (field) => (event) => setForm({ ...form, [field]: event.target.value })
  return (
    <section className="workspace-card">
      <h2>Crear cuenta de paciente</h2>
      <p>La contraseña inicial debe tener al menos 12 caracteres. Compartila con el paciente de forma segura.</p>
      <form className="patient-form" onSubmit={onSubmit}>
        <label>Nombre<input required maxLength={100} value={form.firstName} onChange={updateForm('firstName')} /></label>
        <label>Apellido<input required maxLength={100} value={form.lastName} onChange={updateForm('lastName')} /></label>
        <label>DNI<input required inputMode="numeric" pattern="[0-9]{7,8}" maxLength={8} value={form.dni} onChange={updateForm('dni')} /></label>
        <label>Fecha de nacimiento (opcional)<input type="date" value={form.birthDate} onChange={updateForm('birthDate')} /></label>
        <label>Contraseña inicial<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={form.password} onChange={updateForm('password')} /></label>
        <button className="primary-button" disabled={isSaving}>{isSaving ? 'Creando…' : 'Crear paciente'} <span>→</span></button>
      </form>
    </section>
  )
}

function PatientWorkspace({ user, onLogout }) {
  const [patient, setPatient] = useState(null)
  const [exerciseIds, setExerciseIds] = useState([])
  const [selectedExercise, setSelectedExercise] = useState(null)
  const [openCategory, setOpenCategory] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiRequest('/api/patient/me')
      .then(({ patient: record }) => setPatient(record))
      .catch((requestError) => setError(requestError.message))
  }, [])

  useEffect(() => {
    apiRequest('/api/patient/exercises')
      .then(({ exerciseIds: result }) => setExerciseIds(result))
      .catch((requestError) => setError(requestError.message))
  }, [])

  const openAssignedExercise = async (exercise) => {
    setError('')
    try {
      const { exercise: result } = await apiRequest(`/api/patient/exercises/${encodeURIComponent(exercise.id)}`)
      setSelectedExercise(result)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const logout = async () => {
    try {
      await onLogout()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  if (selectedExercise) {
    return <section className="patient-exercise-view"><ExerciseDetailView exercise={selectedExercise} onBack={() => setSelectedExercise(null)} /></section>
  }

  return (
    <section className="workspace-page patient-workspace">
      <header className="workspace-header"><div className="brand-mark" aria-label="ReHabita"><span className="brand-symbol"><HeartPulse aria-hidden="true" /></span><span>ReHabita</span></div><button className="guest-back" onClick={logout}>Cerrar sesión</button></header>
      <div className="workspace-content">
        <p className="eyebrow">ESPACIO DEL PACIENTE</p>
        <h1>{patient ? `Hola, ${patient.firstName}` : `Hola, ${user.displayName}`}</h1>
        {error && <p className="form-message error-message" role="alert">{error}</p>}
        <section className="workspace-card">
          <h2>Lista de categorías y ejercicios</h2>
          {exerciseIds.length ? (
            <ExerciseCategories
              mode="patient"
              openCategory={openCategory}
              setOpenCategory={setOpenCategory}
              selectedExerciseIds={exerciseIds}
              onSelectExercise={openAssignedExercise}
            />
          ) : <p>Tu terapeuta todavía no asignó ejercicios.</p>}
        </section>
      </div>
    </section>
  )
}

export default App
