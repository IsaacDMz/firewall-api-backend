import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { jest } from '@jest/globals'
import { JwtService } from '@nestjs/jwt'
import { getRepositoryToken } from '@nestjs/typeorm'
import * as argon2 from 'argon2'
import request from 'supertest'
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter'
import { RefreshSession } from '../../database/entities/refresh-session.entity'
import { ActiveUserGuard } from '../users/guards/active-user.guard'
import { UsersService } from '../users/users.service'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

describe('AuthController', () => {
  it('returns invalid credentials for a short login password', async () => {
    const usersService = {
      findByEmail: jest.fn(async () => ({
        passwordHash: await argon2.hash('strong-password'),
        isActive: true,
      })),
    }
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        ActiveUserGuard,
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: {} },
        { provide: getRepositoryToken(RefreshSession), useValue: {} },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile()
    const app = module.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    app.useGlobalFilters(new HttpExceptionFilter())
    await app.init()

    try {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'professor@example.com', password: 'short' })
        .expect(401)
        .expect({ message: 'Usuário ou senha inválidos.', code: 'AUTH_INVALID_CREDENTIALS' })

      expect(usersService.findByEmail).toHaveBeenCalledWith('professor@example.com')
    } finally {
      await app.close()
    }
  })

  it('rejects role and isActive fields from the public registration payload', async () => {
    const authService = { register: jest.fn() }
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [AuthService, ActiveUserGuard, { provide: JwtService, useValue: {} }, { provide: UsersService, useValue: {} }],
    })
      .overrideProvider(AuthService)
      .useValue(authService)
      .compile()
    const app = module.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    app.useGlobalFilters(new HttpExceptionFilter())
    await app.init()

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        username: 'professor',
        email: 'professor@example.com',
        password: 'strong-password',
        role: 'ADMIN',
        isActive: true,
      })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('BAD_REQUEST'))

    expect(authService.register).not.toHaveBeenCalled()
    await app.close()
  })
})
