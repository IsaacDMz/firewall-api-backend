import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface'
import { Block } from '../../database/entities/block.entity'
import { Lab, LabStatus } from '../../database/entities/lab.entity'
import { FirewallService } from '../firewall/firewall.service'
import { HistoryService } from '../history/history.service'
import { CreateLabDto } from './dto/create-lab.dto'
import { UpdateLabStatusDto } from './dto/update-lab-status.dto'
import { UpdateLabDto } from './dto/update-lab.dto'
import { LabResponse } from './labs.types'

@Injectable()
export class LabsService {
  constructor(
    @InjectRepository(Lab) private readonly labsRepository: Repository<Lab>,
    @InjectRepository(Block) private readonly blocksRepository: Repository<Block>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly firewallService: FirewallService,
    private readonly historyService: HistoryService,
  ) {}

  async findAll(): Promise<LabResponse[]> {
    const labs = await this.labsRepository.find({ relations: { block: true }, order: { name: 'ASC' } })
    return labs.map((lab) => this.toResponse(lab))
  }

  async create(data: CreateLabDto): Promise<LabResponse> {
    const status = data.status ?? LabStatus.BLOQUEADO
    await this.getBlock(data.blockId)
    await this.ensureSubnetAvailable(data.subnet)

    try {
      if (status === LabStatus.BLOQUEADO) {
        return await this.dataSource.transaction(async (manager) => {
          const labs = manager.getRepository(Lab)
          const lab = await labs.save(labs.create({ name: data.name, blockId: data.blockId, subnet: data.subnet, status }))
          await this.firewallService.blockInternet(lab.subnet, lab.id)
          return this.toResponse(await labs.findOneOrFail({ where: { id: lab.id }, relations: { block: true } }))
        })
      }

      const lab = this.labsRepository.create({ name: data.name, blockId: data.blockId, subnet: data.subnet, status })
      const saved = await this.labsRepository.save(lab)
      return this.toResponse(await this.labsRepository.findOneOrFail({ where: { id: saved.id }, relations: { block: true } }))
    } catch (error) {
      this.handleUniqueViolation(error)
    }
  }

  async update(id: number, data: UpdateLabDto): Promise<LabResponse> {
    const lab = await this.labsRepository.findOne({ where: { id }, relations: { block: true } })

    if (!lab) {
      throw new NotFoundException({ message: 'Lab not found', code: 'LAB_NOT_FOUND' })
    }

    const subnet = data.subnet ?? lab.subnet
    const subnetChanged = subnet !== lab.subnet

    if (subnetChanged) {
      await this.ensureSubnetAvailable(subnet, lab.id)
    }

    if (data.blockId && data.blockId !== lab.blockId) {
      await this.getBlock(data.blockId)
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
      const updated = await this.labsRepository.save({
        ...lab,
        name: data.name ?? lab.name,
        blockId: data.blockId ?? lab.blockId,
        subnet,
      })
      return this.toResponse(await this.labsRepository.findOneOrFail({ where: { id: updated.id }, relations: { block: true } }))
    } catch (error) {
      if (firewallChanged) {
        await this.compensateFirewallSubnetChange(lab.subnet, subnet, lab.id, true)
      }
      this.handleUniqueViolation(error)
    }
  }

  async updateStatus(id: number, data: UpdateLabStatusDto, user: AuthenticatedUser): Promise<LabResponse> {
    const lab = await this.labsRepository.findOne({ where: { id }, relations: { block: true } })

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

    const updatedLab = await this.dataSource.transaction(async (manager) => {
      const labs = manager.getRepository(Lab)
      const previousStatus = lab.status
      const updated = await labs.save({ ...lab, status: data.status })

      await this.historyService.recordStatusChange(manager, {
        user,
        lab,
        previousStatus,
        newStatus: data.status,
      })

      return updated
    })

    return this.toResponse(updatedLab)
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

  private async getBlock(id: string): Promise<Block> {
    const block = await this.blocksRepository.findOneBy({ id })

    if (!block) {
      throw new NotFoundException({ message: 'Block not found', code: 'BLOCK_NOT_FOUND' })
    }

    return block
  }

  private async ensureSubnetAvailable(subnet: string, currentLabId?: number): Promise<void> {
    const query = this.labsRepository.createQueryBuilder('lab').where('lab.subnet && CAST(:subnet AS cidr)', { subnet })

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
