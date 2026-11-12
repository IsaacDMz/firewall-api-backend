import { INestApplication, ValidationPipe } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { jest } from '@jest/globals'
import request from 'supertest'
import { EntityManager } from 'typeorm'
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter'
import { LabStatus } from '../../database/entities/lab.entity'
import { AuditResult } from '../../database/entities/audit-log.entity'
import { FirewallService } from '../firewall/firewall.service'
import { SshConnectionError, SshTimeoutError } from '../firewall/ssh-command-runner'
import { UsersService } from '../users/users.service'
import { LabsController } from './labs.controller'
import { LabsService } from './labs.service'

const emptyRules = '-P FORWARD ACCEPT\n-A FORWARD -j LAB_GUARD\n-N LAB_GUARD\n'
const blockedRules = `${emptyRules}-A LAB_GUARD -s 10.1.0.0/24 -o eth0 -m comment --comment "labguard:1" -j REJECT --reject-with icmp-port-unreachable\n`

describe('POST /api/labs/:id/firewall-reconcile', () => {
  let app: INestApplication
  const lab = { id: 1, subnet: '10.1.0.0/24', status: LabStatus.BLOQUEADO }
  const repository = { findOne: jest.fn(async () => lab as typeof lab | null), save: jest.fn() }
  const manager = { getRepository: jest.fn(() => repository) }
  const dataSource = { transaction: jest.fn(async (work: (manager: EntityManager) => Promise<unknown>) => work(manager as never)) }
  const runner = { run: jest.fn(async () => ({ stdout: blockedRules, stderr: '' })) }
  const audit = { record: jest.fn(async () => undefined) }
  const users = { findById: jest.fn(async () => ({ isActive: true })) }

  beforeAll(async () => {
    const firewall = new FirewallService(runner, { getOrThrow: () => 'eth0' } as never)
    const service = new LabsService(repository as never, {} as never, dataSource as never, firewall, {} as never, audit as never)
    const module = await Test.createTestingModule({
      controllers: [LabsController],
      providers: [
        { provide: LabsService, useValue: service },
        { provide: UsersService, useValue: users },
        { provide: JwtService, useValue: { verifyAsync: jest.fn(async (token: string) => ({ sub: 'user-id', username: 'user', role: token.toUpperCase(), type: 'access' })) } },
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
    repository.findOne.mockResolvedValue(lab)
    runner.run.mockResolvedValue({ stdout: blockedRules, stderr: '' })
    users.findById.mockResolvedValue({ isActive: true })
  })

  afterAll(async () => {
    await app.close()
  })

  it.each(['professor', 'admin'])('uses the same mutation permissions for %s', async (token) => {
    await request(app.getHttpServer())
      .post('/api/labs/1/firewall-reconcile')
      .auth(token, { type: 'bearer' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          labId: 1,
          subnet: lab.subnet,
          databaseStatus: 'bloqueado',
          firewallStatus: 'bloqueado',
          isSynchronized: true,
          checkedAt: expect.any(String),
          error: null,
          success: true,
          changeApplied: false,
        })
      })
    expect(runner.run).toHaveBeenCalledTimes(1)
    expect(runner.run).toHaveBeenCalledWith('/usr/bin/sudo -n /usr/local/sbin/labguard-firewall status')
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('reapplies only the persisted policy using the existing executor', async () => {
    runner.run.mockResolvedValueOnce({ stdout: emptyRules, stderr: '' }).mockResolvedValueOnce({ stdout: 'OK block', stderr: '' }).mockResolvedValueOnce({ stdout: blockedRules, stderr: '' })

    await request(app.getHttpServer())
      .post('/api/labs/1/firewall-reconcile')
      .auth('professor', { type: 'bearer' })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ success: true, isSynchronized: true, changeApplied: true }))

    expect(runner.run.mock.calls.map(([command]) => command)).toEqual([
      '/usr/bin/sudo -n /usr/local/sbin/labguard-firewall status',
      '/usr/bin/sudo -n /usr/local/sbin/labguard-firewall block 10.1.0.0/24 1 eth0',
      '/usr/bin/sudo -n /usr/local/sbin/labguard-firewall status',
    ])
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('returns HTTP 502 with the diagnostic fields when SSH fails', async () => {
    runner.run.mockRejectedValueOnce(new SshConnectionError('private information'))

    await request(app.getHttpServer())
      .post('/api/labs/1/firewall-reconcile')
      .auth('professor', { type: 'bearer' })
      .expect(502)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          message: 'Firewall connection failed',
          code: 'FIREWALL_CONNECTION_FAILED',
          details: { databaseStatus: 'bloqueado', firewallStatus: 'desconhecido', isSynchronized: null, success: false, changeApplied: false, error: { code: 'FIREWALL_CONNECTION_FAILED' } },
        })
        expect(JSON.stringify(body)).not.toContain('private information')
      })
    expect(runner.run).toHaveBeenCalledTimes(1)
    expect(audit.record).toHaveBeenLastCalledWith(expect.objectContaining({ result: AuditResult.FAILURE }))
  })

  it('returns HTTP 502 when final verification fails after the command succeeded', async () => {
    runner.run.mockResolvedValueOnce({ stdout: emptyRules, stderr: '' }).mockResolvedValueOnce({ stdout: 'OK block', stderr: '' }).mockRejectedValueOnce(new SshTimeoutError())

    await request(app.getHttpServer())
      .post('/api/labs/1/firewall-reconcile')
      .auth('admin', { type: 'bearer' })
      .expect(502)
      .expect(({ body }) => {
        expect(body).toMatchObject({ code: 'FIREWALL_TIMEOUT', details: { firewallStatus: 'desconhecido', isSynchronized: null, success: false, changeApplied: true } })
      })
  })

  it('returns HTTP 409 with the final state when the rule did not resolve the divergence', async () => {
    runner.run.mockResolvedValue({ stdout: emptyRules, stderr: '' })

    await request(app.getHttpServer())
      .post('/api/labs/1/firewall-reconcile')
      .auth('admin', { type: 'bearer' })
      .expect(409)
      .expect(({ body }) => {
        expect(body).toMatchObject({ code: 'FIREWALL_RECONCILIATION_FAILED', details: { firewallStatus: 'liberado', isSynchronized: false, success: false, changeApplied: true } })
      })
  })

  it.each([{ subnet: '10.2.0.0/24' }, { status: 'liberado' }, { command: 'iptables -F' }])('rejects client-supplied arguments %j before any operation', async (body) => {
    await request(app.getHttpServer())
      .post('/api/labs/1/firewall-reconcile')
      .auth('admin', { type: 'bearer' })
      .send(body)
      .expect(400)
      .expect(({ body: error }) => expect(error.code).toBe('BAD_REQUEST'))
    expect(runner.run).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })

  it.each([
    { id: 'invalid', status: 400 },
    { id: '0', status: 400 },
    { id: '2147483648', status: 400 },
  ])('rejects invalid lab ID $id', async ({ id, status }) => {
    await request(app.getHttpServer()).post(`/api/labs/${id}/firewall-reconcile`).auth('admin', { type: 'bearer' }).expect(status)
    expect(runner.run).not.toHaveBeenCalled()
  })

  it('returns HTTP 404 for a missing lab', async () => {
    repository.findOne.mockResolvedValue(null)
    await request(app.getHttpServer()).post('/api/labs/999/firewall-reconcile').auth('admin', { type: 'bearer' }).expect(404).expect({ message: 'Lab not found', code: 'LAB_NOT_FOUND' })
    expect(runner.run).not.toHaveBeenCalled()
  })

  it('requires authentication', async () => {
    await request(app.getHttpServer()).post('/api/labs/1/firewall-reconcile').expect(401)
    expect(runner.run).not.toHaveBeenCalled()
  })

  it('rejects a user with no mutation permission', async () => {
    await request(app.getHttpServer()).post('/api/labs/1/firewall-reconcile').auth('viewer', { type: 'bearer' }).expect(403)
    expect(runner.run).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })

  it('rejects an inactive user', async () => {
    users.findById.mockResolvedValue({ isActive: false })
    await request(app.getHttpServer()).post('/api/labs/1/firewall-reconcile').auth('professor', { type: 'bearer' }).expect(403).expect({ message: 'Account is inactive', code: 'ACCOUNT_INACTIVE' })
    expect(runner.run).not.toHaveBeenCalled()
  })
})
