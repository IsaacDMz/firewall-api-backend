import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtAccessGuard } from '../../common/guards/jwt-access.guard'
import { asJwtExpiration } from '../../config/auth.config'
import { RolesGuard } from '../../common/guards/roles.guard'
import { RefreshSession } from '../../database/entities/refresh-session.entity'
import { UsersModule } from '../users/users.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([RefreshSession]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('auth.accessSecret'),
        signOptions: { expiresIn: asJwtExpiration(config.getOrThrow<string>('auth.accessTtl')) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAccessGuard, RolesGuard],
  exports: [JwtModule, JwtAccessGuard, RolesGuard],
})
export class AuthModule {}
