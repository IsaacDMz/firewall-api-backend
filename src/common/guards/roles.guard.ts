import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { UserRole } from '../../database/entities/user.entity'
import { AuthenticatedUser } from '../auth/authenticated-user.interface'
import { ROLES_KEY } from '../auth/roles.decorator'

type AuthenticatedRequest = Request & { user?: AuthenticatedUser }

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()])

    if (!roles) {
      return true
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    return request.user !== undefined && roles.includes(request.user.role)
  }
}
