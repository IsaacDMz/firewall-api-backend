import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Block } from '../../database/entities/block.entity'
import { Lab } from '../../database/entities/lab.entity'
import { CreateBlockDto } from './dto/create-block.dto'
import { UpdateBlockDto } from './dto/update-block.dto'
import { BlockResponse } from './blocks.types'

@Injectable()
export class BlocksService {
  constructor(
    @InjectRepository(Block) private readonly blocksRepository: Repository<Block>,
    @InjectRepository(Lab) private readonly labsRepository: Repository<Lab>,
  ) {}

  async create(data: CreateBlockDto): Promise<BlockResponse> {
    try {
      return this.toResponse(await this.blocksRepository.save(this.blocksRepository.create(data)))
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

  async update(id: string, data: UpdateBlockDto): Promise<BlockResponse> {
    const block = await this.getById(id)
    block.name = data.name

    try {
      return this.toResponse(await this.blocksRepository.save(block))
    } catch (error) {
      this.handleUniqueViolation(error)
    }
  }

  async remove(id: string): Promise<void> {
    const block = await this.getById(id)

    if (await this.labsRepository.exists({ where: { blockId: id } })) {
      throw new ConflictException({ message: 'Block is in use by one or more labs', code: 'BLOCK_IN_USE' })
    }

    await this.blocksRepository.remove(block)
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
