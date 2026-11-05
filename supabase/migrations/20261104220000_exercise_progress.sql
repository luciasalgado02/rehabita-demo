ALTER TABLE session_records
  ADD COLUMN IF NOT EXISTS activity_date TEXT,
  ADD COLUMN IF NOT EXISTS exercise_id TEXT,
  ADD COLUMN IF NOT EXISTS configured_repetitions INTEGER,
  ADD COLUMN IF NOT EXISTS configured_series INTEGER,
  ADD COLUMN IF NOT EXISTS repetitions_completed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS series_completed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activity_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS session_records_patient_exercise_date_idx
  ON session_records(patient_id, exercise_id, activity_date);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'session_records_exercise_progress_check'
      AND conrelid = 'session_records'::regclass
  ) THEN
    ALTER TABLE session_records
      ADD CONSTRAINT session_records_exercise_progress_check CHECK (
        repetitions_completed >= 0
        AND series_completed >= 0
        AND activity_seconds >= 0
        AND completed IN (0, 1)
      );
  END IF;
END;
$$;
