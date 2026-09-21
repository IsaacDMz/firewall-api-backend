import * as Joi from 'joi'

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_HOST: Joi.string().hostname().default('localhost'),
  DATABASE_PORT: Joi.number().port().default(5432),
  DATABASE_NAME: Joi.string().trim().min(1).default('lab_guard'),
  DATABASE_USERNAME: Joi.string().trim().min(1).default('postgres'),
  DATABASE_PASSWORD: Joi.string().min(1).required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('15m'),
  JWT_REFRESH_TTL: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('7d'),
  SSH_HOST: Joi.string().hostname().required(),
  SSH_PORT: Joi.number().port().default(22),
  SSH_USERNAME: Joi.string().trim().min(1).required(),
  SSH_PRIVATE_KEY_PATH: Joi.string().trim().min(1).required(),
  SSH_HOST_FINGERPRINT: Joi.string()
    .pattern(/^SHA256:[A-Za-z0-9+/]+={0,2}$/)
    .required(),
  SSH_CONNECT_TIMEOUT: Joi.number().integer().min(1000).default(10_000),
  SSH_COMMAND_TIMEOUT: Joi.number().integer().min(1000).default(15_000),
  SSH_WAN_INTERFACE: Joi.string()
    .pattern(/^[A-Za-z0-9_.:-]{1,32}$/)
    .required(),
}).unknown(true)
