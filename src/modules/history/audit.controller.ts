import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Roles } from '../../common/auth/roles.decorator'
import { JwtAccessGuard } from '../../common/guards/jwt-access.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { UserRole } from '../../database/entities/user.entity'
import { AuditService } from '../audit/audit.service'
import { ActiveUserGuard } from '../users/guards/active-user.guard'

@ApiTags('history')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, ActiveUserGuard, RolesGuard)
@Controller('history/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Roles(UserRole.ADMIN)
  @Get()
  findAll() {
    return this.auditService.findAll()
  }
}
