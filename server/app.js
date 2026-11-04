import express from 'express'
import session from 'express-session'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { PersistentSessionStore } from './session-store.js'
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from './passwords.js'
import { exercisesById } from '../shared/exercises.js'

const DNI_PATTERN = /^\d{7,8}$/
const APPOINTMENT_COLORS = new Set(['#cdeee6', '#dbeafe', '#fce7c8', '#eadcf8', '#f8d7da'])
const EXERCISE_SPEEDS = new Set(['lenta', 'media', 'rápida'])
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

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function getArgentinaDateTime() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  }
}

function isValidAppointmentInput(body) {
  return body && typeof body.patientId === 'string' && body.patientId.length > 0 &&
    isCalendarDate(body.date) &&
    typeof body.startTime === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(body.startTime) &&
    typeof body.endTime === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(body.endTime) &&
    body.startTime < body.endTime &&
    typeof body.color === 'string' && APPOINTMENT_COLORS.has(body.color) &&
    (body.observations === undefined || body.observations === null ||
      typeof body.observations === 'string' && body.observations.length <= 2000)
}

function isValidExerciseConfiguration(body) {
  return body && Number.isInteger(body.repetitions) && body.repetitions >= 1 && body.repetitions <= 1000 &&
    Number.isInteger(body.series) && body.series >= 1 && body.series <= 100 &&
    typeof body.speed === 'string' && EXERCISE_SPEEDS.has(body.speed) &&
    Number.isInteger(body.restSeconds) && body.restSeconds >= 0 && body.restSeconds <= 3600
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
  const store = new PersistentSessionStore(db)
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

  async function requireUser(req, res, next) {
    try {
      const userId = req.session?.userId
      if (!userId) {
        res.status(401).json({ error: 'La sesión venció. Iniciá sesión nuevamente.' })
        return
      }
      const user = await db.get('SELECT id, role, active FROM users WHERE id = ?', [userId])
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
    } catch (error) {
      next(error)
    }
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

  async function getTherapistPatient(patientId, therapistId) {
    return db.get(`
      SELECT patients.id AS id, first_name AS firstName, last_name AS lastName,
        patients.birth_date AS birthDate, patients.created_at AS createdAt, users.dni AS dni
      FROM patients JOIN users ON users.id = patients.user_id
      WHERE patients.id = ? AND patients.therapist_id = ?
    `, [patientId, therapistId])
  }

  async function getOrCreatePatientPlan(tx, patientId, therapistId) {
    const plan = await tx.get(`
      SELECT id FROM plans
      WHERE patient_id = ? AND therapist_id = ?
      ORDER BY created_at, id LIMIT 1
    `, [patientId, therapistId])
    if (plan) return plan.id
    const planId = randomUUID()
    await tx.run('INSERT INTO plans (id, patient_id, therapist_id) VALUES (?, ?, ?)', [planId, patientId, therapistId])
    return planId
  }

  async function getPlanExerciseIds(patientId) {
    const rows = await db.all(`
      SELECT plan_exercises.exercise_id AS id
      FROM plan_exercises
      WHERE plan_exercises.plan_id = (
        SELECT id FROM plans WHERE patient_id = ?
        ORDER BY created_at, id LIMIT 1
      )
      ORDER BY plan_exercises.exercise_id
    `, [patientId])
    return rows.map(({ id }) => id)
  }

  async function getPlanExerciseConfigurations(patientId, therapistId) {
    const rows = await db.all(`
      SELECT plan_exercises.exercise_id AS exerciseId,
        plan_exercises.repetitions AS repetitions,
        plan_exercises.series AS series,
        plan_exercises.speed AS speed,
        plan_exercises.rest_seconds AS restSeconds
      FROM plan_exercises
      JOIN plans ON plans.id = plan_exercises.plan_id
      WHERE plans.patient_id = ? AND plans.therapist_id = COALESCE(?, plans.therapist_id)
        AND plan_exercises.repetitions IS NOT NULL
      ORDER BY plan_exercises.exercise_id
    `, [patientId, therapistId ?? null])
    return rows
  }

  app.get('/api/auth/csrf', (req, res, next) => {
    if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex')
    req.session.save((error) => {
      if (error) return next(error)
      res.json({ csrfToken: req.session.csrfToken })
    })
  })

  app.get('/api/health', async (req, res) => {
    await db.get('SELECT 1')
    res.json({ status: 'ok' })
  })

  app.get('/api/auth/me', async (req, res, next) => {
    if (!req.session?.userId) {
      res.json({ user: null })
      return
    }
    const user = await db.get('SELECT id, role, active FROM users WHERE id = ?', [req.session.userId])
    if (!user || !user.active) {
      req.session.destroy((error) => {
        if (error) return next(error)
        clearSessionCookie(res, secureCookie)
        res.json({ user: null })
      })
      return
    }
    const profile = user.role === 'patient'
      ? await db.get('SELECT first_name, last_name FROM patients WHERE user_id = ?', [user.id])
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
      const user = await db.get('SELECT id, password_hash, role, active FROM users WHERE dni = ? AND role = ?', [dni, role])
      const passwordValid = await verifyPassword(password, user?.password_hash || dummyHash)
      if (!user || !user.active || !passwordValid) {
        res.status(401).json({ error: 'No se pudo iniciar sesión. Revisá tus datos e intentá nuevamente.' })
        return
      }

      const patient = user.role === 'patient'
        ? await db.get('SELECT first_name, last_name FROM patients WHERE user_id = ?', [user.id])
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

  app.get('/api/therapist/patients', requireRole('therapist'), async (req, res) => {
    const patients = await db.all(`
      SELECT patients.id, patients.first_name AS firstName, patients.last_name AS lastName,
        patients.birth_date AS birthDate, patients.created_at AS createdAt,
        EXISTS (
          SELECT 1 FROM plan_exercises
          JOIN plans ON plans.id = plan_exercises.plan_id
          WHERE plans.patient_id = patients.id AND plans.therapist_id = patients.therapist_id
        ) AS hasPlan
      FROM patients
      WHERE patients.therapist_id = ?
      ORDER BY patients.last_name, patients.first_name
    `, [req.user.id])
    res.json({
      patients: patients.map((patient) => ({
        ...patient,
        age: getAge(patient.birthDate),
        hasPlan: Boolean(patient.hasPlan),
      })),
    })
  })

  app.get('/api/therapist/appointments', requireRole('therapist'), async (req, res) => {
    const { from, to } = req.query
    const spanDays = isCalendarDate(from) && isCalendarDate(to)
      ? (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000
      : Number.NaN
    if (!Number.isInteger(spanDays) || spanDays < 0 || spanDays > 62) {
      res.status(400).json({ error: 'Seleccioná un período válido de hasta 63 días.' })
      return
    }

    const appointments = await db.all(`
      SELECT appointments.id, appointments.patient_id AS patientId,
        appointments.appointment_date AS date, appointments.start_time AS startTime,
        appointments.end_time AS endTime, appointments.color,
        appointments.observations, appointments.created_at AS createdAt,
        appointments.updated_at AS updatedAt,
        patients.first_name AS patientFirstName, patients.last_name AS patientLastName
      FROM appointments
      JOIN patients ON patients.id = appointments.patient_id
      WHERE appointments.therapist_id = ? AND appointments.appointment_date >= ? AND appointments.appointment_date <= ?
      ORDER BY appointments.appointment_date, appointments.start_time, appointments.id
    `, [req.user.id, from, to])
    res.json({ appointments })
  })

  app.post('/api/therapist/appointments', requireCsrf, requireRole('therapist'), async (req, res, next) => {
    if (!isValidAppointmentInput(req.body)) {
      res.status(400).json({ error: 'Revisá los datos de la cita, el horario, el color y las observaciones.' })
      return
    }

    try {
      const result = await db.withTransaction(async (tx) => {
        await tx.lockTherapist(req.user.id)
        const patient = await tx.get(
          'SELECT id FROM patients WHERE id = ? AND therapist_id = ?',
          [req.body.patientId, req.user.id]
        )
        if (!patient) return { error: 'patient-not-found' }
        const conflict = await tx.get(`
          SELECT id FROM appointments
          WHERE therapist_id = ? AND appointment_date = ? AND start_time < ? AND end_time > ?
          LIMIT 1
        `, [req.user.id, req.body.date, req.body.endTime, req.body.startTime])
        if (conflict) return { error: 'conflict' }

        const appointmentId = randomUUID()
        await tx.run(`
          INSERT INTO appointments
            (id, therapist_id, patient_id, appointment_date, start_time, end_time, color, observations)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          appointmentId, req.user.id, patient.id, req.body.date, req.body.startTime,
          req.body.endTime, req.body.color, (req.body.observations || '').trim(),
        ])
        return { appointment: await tx.get(`
          SELECT appointments.id, appointments.patient_id AS patientId,
            appointments.appointment_date AS date, appointments.start_time AS startTime,
            appointments.end_time AS endTime, appointments.color,
            appointments.observations, appointments.created_at AS createdAt,
            appointments.updated_at AS updatedAt,
            patients.first_name AS patientFirstName, patients.last_name AS patientLastName
          FROM appointments JOIN patients ON patients.id = appointments.patient_id
          WHERE appointments.id = ? AND appointments.therapist_id = ?
        `, [appointmentId, req.user.id]) }
      })
      if (result.error === 'patient-not-found') {
        res.status(404).json({ error: 'Seleccioná un paciente de tu lista.' })
        return
      }
      if (result.error === 'conflict') {
        res.status(409).json({ error: 'Ese horario se superpone con otra cita. Elegí otro horario.' })
        return
      }
      res.status(201).json({ appointment: result.appointment })
    } catch (error) {
      next(error)
    }
  })

  app.put('/api/therapist/appointments/:appointmentId', requireCsrf, requireRole('therapist'), async (req, res, next) => {
    if (!isValidAppointmentInput(req.body)) {
      res.status(400).json({ error: 'Revisá los datos de la cita, el horario, el color y las observaciones.' })
      return
    }

    try {
      const result = await db.withTransaction(async (tx) => {
        await tx.lockTherapist(req.user.id)
        const appointment = await tx.get(
          'SELECT id FROM appointments WHERE id = ? AND therapist_id = ?',
          [req.params.appointmentId, req.user.id]
        )
        if (!appointment) return { error: 'not-found' }
        const patient = await tx.get(
          'SELECT id FROM patients WHERE id = ? AND therapist_id = ?',
          [req.body.patientId, req.user.id]
        )
        if (!patient) return { error: 'patient-not-found' }
        const conflict = await tx.get(`
          SELECT id FROM appointments
          WHERE therapist_id = ? AND appointment_date = ? AND start_time < ? AND end_time > ? AND id <> ?
          LIMIT 1
        `, [req.user.id, req.body.date, req.body.endTime, req.body.startTime, appointment.id])
        if (conflict) return { error: 'conflict' }

        await tx.run(`
          UPDATE appointments
          SET patient_id = ?, appointment_date = ?, start_time = ?, end_time = ?,
            color = ?, observations = ?, updated_at = datetime('now')
          WHERE id = ? AND therapist_id = ?
        `, [
          patient.id, req.body.date, req.body.startTime, req.body.endTime,
          req.body.color, (req.body.observations || '').trim(), appointment.id, req.user.id,
        ])
        return { appointment: await tx.get(`
          SELECT appointments.id, appointments.patient_id AS patientId,
            appointments.appointment_date AS date, appointments.start_time AS startTime,
            appointments.end_time AS endTime, appointments.color,
            appointments.observations, appointments.created_at AS createdAt,
            appointments.updated_at AS updatedAt,
            patients.first_name AS patientFirstName, patients.last_name AS patientLastName
          FROM appointments JOIN patients ON patients.id = appointments.patient_id
          WHERE appointments.id = ? AND appointments.therapist_id = ?
        `, [appointment.id, req.user.id]) }
      })
      if (result.error === 'not-found') {
        res.status(404).json({ error: 'No se encontró la cita solicitada.' })
        return
      }
      if (result.error === 'patient-not-found') {
        res.status(404).json({ error: 'Seleccioná un paciente de tu lista.' })
        return
      }
      if (result.error === 'conflict') {
        res.status(409).json({ error: 'Ese horario se superpone con otra cita. Elegí otro horario.' })
        return
      }
      res.json({ appointment: result.appointment })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/therapist/appointments/:appointmentId', requireCsrf, requireRole('therapist'), async (req, res, next) => {
    try {
      const deleted = await db.withTransaction(async (tx) => {
        await tx.lockTherapist(req.user.id)
        const result = await tx.run(
          'DELETE FROM appointments WHERE id = ? AND therapist_id = ?',
          [req.params.appointmentId, req.user.id]
        )
        return result.changes > 0
      })
      if (!deleted) {
        res.status(404).json({ error: 'No se encontró la cita solicitada.' })
        return
      }
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/therapist/patients/:patientId', requireRole('therapist'), async (req, res) => {
    const patient = await getTherapistPatient(req.params.patientId, req.user.id)
    if (!patient) {
      res.status(404).json({ error: 'No se encontró el paciente solicitado.' })
      return
    }
    res.json({ patient: { ...patient, age: getAge(patient.birthDate) } })
  })

  app.delete('/api/therapist/patients/:patientId', requireCsrf, requireRole('therapist'), async (req, res, next) => {
    try {
      const result = await db.withTransaction(async (tx) => {
        const patient = await tx.get(`
          SELECT patients.id AS id
          FROM patients JOIN users ON users.id = patients.user_id
          WHERE patients.id = ? AND patients.therapist_id = ?
        `, [req.params.patientId, req.user.id])
        if (!patient) return 'not-found'

        const hasSessionHistory = await tx.get(
          'SELECT 1 FROM session_records WHERE patient_id = ? LIMIT 1',
          [patient.id]
        )
        if (hasSessionHistory) return 'has-history'

        const account = await tx.get(`
          SELECT users.id AS userId
          FROM patients JOIN users ON users.id = patients.user_id
          WHERE patients.id = ? AND patients.therapist_id = ? AND users.role = 'patient'
        `, [patient.id, req.user.id])
        if (!account) return 'not-found'

        await tx.run("DELETE FROM users WHERE id = ? AND role = 'patient'", [account.userId])
        return 'deleted'
      })
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

  app.get('/api/therapist/patients/:patientId/exercises', requireRole('therapist'), async (req, res) => {
    const patient = await getTherapistPatient(req.params.patientId, req.user.id)
    if (!patient) {
      res.status(404).json({ error: 'No se encontró el paciente solicitado.' })
      return
    }
    res.json({
      exerciseIds: await getPlanExerciseIds(patient.id),
      configurations: await getPlanExerciseConfigurations(patient.id, req.user.id),
    })
  })

  app.put('/api/therapist/patients/:patientId/exercises', requireCsrf, requireRole('therapist'), async (req, res) => {
    const patient = await getTherapistPatient(req.params.patientId, req.user.id)
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

    await db.withTransaction(async (tx) => {
      const planId = await getOrCreatePatientPlan(tx, patient.id, req.user.id)
      if (exerciseIds.length) {
        const placeholders = exerciseIds.map(() => '?').join(', ')
        await tx.run(
          `DELETE FROM plan_exercises WHERE plan_id = ? AND exercise_id NOT IN (${placeholders})`,
          [planId, ...exerciseIds]
        )
      } else {
        await tx.run('DELETE FROM plan_exercises WHERE plan_id = ?', [planId])
      }
      for (const exerciseId of exerciseIds) {
        await tx.run(
          'INSERT INTO plan_exercises (plan_id, exercise_id) VALUES (?, ?) ON CONFLICT (plan_id, exercise_id) DO NOTHING',
          [planId, exerciseId]
        )
      }
      await tx.run("UPDATE plans SET updated_at = datetime('now') WHERE id = ?", [planId])
    })
    res.json({ exerciseIds })
  })

  app.put('/api/therapist/patients/:patientId/exercises/:exerciseId/configuration', requireCsrf, requireRole('therapist'), async (req, res) => {
    const patient = await getTherapistPatient(req.params.patientId, req.user.id)
    if (!patient) {
      res.status(404).json({ error: 'No se encontró el paciente solicitado.' })
      return
    }
    if (!exercisesById.has(req.params.exerciseId) || !isValidExerciseConfiguration(req.body)) {
      res.status(400).json({ error: 'Revisá los parámetros del ejercicio.' })
      return
    }

    const updated = await db.withTransaction(async (tx) => {
      const plan = await tx.get(
        'SELECT id FROM plans WHERE patient_id = ? AND therapist_id = ? ORDER BY created_at, id LIMIT 1',
        [patient.id, req.user.id]
      )
      if (!plan) return false
      const result = await tx.run(`
        UPDATE plan_exercises
        SET repetitions = ?, series = ?, speed = ?, rest_seconds = ?
        WHERE plan_id = ? AND exercise_id = ?
      `, [
        req.body.repetitions,
        req.body.series,
        req.body.speed,
        req.body.restSeconds,
        plan.id,
        req.params.exerciseId,
      ])
      if (result.changes) await tx.run("UPDATE plans SET updated_at = datetime('now') WHERE id = ?", [plan.id])
      return result.changes > 0
    })
    if (!updated) {
      res.status(409).json({ error: 'Primero asigná este ejercicio al paciente.' })
      return
    }
    res.json({ configuration: { exerciseId: req.params.exerciseId, ...req.body } })
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
      await db.withTransaction(async (tx) => {
        await tx.run(`
          INSERT INTO users (id, dni, password_hash, role) VALUES (?, ?, ?, 'patient')
        `, [userId, dni, passwordHash])
        await tx.run(`
          INSERT INTO patients (id, user_id, therapist_id, first_name, last_name)
          VALUES (?, ?, ?, ?, ?)
        `, [patientId, userId, req.user.id, firstName.trim(), lastName.trim()])
        if (birthDate) {
          await tx.run('UPDATE patients SET birth_date = ? WHERE id = ?', [birthDate, patientId])
        }
      })
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
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
        res.status(409).json({ error: 'No se pudo crear el paciente. Verificá que los datos sean únicos.' })
        return
      }
      next(error)
    }
  })

  app.get('/api/patient/me', requireRole('patient'), async (req, res) => {
    const patient = await db.get(`
      SELECT id, first_name AS firstName, last_name AS lastName, created_at AS createdAt
      FROM patients WHERE user_id = ?
    `, [req.user.id])
    if (!patient) {
      res.status(404).json({ error: 'No se encontró la ficha asociada a esta cuenta.' })
      return
    }
    res.json({ patient })
  })

  app.get('/api/patient/appointments/upcoming', requireRole('patient'), async (req, res) => {
    const patient = await db.get('SELECT id, therapist_id AS therapistId FROM patients WHERE user_id = ?', [req.user.id])
    if (!patient) {
      res.status(404).json({ error: 'No se encontró la ficha asociada a esta cuenta.' })
      return
    }

    const now = getArgentinaDateTime()
    const appointment = await db.get(`
      SELECT id, appointment_date AS date, start_time AS startTime, end_time AS endTime
      FROM appointments
      WHERE patient_id = ? AND therapist_id = ?
        AND (appointment_date > ? OR (appointment_date = ? AND start_time > ?))
      ORDER BY appointment_date, start_time, id
      LIMIT 1
    `, [patient.id, patient.therapistId, now.date, now.date, now.time])
    res.json({ appointment: appointment || null })
  })

  app.get('/api/patient/exercises', requireRole('patient'), async (req, res) => {
    const patient = await db.get('SELECT id FROM patients WHERE user_id = ?', [req.user.id])
    if (!patient) {
      res.status(404).json({ error: 'No se encontró la ficha asociada a esta cuenta.' })
      return
    }
    const exerciseIds = await getPlanExerciseIds(patient.id)
    res.json({
      exerciseIds,
      configurations: await getPlanExerciseConfigurations(patient.id),
    })
  })

  app.get('/api/patient/exercises/:exerciseId', requireRole('patient'), async (req, res) => {
    const exercise = exercisesById.get(req.params.exerciseId)
    if (!exercise) {
      res.status(404).json({ error: 'No se encontró el ejercicio solicitado.' })
      return
    }
    const patient = await db.get('SELECT id FROM patients WHERE user_id = ?', [req.user.id])
    if (!patient) {
      res.status(404).json({ error: 'No se encontró la ficha asociada a esta cuenta.' })
      return
    }
    if (!(await getPlanExerciseIds(patient.id)).includes(exercise.id)) {
      res.status(403).json({ error: 'Este ejercicio no está incluido en tu planificación.' })
      return
    }
    const configuration = (await getPlanExerciseConfigurations(patient.id))
      .find((item) => item.exerciseId === exercise.id) || null
    res.json({ exercise, configuration })
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
    const appointmentsTableMissing =
      (error?.code === '42P01' && /appointments/i.test(error.message || '')) ||
      (error?.code === 'SQLITE_ERROR' && /no such table:\s*appointments/i.test(error.message || ''))
    if (appointmentsTableMissing) {
      console.error('Agenda database migration is missing: 20261104000000_agenda.sql')
      res.status(503).json({
        error: 'La agenda todavía no está habilitada en la base de datos. Aplicá la migración 20261104000000_agenda.sql en Supabase e intentá nuevamente.',
      })
      return
    }
    console.error('API request failed:', error?.name || 'Unknown error')
    res.status(500).json({ error: 'Ocurrió un error. Intentá nuevamente.' })
  })

  return app
}
