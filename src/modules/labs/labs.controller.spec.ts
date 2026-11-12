import { INestApplication, ValidationPipe } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { jest } from '@jest/globals'
import request from 'supertest'
import { FindManyOptions } from 'typeorm'
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter'
import { Lab, LabStatus } from '../../database/entities/lab.entity'
import { UserRole } from '../../database/entities/user.entity'
import { FirewallObservation } from '../firewall/firewall.types'
import { UsersService } from '../users/users.service'
import { LabsController } from './labs.controller'
import { LabsService } from './labs.service'

const blockA = { id: 'faabce83-c7eb-4df6-a509-5722fc599339', name: 'Bloco A' }
const blockB = { id: '0aabce83-c7eb-4df6-a509-5722fc599339', name: 'Bloco B' }
const emptyBlockId = '1aabce83-c7eb-4df6-a509-5722fc599339'
const labs = [
  { id: 2, name: 'Lab B', block: blockB, blockId: blockB.id, subnet: '192.168.20.0/24', status: LabStatus.LIBERADO },
  { id: 3, name: 'Lab C', block: blockA, blockId: blockA.id, subnet: '192.168.30.0/24', status: LabStatus.BLOQUEADO },
  { id: 1, name: 'Lab A', block: blockA, blockId: blockA.id, subnet: '192.168.10.0/24', status: LabStatus.BLOQUEADO },
]
const responseFor = (ids: number[]) =>
  ids.map((id) => {
    const { id: labId, name, block, subnet, status } = labs.find((lab) => lab.id === id)!
    return { id: labId, name, block, subnet, status }
  })

describe('LabsController listing', () => {
  let app: INestApplication
  const labsRepository = {
    find: jest.fn<(options?: FindManyOptions<Lab>) => Promise<Lab[]>>(),
    findOneBy: jest.fn(async ({ id }: { id: number }) => (labs.find((lab) => lab.id === id) as Lab | undefined) ?? null),
  }
  const firewallService = { observeSubnet: jest.fn(async (): Promise<FirewallObservation> => ({ status: 'bloqueado', error: null })) }
  const usersService = { findById: jest.fn(async () => ({ isActive: true })) }

  beforeAll(async () => {
    const service = new LabsService(labsRepository as never, {} as never, {} as never, firewallService as never, {} as never, {} as never)
    const module = await Test.createTestingModule({
      controllers: [LabsController],
      providers: [
        { provide: LabsService, useValue: service },
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: { verifyAsync: jest.fn(async () => ({ sub: 'user-id', username: 'professor', role: UserRole.PROFESSOR, type: 'access' })) } },
      ],
    }).compile()
    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    app.useGlobalFilters(new HttpExceptionFilter())
    await app.init()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    usersService.findById.mockResolvedValue({ isActive: true })
    firewallService.observeSubnet.mockResolvedValue({ status: 'bloqueado', error: null })
    labsRepository.find.mockImplementation(async (options) => {
      const where = options?.where as { blockId?: string } | undefined
      return labs.filter((lab) => where?.blockId === undefined || lab.blockId === where.blockId).sort((a, b) => a.name.localeCompare(b.name)) as Lab[]
    })
  })

  afterAll(async () => {
    await app.close()
  })

  it.each([
    { description: 'all labs without a filter', query: '', blockId: undefined, ids: [1, 2, 3] },
    { description: 'only labs in block A', query: `?blockId=${blockA.id}`, blockId: blockA.id, ids: [1, 3] },
    { description: 'only labs in block B', query: `?blockId=${blockB.id}`, blockId: blockB.id, ids: [2] },
    { description: 'an empty array for a block without labs', query: `?blockId=${emptyBlockId}`, blockId: emptyBlockId, ids: [] },
  ])('returns $description, preserving fields and name ordering', async ({ query, blockId, ids }) => {
    await request(app.getHttpServer()).get(`/api/labs${query}`).auth('test-token', { type: 'bearer' }).expect(200).expect(responseFor(ids))

    expect(labsRepository.find).toHaveBeenCalledTimes(1)
    expect(labsRepository.find).toHaveBeenCalledWith({
      ...(blockId !== undefined ? { where: { blockId } } : {}),
      relations: { block: true },
      order: { name: 'ASC' },
    })
  })

  it.each(['1', 'invalid', '', 'null', 'faabce83-c7eb-1df6-a509-5722fc599339', `${blockA.id}&blockId=${blockB.id}`])('rejects invalid blockId %s before querying the repository', async (blockId) => {
    await request(app.getHttpServer()).get(`/api/labs?blockId=${blockId}`).auth('test-token', { type: 'bearer' }).expect(400).expect({ message: 'blockId must be a UUID', code: 'BAD_REQUEST' })

    expect(labsRepository.find).not.toHaveBeenCalled()
  })

  it('requires authentication when filtering by block', async () => {
    await request(app.getHttpServer()).get(`/api/labs?blockId=${blockA.id}`).expect(401).expect({ message: 'Authentication required', code: 'AUTH_UNAUTHORIZED' })

    expect(labsRepository.find).not.toHaveBeenCalled()
  })

  it('rejects inactive users when filtering by block', async () => {
    usersService.findById.mockResolvedValue({ isActive: false })

    await request(app.getHttpServer()).get(`/api/labs?blockId=${blockA.id}`).auth('test-token', { type: 'bearer' }).expect(403).expect({ message: 'Account is inactive', code: 'ACCOUNT_INACTIVE' })

    expect(labsRepository.find).not.toHaveBeenCalled()
  })

  it('exposes the consistency check as a read-only authenticated GET', async () => {
    await request(app.getHttpServer())
      .get('/api/labs/1/firewall-status')
      .auth('test-token', { type: 'bearer' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          labId: 1,
          subnet: '192.168.10.0/24',
          databaseStatus: 'bloqueado',
          firewallStatus: 'bloqueado',
          isSynchronized: true,
          checkedAt: expect.any(String),
          error: null,
        })
        expect(new Date(body.checkedAt).toISOString()).toBe(body.checkedAt)
      })

    expect(firewallService.observeSubnet).toHaveBeenCalledWith('192.168.10.0/24')
  })

  it('returns HTTP 200 with unknown state and a controlled error when the router is inaccessible', async () => {
    const error = { message: 'Firewall connection failed', code: 'FIREWALL_CONNECTION_FAILED' }
    firewallService.observeSubnet.mockResolvedValue({ status: 'desconhecido', error })

    await request(app.getHttpServer())
      .get('/api/labs/1/firewall-status')
      .auth('test-token', { type: 'bearer' })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ firewallStatus: 'desconhecido', isSynchronized: null, error }))
  })

  it.each([
    { id: 'invalid', status: 400, code: 'BAD_REQUEST' },
    { id: '999', status: 404, code: 'LAB_NOT_FOUND' },
  ])('returns $status for lab ID $id without contacting the firewall', async ({ id, status, code }) => {
    await request(app.getHttpServer())
      .get(`/api/labs/${id}/firewall-status`)
      .auth('test-token', { type: 'bearer' })
      .expect(status)
      .expect(({ body }) => expect(body).toMatchObject({ message: expect.any(String), code }))

    expect(firewallService.observeSubnet).not.toHaveBeenCalled()
  })

  it('requires authentication for consistency checks', async () => {
    await request(app.getHttpServer()).get('/api/labs/1/firewall-status').expect(401).expect({ message: 'Authentication required', code: 'AUTH_UNAUTHORIZED' })
    expect(firewallService.observeSubnet).not.toHaveBeenCalled()
  })

  it('rejects inactive users for consistency checks', async () => {
    usersService.findById.mockResolvedValue({ isActive: false })
    await request(app.getHttpServer()).get('/api/labs/1/firewall-status').auth('test-token', { type: 'bearer' }).expect(403).expect({ message: 'Account is inactive', code: 'ACCOUNT_INACTIVE' })
    expect(firewallService.observeSubnet).not.toHaveBeenCalled()
  })
})
