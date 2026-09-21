import * as argon2 from 'argon2'
import { randomUUID } from 'crypto'
import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RefreshSession } from '../../database/entities/refresh-session.entity'
import { User } from '../../database/entities/user.entity'
import { asJwtExpiration } from '../../config/auth.config'
import { UsersService } from '../users/users.service'
import { LoginDto } from './dto/login.dto'
import { RegisterDto } from './dto/register.dto'
import { PublicUser, TokenPair } from './auth.types'

type RefreshTokenPayload = {
  sub: string
  sid: string
  type: 'refresh'
}

type AccessTokenPayload = {
  sub: string
  username: string
  role: User['role']
  type: 'access'
}

type DecodedToken = { exp?: number } | null

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    @InjectRepository(RefreshSession) private readonly refreshSessionsRepository: Repository<RefreshSession>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(data: RegisterDto): Promise<PublicUser> {
    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id })

    try {
      const user = await this.usersService.createPendingProfessor({
        username: data.username,
        email: data.email,
        passwordHash,
      })

      return this.toPublicUser(user)
    } catch (error) {
      this.handleUniqueViolation(error)
    }
  }

  async login(data: LoginDto): Promise<TokenPair> {
    const user = await this.usersService.findByUsername(data.username)
    const isValidPassword = user ? await this.verifyPassword(user.passwordHash, data.password) : false

    if (!user || !isValidPassword) {
      throw this.invalidCredentials()
    }

    if (!user.isActive) {
      throw this.accountInactive()
    }

    return this.issueTokenPair(user)
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = await this.verifyRefreshToken(refreshToken)
    const session = await this.refreshSessionsRepository.findOne({
      where: { id: payload.sid, userId: payload.sub },
      relations: { user: true },
    })

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw this.invalidRefreshToken()
    }

    if (!(await this.verifyPassword(session.tokenHash, refreshToken))) {
      throw this.invalidRefreshToken()
    }

    if (!session.user.isActive) {
      await this.revoke(session)
      throw this.accountInactive()
    }

    await this.revoke(session)
    return this.issueTokenPair(session.user)
  }

  async logout(refreshToken: string): Promise<void> {
    const payload = await this.verifyRefreshToken(refreshToken)
    const session = await this.refreshSessionsRepository.findOneBy({ id: payload.sid, userId: payload.sub })

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw this.invalidRefreshToken()
    }

    if (!(await this.verifyPassword(session.tokenHash, refreshToken))) {
      throw this.invalidRefreshToken()
    }

    await this.revoke(session)
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.usersService.findById(userId)

    if (!user) {
      throw new UnauthorizedException({ message: 'User not found', code: 'AUTH_UNAUTHORIZED' })
    }

    return this.toPublicUser(user)
  }

  private async issueTokenPair(user: User): Promise<TokenPair> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      type: 'access',
    }
    const sessionId = randomUUID()
    const refreshPayload: RefreshTokenPayload = { sub: user.id, sid: sessionId, type: 'refresh' }
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.configService.getOrThrow<string>('auth.refreshSecret'),
      expiresIn: asJwtExpiration(this.configService.getOrThrow<string>('auth.refreshTtl')),
    })
    const decodedToken = this.jwtService.decode(refreshToken) as DecodedToken

    if (!decodedToken?.exp) {
      throw new Error('Refresh token expiration is missing')
    }

    await this.refreshSessionsRepository.save(
      this.refreshSessionsRepository.create({
        id: sessionId,
        userId: user.id,
        tokenHash: await argon2.hash(refreshToken, { type: argon2.argon2id }),
        expiresAt: new Date(decodedToken.exp * 1000),
      }),
    )

    return {
      accessToken: await this.jwtService.signAsync(accessPayload),
      refreshToken,
    }
  }

  private async verifyRefreshToken(refreshToken: string): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('auth.refreshSecret'),
      })

      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type')
      }

      return payload
    } catch {
      throw this.invalidRefreshToken()
    }
  }

  private async verifyPassword(hash: string, value: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, value)
    } catch {
      return false
    }
  }

  private async revoke(session: RefreshSession): Promise<void> {
    await this.refreshSessionsRepository.update(session.id, { revokedAt: new Date() })
  }

  private handleUniqueViolation(error: unknown): never {
    const constraint = (error as { driverError?: { constraint?: string } }).driverError?.constraint

    if (constraint === 'UQ_users_username') {
      throw new ConflictException({ message: 'Username is already in use', code: 'USERNAME_ALREADY_EXISTS' })
    }

    if (constraint === 'UQ_users_email') {
      throw new ConflictException({ message: 'Email is already in use', code: 'EMAIL_ALREADY_EXISTS' })
    }

    throw error
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    }
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({ message: 'Invalid credentials', code: 'AUTH_INVALID_CREDENTIALS' })
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({ message: 'Invalid or expired refresh token', code: 'AUTH_INVALID_REFRESH_TOKEN' })
  }

  private accountInactive(): ForbiddenException {
    return new ForbiddenException({ message: 'Account is inactive', code: 'ACCOUNT_INACTIVE' })
  }
}
