import { registerAs } from '@nestjs/config'
import type { JwtSignOptions } from '@nestjs/jwt'

type JwtExpiration = NonNullable<JwtSignOptions['expiresIn']>

export function asJwtExpiration(value: string): JwtExpiration {
  return value as JwtExpiration
}

export default registerAs('auth', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
}))
