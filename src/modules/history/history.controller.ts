import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAccessGuard } from '../../common/guards/jwt-access.guard'
import { ActiveUserGuard } from '../users/guards/active-user.guard'
import { HistoryService } from './history.service'
import { HistoryResponse } from './history.types'

@ApiTags('history')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, ActiveUserGuard)
@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  findAll(): Promise<HistoryResponse[]> {
    return this.historyService.findAll()
  }
}
