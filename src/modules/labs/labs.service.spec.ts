import { jest } from '@jest/globals'
import { Lab, LabStatus } from '../../database/entities/lab.entity'
import { LabsService } from './labs.service'

const block = { id: 'faabce83-c7eb-4df6-a509-5722fc599339', name: 'Bloco A' }
const lab: Lab = {
  id: 1,
  name: 'Lab 1',
  blockId: block.id,
  block,
  subnet: '192.168.10.0/24',
  status: LabStatus.BLOQUEADO,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function noConflictQuery() {
  const query = {
    where: jest.fn(),
    andWhere: jest.fn(),
    getOne: jest.fn(async () => null),
  }
  query.where.mockReturnValue(query)
  query.andWhere.mockReturnValue(query)
  return query
}

function createService(options: { conflict?: Lab | null; blockFailure?: Error; unblockOldFailure?: Error } = {}) {
  const query = noConflictQuery()
  query.getOne.mockResolvedValue(options.conflict ?? null)
  const labsRepository = {
    findOne: jest.fn(async () => lab),
    findOneOrFail: jest.fn(async () => lab),
    save: jest.fn(async (value) => ({ ...lab, ...value })),
    createQueryBuilder: jest.fn(() => query),
  }
  const blocksRepository = { findOneBy: jest.fn(async () => block) }
  const firewallService = {
    blockInternet: jest.fn(async () => {
      if (options.blockFailure) throw options.blockFailure
    }),
    unblockInternet: jest.fn(async (subnet: string) => {
      if (subnet === lab.subnet && options.unblockOldFailure) throw options.unblockOldFailure
    }),
  }
  const service = new LabsService(labsRepository as never, blocksRepository as never, {} as never, firewallService as never, {} as never)
  return { service, labsRepository, firewallService }
}

describe('LabsService', () => {
  it('preserves the subnet when a PATCH omits it', async () => {
    const { service, labsRepository, firewallService } = createService()

    await expect(service.update(lab.id, { name: 'Lab Renomeado' })).resolves.toMatchObject({ subnet: lab.subnet })
    expect(labsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ subnet: lab.subnet, name: 'Lab Renomeado' }))
    expect(firewallService.blockInternet).not.toHaveBeenCalled()
    expect(firewallService.unblockInternet).not.toHaveBeenCalled()
  })

  it('replaces firewall rules before persisting a blocked lab subnet change', async () => {
    const { service, labsRepository, firewallService } = createService()

    await service.update(lab.id, { subnet: '192.168.11.0/24' })

    expect(firewallService.blockInternet).toHaveBeenCalledWith('192.168.11.0/24', lab.id)
    expect(firewallService.unblockInternet).toHaveBeenCalledWith('192.168.10.0/24', lab.id)
    expect(labsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ subnet: '192.168.11.0/24' }))
  })

  it('rejects an overlapping subnet before changing the firewall', async () => {
    const { service, labsRepository, firewallService } = createService({ conflict: { ...lab, id: 2 } })

    await expect(service.update(lab.id, { subnet: '192.168.10.0/25' })).rejects.toMatchObject({ response: { code: 'LAB_SUBNET_OVERLAP' } })
    expect(labsRepository.save).not.toHaveBeenCalled()
    expect(firewallService.blockInternet).not.toHaveBeenCalled()
  })

  it('does not persist a subnet change when blocking the new subnet fails', async () => {
    const { service, labsRepository, firewallService } = createService({ blockFailure: new Error('firewall unavailable') })

    await expect(service.update(lab.id, { subnet: '192.168.11.0/24' })).rejects.toThrow('firewall unavailable')
    expect(labsRepository.save).not.toHaveBeenCalled()
    expect(firewallService.unblockInternet).not.toHaveBeenCalled()
  })

  it('compensates the new firewall rule when removing the old rule fails', async () => {
    const { service, labsRepository, firewallService } = createService({ unblockOldFailure: new Error('old rule removal failed') })

    await expect(service.update(lab.id, { subnet: '192.168.11.0/24' })).rejects.toThrow('old rule removal failed')
    expect(labsRepository.save).not.toHaveBeenCalled()
    expect(firewallService.unblockInternet).toHaveBeenLastCalledWith('192.168.11.0/24', lab.id)
  })
})
