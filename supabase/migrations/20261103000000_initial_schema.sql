CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  dni TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('therapist', 'patient')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  therapist_id TEXT NOT NULL REFERENCES users(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  therapist_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL DEFAULT 'Planificación',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
  expires BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS one_therapist_account_idx
  ON users(role) WHERE role = 'therapist';
CREATE INDEX IF NOT EXISTS web_sessions_expires_idx ON web_sessions(expires);
CREATE INDEX IF NOT EXISTS patients_therapist_idx ON patients(therapist_id);
CREATE INDEX IF NOT EXISTS plans_patient_idx ON plans(patient_id);
CREATE INDEX IF NOT EXISTS plan_exercises_id_idx ON plan_exercises(exercise_id);
CREATE INDEX IF NOT EXISTS session_records_patient_idx ON session_records(patient_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE users, patients, plans, plan_exercises, session_records, web_sessions
  FROM anon, authenticated;
