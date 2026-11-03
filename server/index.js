import { randomBytes } from 'node:crypto'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiApp } from './app.js'
import { openDatabase } from './db.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const production = process.env.NODE_ENV === 'production'
const port = Number(production ? process.env.PORT || 4173 : process.env.API_PORT || 4174)
const sessionSecret = process.env.SESSION_SECRET || (!production ? randomBytes(48).toString('hex') : undefined)
const db = openDatabase()
const app = createApiApp({ db, sessionSecret, production })

if (production) {
  const distPath = path.join(projectRoot, 'dist')
  app.use(express.static(distPath, { index: false, maxAge: '1h' }))
  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next()
      return
    }
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

const server = app.listen(port, production ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`ReHabita server listening on port ${port} (${production ? 'production' : 'development API'})`)
})

function shutdown() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
