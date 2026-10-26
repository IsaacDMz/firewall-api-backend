import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '../../database/entities/user.entity'
import { AuthModule } from '../auth/auth.module'
import { ActiveUserGuard } from './guards/active-user.guard'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
  imports: [forwardRef(() => AuthModule), TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService, ActiveUserGuard],
  exports: [UsersService, ActiveUserGuard],
})
export class UsersModule {}
