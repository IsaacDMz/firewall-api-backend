import { registerAs } from '@nestjs/config'

export default registerAs('firewall', () => ({
  host: process.env.SSH_HOST,
  port: Number(process.env.SSH_PORT ?? 22),
  username: process.env.SSH_USERNAME,
  privateKeyPath: process.env.SSH_PRIVATE_KEY_PATH,
  hostFingerprint: process.env.SSH_HOST_FINGERPRINT,
  connectTimeout: Number(process.env.SSH_CONNECT_TIMEOUT ?? 10_000),
  commandTimeout: Number(process.env.SSH_COMMAND_TIMEOUT ?? 15_000),
  wanInterface: process.env.SSH_WAN_INTERFACE,
}))
