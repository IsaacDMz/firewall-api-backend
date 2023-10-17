import * as dotenv from 'dotenv'

dotenv.config()

export const sshConfig = {
  host: process.env.SSH_HOST,
  port: 22,
  username: process.env.SSH_USER,
  password: process.env.SSH_PASSWORD,
}
