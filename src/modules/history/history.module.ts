import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { UsersModule } from '../users/users.module'
import { History } from '../../database/entities/history.entity'
import { HistoryController } from './history.controller'
import { HistoryService } from './history.service'
import { AuditModule } from '../audit/audit.module'
import { AuditController } from './audit.controller'

@Module({
  imports: [AuthModule, UsersModule, AuditModule, TypeOrmModule.forFeature([History])],
  controllers: [HistoryController, AuditController],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
