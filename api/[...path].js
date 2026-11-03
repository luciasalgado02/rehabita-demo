import { createApiApp } from '../server/app.js'
import { openPostgresDatabase } from '../server/postgres-db.js'

const db = openPostgresDatabase()
const app = createApiApp({
  db,
  sessionSecret: process.env.SESSION_SECRET,
  production: true,
})

export default function handler(req, res) {
  return app(req, res)
}
