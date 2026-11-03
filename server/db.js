import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function openDatabase(filename = process.env.DATABASE_PATH || path.join(projectRoot, '.data', 'rehabita.sqlite')) {
  if (filename !== ':memory:') {
    mkdirSync(path.dirname(path.resolve(filename)), { recursive: true })
  }

  const db = new Database(filename)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      dni TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('therapist', 'patient')),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      therapist_id TEXT NOT NULL REFERENCES users(id),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      birth_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      therapist_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL DEFAULT 'Planificación',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plan_exercises (
      plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      exercise_id TEXT NOT NULL,
      PRIMARY KEY (plan_id, exercise_id)
    );

    CREATE TABLE IF NOT EXISTS session_records (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT
    );

    CREATE TABLE IF NOT EXISTS web_sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_therapist_account_idx
      ON users(role) WHERE role = 'therapist';
    CREATE INDEX IF NOT EXISTS web_sessions_expires_idx ON web_sessions(expires);
    CREATE INDEX IF NOT EXISTS patients_therapist_idx ON patients(therapist_id);
    CREATE INDEX IF NOT EXISTS plans_patient_idx ON plans(patient_id);
    CREATE INDEX IF NOT EXISTS plan_exercises_id_idx ON plan_exercises(exercise_id);
    CREATE INDEX IF NOT EXISTS session_records_patient_idx ON session_records(patient_id);
  `)
  db.prepare('DELETE FROM web_sessions WHERE expires <= ?').run(Date.now())
  let transactionTail = Promise.resolve()
  let transactionActive = false
  let transactionFinished = Promise.resolve()
  const outsideTransaction = async (operation) => {
    while (transactionActive) await transactionFinished
    return operation()
  }

  return {
    prepare: db.prepare.bind(db),
    close: db.close.bind(db),
    get: (sql, params = []) => outsideTransaction(() => db.prepare(sql).get(...params)),
    all: (sql, params = []) => outsideTransaction(() => db.prepare(sql).all(...params)),
    run: (sql, params = []) => outsideTransaction(() => db.prepare(sql).run(...params)),
    withTransaction: async (callback) => {
      const previousTransaction = transactionTail
      let releaseTransaction
      transactionTail = new Promise((resolve) => { releaseTransaction = resolve })
      await previousTransaction
      let finishTransaction
      let began = false
      try {
        db.exec('BEGIN IMMEDIATE')
        began = true
        transactionActive = true
        transactionFinished = new Promise((resolve) => { finishTransaction = resolve })
        const result = await callback({
          get: async (sql, params = []) => db.prepare(sql).get(...params),
          all: async (sql, params = []) => db.prepare(sql).all(...params),
          run: async (sql, params = []) => db.prepare(sql).run(...params),
        })
        db.exec('COMMIT')
        began = false
        return result
      } catch (error) {
        if (began) db.exec('ROLLBACK')
        throw error
      } finally {
        if (transactionActive) {
          transactionActive = false
          finishTransaction()
        }
        releaseTransaction()
      }
    },
  }
}
