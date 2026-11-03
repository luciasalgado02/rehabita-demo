import express from 'express'
import session from 'express-session'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { SQLiteSessionStore } from './sqlite-session-store.js'
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from './passwords.js'
import { exercisesById } from '../shared/exercises.js'

const DNI_PATTERN = /^\d{7,8}$/
const SESSION_MAX_AGE = 8 * 60 * 60 * 1000
const dummyHash = `scrypt$32768$8$1$${randomBytes(16).toString('hex')}$${scryptSync(randomBytes(32), 'rehabita-invalid-account-salt', 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex')}`

function isDni(value) {
  return typeof value === 'string' && DNI_PATTERN.test(value)
}

function isValidBirthDate(value) {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10)
}

function getAge(birthDate) {
  if (!birthDate) return null
  const [year, month, day] = birthDate.split('-').map(Number)
  const today = new Date()
  return today.getUTCFullYear() - year -
    (today.getUTCMonth() + 1 < month || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day) ? 1 : 0)
}

function csrfMatches(expectedValue, suppliedValue) {
  if (typeof expectedValue !== 'string' || typeof suppliedValue !== 'string') return false
  const expected = Buffer.from(expectedValue)
  const supplied = Buffer.from(suppliedValue)
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

function clearSessionCookie(res, secure) {
  res.clearCookie('rehabita.sid', {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
  })
}

export function createApiApp({ db, sessionSecret, production = false } = {}) {
  if (!db) throw new Error('A database connection is required.')
  if (production && (!sessionSecret || sessionSecret.length < 32)) {
    throw new Error('SESSION_SECRET must contain at least 32 characters in production.')
  }

  const app = express()
  const secureCookie = production
  const store = new SQLiteSessionStore(db)
  const attempts = new Map()

  app.disable('x-powered-by')
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1)
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.set('X-Frame-Options', 'DENY')
    if (production) {
      res.set('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'")
      if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
    next()
  })
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  app.use(express.json({ limit: '10kb', strict: true }))
  app.use(session({
    name: 'rehabita.sid',
    secret: sessionSecret || randomBytes(48).toString('hex'),
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    },
  }))

  function requireCsrf(req, res, next) {
    if (!csrfMatches(req.session?.csrfToken, req.get('x-csrf-token'))) {
      res.status(403).json({ error: 'La solicitud venció. Actualizá la página e intentá nuevamente.' })
      return
    }
    const origin = req.get('origin')
    if (production && origin) {
      try {
        const allowedOrigin = process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`
        if (new URL(origin).origin !== allowedOrigin) {
          res.status(403).json({ error: 'La solicitud no está autorizada.' })
          return
        }
      } catch {
        res.status(403).json({ error: 'La solicitud no está autorizada.' })
        return
      }
    }
    next()
  }

  function requireUser(req, res, next) {
    const userId = req.session?.userId
    if (!userId) {
      res.status(401).json({ error: 'La sesión venció. Iniciá sesión nuevamente.' })
      return
    }
    const user = db.prepare('SELECT id, role, active FROM users WHERE id = ?').get(userId)
    if (!user || !user.active) {
      req.session.destroy((error) => {
        if (error) return next(error)
        clearSessionCookie(res, secureCookie)
        res.status(401).json({ error: 'La sesión venció. Iniciá sesión nuevamente.' })
      })
      return
    }
    req.user = user
    next()
  }

  function requireRole(role) {
    return (req, res, next) => {
      requireUser(req, res, (error) => {
        if (error) return next(error)
        if (res.headersSent) return
        if (req.user?.role !== role) {
          res.status(403).json({ error: 'No tenés permiso para realizar esta acción.' })
          return
        }
        next()
      })
    }
  }

  function allowLoginAttempt(req, res, next) {
    const now = Date.now()
    const key = req.ip || req.socket.remoteAddress || 'unknown'
    const windowMs = 15 * 60 * 1000
    if (attempts.size > 5000) attempts.delete(attempts.keys().next().value)
    const record = attempts.get(key)
    if (!record || now - record.startedAt >= windowMs) {
      attempts.set(key, { startedAt: now, count: 1 })
      next()
      return
    }
    if (record.count >= 10) {
      res.status(429).json({ error: 'Demasiados intentos. Esperá unos minutos e intentá nuevamente.' })
      return
    }
    record.count += 1
    next()
  }

  function getTherapistPatient(patientId, therapistId) {
    return db.prepare(`
      SELECT patients.id AS id, first_name AS firstName, last_name AS lastName,
        patients.birth_date AS birthDate, patients.created_at AS createdAt, users.dni AS dni
      FROM patients JOIN users ON users.id = patients.user_id
      WHERE patients.id = ? AND patients.therapist_id = ?
    `).get(patientId, therapistId)
  }

  function getOrCreatePatientPlan(patientId, therapistId) {
    const plan = db.prepare(`
      SELECT id FROM plans
      WHERE patient_id = ? AND therapist_id = ?
      ORDER BY created_at, id LIMIT 1
    `).get(patientId, therapistId)
    if (plan) return plan.id
    const planId = randomUUID()
    db.prepare('INSERT INTO plans (id, patient_id, therapist_id) VALUES (?, ?, ?)').run(planId, patientId, therapistId)
    return planId
  }

  function getPlanExerciseIds(patientId) {
    return db.prepare(`
      SELECT plan_exercises.exercise_id AS id
      FROM plan_exercises
      WHERE plan_exercises.plan_id = (
        SELECT id FROM plans WHERE patient_id = ?
        ORDER BY created_at, id LIMIT 1
      )
      ORDER BY plan_exercises.exercise_id
    `).all(patientId).map(({ id }) => id)
  }

  app.get('/api/auth/csrf', (req, res, next) => {
    if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex')
    req.session.save((error) => {
      if (error) return next(error)
      res.json({ csrfToken: req.session.csrfToken })
    })
  })

  app.get('/api/health', (req, res) => {
    db.prepare('SELECT 1').get()
    res.json({ status: 'ok' })
  })

  app.get('/api/auth/me', (req, res, next) => {
    if (!req.session?.userId) {
      res.json({ user: null })
      return
    }
    const user = db.prepare('SELECT id, role, active FROM users WHERE id = ?').get(req.session.userId)
    if (!user || !user.active) {
      req.session.destroy((error) => {
        if (error) return next(error)
        clearSessionCookie(res, secureCookie)
        res.json({ user: null })
      })
      return
    }
    const profile = user.role === 'patient'
      ? db.prepare('SELECT first_name, last_name FROM patients WHERE user_id = ?').get(user.id)
      : null
    if (user.role === 'patient' && !profile) {
      res.status(500).json({ error: 'No se pudo cargar la cuenta. Contactá a tu terapeuta.' })
      return
    }
    res.json({
      user: {
        id: user.id,
        role: user.role,
        displayName: profile ? `${profile.first_name} ${profile.last_name}` : 'Terapeuta',
      },
    })
  })

  app.post('/api/auth/login', requireCsrf, allowLoginAttempt, async (req, res, next) => {
    const { dni, password, role } = req.body ?? {}
    if (!isDni(dni) || typeof password !== 'string' || password.length < 1 || password.length > 128 ||
      !['therapist', 'patient'].includes(role)) {
      res.status(400).json({ error: 'Revisá los datos ingresados e intentá nuevamente.' })
      return
    }

    try {
      const user = db.prepare('SELECT id, password_hash, role, active FROM users WHERE dni = ? AND role = ?').get(dni, role)
      const passwordValid = await verifyPassword(password, user?.password_hash || dummyHash)
      if (!user || !user.active || !passwordValid) {
        res.status(401).json({ error: 'No se pudo iniciar sesión. Revisá tus datos e intentá nuevamente.' })
        return
      }

      const patient = user.role === 'patient'
        ? db.prepare('SELECT first_name, last_name FROM patients WHERE user_id = ?').get(user.id)
        : null
      if (user.role === 'patient' && !patient) {
        res.status(500).json({ error: 'No se pudo completar el acceso. Contactá a tu terapeuta.' })
        return
      }

      await new Promise((resolve, reject) => {
        req.session.regenerate((error) => error ? reject(error) : resolve())
      })
      req.session.userId = user.id
      req.session.csrfToken = randomBytes(32).toString('hex')
      await new Promise((resolve, reject) => {
        req.session.save((error) => error ? reject(error) : resolve())
      })

      res.json({
        user: {
          id: user.id,
          role: user.role,
          displayName: patient ? `${patient.first_name} ${patient.last_name}` : 'Terapeuta',
        },
        csrfToken: req.session.csrfToken,
      })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/auth/logout', requireCsrf, (req, res, next) => {
    if (!req.session) {
      clearSessionCookie(res, secureCookie)
      res.status(204).end()
      return
    }
    req.session.destroy((error) => {
      if (error) return next(error)
      clearSessionCookie(res, secureCookie)
      res.status(204).end()
    })
  })

  app.get('/api/therapist/patients', requireRole('therapist'), (req, res) => {
    const patients = db.prepare(`
      SELECT patients.id, patients.first_name AS firstName, patients.last_name AS lastName,
        patients.birth_date AS birthDate, patients.created_at AS createdAt,
        EXISTS (
          SELECT 1 FROM plans
          WHERE plans.patient_id = patients.id AND plans.therapist_id = patients.therapist_id
        ) AS hasPlan
      FROM patients
      WHERE patients.therapist_id = ?
      ORDER BY patients.last_name, patients.first_name
    `).all(req.user.id)
    res.json({
      patients: patients.map((patient) => ({
        ...patient,
        age: getAge(patient.birthDate),
        hasPlan: Boolean(patient.hasPlan),
      })),
    })
  })

  app.get('/api/therapist/patients/:patientId', requireRole('therapist'), (req, res) => {
    const patient = getTherapistPatient(req.params.patientId, req.user.id)
    if (!patient) {
      res.status(404).json({ error: 'No se encontró el paciente solicitado.' })
      return
    }
    res.json({ patient: { ...patient, age: getAge(patient.birthDate) } })
  })

  app.delete('/api/therapist/patients/:patientId', requireCsrf, requireRole('therapist'), (req, res, next) => {
    try {
      const deletePatient = db.transaction(() => {
        const patient = getTherapistPatient(req.params.patientId, req.user.id)
        if (!patient) return 'not-found'

        const hasSessionHistory = db.prepare(
          'SELECT 1 FROM session_records WHERE patient_id = ? LIMIT 1'
        ).get(patient.id)
        if (hasSessionHistory) return 'has-history'

        const account = db.prepare(`
          SELECT users.id AS userId
          FROM patients JOIN users ON users.id = patients.user_id
          WHERE patients.id = ? AND patients.therapist_id = ? AND users.role = 'patient'
        `).get(patient.id, req.user.id)
        if (!account) return 'not-found'

        db.prepare("DELETE FROM users WHERE id = ? AND role = 'patient'").run(account.userId)
        return 'deleted'
      })
      const result = deletePatient.immediate()
      if (result === 'not-found') {
        res.status(404).json({ error: 'No se encontró el paciente solicitado.' })
        return
      }
      if (result === 'has-history') {
        res.status(409).json({
          error: 'No se puede eliminar este paciente porque conserva registros de sesiones. Conservá sus datos clínicos y consultá la política de retención.',
        })
        return
      }
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/therapist/patients/:patientId/exercises', requireRole('therapist'), (req, res) => {
    const patient = getTherapistPatient(req.params.patientId, req.user.id)
    if (!patient) {
      res.status(404).json({ error: 'No se encontró el paciente solicitado.' })
      return
    }
    res.json({ exerciseIds: getPlanExerciseIds(patient.id) })
  })

  app.put('/api/therapist/patients/:patientId/exercises', requireCsrf, requireRole('therapist'), (req, res) => {
    const patient = getTherapistPatient(req.params.patientId, req.user.id)
    if (!patient) {
      res.status(404).json({ error: 'No se encontró el paciente solicitado.' })
      return
    }
    const { exerciseIds } = req.body ?? {}
    if (!Array.isArray(exerciseIds) || exerciseIds.some((id) => typeof id !== 'string' || !exercisesById.has(id)) ||
      new Set(exerciseIds).size !== exerciseIds.length) {
      res.status(400).json({ error: 'La selección contiene ejercicios no válidos.' })
      return
    }

    const savePlan = db.transaction(() => {
      const planId = getOrCreatePatientPlan(patient.id, req.user.id)
      db.prepare('DELETE FROM plan_exercises WHERE plan_id = ?').run(planId)
      const insertExercise = db.prepare('INSERT INTO plan_exercises (plan_id, exercise_id) VALUES (?, ?)')
      for (const exerciseId of exerciseIds) insertExercise.run(planId, exerciseId)
      db.prepare("UPDATE plans SET updated_at = datetime('now') WHERE id = ?").run(planId)
    })
    savePlan.immediate()
    res.json({ exerciseIds })
  })

  app.post('/api/therapist/patients', requireCsrf, requireRole('therapist'), async (req, res, next) => {
    const { firstName, lastName, dni, password, birthDate } = req.body ?? {}
    if (
      typeof firstName !== 'string' || firstName.trim().length < 1 || firstName.trim().length > 100 ||
      typeof lastName !== 'string' || lastName.trim().length < 1 || lastName.trim().length > 100 ||
      !isDni(dni) || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > 128 ||
      !isValidBirthDate(birthDate)
    ) {
      res.status(400).json({
        error: `Completá nombre, apellido y DNI válido, y revisá la fecha de nacimiento. La contraseña inicial debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      })
      return
    }

    try {
      const userId = randomUUID()
      const patientId = randomUUID()
      const passwordHash = await hashPassword(password)
      const createPatient = db.transaction(() => {
        db.prepare(`
          INSERT INTO users (id, dni, password_hash, role) VALUES (?, ?, ?, 'patient')
        `).run(userId, dni, passwordHash)
        db.prepare(`
          INSERT INTO patients (id, user_id, therapist_id, first_name, last_name)
          VALUES (?, ?, ?, ?, ?)
        `).run(patientId, userId, req.user.id, firstName.trim(), lastName.trim())
        if (birthDate) {
          db.prepare('UPDATE patients SET birth_date = ? WHERE id = ?').run(birthDate, patientId)
        }
      })
      createPatient()
      res.status(201).json({
        patient: {
          id: patientId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          birthDate: birthDate || null,
          age: getAge(birthDate || null),
        },
      })
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        res.status(409).json({ error: 'No se pudo crear el paciente. Verificá que los datos sean únicos.' })
        return
      }
      next(error)
    }
  })

  app.get('/api/patient/me', requireRole('patient'), (req, res) => {
    const patient = db.prepare(`
      SELECT id, first_name AS firstName, last_name AS lastName, created_at AS createdAt
      FROM patients WHERE user_id = ?
    `).get(req.user.id)
    if (!patient) {
      res.status(404).json({ error: 'No se encontró la ficha asociada a esta cuenta.' })
      return
    }
    res.json({ patient })
  })

  app.get('/api/patient/exercises', requireRole('patient'), (req, res) => {
    const patient = db.prepare('SELECT id FROM patients WHERE user_id = ?').get(req.user.id)
    if (!patient) {
      res.status(404).json({ error: 'No se encontró la ficha asociada a esta cuenta.' })
      return
    }
    const exerciseIds = getPlanExerciseIds(patient.id)
    res.json({ exerciseIds })
  })

  app.get('/api/patient/exercises/:exerciseId', requireRole('patient'), (req, res) => {
    const exercise = exercisesById.get(req.params.exerciseId)
    if (!exercise) {
      res.status(404).json({ error: 'No se encontró el ejercicio solicitado.' })
      return
    }
    const patient = db.prepare('SELECT id FROM patients WHERE user_id = ?').get(req.user.id)
    if (!patient) {
      res.status(404).json({ error: 'No se encontró la ficha asociada a esta cuenta.' })
      return
    }
    if (!getPlanExerciseIds(patient.id).includes(exercise.id)) {
      res.status(403).json({ error: 'Este ejercicio no está incluido en tu planificación.' })
      return
    }
    res.json({ exercise })
  })

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'La operación solicitada no está disponible.' })
  })

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error)
      return
    }
    if (error?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'La solicitud no tiene un formato válido.' })
      return
    }
    console.error('API request failed:', error?.name || 'Unknown error')
    res.status(500).json({ error: 'Ocurrió un error. Intentá nuevamente.' })
  })

  return app
}
