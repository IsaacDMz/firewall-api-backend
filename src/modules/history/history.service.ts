import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface'
import { History, HistoryAction } from '../../database/entities/history.entity'
import { Lab, LabStatus } from '../../database/entities/lab.entity'
import { HistoryResponse } from './history.types'

type StatusChange = {
  user: AuthenticatedUser
  lab: Pick<Lab, 'id' | 'name'>
  previousStatus: LabStatus
  newStatus: LabStatus
  requestId?: string | null
}

@Injectable()
export class HistoryService {
  constructor(@InjectRepository(History) private readonly historiesRepository: Repository<History>) {}

  async findAll(): Promise<HistoryResponse[]> {
    const histories = await this.historiesRepository.find({ order: { createdAt: 'DESC' } })
    return histories.map((history) => this.toResponse(history))
  }

  async recordStatusChange(manager: EntityManager, change: StatusChange): Promise<void> {
    const histories = manager.getRepository(History)
    await histories.save(
      histories.create({
        userId: change.user.id,
        usernameSnapshot: change.user.username,
        labId: change.lab.id,
        labNameSnapshot: change.lab.name,
        action: change.newStatus === LabStatus.BLOQUEADO ? HistoryAction.BLOCK_INTERNET : HistoryAction.UNBLOCK_INTERNET,
        previousStatus: change.previousStatus,
        newStatus: change.newStatus,
        requestId: change.requestId ?? null,
      }),
    )
  }

  private toResponse(history: History): HistoryResponse {
    return {
      user: history.usernameSnapshot,
      lab: history.labNameSnapshot,
      action: history.action === HistoryAction.BLOCK_INTERNET ? 'Bloqueou Internet' : 'Liberou Internet',
      time: history.createdAt.toISOString(),
    }
  }
}
