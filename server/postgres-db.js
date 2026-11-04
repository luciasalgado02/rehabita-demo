import pg from 'pg'

const { Pool } = pg
let sharedPool

export function postgresValues(sql) {
  let index = 0
  return sql
    .replace(/\bAS\s+([a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)\b/g, 'AS "$1"')
    .replace(/\?/g, () => `$${++index}`)
    .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
}

function queryMethods(queryable) {
  return {
    get: async (sql, params = []) => (await queryable.query(postgresValues(sql), params)).rows[0],
    all: async (sql, params = []) => (await queryable.query(postgresValues(sql), params)).rows,
    run: async (sql, params = []) => {
      const result = await queryable.query(postgresValues(sql), params)
      return { changes: result.rowCount }
    },
  }
}

export function openPostgresDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required for the Supabase database.')
  sharedPool ??= new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'rehabita-vercel-api',
  })

  return {
    ...queryMethods(sharedPool),
    close: async () => {},
    withTransaction: async (callback) => {
      const client = await sharedPool.connect()
      try {
        await client.query('BEGIN')
        const result = await callback({
          ...queryMethods(client),
          lockTherapist: async (therapistId) => {
            await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [therapistId])
          },
        })
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
  }
}
