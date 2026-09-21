import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { jest } from '@jest/globals'
import { JwtService } from '@nestjs/jwt'
import request from 'supertest'
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

describe('AuthController', () => {
  it('rejects role and isActive fields from the public registration payload', async () => {
    const authService = { register: jest.fn() }
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [AuthService, { provide: JwtService, useValue: {} }],
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
