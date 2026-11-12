import { jest } from '@jest/globals'
import { DataSource } from 'typeorm'
import * as dotenv from 'dotenv'
import { Block } from '../../database/entities/block.entity'
import { Lab, LabStatus } from '../../database/entities/lab.entity'
import { LabsService } from './labs.service'

// Opt in against a development database with at least two labs. The test does
// not write records or execute SSH: only real row locks and reads are exercised.
const describePostgres = process.env.LAB_GUARD_POSTGRES_TESTS === '1' ? describe : describe.skip

describePostgres('Lab operation locking with PostgreSQL', () => {
  let dataSource: DataSource
  let labs: Lab[]

  beforeAll(async () => {
    dotenv.config()
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: Number(process.env.DATABASE_PORT ?? 5432),
      username: process.env.DATABASE_USERNAME ?? 'postgres',
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME ?? 'lab_guard',
      entities: [Lab, Block],
      synchronize: false,
      connectTimeoutMS: 3000,
    })
    await dataSource.initialize()
    labs = await dataSource.getRepository(Lab).find({ take: 2, order: { id: 'ASC' } })
    if (labs.length < 2) throw new Error('Integration test requires two existing labs in a development PostgreSQL database')
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
  })

  it('holds the row lock across SSH observation, rejects conflicting operations from another service, and releases it afterwards', async () => {
    const lab = labs[0]
    const actor = { id: '0aabce83-c7eb-4df6-a509-5722fc599339', username: 'test', role: 'ADMIN' as const }
    let release!: () => void
    let started!: () => void
    const waitForRelease = new Promise<void>((resolve) => {
      release = resolve
    })
    const waitForStart = new Promise<void>((resolve) => {
      started = resolve
    })
    const observer = jest.fn(async (subnet: string) => ({ status: labs.find((value) => value.subnet === subnet)!.status, error: null }))
    observer.mockImplementationOnce(async () => {
      started()
      await waitForRelease
      return { status: lab.status, error: null }
    })
    const firewall = { observeSubnet: observer, blockInternet: jest.fn(), unblockInternet: jest.fn() }
    const audit = { record: jest.fn(async () => undefined) }
    const service = () => new LabsService(dataSource.getRepository(Lab), dataSource.getRepository(Block), dataSource, firewall as never, {} as never, audit as never)
    const firstService = service()
    const secondService = service()
    const pending = firstService.reconcileFirewall(lab.id, actor, 'first')

    try {
      await waitForStart
      const conflict = { status: 409, response: { code: 'LAB_OPERATION_IN_PROGRESS' } }
      await expect(secondService.reconcileFirewall(lab.id, actor, 'second')).rejects.toMatchObject(conflict)
      await expect(secondService.updateStatus(lab.id, { status: LabStatus.BLOQUEADO }, actor, 'block')).rejects.toMatchObject(conflict)
      await expect(secondService.updateStatus(lab.id, { status: LabStatus.LIBERADO }, actor, 'unblock')).rejects.toMatchObject(conflict)
      await expect(secondService.update(lab.id, { name: 'must not persist' }, actor, 'update')).rejects.toMatchObject(conflict)
      await expect(secondService.reconcileFirewall(labs[1].id, actor, 'other-lab')).resolves.toMatchObject({ success: true, changeApplied: false })
      expect(firewall.blockInternet).not.toHaveBeenCalled()
      expect(firewall.unblockInternet).not.toHaveBeenCalled()
    } finally {
      release()
      await pending
    }

    await expect(secondService.reconcileFirewall(lab.id, actor, 'after-release')).resolves.toMatchObject({ success: true, changeApplied: false })
    expect(await dataSource.getRepository(Lab).findOneByOrFail({ id: lab.id })).toMatchObject({ name: lab.name, status: lab.status, subnet: lab.subnet })
  })

  it('releases the row lock when an operation throws', async () => {
    const lab = labs[0]
    const actor = { id: '0aabce83-c7eb-4df6-a509-5722fc599339', username: 'test', role: 'ADMIN' as const }
    const observer = jest.fn(async () => ({ status: lab.status, error: null }))
    observer.mockRejectedValueOnce(new Error('unexpected test failure'))
    const service = new LabsService(
      dataSource.getRepository(Lab),
      dataSource.getRepository(Block),
      dataSource,
      { observeSubnet: observer } as never,
      {} as never,
      { record: jest.fn(async () => undefined) } as never,
    )

    await expect(service.reconcileFirewall(lab.id, actor, 'failure')).rejects.toThrow('unexpected test failure')
    await expect(service.reconcileFirewall(lab.id, actor, 'retry')).resolves.toMatchObject({ success: true })
  })
})
