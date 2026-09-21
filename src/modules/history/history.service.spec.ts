import { jest } from '@jest/globals'
import { History, HistoryAction } from '../../database/entities/history.entity'
import { Lab, LabStatus } from '../../database/entities/lab.entity'
import { UserRole } from '../../database/entities/user.entity'
import { HistoryService } from './history.service'

const user = { id: 'faabce83-c7eb-4df6-a509-5722fc599339', username: 'professor', role: UserRole.PROFESSOR }
const lab = { id: 1, name: 'Lab de Redes' } as Pick<Lab, 'id' | 'name'>

describe('HistoryService', () => {
  let service: HistoryService
  let historiesRepository: { create: jest.Mock; find: jest.Mock; save: jest.Mock }
  let transactionRepository: { create: jest.Mock; save: jest.Mock }
  let manager: { getRepository: jest.Mock }

  beforeEach(() => {
    historiesRepository = {
      create: jest.fn((data) => data),
      find: jest.fn(),
      save: jest.fn(),
    }
    transactionRepository = {
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => data),
    }
    manager = { getRepository: jest.fn(() => transactionRepository) }
    service = new HistoryService(historiesRepository as never)
  })

  it('records an internet block with the responsible user snapshots', async () => {
    await service.recordStatusChange(manager as never, {
      user,
      lab,
      previousStatus: LabStatus.LIBERADO,
      newStatus: LabStatus.BLOQUEADO,
    })

    expect(transactionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        usernameSnapshot: user.username,
        labId: lab.id,
        labNameSnapshot: lab.name,
        action: HistoryAction.BLOCK_INTERNET,
        previousStatus: LabStatus.LIBERADO,
        newStatus: LabStatus.BLOQUEADO,
      }),
    )
  })

  it('records an internet release', async () => {
    await service.recordStatusChange(manager as never, {
      user,
      lab,
      previousStatus: LabStatus.BLOQUEADO,
      newStatus: LabStatus.LIBERADO,
    })

    expect(transactionRepository.save).toHaveBeenCalledWith(expect.objectContaining({ action: HistoryAction.UNBLOCK_INTERNET }))
  })

  it('returns newest history first using frontend-compatible fields', async () => {
    const newestTime = new Date('2026-09-21T15:00:00.000Z')
    const oldestTime = new Date('2026-09-21T14:00:00.000Z')
    historiesRepository.find.mockResolvedValue([
      {
        usernameSnapshot: 'admin',
        labNameSnapshot: 'Lab 2',
        action: HistoryAction.UNBLOCK_INTERNET,
        createdAt: newestTime,
      },
      {
        usernameSnapshot: 'professor',
        labNameSnapshot: 'Lab 1',
        action: HistoryAction.BLOCK_INTERNET,
        createdAt: oldestTime,
      },
    ] as History[])

    await expect(service.findAll()).resolves.toEqual([
      { user: 'admin', lab: 'Lab 2', action: 'Liberou Internet', time: newestTime.toISOString() },
      { user: 'professor', lab: 'Lab 1', action: 'Bloqueou Internet', time: oldestTime.toISOString() },
    ])
    expect(historiesRepository.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } })
  })
})
