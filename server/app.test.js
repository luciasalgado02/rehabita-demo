import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { createApiApp } from './app.js'
import { openDatabase } from './db.js'
import { hashPassword } from './passwords.js'

const db = openDatabase(':memory:')
const app = createApiApp({ db, sessionSecret: 'test-session-secret-with-at-least-thirty-two-characters' })
const server = createServer(app)
let baseUrl

const therapistId = randomUUID()
const patientId = randomUUID()
const patientProfileId = randomUUID()
const therapistDni = '00123456'
const patientDni = '00765432'
const password = 'correct-horse-battery-staple'

before(async () => {
  const therapistHash = await hashPassword(password)
  const patientHash = await hashPassword(password)
  db.prepare('INSERT INTO users (id, dni, password_hash, role) VALUES (?, ?, ?, ?)').run(therapistId, therapistDni, therapistHash, 'therapist')
  db.prepare('INSERT INTO users (id, dni, password_hash, role) VALUES (?, ?, ?, ?)').run(patientId, patientDni, patientHash, 'patient')
  db.prepare('INSERT INTO patients (id, user_id, therapist_id, first_name, last_name) VALUES (?, ?, ?, ?, ?)').run(patientProfileId, patientId, therapistId, 'Ana', 'Paciente')
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  db.close()
})

function createClient() {
  let cookie = ''
  return async (urlPath, { method = 'GET', body, csrfToken, origin } = {}) => {
    const headers = {}
    if (cookie) headers.Cookie = cookie
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken
    if (origin) headers.Origin = origin
    const response = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0]
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    }
  }
}

test('authenticates role-specific accounts and protects therapist and patient operations', async () => {
  const client = createClient()

  assert.equal((await client('/api/therapist/patients')).status, 401)
  const csrf = await client('/api/auth/csrf')
  assert.equal(csrf.status, 200)

  const missingCsrf = await client('/api/auth/login', {
    method: 'POST',
    body: { dni: patientDni, password, role: 'patient' },
  })
  assert.equal(missingCsrf.status, 403)

  const invalidCredentials = await client('/api/auth/login', {
    method: 'POST',
    csrfToken: csrf.body.csrfToken,
    body: { dni: therapistDni, password, role: 'patient' },
  })
  assert.equal(invalidCredentials.status, 401)
  assert.match(invalidCredentials.body.error, /No se pudo iniciar sesión/)

  const login = await client('/api/auth/login', {
    method: 'POST',
    csrfToken: csrf.body.csrfToken,
    body: { dni: patientDni, password, role: 'patient' },
  })
  assert.equal(login.status, 200)
  assert.equal(login.body.user.role, 'patient')
  assert.equal(login.body.user.displayName, 'Ana Paciente')
  assert.notEqual(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(patientId).password_hash, password)
  assert.equal((await client('/api/therapist/patients')).status, 403)

  const ownProfile = await client('/api/patient/me')
  assert.equal(ownProfile.status, 200)
  assert.equal(ownProfile.body.patient.id, patientProfileId)

  const logout = await client('/api/auth/logout', { method: 'POST', csrfToken: login.body.csrfToken })
  assert.equal(logout.status, 204)
  assert.equal((await client('/api/patient/me')).status, 401)
})

test('therapist creates a linked patient atomically and duplicate DNI is rejected', async () => {
  const therapistClient = createClient()
  const csrf = await therapistClient('/api/auth/csrf')
  const login = await therapistClient('/api/auth/login', {
    method: 'POST',
    csrfToken: csrf.body.csrfToken,
    body: { dni: therapistDni, password, role: 'therapist' },
  })
  assert.equal(login.status, 200)
  assert.equal(login.body.user.role, 'therapist')

  const created = await therapistClient('/api/therapist/patients', {
    method: 'POST',
    csrfToken: login.body.csrfToken,
    body: {
      firstName: 'Eva',
      lastName: 'Nueva',
      dni: '00012345',
      password: 'a-secure-patient-password',
      birthDate: '2000-01-01',
    },
  })
  assert.equal(created.status, 201)
  const linked = db.prepare(`
    SELECT users.role, patients.therapist_id, patients.user_id
    FROM patients JOIN users ON users.id = patients.user_id
    WHERE patients.id = ?
  `).get(created.body.patient.id)
  assert.equal(linked.role, 'patient')
  assert.equal(linked.therapist_id, therapistId)
  assert.equal(linked.user_id !== '', true)
  assert.equal(db.prepare('SELECT birth_date FROM patients WHERE id = ?').get(created.body.patient.id).birth_date, '2000-01-01')
  const patientDetails = await therapistClient(`/api/therapist/patients/${created.body.patient.id}`)
  assert.equal(patientDetails.status, 200)
  assert.equal(patientDetails.body.patient.birthDate, '2000-01-01')
  assert.equal(typeof patientDetails.body.patient.age, 'number')

  const exerciseIds = ['hombro-elevacion-hacia-adelante', 'mano-puños']
  const savedPlan = await therapistClient(`/api/therapist/patients/${patientProfileId}/exercises`, {
    method: 'PUT',
    csrfToken: login.body.csrfToken,
    body: { exerciseIds },
  })
  assert.equal(savedPlan.status, 200)
  assert.deepEqual(savedPlan.body.exerciseIds, exerciseIds)
  assert.deepEqual(
    db.prepare(`
      SELECT plan_exercises.exercise_id AS id
      FROM plan_exercises JOIN plans ON plans.id = plan_exercises.plan_id
      WHERE plans.patient_id = ?
      ORDER BY id
    `).all(patientProfileId).map(({ id }) => id),
    [...exerciseIds].sort()
  )

  const invalidPlan = await therapistClient(`/api/therapist/patients/${patientProfileId}/exercises`, {
    method: 'PUT',
    csrfToken: login.body.csrfToken,
    body: { exerciseIds: ['not-a-real-exercise'] },
  })
  assert.equal(invalidPlan.status, 400)
  const reloadedPlan = await therapistClient(`/api/therapist/patients/${patientProfileId}/exercises`)
  assert.deepEqual(reloadedPlan.body.exerciseIds, [...exerciseIds].sort())
  const secondPatientPlan = await therapistClient(`/api/therapist/patients/${created.body.patient.id}/exercises`)
  assert.deepEqual(secondPatientPlan.body.exerciseIds, [])
  const savedSecondPatientPlan = await therapistClient(`/api/therapist/patients/${created.body.patient.id}/exercises`, {
    method: 'PUT',
    csrfToken: login.body.csrfToken,
    body: { exerciseIds: ['antebrazo-supinacion'] },
  })
  assert.deepEqual(savedSecondPatientPlan.body.exerciseIds, ['antebrazo-supinacion'])
  assert.deepEqual(
    (await therapistClient(`/api/therapist/patients/${patientProfileId}/exercises`)).body.exerciseIds,
    [...exerciseIds].sort()
  )
  const patientRows = await therapistClient('/api/therapist/patients')
  assert.equal(patientRows.body.patients.find(({ id }) => id === patientProfileId).hasPlan, true)
  assert.equal(patientRows.body.patients.find(({ id }) => id === created.body.patient.id).hasPlan, true)

  const duplicate = await therapistClient('/api/therapist/patients', {
    method: 'POST',
    csrfToken: login.body.csrfToken,
    body: {
      firstName: 'Otra',
      lastName: 'Persona',
      dni: patientDni,
      password: 'a-secure-patient-password',
    },
  })
  assert.equal(duplicate.status, 409)

  const patientClient = createClient()
  const patientCsrf = await patientClient('/api/auth/csrf')
  const patientLogin = await patientClient('/api/auth/login', {
    method: 'POST',
    csrfToken: patientCsrf.body.csrfToken,
    body: { dni: patientDni, password, role: 'patient' },
  })
  const patientPlan = await patientClient('/api/patient/exercises')
  assert.equal(patientPlan.status, 200)
  assert.deepEqual(patientPlan.body.exerciseIds, [...exerciseIds].sort())
  const assignedExercise = await patientClient('/api/patient/exercises/hombro-elevacion-hacia-adelante')
  assert.equal(assignedExercise.status, 200)
  const unassignedExercise = await patientClient('/api/patient/exercises/antebrazo-supinacion')
  assert.equal(unassignedExercise.status, 403)

  const deniedCreate = await patientClient('/api/therapist/patients', {
    method: 'POST',
    csrfToken: patientLogin.body.csrfToken,
    body: {
      firstName: 'Sin',
      lastName: 'Permiso',
      dni: '00999999',
      password: 'a-secure-patient-password',
    },
  })
  assert.equal(deniedCreate.status, 403)

  const deniedDelete = await patientClient(`/api/therapist/patients/${created.body.patient.id}`, {
    method: 'DELETE',
    csrfToken: patientLogin.body.csrfToken,
  })
  assert.equal(deniedDelete.status, 403)

  const patientPlanId = db.prepare('SELECT id FROM plans WHERE patient_id = ?').get(created.body.patient.id).id
  db.prepare('INSERT INTO session_records (id, patient_id, plan_id, started_at) VALUES (?, ?, ?, ?)').run(
    randomUUID(),
    created.body.patient.id,
    patientPlanId,
    new Date().toISOString()
  )
  const historyProtectedDelete = await therapistClient(`/api/therapist/patients/${created.body.patient.id}`, {
    method: 'DELETE',
    csrfToken: login.body.csrfToken,
  })
  assert.equal(historyProtectedDelete.status, 409)
  assert.ok(db.prepare('SELECT id FROM patients WHERE id = ?').get(created.body.patient.id))
  assert.ok(db.prepare('SELECT id FROM plans WHERE id = ?').get(patientPlanId))

  const deletePatient = await therapistClient(`/api/therapist/patients/${patientProfileId}`, {
    method: 'DELETE',
    csrfToken: login.body.csrfToken,
  })
  assert.equal(deletePatient.status, 204)
  assert.equal(db.prepare('SELECT id FROM patients WHERE id = ?').get(patientProfileId), undefined)
  assert.equal(db.prepare('SELECT id FROM users WHERE id = ?').get(patientId), undefined)
  assert.equal(db.prepare('SELECT id FROM plans WHERE patient_id = ?').get(patientProfileId), undefined)
  assert.equal(
    db.prepare(`
      SELECT plan_exercises.exercise_id
      FROM plan_exercises JOIN plans ON plans.id = plan_exercises.plan_id
      WHERE plans.patient_id = ?
    `).get(patientProfileId),
    undefined
  )
})

test('therapists create, view, update, and delete appointments with validation and conflict protection', async () => {
  const therapistClient = createClient()
  const csrf = await therapistClient('/api/auth/csrf')
  const login = await therapistClient('/api/auth/login', {
    method: 'POST',
    csrfToken: csrf.body.csrfToken,
    body: { dni: therapistDni, password, role: 'therapist' },
  })
  assert.equal(login.status, 200)

  const patientPassword = 'another-secure-patient-password'
  const patientCreated = await therapistClient('/api/therapist/patients', {
    method: 'POST',
    csrfToken: login.body.csrfToken,
    body: {
      firstName: 'Ana',
      lastName: 'Agenda',
      dni: '00911111',
      password: patientPassword,
    },
  })
  assert.equal(patientCreated.status, 201)
  const appointmentPatientId = patientCreated.body.patient.id

  const range = '/api/therapist/appointments?from=2026-11-01&to=2026-11-30'
  assert.equal((await therapistClient('/api/therapist/appointments')).status, 400)
  assert.equal((await therapistClient('/api/therapist/appointments?from=2026-02-30&to=2026-03-01')).status, 400)
  assert.deepEqual((await therapistClient(range)).body.appointments, [])

  const baseAppointment = {
    patientId: appointmentPatientId,
    date: '2026-11-05',
    startTime: '10:00',
    endTime: '11:00',
    color: '#cdeee6',
    observations: 'Control de movilidad',
  }
  const invalidDate = await therapistClient('/api/therapist/appointments', {
    method: 'POST',
    csrfToken: login.body.csrfToken,
    body: { ...baseAppointment, date: '2026-02-30' },
  })
  assert.equal(invalidDate.status, 400)

  const invalidColor = await therapistClient('/api/therapist/appointments', {
    method: 'POST',
    csrfToken: login.body.csrfToken,
    body: { ...baseAppointment, color: 'url(javascript:alert(1))' },
  })
  assert.equal(invalidColor.status, 400)

  const unknownPatient = await therapistClient('/api/therapist/appointments', {
    method: 'POST',
    csrfToken: login.body.csrfToken,
    body: { ...baseAppointment, patientId: randomUUID() },
  })
  assert.equal(unknownPatient.status, 404)

  const created = await therapistClient('/api/therapist/appointments', {
    method: 'POST',
    csrfToken: login.body.csrfToken,
    body: baseAppointment,
  })
  assert.equal(created.status, 201)
  assert.equal(created.body.appointment.patientId, appointmentPatientId)
  assert.equal(created.body.appointment.patientFirstName, 'Ana')
  assert.equal(created.body.appointment.observations, 'Control de movilidad')

  const otherOwnerAppointmentId = randomUUID()
  const patientAccountId = db.prepare('SELECT user_id AS id FROM patients WHERE id = ?').get(appointmentPatientId).id
  db.prepare(`
    INSERT INTO appointments
      (id, therapist_id, patient_id, appointment_date, start_time, end_time, color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(otherOwnerAppointmentId, patientAccountId, appointmentPatientId, '2026-11-05', '12:00', '12:30', '#dbeafe')
  const ownerScopedList = await therapistClient('/api/therapist/appointments?from=2026-11-05&to=2026-11-05')
  assert.deepEqual(ownerScopedList.body.appointments.map(({ id }) => id), [created.body.appointment.id])

  const foreignUpdate = await therapistClient(`/api/therapist/appointments/${otherOwnerAppointmentId}`, {
    method: 'PUT',
    csrfToken: login.body.csrfToken,
    body: baseAppointment,
  })
  assert.equal(foreignUpdate.status, 404)
  const foreignDelete = await therapistClient(`/api/therapist/appointments/${otherOwnerAppointmentId}`, {
    method: 'DELETE',
    csrfToken: login.body.csrfToken,
  })
  assert.equal(foreignDelete.status, 404)

  const overlapping = await therapistClient('/api/therapist/appointments', {
    method: 'POST',
    csrfToken: login.body.csrfToken,
    body: { ...baseAppointment, startTime: '10:30', endTime: '11:30' },
  })
  assert.equal(overlapping.status, 409)

  const adjacent = await therapistClient('/api/therapist/appointments', {
    method: 'POST',
    csrfToken: login.body.csrfToken,
    body: { ...baseAppointment, startTime: '11:00', endTime: '11:30' },
  })
  assert.equal(adjacent.status, 201)

  const concurrentAppointments = await Promise.all(['Eva', 'Lucía'].map((observations) =>
    therapistClient('/api/therapist/appointments', {
      method: 'POST',
      csrfToken: login.body.csrfToken,
      body: { ...baseAppointment, date: '2026-11-06', startTime: '09:00', endTime: '10:00', observations },
    })
  ))
  assert.deepEqual(concurrentAppointments.map(({ status }) => status).sort(), [201, 409])

  const conflictingUpdate = await therapistClient(`/api/therapist/appointments/${created.body.appointment.id}`, {
    method: 'PUT',
    csrfToken: login.body.csrfToken,
    body: { ...baseAppointment, startTime: '10:30', endTime: '11:15' },
  })
  assert.equal(conflictingUpdate.status, 409)

  const updated = await therapistClient(`/api/therapist/appointments/${created.body.appointment.id}`, {
    method: 'PUT',
    csrfToken: login.body.csrfToken,
    body: { ...baseAppointment, date: '2026-11-07', startTime: '13:15', endTime: '14:00', color: '#eadcf8', observations: '' },
  })
  assert.equal(updated.status, 200)
  assert.equal(updated.body.appointment.date, '2026-11-07')
  assert.equal(updated.body.appointment.color, '#eadcf8')
  assert.equal(updated.body.appointment.observations, '')

  const reloaded = await therapistClient('/api/therapist/appointments?from=2026-11-07&to=2026-11-07')
  assert.equal(reloaded.body.appointments.length, 1)
  assert.equal(reloaded.body.appointments[0].id, created.body.appointment.id)

  assert.equal((await therapistClient('/api/auth/logout', {
    method: 'POST',
    csrfToken: login.body.csrfToken,
  })).status, 204)
  const returningTherapist = createClient()
  const returningCsrf = await returningTherapist('/api/auth/csrf')
  const returningLogin = await returningTherapist('/api/auth/login', {
    method: 'POST',
    csrfToken: returningCsrf.body.csrfToken,
    body: { dni: therapistDni, password, role: 'therapist' },
  })
  assert.equal(returningLogin.status, 200)
  const afterNewSession = await returningTherapist('/api/therapist/appointments?from=2026-11-07&to=2026-11-07')
  assert.equal(afterNewSession.body.appointments[0].id, created.body.appointment.id)

  const unknownAppointment = await returningTherapist(`/api/therapist/appointments/${randomUUID()}`, {
    method: 'DELETE',
    csrfToken: returningLogin.body.csrfToken,
  })
  assert.equal(unknownAppointment.status, 404)

  const deleted = await returningTherapist(`/api/therapist/appointments/${created.body.appointment.id}`, {
    method: 'DELETE',
    csrfToken: returningLogin.body.csrfToken,
  })
  assert.equal(deleted.status, 204)
  assert.equal((await returningTherapist('/api/therapist/appointments?from=2026-11-07&to=2026-11-07')).body.appointments.length, 0)

  const patientClient = createClient()
  const patientCsrf = await patientClient('/api/auth/csrf')
  const patientLogin = await patientClient('/api/auth/login', {
    method: 'POST',
    csrfToken: patientCsrf.body.csrfToken,
    body: { dni: '00911111', password: patientPassword, role: 'patient' },
  })
  assert.equal((await patientClient(range)).status, 403)
  assert.equal((await patientClient('/api/therapist/appointments', {
    method: 'POST',
    csrfToken: patientLogin.body.csrfToken,
    body: baseAppointment,
  })).status, 403)
})

test('requires a strong production session secret and enforces a single therapist account', () => {
  assert.throws(() => createApiApp({ db, production: true }), /SESSION_SECRET/)
  assert.throws(
    () => db.prepare('INSERT INTO users (id, dni, password_hash, role) VALUES (?, ?, ?, ?)').run(randomUUID(), '00888888', 'test-hash', 'therapist'),
    /UNIQUE constraint failed/
  )
})

test('production sessions use secure cookie settings and reject cross-origin mutations', async () => {
  const previousTrustProxy = process.env.TRUST_PROXY
  process.env.TRUST_PROXY = '1'
  const productionApp = createApiApp({
    db,
    sessionSecret: 'production-test-session-secret-with-more-than-thirty-two-characters',
    production: true,
  })
  if (previousTrustProxy === undefined) delete process.env.TRUST_PROXY
  else process.env.TRUST_PROXY = previousTrustProxy
  const productionServer = createServer(productionApp)
  await new Promise((resolve) => productionServer.listen(0, '127.0.0.1', resolve))

  try {
    const origin = `https://127.0.0.1:${productionServer.address().port}`
    const requestUrl = origin.replace('https:', 'http:')
    const csrfResponse = await fetch(`${requestUrl}/api/auth/csrf`, {
      headers: { 'X-Forwarded-Proto': 'https' },
    })
    const cookie = csrfResponse.headers.get('set-cookie')
    const { csrfToken } = await csrfResponse.json()
    assert.match(cookie, /HttpOnly/i)
    assert.match(cookie, /Secure/i)
    assert.match(cookie, /SameSite=Lax/i)
    assert.match(csrfResponse.headers.get('content-security-policy'), /frame-ancestors 'none'/)

    const denied = await fetch(`${requestUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: cookie.split(';')[0],
        'X-CSRF-Token': csrfToken,
        Origin: 'https://attacker.example',
        'X-Forwarded-Proto': 'https',
      },
    })
    assert.equal(denied.status, 403)

    const allowed = await fetch(`${requestUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: cookie.split(';')[0],
        'X-CSRF-Token': csrfToken,
        Origin: origin,
        'X-Forwarded-Proto': 'https',
      },
    })
    assert.equal(allowed.status, 204)
  } finally {
    await new Promise((resolve, reject) => productionServer.close((error) => error ? reject(error) : resolve()))
  }
})
