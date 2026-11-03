import session from 'express-session'

export class PersistentSessionStore extends session.Store {
  constructor(db) {
    super()
    this.db = db
  }

  get(sid, callback) {
    this.db.get('SELECT sess, expires FROM web_sessions WHERE sid = ?', [sid]).then(async (row) => {
      if (!row) {
        callback(null, null)
        return
      }
      if (Number(row.expires) <= Date.now()) {
        await this.db.run('DELETE FROM web_sessions WHERE sid = ?', [sid])
        callback(null, null)
        return
      }
      callback(null, typeof row.sess === 'string' ? JSON.parse(row.sess) : row.sess)
    }).catch(callback)
  }

  set(sid, value, callback = () => {}) {
    const expiry = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 8 * 60 * 60 * 1000
    this.db.run(`
      INSERT INTO web_sessions (sid, sess, expires) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires
    `, [sid, JSON.stringify(value), expiry]).then(() => callback(null), callback)
  }

  touch(sid, value, callback = () => {}) {
    const expiry = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 8 * 60 * 60 * 1000
    this.db.run('UPDATE web_sessions SET expires = ? WHERE sid = ?', [expiry, sid]).then(() => callback(null), callback)
  }

  destroy(sid, callback = () => {}) {
    this.db.run('DELETE FROM web_sessions WHERE sid = ?', [sid]).then(() => callback(null), callback)
  }
}
