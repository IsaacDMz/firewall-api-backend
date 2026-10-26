import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { FirewallModule } from '../firewall/firewall.module'
import { HistoryModule } from '../history/history.module'
import { UsersModule } from '../users/users.module'
import { Block } from '../../database/entities/block.entity'
import { Lab } from '../../database/entities/lab.entity'
import { LabsController } from './labs.controller'
import { LabsService } from './labs.service'

@Module({
  imports: [AuthModule, FirewallModule, HistoryModule, UsersModule, TypeOrmModule.forFeature([Block, Lab])],
  controllers: [LabsController],
  providers: [LabsService],
})
export class LabsModule {}
