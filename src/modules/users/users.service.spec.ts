import { jest } from '@jest/globals'
import { UserRole } from '../../database/entities/user.entity'
import { UsersService } from './users.service'

const actor = { id: '0aabce83-c7eb-4df6-a509-5722fc599339', username: 'admin', role: UserRole.ADMIN }
const auditService = { record: jest.fn(async () => undefined) }

describe('UsersService', () => {
  it('creates every public registration as an inactive professor', async () => {
    const repository = {
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 'user-id', ...data })),
    }
    const service = new UsersService(repository as never, auditService as never)

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

  it('promotes an existing user to administrator', async () => {
    const user = { id: 'faabce83-c7eb-4df6-a509-5722fc599339', username: 'professor', role: UserRole.PROFESSOR }
    const repository = {
      findOneBy: jest.fn(async () => user),
      save: jest.fn(async (data) => data),
    }
    const service = new UsersService(repository as never, auditService as never)

    await expect(service.promoteToAdmin(user.id, actor, '1aabce83-c7eb-4df6-a509-5722fc599339')).resolves.toMatchObject({ role: UserRole.ADMIN })
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ role: UserRole.ADMIN }))
  })

  it('fails with USER_NOT_FOUND when promoting an unknown user', async () => {
    const repository = { findOneBy: jest.fn(async () => null) }
    const service = new UsersService(repository as never, auditService as never)

    await expect(service.promoteToAdmin('faabce83-c7eb-4df6-a509-5722fc599339', actor, '1aabce83-c7eb-4df6-a509-5722fc599339')).rejects.toMatchObject({
      response: { code: 'USER_NOT_FOUND' },
    })
  })

  it('lists users ordered by username', async () => {
    const users = [{ username: 'ana' }, { username: 'bruno' }]
    const repository = { find: jest.fn(async () => users) }
    const service = new UsersService(repository as never, auditService as never)

    await expect(service.findAll()).resolves.toEqual(users)
    expect(repository.find).toHaveBeenCalledWith({ order: { username: 'ASC' } })
  })

  it('updates activation without changing the user role', async () => {
    const user = { id: 'faabce83-c7eb-4df6-a509-5722fc599339', username: 'professor', role: UserRole.PROFESSOR, isActive: false }
    const repository = {
      findOneBy: jest.fn(async () => user),
      save: jest.fn(async (data) => data),
    }
    const service = new UsersService(repository as never, auditService as never)

    await expect(service.setActivation(user.id, true, actor, '1aabce83-c7eb-4df6-a509-5722fc599339')).resolves.toMatchObject({ isActive: true, role: UserRole.PROFESSOR })
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: true, role: UserRole.PROFESSOR }))
  })

  it('deactivates an active user without changing their role', async () => {
    const user = { id: 'faabce83-c7eb-4df6-a509-5722fc599339', username: 'admin2', role: UserRole.ADMIN, isActive: true }
    const repository = {
      findOneBy: jest.fn(async () => user),
      save: jest.fn(async (data) => data),
    }
    const service = new UsersService(repository as never, auditService as never)

    await expect(service.setActivation(user.id, false, actor, '1aabce83-c7eb-4df6-a509-5722fc599339')).resolves.toMatchObject({ isActive: false, role: UserRole.ADMIN })
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false, role: UserRole.ADMIN }))
  })

  it('fails with USER_NOT_FOUND when updating an unknown user activation', async () => {
    const repository = { findOneBy: jest.fn(async () => null) }
    const service = new UsersService(repository as never, auditService as never)

    await expect(service.setActivation('faabce83-c7eb-4df6-a509-5722fc599339', true, actor, '1aabce83-c7eb-4df6-a509-5722fc599339')).rejects.toMatchObject({
      response: { code: 'USER_NOT_FOUND' },
    })
  })

  it('does not allow a user to deactivate their own account', async () => {
    const repository = { findOneBy: jest.fn(), save: jest.fn() }
    const service = new UsersService(repository as never, auditService as never)
    const userId = 'faabce83-c7eb-4df6-a509-5722fc599339'

    await expect(service.setActivation(userId, false, { ...actor, id: userId }, '1aabce83-c7eb-4df6-a509-5722fc599339')).rejects.toMatchObject({
      response: { code: 'SELF_DEACTIVATION_NOT_ALLOWED' },
    })
    expect(repository.findOneBy).not.toHaveBeenCalled()
    expect(repository.save).not.toHaveBeenCalled()
  })
})
