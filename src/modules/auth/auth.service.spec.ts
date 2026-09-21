import * as argon2 from 'argon2'
import { jest } from '@jest/globals'
import { HttpStatus } from '@nestjs/common'
import { RefreshSession } from '../../database/entities/refresh-session.entity'
import { User, UserRole } from '../../database/entities/user.entity'
import { UsersService } from '../users/users.service'
import { AuthService } from './auth.service'

const user: User = {
  id: 'f14a0a8c-bbb3-4e82-956c-ee232f5dc4fc',
  username: 'professor',
  email: 'professor@example.com',
  passwordHash: '',
  role: UserRole.PROFESSOR,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('AuthService', () => {
  let service: AuthService
  let usersService: jest.Mocked<Pick<UsersService, 'createPendingProfessor' | 'findById' | 'findByUsername'>>
  let refreshSessionsRepository: {
    create: jest.Mock
    findOne: jest.Mock
    findOneBy: jest.Mock
    save: jest.Mock
    update: jest.Mock
  }
  let jwtService: { decode: jest.Mock; signAsync: jest.Mock; verifyAsync: jest.Mock }

  beforeEach(() => {
    usersService = {
      createPendingProfessor: jest.fn(),
      findById: jest.fn(),
      findByUsername: jest.fn(),
    }
    refreshSessionsRepository = {
      create: jest.fn((data) => data),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      save: jest.fn(async (data) => data),
      update: jest.fn(async () => ({ affected: 1 })),
    }
    jwtService = {
      decode: jest.fn(() => ({ exp: Math.floor(Date.now() / 1000) + 3600 })),
      signAsync: jest.fn(async (payload) => (payload.type === 'refresh' ? 'refresh-token' : 'access-token')),
      verifyAsync: jest.fn(),
    }
    service = new AuthService(
      usersService as unknown as UsersService,
      refreshSessionsRepository as never,
      jwtService as never,
      { getOrThrow: jest.fn((key: string) => (key === 'auth.refreshSecret' ? 'r'.repeat(32) : '7d')) } as never,
    )
  })

  it('registers a public user without exposing passwordHash', async () => {
    usersService.createPendingProfessor.mockResolvedValue({ ...user, isActive: false })

    const result = await service.register({
      username: user.username,
      email: user.email,
      password: 'strong-password',
    })

    expect(usersService.createPendingProfessor).toHaveBeenCalledWith(expect.objectContaining({ username: user.username, email: user.email }))
    expect(usersService.createPendingProfessor.mock.calls[0][0]).not.toHaveProperty('role')
    expect(usersService.createPendingProfessor.mock.calls[0][0]).not.toHaveProperty('isActive')
    expect(result).toEqual(expect.objectContaining({ role: UserRole.PROFESSOR, isActive: false }))
    expect(result).not.toHaveProperty('passwordHash')
  })

  it('returns a specific conflict code for duplicate usernames', async () => {
    usersService.createPendingProfessor.mockRejectedValue({
      driverError: { constraint: 'UQ_users_username' },
    })

    await expect(service.register({ username: user.username, email: user.email, password: 'strong-password' })).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: expect.objectContaining({ code: 'USERNAME_ALREADY_EXISTS' }),
    })
  })

  it('rejects an inactive user after valid credentials', async () => {
    usersService.findByUsername.mockResolvedValue({ ...user, isActive: false, passwordHash: await argon2.hash('strong-password') })

    await expect(service.login({ username: user.username, password: 'strong-password' })).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: expect.objectContaining({ code: 'ACCOUNT_INACTIVE' }),
    })
  })

  it('issues tokens for an active user with valid credentials', async () => {
    usersService.findByUsername.mockResolvedValue({ ...user, passwordHash: await argon2.hash('strong-password') })

    await expect(service.login({ username: user.username, password: 'strong-password' })).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })
    expect(refreshSessionsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ userId: user.id, tokenHash: expect.any(String) }))
  })

  it('rejects an incorrect password', async () => {
    usersService.findByUsername.mockResolvedValue({ ...user, passwordHash: await argon2.hash('strong-password') })

    await expect(service.login({ username: user.username, password: 'incorrect-password' })).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
      response: expect.objectContaining({ code: 'AUTH_INVALID_CREDENTIALS' }),
    })
  })

  it('rotates a valid refresh session', async () => {
    const tokenHash = await argon2.hash('refresh-token')
    const session: RefreshSession = {
      id: 'e5730153-2d58-4fe5-86a0-f36ccfa27979',
      userId: user.id,
      user,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
    }
    jwtService.verifyAsync.mockResolvedValue({ sub: user.id, sid: session.id, type: 'refresh' })
    refreshSessionsRepository.findOne.mockResolvedValue(session)

    await expect(service.refresh('refresh-token')).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })
    expect(refreshSessionsRepository.update).toHaveBeenCalledWith(session.id, expect.objectContaining({ revokedAt: expect.any(Date) }))
  })

  it('revokes the matching refresh session on logout', async () => {
    const session: RefreshSession = {
      id: 'cf2a0978-7db4-4f1a-9c11-7c65e66f7d44',
      userId: user.id,
      user,
      tokenHash: await argon2.hash('refresh-token'),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
    }
    jwtService.verifyAsync.mockResolvedValue({ sub: user.id, sid: session.id, type: 'refresh' })
    refreshSessionsRepository.findOneBy.mockResolvedValue(session)

    await expect(service.logout('refresh-token')).resolves.toBeUndefined()
    expect(refreshSessionsRepository.update).toHaveBeenCalledWith(session.id, expect.objectContaining({ revokedAt: expect.any(Date) }))
  })
})
