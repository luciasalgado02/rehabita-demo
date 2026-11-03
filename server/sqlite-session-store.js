import session from 'express-session'

export class SQLiteSessionStore extends session.Store {
  constructor(db) {
    super()
    this.db = db
    this.getStatement = db.prepare('SELECT sess, expires FROM web_sessions WHERE sid = ?')
    this.setStatement = db.prepare(`
      INSERT INTO web_sessions (sid, sess, expires) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires
    `)
    this.deleteStatement = db.prepare('DELETE FROM web_sessions WHERE sid = ?')
    this.touchStatement = db.prepare('UPDATE web_sessions SET expires = ? WHERE sid = ?')
  }

  get(sid, callback) {
    try {
      const row = this.getStatement.get(sid)
      if (!row) {
        callback(null, null)
        return
      }
      if (row.expires <= Date.now()) {
        this.deleteStatement.run(sid)
        callback(null, null)
        return
      }
      callback(null, JSON.parse(row.sess))
    } catch (error) {
      callback(error)
    }
  }

  set(sid, value, callback = () => {}) {
    try {
      const expiry = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 8 * 60 * 60 * 1000
      this.setStatement.run(sid, JSON.stringify(value), expiry)
      callback(null)
    } catch (error) {
      callback(error)
    }
  }

  touch(sid, value, callback = () => {}) {
    try {
      const expiry = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 8 * 60 * 60 * 1000
      this.touchStatement.run(expiry, sid)
      callback(null)
    } catch (error) {
      callback(error)
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.deleteStatement.run(sid)
      callback(null)
    } catch (error) {
      callback(error)
    }
  }
}
