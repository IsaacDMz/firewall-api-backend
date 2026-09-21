import { jest } from '@jest/globals'
import { UserRole } from '../../database/entities/user.entity'
import { UsersService } from './users.service'

describe('UsersService', () => {
  it('creates every public registration as an inactive professor', async () => {
    const repository = {
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 'user-id', ...data })),
    }
    const service = new UsersService(repository as never)

    const user = await service.createPendingProfessor({
      username: 'professor',
      email: 'professor@example.com',
      passwordHash: 'hash',
    })

    expect(repository.create).toHaveBeenCalledWith({
      username: 'professor',
      email: 'professor@example.com',
      passwordHash: 'hash',
      role: UserRole.PROFESSOR,
      isActive: false,
    })
    expect(user).toMatchObject({ role: UserRole.PROFESSOR, isActive: false })
  })
})
