import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface'
import { Lab, LabStatus } from '../../database/entities/lab.entity'
import { FirewallService } from '../firewall/firewall.service'
import { HistoryService } from '../history/history.service'
import { CreateLabDto } from './dto/create-lab.dto'
import { UpdateLabStatusDto } from './dto/update-lab-status.dto'
import { LabResponse } from './labs.types'

@Injectable()
export class LabsService {
  constructor(
    @InjectRepository(Lab) private readonly labsRepository: Repository<Lab>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly firewallService: FirewallService,
    private readonly historyService: HistoryService,
  ) {}

  async findAll(): Promise<LabResponse[]> {
    const labs = await this.labsRepository.find({ order: { name: 'ASC' } })
    return labs.map((lab) => this.toResponse(lab))
  }

  async create(data: CreateLabDto): Promise<LabResponse> {
    const status = data.status ?? LabStatus.BLOQUEADO

    if (status === LabStatus.BLOQUEADO) {
      return this.dataSource.transaction(async (manager) => {
        const labs = manager.getRepository(Lab)
        const lab = await labs.save(labs.create({ name: data.name, block: data.block, subnet: data.subnet, status }))
        await this.firewallService.blockInternet(lab.subnet, lab.id)
        return this.toResponse(lab)
      })
    }

    try {
      const lab = this.labsRepository.create({ name: data.name, block: data.block, subnet: data.subnet, status })
      return this.toResponse(await this.labsRepository.save(lab))
    } catch (error) {
      this.handleUniqueViolation(error)
    }
  }

  async updateStatus(id: number, data: UpdateLabStatusDto, user: AuthenticatedUser): Promise<LabResponse> {
    const lab = await this.labsRepository.findOneBy({ id })

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

    throw error
  }

  private toResponse(lab: Lab): LabResponse {
    return {
      id: lab.id,
      name: lab.name,
      block: lab.block,
      subnet: lab.subnet,
      status: lab.status,
    }
  }
}
