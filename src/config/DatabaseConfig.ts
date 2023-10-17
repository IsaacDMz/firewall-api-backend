import { DynamicModule } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import * as dotenv from 'dotenv'

dotenv.config()

export const Database: DynamicModule = TypeOrmModule.forRoot({
  type: 'postgres',
  host: process.env.TYPEORM,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: ['dist/entities/*{.ts,.js}'],
})
