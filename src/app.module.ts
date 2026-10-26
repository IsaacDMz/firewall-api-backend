import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigService } from '@nestjs/config'
import { AuthModule } from './modules/auth/auth.module'
import { BlocksModule } from './modules/blocks/blocks.module'
import { LabsModule } from './modules/labs/labs.module'
import { HistoryModule } from './modules/history/history.module'
import authConfig from './config/auth.config'
import firewallConfig from './config/firewall.config'
import { History } from './database/entities/history.entity'
import { AuditLog } from './database/entities/audit-log.entity'
import { Block } from './database/entities/block.entity'
import { Lab } from './database/entities/lab.entity'
import { RefreshSession } from './database/entities/refresh-session.entity'
import { User } from './database/entities/user.entity'
import appConfig from './config/app.config'
import databaseConfig from './config/database.config'
import { envValidationSchema } from './config/env.validation'
import { RequestIdMiddleware } from './common/http/request-id.middleware'
import { AuditModule } from './modules/audit/audit.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig, databaseConfig, firewallConfig],
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.getOrThrow<string>('database.host'),
        port: config.getOrThrow<number>('database.port'),
        username: config.getOrThrow<string>('database.username'),
        password: config.getOrThrow<string>('database.password'),
        database: config.getOrThrow<string>('database.name'),
        entities: [User, Block, Lab, History, RefreshSession, AuditLog],
        synchronize: false,
      }),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    AuthModule,
    BlocksModule,
    LabsModule,
    HistoryModule,
    AuditModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*')
  }
}
