import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { FirewallModule } from '../firewall/firewall.module'
import { HistoryModule } from '../history/history.module'
import { Lab } from '../../database/entities/lab.entity'
import { LabsController } from './labs.controller'
import { LabsService } from './labs.service'

@Module({
  imports: [AuthModule, FirewallModule, HistoryModule, TypeOrmModule.forFeature([Lab])],
  controllers: [LabsController],
  providers: [LabsService],
})
export class LabsModule {}
