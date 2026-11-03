import { openDatabase } from './db.js'
import { openPostgresDatabase } from './postgres-db.js'

export function openConfiguredDatabase() {
  return process.env.DATABASE_URL ? openPostgresDatabase() : openDatabase()
}
