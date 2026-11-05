import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { createApiApp } from './app.js'
import { openDatabase } from './db.js'
import { hashPassword } from './passwords.js'

const db = openDatabase(':memory:')
const app = createApiApp({ db, sessionSecret: 'exercise-progress-test-session-secret-32-characters' })
const server = createServer(app)
const therapistId = randomUUID()
const patientUserId = randomUUID()
const patientProfileId = randomUUID()
const otherPatientUserId = randomUUID()
const otherPatientProfileId = randomUUID()
const password = 'exercise-progress-test-password'
let baseUrl

before(async () => {
  const passwordHash = await hashPassword(password)
  db.prepare('INSERT INTO users (id, dni, password_hash, role) VALUES (?, ?, ?, ?)').run(
    therapistId, '00111222', passwordHash, 'therapist'
  )
  db.prepare('INSERT INTO users (id, dni, password_hash, role) VALUES (?, ?, ?, ?)').run(
    patientUserId, '00333444', passwordHash, 'patient'
  )
  db.prepare('INSERT INTO patients (id, user_id, therapist_id, first_name, last_name) VALUES (?, ?, ?, ?, ?)').run(
    patientProfileId, patientUserId, therapistId, 'Paciente', 'Uno'
  )
  db.prepare('INSERT INTO users (id, dni, password_hash, role) VALUES (?, ?, ?, ?)').run(
    otherPatientUserId, '00555666', passwordHash, 'patient'
  )
  db.prepare('INSERT INTO patients (id, user_id, therapist_id, first_name, last_name) VALUES (?, ?, ?, ?, ?)').run(
    otherPatientProfileId, otherPatientUserId, therapistId, 'Paciente', 'Dos'
  )
  const planId = randomUUID()
  db.prepare('INSERT INTO plans (id, patient_id, therapist_id) VALUES (?, ?, ?)').run(
    planId, patientProfileId, therapistId
  )
  db.prepare('INSERT INTO plan_exercises (plan_id, exercise_id) VALUES (?, ?)').run(
    planId, 'hombro-elevacion-hacia-adelante'
  )
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  db.close()
})

function createClient() {
  let cookie = ''
  let csrfToken = ''
  return {
    async request(path, { method = 'GET', body } = {}) {
      const headers = {}
      if (cookie) headers.Cookie = cookie
      if (body !== undefined) headers['Content-Type'] = 'application/json'
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['X-CSRF-Token'] = csrfToken
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const setCookie = response.headers.get('set-cookie')
      if (setCookie) cookie = setCookie.split(';')[0]
      const result = response.status === 204 ? null : await response.json()
      if (path === '/api/auth/csrf' && result) csrfToken = result.csrfToken
      if (path === '/api/auth/login' && result?.csrfToken) csrfToken = result.csrfToken
      return { status: response.status, body: result }
    },
    async login(dni, role) {
      await this.request('/api/auth/csrf')
      return this.request('/api/auth/login', {
        method: 'POST',
        body: { dni, password, role },
      })
    },
    async logout() {
      return this.request('/api/auth/logout', { method: 'POST' })
    },
  }
}

test('records real exercise sessions, protects patient history, and reports daily completion', async () => {
  const patient = createClient()
  const therapist = createClient()
  const otherPatient = createClient()
  assert.equal((await patient.login('00333444', 'patient')).status, 200)
  assert.equal((await therapist.login('00111222', 'therapist')).status, 200)
  assert.equal((await otherPatient.login('00555666', 'patient')).status, 200)

  const unconfigured = await patient.request('/api/patient/exercise-sessions', {
    method: 'POST',
    body: { exerciseId: 'hombro-elevacion-hacia-adelante' },
  })
  assert.equal(unconfigured.status, 409)

  db.prepare(`
    UPDATE plan_exercises
    SET repetitions = 5, series = 2, speed = 'lenta', rest_seconds = 30
    WHERE plan_id = (SELECT id FROM plans WHERE patient_id = ?)
      AND exercise_id = 'hombro-elevacion-hacia-adelante'
  `).run(patientProfileId)

  const created = await patient.request('/api/patient/exercise-sessions', {
    method: 'POST',
    body: { exerciseId: 'hombro-elevacion-hacia-adelante' },
  })
  assert.equal(created.status, 201)
  const sessionId = created.body.session.id

  const invalidProgress = await patient.request(`/api/patient/exercise-sessions/${sessionId}`, {
    method: 'PATCH',
    body: {
      completedRepetitions: 11,
      completedSeries: 2,
      activeSeconds: 100,
      completed: false,
      ended: false,
    },
  })
  assert.equal(invalidProgress.status, 400)

  const partial = await patient.request(`/api/patient/exercise-sessions/${sessionId}`, {
    method: 'PATCH',
    body: {
      completedRepetitions: 5,
      completedSeries: 1,
      activeSeconds: 120,
      completed: false,
      ended: false,
    },
  })
  assert.equal(partial.status, 200)
  assert.equal(partial.body.session.completedRepetitions, 5)
  assert.equal(partial.body.session.completedSeries, 1)
  assert.deepEqual(
    (await patient.request('/api/patient/exercise-progress/today')).body.completedExerciseIds,
    []
  )

  await patient.request(`/api/patient/exercise-sessions/${sessionId}`, {
    method: 'PATCH',
    body: {
      completedRepetitions: 4,
      completedSeries: 0,
      activeSeconds: 100,
      completed: false,
      ended: false,
    },
  })
  let progress = await therapist.request(`/api/therapist/patients/${patientProfileId}/progress`)
  assert.equal(progress.status, 200)
  assert.equal(progress.body.sessions[0].completedRepetitions, 5)
  assert.equal(progress.body.sessions[0].completedSeries, 1)
  assert.equal(progress.body.sessions[0].activeSeconds, 120)

  const completed = await patient.request(`/api/patient/exercise-sessions/${sessionId}`, {
    method: 'PATCH',
    body: {
      completedRepetitions: 10,
      completedSeries: 2,
      activeSeconds: 275,
      completed: true,
      ended: true,
    },
  })
  assert.equal(completed.status, 200)
  assert.equal(completed.body.session.completed, true)
  const dailyProgress = await patient.request('/api/patient/exercise-progress/today')
  assert.deepEqual(dailyProgress.body.completedExerciseIds, ['hombro-elevacion-hacia-adelante'])
  assert.equal((await patient.logout()).status, 204)
  assert.equal((await patient.login('00333444', 'patient')).status, 200)
  assert.deepEqual(
    (await patient.request('/api/patient/exercise-progress/today')).body.completedExerciseIds,
    ['hombro-elevacion-hacia-adelante']
  )

  const secondSession = await patient.request('/api/patient/exercise-sessions', {
    method: 'POST',
    body: { exerciseId: 'hombro-elevacion-hacia-adelante' },
  })
  await patient.request(`/api/patient/exercise-sessions/${secondSession.body.session.id}`, {
    method: 'PATCH',
    body: {
      completedRepetitions: 3,
      completedSeries: 0,
      activeSeconds: 45,
      completed: false,
      ended: true,
    },
  })
  progress = await therapist.request(`/api/therapist/patients/${patientProfileId}/progress`)
  assert.equal(progress.body.sessions.length, 2)
  assert.ok(progress.body.sessions.some((session) => session.completedRepetitions === 3 && !session.completed))

  const otherDailyProgress = await otherPatient.request('/api/patient/exercise-progress/today')
  assert.equal(otherDailyProgress.status, 200)
  assert.deepEqual(
    otherDailyProgress.body.completedExerciseIds,
    []
  )
  assert.equal((await otherPatient.request(`/api/therapist/patients/${patientProfileId}/progress`)).status, 403)
  assert.equal((await therapist.request(`/api/therapist/patients/${otherPatientProfileId}/progress`)).body.sessions.length, 0)
})
