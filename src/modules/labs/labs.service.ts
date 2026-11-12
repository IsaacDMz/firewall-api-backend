import { BadGatewayException, BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface'
import { Block } from '../../database/entities/block.entity'
import { Lab, LabStatus } from '../../database/entities/lab.entity'
import { AuditResult } from '../../database/entities/audit-log.entity'
import { FirewallService } from '../firewall/firewall.service'
import { HistoryService } from '../history/history.service'
import { AuditService } from '../audit/audit.service'
import { CreateLabDto } from './dto/create-lab.dto'
import { ListLabsQueryDto } from './dto/list-labs-query.dto'
import { UpdateLabStatusDto } from './dto/update-lab-status.dto'
import { UpdateLabDto } from './dto/update-lab.dto'
import { LabFirewallReconcileResponse, LabFirewallStatusResponse, LabResponse } from './labs.types'

@Injectable()
export class LabsService {
  constructor(
    @InjectRepository(Lab) private readonly labsRepository: Repository<Lab>,
    @InjectRepository(Block) private readonly blocksRepository: Repository<Block>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly firewallService: FirewallService,
    private readonly historyService: HistoryService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: ListLabsQueryDto = {}): Promise<LabResponse[]> {
    const labs = await this.labsRepository.find({
      ...(query.blockId !== undefined ? { where: { blockId: query.blockId } } : {}),
      relations: { block: true },
      order: { name: 'ASC' },
    })
    return labs.map((lab) => this.toResponse(lab))
  }

  async checkFirewallStatus(id: number): Promise<LabFirewallStatusResponse> {
    const lab = await this.labsRepository.findOneBy({ id })
    if (!lab) {
      throw new NotFoundException({ message: 'Lab not found', code: 'LAB_NOT_FOUND' })
    }

    const observation = await this.firewallService.observeSubnet(lab.subnet)
    return {
      labId: lab.id,
      subnet: lab.subnet,
      databaseStatus: lab.status,
      firewallStatus: observation.status,
      isSynchronized: observation.status === 'desconhecido' ? null : lab.status === observation.status,
      checkedAt: new Date().toISOString(),
      error: observation.error,
    }
  }

  async reconcileFirewall(id: number, user: AuthenticatedUser, requestId: string): Promise<LabFirewallReconcileResponse> {
    const event = { actor: user, resourceType: 'LAB' as const, resourceId: id, requestId }
    await this.auditService.record({ ...event, action: 'LAB_FIREWALL_RECONCILE_REQUESTED' })

    let result: LabFirewallReconcileResponse
    try {
      result = await this.withLockedLab(id, (_manager, lab) => this.applyStoredPolicy(lab))
    } catch (error) {
      const response = error instanceof HttpException ? error.getResponse() : null
      const code = typeof response === 'object' && response !== null && 'code' in response ? response.code : 'INTERNAL_SERVER_ERROR'
      await this.auditService.record({ ...event, action: 'LAB_FIREWALL_RECONCILED', result: AuditResult.FAILURE, details: { code } })
      throw error
    }

    await this.auditService.record({ ...event, action: 'LAB_FIREWALL_RECONCILED', result: result.success ? AuditResult.SUCCESS : AuditResult.FAILURE, details: { ...result } })
    if (!result.success) {
      const error = { ...result.error!, details: result }
      if (result.error?.code === 'FIREWALL_RECONCILIATION_FAILED') throw new ConflictException(error)
      throw new BadGatewayException(error)
    }
    return result
  }

  private async applyStoredPolicy(lab: Lab): Promise<LabFirewallReconcileResponse> {
    let observation = await this.firewallService.observeSubnet(lab.subnet)
    let changeApplied: boolean | null = false

    if (observation.status !== 'desconhecido' && !observation.error && observation.status !== lab.status) {
      try {
        if (lab.status === LabStatus.BLOQUEADO) await this.firewallService.blockInternet(lab.subnet, lab.id)
        else await this.firewallService.unblockInternet(lab.subnet, lab.id)
        changeApplied = true
      } catch (error) {
        // A remote command may have taken effect before its connection failed.
        changeApplied = null
        const response = error instanceof BadGatewayException ? error.getResponse() : null
        const failure =
          typeof response === 'object' && response !== null && 'message' in response && typeof response.message === 'string' && 'code' in response && typeof response.code === 'string'
            ? { message: response.message, code: response.code }
            : { message: 'Firewall command failed', code: 'FIREWALL_COMMAND_FAILED' }
        observation = { status: 'desconhecido', error: failure }
      }

      if (changeApplied === true) observation = await this.firewallService.observeSubnet(lab.subnet)
    }

    const isSynchronized = observation.status === 'desconhecido' ? null : observation.status === lab.status
    const error =
      observation.error ??
      (isSynchronized === null
        ? { message: 'Firewall state could not be determined', code: 'FIREWALL_STATE_UNKNOWN' }
        : isSynchronized === false
          ? { message: 'Firewall remains out of sync; manual intervention is required', code: 'FIREWALL_RECONCILIATION_FAILED' }
          : null)
    return {
      labId: lab.id,
      subnet: lab.subnet,
      databaseStatus: lab.status,
      firewallStatus: observation.status,
      isSynchronized,
      checkedAt: new Date().toISOString(),
      error,
      success: isSynchronized === true && error === null,
      changeApplied,
    }
  }

  async create(data: CreateLabDto, user: AuthenticatedUser, requestId: string): Promise<LabResponse> {
    const status = data.status ?? LabStatus.BLOQUEADO
    await this.getBlock(data.blockId)
    await this.ensureSubnetAvailable(data.subnet)

    try {
      if (status === LabStatus.BLOQUEADO) {
        const response = await this.dataSource.transaction(async (manager) => {
          const labs = manager.getRepository(Lab)
          const lab = await labs.save(labs.create({ name: data.name, blockId: data.blockId, subnet: data.subnet, status }))
          await this.firewallService.blockInternet(lab.subnet, lab.id)
          return this.toResponse(await labs.findOneOrFail({ where: { id: lab.id }, relations: { block: true } }))
        })
        await this.auditService.record({ actor: user, action: 'LAB_CREATED', resourceType: 'LAB', resourceId: response.id, requestId, details: { name: response.name, blockId: data.blockId, subnet: response.subnet, status: response.status } })
        return response
      }

      const lab = this.labsRepository.create({ name: data.name, blockId: data.blockId, subnet: data.subnet, status })
      const saved = await this.labsRepository.save(lab)
      const response = this.toResponse(await this.labsRepository.findOneOrFail({ where: { id: saved.id }, relations: { block: true } }))
      await this.auditService.record({ actor: user, action: 'LAB_CREATED', resourceType: 'LAB', resourceId: response.id, requestId, details: { name: response.name, blockId: data.blockId, subnet: response.subnet, status: response.status } })
      return response
    } catch (error) {
      this.handleUniqueViolation(error)
    }
  }

  async update(id: number, data: UpdateLabDto, user: AuthenticatedUser, requestId: string): Promise<LabResponse> {
    return this.withLockedLab(id, (manager) => this.updateLocked(id, data, user, requestId, manager))
  }

  private async updateLocked(id: number, data: UpdateLabDto, user: AuthenticatedUser, requestId: string, manager: EntityManager): Promise<LabResponse> {
    const labs = manager.getRepository(Lab)
    const lab = await labs.findOne({ where: { id }, relations: { block: true } })

    if (!lab) {
      throw new NotFoundException({ message: 'Lab not found', code: 'LAB_NOT_FOUND' })
    }

    const subnet = data.subnet ?? lab.subnet
    const subnetChanged = subnet !== lab.subnet

    if (subnetChanged) {
      await this.ensureSubnetAvailable(subnet, lab.id, labs)
    }

    if (data.blockId && data.blockId !== lab.blockId) {
      await this.getBlock(data.blockId, manager.getRepository(Block))
    }

    let firewallChanged = false

    if (subnetChanged && lab.status === LabStatus.BLOQUEADO) {
      await this.firewallService.blockInternet(subnet, lab.id)
      firewallChanged = true

      try {
        await this.firewallService.unblockInternet(lab.subnet, lab.id)
      } catch (error) {
        await this.compensateFirewallSubnetChange(lab.subnet, subnet, lab.id, false)
        throw error
      }
    }

    try {
      const updated = await labs.save({
        ...lab,
        name: data.name ?? lab.name,
        blockId: data.blockId ?? lab.blockId,
        subnet,
      })
      const response = this.toResponse(await labs.findOneOrFail({ where: { id: updated.id }, relations: { block: true } }))
      await this.auditService.recordInTransaction(manager, {
        actor: user,
        action: 'LAB_UPDATED',
        resourceType: 'LAB',
        resourceId: id,
        requestId,
        details: { before: { name: lab.name, blockId: lab.blockId, subnet: lab.subnet }, after: { name: response.name, blockId: updated.blockId, subnet: response.subnet } },
      })
      return response
    } catch (error) {
      if (firewallChanged) {
        await this.compensateFirewallSubnetChange(lab.subnet, subnet, lab.id, true)
      }
      this.handleUniqueViolation(error)
    }
  }

  async updateStatus(id: number, data: UpdateLabStatusDto, user: AuthenticatedUser, requestId: string): Promise<LabResponse> {
    return this.withLockedLab(id, (manager) => this.updateStatusLocked(id, data, user, requestId, manager))
  }

  private async updateStatusLocked(id: number, data: UpdateLabStatusDto, user: AuthenticatedUser, requestId: string, manager: EntityManager): Promise<LabResponse> {
    const labs = manager.getRepository(Lab)
    const lab = await labs.findOne({ where: { id }, relations: { block: true } })

    if (!lab) {
      throw new NotFoundException({ message: 'Lab not found', code: 'LAB_NOT_FOUND' })
    }

    if (lab.status === data.status) {
      return this.toResponse(lab)
    }

    if (data.status === LabStatus.BLOQUEADO) {
      await this.firewallService.blockInternet(lab.subnet, lab.id)
    } else {
      await this.firewallService.unblockInternet(lab.subnet, lab.id)
    }

    const previousStatus = lab.status
    const updated = await labs.save({ ...lab, status: data.status })
    await this.historyService.recordStatusChange(manager, { user, lab, previousStatus, newStatus: data.status, requestId })
    await this.auditService.recordInTransaction(manager, {
      actor: user,
      action: 'LAB_STATUS_CHANGED',
      resourceType: 'LAB',
      resourceId: lab.id,
      requestId,
      details: { previousStatus, newStatus: data.status },
    })
    return this.toResponse(updated)
  }

  private async withLockedLab<T>(id: number, operation: (manager: EntityManager, lab: Lab) => Promise<T>): Promise<T> {
    if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
      throw new BadRequestException({ message: 'Lab ID must be a positive 32-bit integer', code: 'BAD_REQUEST' })
    }
    try {
      return await this.dataSource.transaction(async (manager) => {
        // Lock only the lab row, avoiding a lock on the nullable side of a relation join.
        const lab = await manager.getRepository(Lab).findOne({ where: { id }, lock: { mode: 'pessimistic_write', onLocked: 'nowait' } })
        if (!lab) throw new NotFoundException({ message: 'Lab not found', code: 'LAB_NOT_FOUND' })
        return operation(manager, lab)
      })
    } catch (error) {
      if ((error as { driverError?: { code?: string } }).driverError?.code === '55P03') {
        throw new ConflictException({ message: 'Another operation is in progress for this lab', code: 'LAB_OPERATION_IN_PROGRESS' })
      }
      throw error
    }
  }

  private handleUniqueViolation(error: unknown): never {
    const constraint = (error as { driverError?: { constraint?: string } }).driverError?.constraint

    if (constraint === 'UQ_labs_name') {
      throw new ConflictException({ message: 'Lab name is already in use', code: 'LAB_NAME_ALREADY_EXISTS' })
    }

    if (constraint === 'UQ_labs_subnet') {
      throw new ConflictException({ message: 'Lab subnet is already in use', code: 'LAB_SUBNET_ALREADY_EXISTS' })
    }

    if (constraint === 'EX_labs_subnet_no_overlap') {
      throw new ConflictException({ message: 'Lab subnet overlaps an existing lab subnet', code: 'LAB_SUBNET_OVERLAP' })
    }

    throw error
  }

  private toResponse(lab: Lab): LabResponse {
    return {
      id: lab.id,
      name: lab.name,
      block: { id: lab.block.id, name: lab.block.name },
      subnet: lab.subnet,
      status: lab.status,
    }
  }

  private async getBlock(id: string, blocks = this.blocksRepository): Promise<Block> {
    const block = await blocks.findOneBy({ id })

    if (!block) {
      throw new NotFoundException({ message: 'Block not found', code: 'BLOCK_NOT_FOUND' })
    }

    return block
  }

  private async ensureSubnetAvailable(subnet: string, currentLabId?: number, labs = this.labsRepository): Promise<void> {
    const query = labs.createQueryBuilder('lab').where('CAST(lab.subnet AS cidr) && CAST(:subnet AS cidr)', { subnet })

    if (currentLabId !== undefined) {
      query.andWhere('lab.id != :currentLabId', { currentLabId })
    }

    if (await query.getOne()) {
      throw new ConflictException({ message: 'Lab subnet overlaps an existing lab subnet', code: 'LAB_SUBNET_OVERLAP' })
    }
  }

  private async compensateFirewallSubnetChange(oldSubnet: string, newSubnet: string, labId: number, restoreOldRule: boolean): Promise<void> {
    if (restoreOldRule) {
      try {
        await this.firewallService.blockInternet(oldSubnet, labId)
      } catch {
        // The original persistence error remains the response; the remote operation did not complete.
      }
    }

    try {
      await this.firewallService.unblockInternet(newSubnet, labId)
    } catch {
      // The original failure remains the response; a later reconciliation can remove the stale rule.
    }
  }
}
