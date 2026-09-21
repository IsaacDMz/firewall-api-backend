import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface'
import { UsersService } from '../users.service'

type AuthenticatedRequest = Request & { user?: AuthenticatedUser }

@Injectable()
export class ActiveUserGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()

    if (!request.user) {
      throw new UnauthorizedException({ message: 'Authentication required', code: 'AUTH_UNAUTHORIZED' })
    }

    const user = await this.usersService.findById(request.user.id)

    if (!user) {
      throw new UnauthorizedException({ message: 'User not found', code: 'AUTH_UNAUTHORIZED' })
    }

    if (!user.isActive) {
      throw new ForbiddenException({ message: 'Account is inactive', code: 'ACCOUNT_INACTIVE' })
    }

    return true
  }
}
