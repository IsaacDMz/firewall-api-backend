import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../../common/auth/current-user.decorator'
import { RequestId } from '../../common/http/request-id.decorator'
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface'
import { Roles } from '../../common/auth/roles.decorator'
import { JwtAccessGuard } from '../../common/guards/jwt-access.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { User, UserRole } from '../../database/entities/user.entity'
import { PublicUser } from '../auth/auth.types'
import { UpdateUserActivationDto } from './dto/update-user-activation.dto'
import { ActiveUserGuard } from './guards/active-user.guard'
import { UsersService } from './users.service'

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, ActiveUserGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(UserRole.ADMIN)
  @Get()
  async findAll(): Promise<PublicUser[]> {
    return (await this.usersService.findAll()).map((user) => this.toPublicUser(user))
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/active')
  async setActivation(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() data: UpdateUserActivationDto,
    @CurrentUser() user: AuthenticatedUser,
    @RequestId() requestId: string,
  ): Promise<PublicUser> {
    return this.toPublicUser(await this.usersService.setActivation(id, data.isActive, user, requestId))
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/promote-admin')
  async promoteToAdmin(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() user: AuthenticatedUser, @RequestId() requestId: string): Promise<PublicUser> {
    return this.toPublicUser(await this.usersService.promoteToAdmin(id, user, requestId))
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
}
