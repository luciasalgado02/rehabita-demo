ALTER TABLE plan_exercises
  ADD COLUMN IF NOT EXISTS repetitions INTEGER,
  ADD COLUMN IF NOT EXISTS series INTEGER,
  ADD COLUMN IF NOT EXISTS speed TEXT,
  ADD COLUMN IF NOT EXISTS rest_seconds INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plan_exercises_configuration_check'
      AND conrelid = 'plan_exercises'::regclass
  ) THEN
    ALTER TABLE plan_exercises
      ADD CONSTRAINT plan_exercises_configuration_check CHECK (
        (repetitions IS NULL AND series IS NULL AND speed IS NULL AND rest_seconds IS NULL)
        OR (
          repetitions IS NOT NULL
          AND series IS NOT NULL
          AND speed IS NOT NULL
          AND rest_seconds IS NOT NULL
          AND
          repetitions BETWEEN 1 AND 1000
          AND series BETWEEN 1 AND 100
          AND speed IN ('lenta', 'media', 'rápida')
          AND rest_seconds BETWEEN 0 AND 3600
        )
      );
  END IF;
END;
$$;
