import readline from 'node:readline/promises'
import { randomUUID } from 'node:crypto'
import { stdin, stdout } from 'node:process'
import { openDatabase } from './db.js'
import { hashPassword, MIN_PASSWORD_LENGTH } from './passwords.js'

const DNI_PATTERN = /^\d{7,8}$/

function readHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Este comando requiere una terminal interactiva para proteger la contraseña.')
  }

  return new Promise((resolve, reject) => {
    let value = ''
    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          cleanup()
          reject(new Error('Operación cancelada.'))
          return
        }
        if (character === '\r' || character === '\n') {
          cleanup()
          stdout.write('\n')
          resolve(value)
          return
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1)
          continue
        }
        if (character >= ' ' && character !== '\u007f') value += character
      }
    }
    const cleanup = () => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
    }

    stdout.write(prompt)
    stdin.setRawMode(true)
    stdin.setEncoding('utf8')
    stdin.resume()
    stdin.on('data', onData)
  })
}

const db = openDatabase()
const rl = readline.createInterface({ input: stdin, output: stdout })

try {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'therapist'").get()
  if (existing.count > 0) {
    throw new Error('Ya existe una cuenta de terapeuta; la inicialización solo puede ejecutarse una vez.')
  }

  const dni = (await rl.question('DNI de la terapeuta (7 u 8 dígitos): ')).trim()
  rl.close()
  if (!DNI_PATTERN.test(dni)) throw new Error('El DNI debe contener 7 u 8 dígitos.')

  const password = await readHidden('Contraseña (mínimo 12 caracteres, no se mostrará): ')
  const confirmation = await readHidden('Confirmá la contraseña: ')
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 128) {
    throw new Error(`La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y 128 caracteres.`)
  }
  if (password !== confirmation) throw new Error('Las contraseñas no coinciden.')

  const passwordHash = await hashPassword(password)
  db.prepare("INSERT INTO users (id, dni, password_hash, role) VALUES (?, ?, ?, 'therapist')")
    .run(randomUUID(), dni, passwordHash)
  stdout.write('Cuenta de terapeuta creada. Guardá las credenciales de forma segura.\n')
} catch (error) {
  console.error(error.code === 'SQLITE_CONSTRAINT_UNIQUE'
    ? 'Ya existe una cuenta con ese DNI o ya se inicializó la cuenta de terapeuta.'
    : error.message)
  process.exitCode = 1
} finally {
  rl.close()
  db.close()
}
