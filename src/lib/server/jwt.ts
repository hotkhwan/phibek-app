// src/lib/server/jwt.ts
export function parseJwt(token: string): any {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT')
  }

  const payload = parts[1]
  const decoded = Buffer.from(payload, 'base64url').toString('utf-8')
  return JSON.parse(decoded)
}
