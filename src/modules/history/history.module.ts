import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { UsersModule } from '../users/users.module'
import { History } from '../../database/entities/history.entity'
import { HistoryController } from './history.controller'
import { HistoryService } from './history.service'

@Module({
  imports: [AuthModule, UsersModule, TypeOrmModule.forFeature([History])],
  controllers: [HistoryController],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
