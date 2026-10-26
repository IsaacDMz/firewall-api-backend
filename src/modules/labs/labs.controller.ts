import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../../common/auth/current-user.decorator'
import { RequestId } from '../../common/http/request-id.decorator'
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface'
import { Roles } from '../../common/auth/roles.decorator'
import { JwtAccessGuard } from '../../common/guards/jwt-access.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { UserRole } from '../../database/entities/user.entity'
import { ActiveUserGuard } from '../users/guards/active-user.guard'
import { CreateLabDto } from './dto/create-lab.dto'
import { UpdateLabStatusDto } from './dto/update-lab-status.dto'
import { UpdateLabDto } from './dto/update-lab.dto'
import { LabsService } from './labs.service'
import { LabResponse } from './labs.types'

@ApiTags('labs')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, ActiveUserGuard, RolesGuard)
@Controller('labs')
export class LabsController {
  constructor(private readonly labsService: LabsService) {}

  @Roles(UserRole.PROFESSOR, UserRole.ADMIN)
  @Get()
  findAll(): Promise<LabResponse[]> {
    return this.labsService.findAll()
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
