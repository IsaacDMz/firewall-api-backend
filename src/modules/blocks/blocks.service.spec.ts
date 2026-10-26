import { jest } from '@jest/globals'
import { BlocksService } from './blocks.service'

const block = {
  id: 'faabce83-c7eb-4df6-a509-5722fc599339',
  name: 'Bloco A',
  createdAt: new Date('2026-10-26T00:00:00.000Z'),
}

describe('BlocksService', () => {
  it('creates a block', async () => {
    const blocksRepository = {
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ ...block, ...data })),
    }
    const service = new BlocksService(blocksRepository as never, {} as never)

    await expect(service.create({ name: block.name })).resolves.toEqual({
      id: block.id,
      name: block.name,
      createdAt: block.createdAt,
    })
  })

  it('lists blocks ordered by name', async () => {
    const blocksRepository = { find: jest.fn(async () => [block]) }
    const service = new BlocksService(blocksRepository as never, {} as never)

    await expect(service.findAll()).resolves.toHaveLength(1)
    expect(blocksRepository.find).toHaveBeenCalledWith({ order: { name: 'ASC' } })
  })

  it('does not remove a block that is in use by a lab', async () => {
    const blocksRepository = { findOneBy: jest.fn(async () => block), remove: jest.fn() }
    const labsRepository = { exists: jest.fn(async () => true) }
    const service = new BlocksService(blocksRepository as never, labsRepository as never)

    await expect(service.remove(block.id)).rejects.toMatchObject({ response: { code: 'BLOCK_IN_USE' } })
    expect(blocksRepository.remove).not.toHaveBeenCalled()
  })
})
