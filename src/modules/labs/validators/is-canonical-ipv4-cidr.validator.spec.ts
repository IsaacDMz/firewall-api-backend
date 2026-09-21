import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateLabDto } from '../dto/create-lab.dto'

describe('CreateLabDto subnet validation', () => {
  it.each(['192.168.10.0/24', '10.0.0.0/8', '0.0.0.0/0'])('accepts canonical network %s', async (subnet) => {
    const errors = await validate(plainToInstance(CreateLabDto, { name: 'Lab', block: 'B1', subnet, status: 'liberado' }))

    expect(errors).toHaveLength(0)
  })

  it.each(['192.168.10.37/24', '192.168.10.0/33', '192.168.10.0', '192.168.010.0/24'])('rejects invalid or non-canonical network %s', async (subnet) => {
    const errors = await validate(plainToInstance(CreateLabDto, { name: 'Lab', block: 'B1', subnet }))

    expect(errors.some((error) => error.property === 'subnet')).toBe(true)
  })
})
