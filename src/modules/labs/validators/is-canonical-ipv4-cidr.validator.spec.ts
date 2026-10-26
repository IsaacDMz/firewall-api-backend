import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateLabDto } from '../dto/create-lab.dto'
import { UpdateLabDto } from '../dto/update-lab.dto'

describe('CreateLabDto subnet validation', () => {
  it.each(['192.168.0.0/24', '10.0.0.0/8', '192.168.50.32/27', '192.168.50.32/31', '192.168.0.50/32', ' 192.168.0.0/24 '])('accepts canonical network %s', async (subnet) => {
    const errors = await validate(plainToInstance(CreateLabDto, { name: 'Lab', blockId: 'faabce83-c7eb-4df6-a509-5722fc599339', subnet, status: 'liberado' }))

    expect(errors).toHaveLength(0)
  })

  it.each([
    '192.168.0.50',
    '192.168.0.50/24',
    '192.168.50.324/24',
    '50.324',
    '192.168.001.0/24',
    '192.168.0.0/33',
    '0.0.0.0/0',
    '192.168.0.0/024',
    '192.168.0.0/24/1',
    '::1/128',
  ])('rejects invalid or non-canonical network %s', async (subnet) => {
    const errors = await validate(plainToInstance(CreateLabDto, { name: 'Lab', blockId: 'faabce83-c7eb-4df6-a509-5722fc599339', subnet }))

    expect(errors.some((error) => error.property === 'subnet')).toBe(true)
  })

  it('suggests the canonical network when host bits are set', async () => {
    const errors = await validate(plainToInstance(CreateLabDto, { name: 'Lab', blockId: 'faabce83-c7eb-4df6-a509-5722fc599339', subnet: '172.0.0.1/16' }))

    expect(errors.find((error) => error.property === 'subnet')?.constraints?.isCanonicalIpv4Cidr).toContain('172.0.0.0/16')
  })

  it.each([123, null, [], {}])('rejects a non-string subnet value', async (subnet) => {
    const errors = await validate(plainToInstance(CreateLabDto, { name: 'Lab', blockId: 'faabce83-c7eb-4df6-a509-5722fc599339', subnet }))

    expect(errors.some((error) => error.property === 'subnet')).toBe(true)
  })

  it('allows an omitted subnet in PATCH but rejects null', async () => {
    await expect(validate(plainToInstance(UpdateLabDto, {}))).resolves.toHaveLength(0)

    const errors = await validate(plainToInstance(UpdateLabDto, { subnet: null }))
    expect(errors.some((error) => error.property === 'subnet')).toBe(true)
  })
})
