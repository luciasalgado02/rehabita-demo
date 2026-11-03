import assert from 'node:assert/strict'
import { test } from 'node:test'
import { postgresValues } from './postgres-db.js'

test('translates SQLite-style placeholders and camel-case aliases for PostgreSQL', () => {
  assert.equal(
    postgresValues("SELECT first_name AS firstName, updated_at AS updatedAt WHERE id = ? AND updated_at = datetime('now')"),
    'SELECT first_name AS "firstName", updated_at AS "updatedAt" WHERE id = $1 AND updated_at = CURRENT_TIMESTAMP'
  )
})
