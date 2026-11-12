import { jest } from '@jest/globals'
import { BadGatewayException } from '@nestjs/common'
import { EntityManager } from 'typeorm'
import { AuditResult } from '../../database/entities/audit-log.entity'
import { Block } from '../../database/entities/block.entity'
import { Lab, LabStatus } from '../../database/entities/lab.entity'
import { FirewallObservation } from '../firewall/firewall.types'
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
    findOneBy: jest.fn(async () => lab as Lab | null),
    findOne: jest.fn(async () => lab as Lab | null),
    findOneOrFail: jest.fn(async () => lab),
    save: jest.fn(async (value) => ({ ...lab, ...value })),
    createQueryBuilder: jest.fn(() => query),
  }
  const blocksRepository = { findOneBy: jest.fn(async () => block) }
  const firewallService = {
    observeSubnet: jest.fn(async (): Promise<FirewallObservation> => ({ status: 'bloqueado', error: null })),
    blockInternet: jest.fn(async () => {
      if (options.blockFailure) throw options.blockFailure
    }),
    unblockInternet: jest.fn(async (subnet: string) => {
      if (subnet === lab.subnet && options.unblockOldFailure) throw options.unblockOldFailure
    }),
  }
  const auditService = { record: jest.fn(async () => undefined), recordInTransaction: jest.fn(async () => undefined) }
  const historyService = { recordStatusChange: jest.fn(async () => undefined) }
  const manager = { getRepository: jest.fn((entity) => (entity === Block ? blocksRepository : labsRepository)) }
  const dataSource = { transaction: jest.fn(async (work: (manager: EntityManager) => Promise<unknown>) => work(manager as never)) }
  const service = new LabsService(labsRepository as never, blocksRepository as never, dataSource as never, firewallService as never, historyService as never, auditService as never)
  return { service, labsRepository, firewallService, auditService, dataSource, manager, blocksRepository, historyService }
}

const actor = { id: '0aabce83-c7eb-4df6-a509-5722fc599339', username: 'admin', role: 'ADMIN' as const }
const requestId = '1aabce83-c7eb-4df6-a509-5722fc599339'

describe('LabsService', () => {
  it.each([
    { before: LabStatus.BLOQUEADO, after: LabStatus.LIBERADO, method: 'unblockInternet' as const },
    { before: LabStatus.LIBERADO, after: LabStatus.BLOQUEADO, method: 'blockInternet' as const },
  ])('preserves the existing $before to $after flow inside the shared transaction', async ({ before, after, method }) => {
    const { service, labsRepository, firewallService, auditService, historyService, manager } = createService()
    labsRepository.findOne.mockResolvedValue({ ...lab, status: before })

    await expect(service.updateStatus(lab.id, { status: after }, actor, requestId)).resolves.toMatchObject({ status: after, block })

    expect(firewallService[method]).toHaveBeenCalledWith(lab.subnet, lab.id)
    expect(firewallService[method].mock.invocationCallOrder[0]).toBeLessThan(labsRepository.save.mock.invocationCallOrder[0])
    expect(historyService.recordStatusChange).toHaveBeenCalledWith(manager, expect.objectContaining({ previousStatus: before, newStatus: after, user: actor, requestId }))
    expect(auditService.recordInTransaction).toHaveBeenCalledWith(manager, expect.objectContaining({ action: 'LAB_STATUS_CHANGED' }))
  })

  it('preserves the status no-op without changing firewall, history or persistence', async () => {
    const { service, labsRepository, firewallService, historyService } = createService()

    await service.updateStatus(lab.id, { status: lab.status }, actor, requestId)

    expect(labsRepository.save).not.toHaveBeenCalled()
    expect(historyService.recordStatusChange).not.toHaveBeenCalled()
    expect(firewallService.blockInternet).not.toHaveBeenCalled()
    expect(firewallService.unblockInternet).not.toHaveBeenCalled()
  })

  it('does not persist a status change when applying its firewall policy fails', async () => {
    const { service, labsRepository, firewallService, historyService } = createService({ unblockOldFailure: new Error('remote failure') })

    await expect(service.updateStatus(lab.id, { status: LabStatus.LIBERADO }, actor, requestId)).rejects.toThrow('remote failure')
    expect(firewallService.unblockInternet).toHaveBeenCalledWith(lab.subnet, lab.id)
    expect(labsRepository.save).not.toHaveBeenCalled()
    expect(historyService.recordStatusChange).not.toHaveBeenCalled()
  })

  it.each([
    { databaseStatus: LabStatus.BLOQUEADO, firewallStatus: 'bloqueado' as const, isSynchronized: true },
    { databaseStatus: LabStatus.LIBERADO, firewallStatus: 'liberado' as const, isSynchronized: true },
    { databaseStatus: LabStatus.BLOQUEADO, firewallStatus: 'liberado' as const, isSynchronized: false },
    { databaseStatus: LabStatus.LIBERADO, firewallStatus: 'bloqueado' as const, isSynchronized: false },
  ])('compares $databaseStatus in PostgreSQL with $firewallStatus in the firewall', async ({ databaseStatus, firewallStatus, isSynchronized }) => {
    const { service, labsRepository, firewallService } = createService()
    labsRepository.findOneBy.mockResolvedValue({ ...lab, status: databaseStatus })
    firewallService.observeSubnet.mockResolvedValue({ status: firewallStatus, error: null })
    const before = Date.now()

    const result = await service.checkFirewallStatus(lab.id)

    expect(result).toEqual({ labId: lab.id, subnet: lab.subnet, databaseStatus, firewallStatus, isSynchronized, checkedAt: expect.any(String), error: null })
    expect(Date.parse(result.checkedAt)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(result.checkedAt)).toBeLessThanOrEqual(Date.now())
    expect(labsRepository.findOneBy).toHaveBeenCalledWith({ id: lab.id })
    expect(firewallService.observeSubnet).toHaveBeenCalledWith(lab.subnet)
    expect(labsRepository.save).not.toHaveBeenCalled()
    expect(firewallService.blockInternet).not.toHaveBeenCalled()
    expect(firewallService.unblockInternet).not.toHaveBeenCalled()
  })

  it('returns an unknown comparison and the communication error without writes', async () => {
    const { service, labsRepository, firewallService } = createService()
    const error = { message: 'Firewall connection failed', code: 'FIREWALL_CONNECTION_FAILED' }
    firewallService.observeSubnet.mockResolvedValue({ status: 'desconhecido', error })

    await expect(service.checkFirewallStatus(lab.id)).resolves.toMatchObject({ databaseStatus: lab.status, firewallStatus: 'desconhecido', isSynchronized: null, error })
    expect(labsRepository.save).not.toHaveBeenCalled()
    expect(firewallService.blockInternet).not.toHaveBeenCalled()
    expect(firewallService.unblockInternet).not.toHaveBeenCalled()
  })

  it('returns 404 without SSH access for a missing lab', async () => {
    const { service, labsRepository, firewallService } = createService()
    labsRepository.findOneBy.mockResolvedValue(null)

    await expect(service.checkFirewallStatus(999)).rejects.toMatchObject({ status: 404, response: { message: 'Lab not found', code: 'LAB_NOT_FOUND' } })
    expect(firewallService.observeSubnet).not.toHaveBeenCalled()
  })

  it('preserves the subnet when a PATCH omits it', async () => {
    const { service, labsRepository, firewallService } = createService()

    await expect(service.update(lab.id, { name: 'Lab Renomeado' }, actor, requestId)).resolves.toMatchObject({ subnet: lab.subnet })
    expect(labsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ subnet: lab.subnet, name: 'Lab Renomeado' }))
    expect(firewallService.blockInternet).not.toHaveBeenCalled()
    expect(firewallService.unblockInternet).not.toHaveBeenCalled()
  })

  it('replaces firewall rules before persisting a blocked lab subnet change', async () => {
    const { service, labsRepository, firewallService } = createService()

    await service.update(lab.id, { subnet: '192.168.11.0/24' }, actor, requestId)

    expect(firewallService.blockInternet).toHaveBeenCalledWith('192.168.11.0/24', lab.id)
    expect(firewallService.unblockInternet).toHaveBeenCalledWith('192.168.10.0/24', lab.id)
    expect(labsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ subnet: '192.168.11.0/24' }))
  })

  it('rejects an overlapping subnet before changing the firewall', async () => {
    const { service, labsRepository, firewallService } = createService({ conflict: { ...lab, id: 2 } })

    await expect(service.update(lab.id, { subnet: '192.168.10.0/25' }, actor, requestId)).rejects.toMatchObject({ response: { code: 'LAB_SUBNET_OVERLAP' } })
    expect(labsRepository.save).not.toHaveBeenCalled()
    expect(firewallService.blockInternet).not.toHaveBeenCalled()
  })

  it('does not persist a subnet change when blocking the new subnet fails', async () => {
    const { service, labsRepository, firewallService } = createService({ blockFailure: new Error('firewall unavailable') })

    await expect(service.update(lab.id, { subnet: '192.168.11.0/24' }, actor, requestId)).rejects.toThrow('firewall unavailable')
    expect(labsRepository.save).not.toHaveBeenCalled()
    expect(firewallService.unblockInternet).not.toHaveBeenCalled()
  })

  it('compensates the new firewall rule when removing the old rule fails', async () => {
    const { service, labsRepository, firewallService } = createService({ unblockOldFailure: new Error('old rule removal failed') })

    await expect(service.update(lab.id, { subnet: '192.168.11.0/24' }, actor, requestId)).rejects.toThrow('old rule removal failed')
    expect(labsRepository.save).not.toHaveBeenCalled()
    expect(firewallService.unblockInternet).toHaveBeenLastCalledWith('192.168.11.0/24', lab.id)
  })
})

describe('LabsService reconciliation', () => {
  it.each([LabStatus.BLOQUEADO, LabStatus.LIBERADO])('does not apply changes when %s is already synchronized', async (status) => {
    const { service, labsRepository, firewallService, auditService } = createService()
    labsRepository.findOne.mockResolvedValue({ ...lab, status })
    firewallService.observeSubnet.mockResolvedValue({ status, error: null })

    await expect(service.reconcileFirewall(lab.id, actor, requestId)).resolves.toMatchObject({
      databaseStatus: status,
      firewallStatus: status,
      success: true,
      isSynchronized: true,
      changeApplied: false,
      error: null,
    })
    expect(firewallService.observeSubnet).toHaveBeenCalledTimes(1)
    expect(firewallService.blockInternet).not.toHaveBeenCalled()
    expect(firewallService.unblockInternet).not.toHaveBeenCalled()
    expect(labsRepository.save).not.toHaveBeenCalled()
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'LAB_FIREWALL_RECONCILE_REQUESTED', actor, resourceId: lab.id, requestId }))
    expect(auditService.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'LAB_FIREWALL_RECONCILED', result: AuditResult.SUCCESS, details: expect.objectContaining({ changeApplied: false }) }),
    )
  })

  it.each([
    { desired: LabStatus.BLOQUEADO, observed: LabStatus.LIBERADO, method: 'blockInternet' as const, other: 'unblockInternet' as const },
    { desired: LabStatus.LIBERADO, observed: LabStatus.BLOQUEADO, method: 'unblockInternet' as const, other: 'blockInternet' as const },
  ])('reapplies persisted $desired and confirms it after observing $observed', async ({ desired, observed, method, other }) => {
    const { service, labsRepository, firewallService, auditService } = createService()
    labsRepository.findOne.mockResolvedValue({ ...lab, status: desired })
    firewallService.observeSubnet.mockResolvedValueOnce({ status: observed, error: null }).mockResolvedValueOnce({ status: desired, error: null })

    const response = await service.reconcileFirewall(lab.id, actor, requestId)

    expect(response).toMatchObject({ labId: lab.id, subnet: lab.subnet, databaseStatus: desired, firewallStatus: desired, success: true, isSynchronized: true, changeApplied: true, error: null })
    expect(Number.isNaN(Date.parse(response.checkedAt))).toBe(false)
    expect(firewallService[method]).toHaveBeenCalledTimes(1)
    expect(firewallService[method]).toHaveBeenCalledWith(lab.subnet, lab.id)
    expect(firewallService[other]).not.toHaveBeenCalled()
    expect(firewallService.observeSubnet).toHaveBeenCalledTimes(2)
    expect(firewallService.observeSubnet.mock.invocationCallOrder[0]).toBeLessThan(firewallService[method].mock.invocationCallOrder[0])
    expect(firewallService[method].mock.invocationCallOrder[0]).toBeLessThan(firewallService.observeSubnet.mock.invocationCallOrder[1])
    expect(labsRepository.save).not.toHaveBeenCalled()
    expect(auditService.record).toHaveBeenLastCalledWith(expect.objectContaining({ result: AuditResult.SUCCESS, details: expect.objectContaining({ changeApplied: true }) }))
  })

  it.each(['FIREWALL_CONNECTION_FAILED', 'FIREWALL_TIMEOUT', 'FIREWALL_STATE_UNKNOWN'])('does not change anything when the initial observation fails with %s', async (code) => {
    const { service, labsRepository, firewallService, auditService } = createService()
    firewallService.observeSubnet.mockResolvedValue({ status: 'desconhecido', error: { message: 'Controlled failure', code } })

    await expect(service.reconcileFirewall(lab.id, actor, requestId)).rejects.toMatchObject({
      status: 502,
      response: { code, details: { success: false, changeApplied: false, firewallStatus: 'desconhecido', isSynchronized: null } },
    })
    expect(firewallService.blockInternet).not.toHaveBeenCalled()
    expect(firewallService.unblockInternet).not.toHaveBeenCalled()
    expect(labsRepository.save).not.toHaveBeenCalled()
    expect(auditService.record).toHaveBeenLastCalledWith(expect.objectContaining({ result: AuditResult.FAILURE, details: expect.objectContaining({ error: { message: 'Controlled failure', code } }) }))
  })

  it('does not claim the previous observation is final after a command failure', async () => {
    const { service, labsRepository, firewallService, auditService } = createService({
      blockFailure: new BadGatewayException({ message: 'Firewall connection failed', code: 'FIREWALL_CONNECTION_FAILED' }),
    })
    firewallService.observeSubnet.mockResolvedValue({ status: 'liberado', error: null })

    await expect(service.reconcileFirewall(lab.id, actor, requestId)).rejects.toMatchObject({
      status: 502,
      response: { code: 'FIREWALL_CONNECTION_FAILED', details: { success: false, changeApplied: null, firewallStatus: 'desconhecido', isSynchronized: null } },
    })
    expect(firewallService.observeSubnet).toHaveBeenCalledTimes(1)
    expect(labsRepository.save).not.toHaveBeenCalled()
    expect(auditService.record).toHaveBeenLastCalledWith(expect.objectContaining({ result: AuditResult.FAILURE }))
  })

  it('does not report success if the command succeeds but final verification fails', async () => {
    const { service, labsRepository, firewallService } = createService()
    firewallService.observeSubnet
      .mockResolvedValueOnce({ status: 'liberado', error: null })
      .mockResolvedValueOnce({ status: 'desconhecido', error: { message: 'Firewall operation timed out', code: 'FIREWALL_TIMEOUT' } })

    await expect(service.reconcileFirewall(lab.id, actor, requestId)).rejects.toMatchObject({
      status: 502,
      response: { code: 'FIREWALL_TIMEOUT', details: { success: false, changeApplied: true, firewallStatus: 'desconhecido', isSynchronized: null } },
    })
    expect(labsRepository.save).not.toHaveBeenCalled()
  })

  it('reports a remaining divergence without removing any other rules or retrying', async () => {
    const { service, labsRepository, firewallService } = createService()
    labsRepository.findOne.mockResolvedValue({ ...lab, status: LabStatus.LIBERADO })
    firewallService.observeSubnet.mockResolvedValue({ status: 'bloqueado', error: null })

    await expect(service.reconcileFirewall(lab.id, actor, requestId)).rejects.toMatchObject({
      status: 409,
      response: { code: 'FIREWALL_RECONCILIATION_FAILED', details: { success: false, changeApplied: true, firewallStatus: 'bloqueado', isSynchronized: false } },
    })
    expect(firewallService.unblockInternet).toHaveBeenCalledTimes(1)
    expect(firewallService.unblockInternet).toHaveBeenCalledWith(lab.subnet, lab.id)
    expect(firewallService.blockInternet).not.toHaveBeenCalled()
    expect(labsRepository.save).not.toHaveBeenCalled()
  })

  it('audits a missing lab without contacting the firewall', async () => {
    const { service, labsRepository, firewallService, auditService } = createService()
    labsRepository.findOne.mockResolvedValue(null)

    await expect(service.reconcileFirewall(999, actor, requestId)).rejects.toMatchObject({ status: 404, response: { code: 'LAB_NOT_FOUND' } })
    expect(firewallService.observeSubnet).not.toHaveBeenCalled()
    expect(auditService.record).toHaveBeenLastCalledWith(expect.objectContaining({ result: AuditResult.FAILURE, details: { code: 'LAB_NOT_FOUND' } }))
  })

  it('does not contact the firewall when the attempt cannot be audited', async () => {
    const { service, firewallService, auditService } = createService()
    auditService.record.mockRejectedValue(new Error('database unavailable'))

    await expect(service.reconcileFirewall(lab.id, actor, requestId)).rejects.toThrow('database unavailable')
    expect(firewallService.observeSubnet).not.toHaveBeenCalled()
    expect(firewallService.blockInternet).not.toHaveBeenCalled()
  })

  it.each(['reconcile', 'block', 'unblock', 'update'] as const)('rejects concurrent %s before SSH when the PostgreSQL row lock is held', async (operation) => {
    const { service, labsRepository, firewallService } = createService()
    labsRepository.findOne.mockRejectedValue({ driverError: { code: '55P03' } })
    const run = () =>
      operation === 'reconcile'
        ? service.reconcileFirewall(lab.id, actor, requestId)
        : operation === 'update'
          ? service.update(lab.id, { subnet: '192.168.11.0/24' }, actor, requestId)
          : service.updateStatus(lab.id, { status: operation === 'block' ? LabStatus.BLOQUEADO : LabStatus.LIBERADO }, actor, requestId)

    await expect(run()).rejects.toMatchObject({ status: 409, response: { code: 'LAB_OPERATION_IN_PROGRESS' } })
    expect(labsRepository.findOne).toHaveBeenCalledWith({ where: { id: lab.id }, lock: { mode: 'pessimistic_write', onLocked: 'nowait' } })
    expect(firewallService.observeSubnet).not.toHaveBeenCalled()
    expect(firewallService.blockInternet).not.toHaveBeenCalled()
    expect(firewallService.unblockInternet).not.toHaveBeenCalled()
  })
})
