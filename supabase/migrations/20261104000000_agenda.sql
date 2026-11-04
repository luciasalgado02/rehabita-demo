CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  therapist_id TEXT NOT NULL REFERENCES users(id),
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  color TEXT NOT NULL,
  observations TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS appointments_therapist_date_idx
  ON appointments(therapist_id, appointment_date, start_time);
CREATE INDEX IF NOT EXISTS appointments_patient_idx ON appointments(patient_id);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE appointments FROM anon, authenticated;
