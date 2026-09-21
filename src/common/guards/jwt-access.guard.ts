import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Request } from 'express'
import { UserRole } from '../../database/entities/user.entity'
import { AuthenticatedUser } from '../auth/authenticated-user.interface'

type AccessTokenPayload = {
  sub: string
  username: string
  role: UserRole
  type: 'access'
}

type AuthenticatedRequest = Request & { user: AuthenticatedUser }

@Injectable()
export class JwtAccessGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const token = this.extractToken(request)

    if (!token) {
      throw new UnauthorizedException({ message: 'Authentication required', code: 'AUTH_UNAUTHORIZED' })
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token)

      if (payload.type !== 'access') {
        throw new Error('Invalid token type')
      }

      request.user = { id: payload.sub, username: payload.username, role: payload.role }
      return true
    } catch {
      throw new UnauthorizedException({ message: 'Invalid or expired access token', code: 'AUTH_UNAUTHORIZED' })
    }
  }

  private extractToken(request: Request): string | undefined {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? []
    return scheme === 'Bearer' ? token : undefined
  }
}
