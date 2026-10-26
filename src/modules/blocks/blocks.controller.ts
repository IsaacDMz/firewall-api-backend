import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Roles } from '../../common/auth/roles.decorator'
import { JwtAccessGuard } from '../../common/guards/jwt-access.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { UserRole } from '../../database/entities/user.entity'
import { ActiveUserGuard } from '../users/guards/active-user.guard'
import { BlocksService } from './blocks.service'
import { BlockResponse } from './blocks.types'
import { CreateBlockDto } from './dto/create-block.dto'
import { UpdateBlockDto } from './dto/update-block.dto'

@ApiTags('blocks')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, ActiveUserGuard, RolesGuard)
@Controller('blocks')
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  @Roles(UserRole.PROFESSOR, UserRole.ADMIN)
  @Get()
  findAll(): Promise<BlockResponse[]> {
    return this.blocksService.findAll()
  }

  @Roles(UserRole.PROFESSOR, UserRole.ADMIN)
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<BlockResponse> {
    return this.blocksService.findOne(id)
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() data: CreateBlockDto): Promise<BlockResponse> {
    return this.blocksService.create(data)
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() data: UpdateBlockDto): Promise<BlockResponse> {
    return this.blocksService.update(id, data)
  }

  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<void> {
    return this.blocksService.remove(id)
  }
}
