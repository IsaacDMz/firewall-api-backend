import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../../common/auth/current-user.decorator'
import { RequestId } from '../../common/http/request-id.decorator'
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface'
import { Roles } from '../../common/auth/roles.decorator'
import { JwtAccessGuard } from '../../common/guards/jwt-access.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { UserRole } from '../../database/entities/user.entity'
import { ActiveUserGuard } from '../users/guards/active-user.guard'
import { CreateLabDto } from './dto/create-lab.dto'
import { ListLabsQueryDto } from './dto/list-labs-query.dto'
import { ReconcileFirewallDto } from './dto/reconcile-firewall.dto'
import { UpdateLabStatusDto } from './dto/update-lab-status.dto'
import { UpdateLabDto } from './dto/update-lab.dto'
import { LabsService } from './labs.service'
import { LabFirewallReconcileResponse, LabFirewallStatusResponse, LabResponse } from './labs.types'

@ApiTags('labs')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, ActiveUserGuard, RolesGuard)
@Controller('labs')
export class LabsController {
  constructor(private readonly labsService: LabsService) {}

  @Roles(UserRole.PROFESSOR, UserRole.ADMIN)
  @Get()
  findAll(@Query() query: ListLabsQueryDto): Promise<LabResponse[]> {
    return this.labsService.findAll(query)
  }

  @Roles(UserRole.PROFESSOR, UserRole.ADMIN)
  @Get(':id/firewall-status')
  @ApiOperation({ summary: 'Check lab firewall consistency without changing database status or firewall rules' })
  checkFirewallStatus(@Param('id', ParseIntPipe) id: number): Promise<LabFirewallStatusResponse> {
    return this.labsService.checkFirewallStatus(id)
  }

  @Roles(UserRole.PROFESSOR, UserRole.ADMIN)
  @Post(':id/firewall-reconcile')
  @HttpCode(200)
  @ApiOperation({ summary: 'Manually reapply the stored lab policy and verify the firewall result' })
  reconcileFirewall(
    @Body() _data: ReconcileFirewallDto,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @RequestId() requestId: string,
  ): Promise<LabFirewallReconcileResponse> {
    return this.labsService.reconcileFirewall(id, user, requestId)
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() data: CreateLabDto, @CurrentUser() user: AuthenticatedUser, @RequestId() requestId: string): Promise<LabResponse> {
    return this.labsService.create(data, user, requestId)
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() data: UpdateLabDto, @CurrentUser() user: AuthenticatedUser, @RequestId() requestId: string): Promise<LabResponse> {
    return this.labsService.update(id, data, user, requestId)
  }

  @Roles(UserRole.PROFESSOR, UserRole.ADMIN)
  @Patch(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() data: UpdateLabStatusDto, @CurrentUser() user: AuthenticatedUser, @RequestId() requestId: string): Promise<LabResponse> {
    return this.labsService.updateStatus(id, data, user, requestId)
  }
}
