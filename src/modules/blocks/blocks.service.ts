import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Block } from '../../database/entities/block.entity'
import { Lab } from '../../database/entities/lab.entity'
import { CreateBlockDto } from './dto/create-block.dto'
import { UpdateBlockDto } from './dto/update-block.dto'
import { BlockResponse } from './blocks.types'
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface'
import { AuditService } from '../audit/audit.service'

@Injectable()
export class BlocksService {
  constructor(
    @InjectRepository(Block) private readonly blocksRepository: Repository<Block>,
    @InjectRepository(Lab) private readonly labsRepository: Repository<Lab>,
    private readonly auditService: AuditService,
  ) {}

  async create(data: CreateBlockDto, user: AuthenticatedUser, requestId: string): Promise<BlockResponse> {
    try {
      const block = await this.blocksRepository.save(this.blocksRepository.create(data))
      await this.auditService.record({ actor: user, action: 'BLOCK_CREATED', resourceType: 'BLOCK', resourceId: block.id, requestId, details: { name: block.name } })
      return this.toResponse(block)
    } catch (error) {
      this.handleUniqueViolation(error)
    }
  }

  async findAll(): Promise<BlockResponse[]> {
    const blocks = await this.blocksRepository.find({ order: { name: 'ASC' } })
    return blocks.map((block) => this.toResponse(block))
  }

  async findOne(id: string): Promise<BlockResponse> {
    return this.toResponse(await this.getById(id))
  }

  async update(id: string, data: UpdateBlockDto, user: AuthenticatedUser, requestId: string): Promise<BlockResponse> {
    const block = await this.getById(id)
    const previousName = block.name
    block.name = data.name

    try {
      const updated = await this.blocksRepository.save(block)
      await this.auditService.record({ actor: user, action: 'BLOCK_UPDATED', resourceType: 'BLOCK', resourceId: id, requestId, details: { before: { name: previousName }, after: { name: updated.name } } })
      return this.toResponse(updated)
    } catch (error) {
      this.handleUniqueViolation(error)
    }
  }

  async remove(id: string, user: AuthenticatedUser, requestId: string): Promise<void> {
    const block = await this.getById(id)

    if (await this.labsRepository.exists({ where: { blockId: id } })) {
      throw new ConflictException({ message: 'Block is in use by one or more labs', code: 'BLOCK_IN_USE' })
    }

    await this.blocksRepository.remove(block)
    await this.auditService.record({ actor: user, action: 'BLOCK_DELETED', resourceType: 'BLOCK', resourceId: id, requestId, details: { name: block.name } })
  }

  private async getById(id: string): Promise<Block> {
    const block = await this.blocksRepository.findOneBy({ id })

    if (!block) {
      throw new NotFoundException({ message: 'Block not found', code: 'BLOCK_NOT_FOUND' })
    }

    return block
  }

  private handleUniqueViolation(error: unknown): never {
    if ((error as { driverError?: { constraint?: string } }).driverError?.constraint === 'UQ_blocks_name') {
      throw new ConflictException({ message: 'Block name is already in use', code: 'BLOCK_NAME_ALREADY_EXISTS' })
    }

    throw error
  }

  private toResponse(block: Block): BlockResponse {
    return { id: block.id, name: block.name, createdAt: block.createdAt }
  }
}
