export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function parseResponse(response) {
  if (response.status === 204) return null
  const result = await response.json()
  if (!response.ok) throw new ApiError(result.error || 'Ocurrió un error. Intentá nuevamente.', response.status)
  return result
}

export async function getCsrfToken() {
  const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' })
  const result = await parseResponse(response)
  return result.csrfToken
}

export async function apiRequest(path, { method = 'GET', body, csrfToken } = {}) {
  const options = { method, credentials: 'same-origin', headers: {} }
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
    options.headers['X-CSRF-Token'] = csrfToken || await getCsrfToken()
  }
  const response = await fetch(path, options)
  return parseResponse(response)
}
