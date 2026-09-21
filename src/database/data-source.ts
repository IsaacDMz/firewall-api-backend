import 'dotenv/config'
import { DataSource } from 'typeorm'
import { History } from './entities/history.entity'
import { Lab } from './entities/lab.entity'
import { RefreshSession } from './entities/refresh-session.entity'
import { User } from './entities/user.entity'

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USERNAME ?? 'postgres',
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME ?? 'lab_guard',
  entities: [User, Lab, History, RefreshSession],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  synchronize: false,
})
