import { createApiApp } from '../server/app.js'
import { openDatabase } from '../server/db.js'
import { openPostgresDatabase } from '../server/postgres-db.js'

const production = process.env.VERCEL_ENV === 'production'
const db = production ? openPostgresDatabase() : openDatabase()
const app = createApiApp({
  db,
  sessionSecret: process.env.SESSION_SECRET,
  production,
})

export default function handler(req, res) {
  const route = req.query?.__apiPath
  if (typeof route === 'string' && route.startsWith('/')) {
    req.url = `/api${route}`
  }
  return app(req, res)
}
