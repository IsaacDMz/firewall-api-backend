import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '../../database/entities/user.entity'
import { ActiveUserGuard } from './guards/active-user.guard'
import { UsersService } from './users.service'

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService, ActiveUserGuard],
  exports: [UsersService, ActiveUserGuard],
})
export class UsersModule {}
