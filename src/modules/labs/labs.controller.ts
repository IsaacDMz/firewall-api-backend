import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../../common/auth/current-user.decorator'
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface'
import { Roles } from '../../common/auth/roles.decorator'
import { JwtAccessGuard } from '../../common/guards/jwt-access.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { UserRole } from '../../database/entities/user.entity'
import { CreateLabDto } from './dto/create-lab.dto'
import { UpdateLabStatusDto } from './dto/update-lab-status.dto'
import { LabsService } from './labs.service'
import { LabResponse } from './labs.types'

@ApiTags('labs')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, RolesGuard)
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
  create(@Body() data: CreateLabDto): Promise<LabResponse> {
    return this.labsService.create(data)
  }

  @Roles(UserRole.PROFESSOR, UserRole.ADMIN)
  @Patch(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() data: UpdateLabStatusDto, @CurrentUser() user: AuthenticatedUser): Promise<LabResponse> {
    return this.labsService.updateStatus(id, data, user)
  }
}
