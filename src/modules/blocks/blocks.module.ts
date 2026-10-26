import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Block } from '../../database/entities/block.entity'
import { Lab } from '../../database/entities/lab.entity'
import { AuthModule } from '../auth/auth.module'
import { UsersModule } from '../users/users.module'
import { AuditModule } from '../audit/audit.module'
import { BlocksController } from './blocks.controller'
import { BlocksService } from './blocks.service'

@Module({
  imports: [AuthModule, AuditModule, UsersModule, TypeOrmModule.forFeature([Block, Lab])],
  controllers: [BlocksController],
  providers: [BlocksService],
  exports: [BlocksService],
})
export class BlocksModule {}
