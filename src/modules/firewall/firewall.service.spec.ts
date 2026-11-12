import { jest } from '@jest/globals'
import { HttpStatus } from '@nestjs/common'
import { FirewallService } from './firewall.service'
import { SshCommandError, SshCommandRunner, SshConnectionError, SshTimeoutError } from './ssh-command-runner'

describe('FirewallService', () => {
  let commandRunner: jest.Mocked<SshCommandRunner>
  let service: FirewallService

  beforeEach(() => {
    commandRunner = { run: jest.fn(async () => ({ stdout: '', stderr: '' })) }
    service = new FirewallService(commandRunner, {
      getOrThrow: jest.fn(() => 'eth0'),
    } as never)
  })

  it('uses only the controlled block command', async () => {
    await service.blockInternet('192.168.10.0/24', 12)

    expect(commandRunner.run).toHaveBeenCalledWith('/usr/bin/sudo -n /usr/local/sbin/labguard-firewall block 192.168.10.0/24 12 eth0')
  })

  it('uses only the controlled unblock command', async () => {
    await service.unblockInternet('192.168.10.0/24', 12)

    expect(commandRunner.run).toHaveBeenCalledWith('/usr/bin/sudo -n /usr/local/sbin/labguard-firewall unblock 192.168.10.0/24 12 eth0')
  })

  it.each([
    [new SshConnectionError(), 'FIREWALL_CONNECTION_FAILED'],
    [new SshCommandError(), 'FIREWALL_COMMAND_FAILED'],
    [new SshTimeoutError(), 'FIREWALL_TIMEOUT'],
  ])('maps SSH failures to a 502 API error', async (error, code) => {
    commandRunner.run.mockRejectedValue(error)

    await expect(service.blockInternet('192.168.10.0/24', 12)).rejects.toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
      response: expect.objectContaining({ code }),
    })
  })

  it('keeps a valid host address in the controlled command', async () => {
    await service.blockInternet('192.168.10.37/24', 12)

    expect(commandRunner.run).toHaveBeenCalledWith('/usr/bin/sudo -n /usr/local/sbin/labguard-firewall block 192.168.10.37/24 12 eth0')
  })

  it('reads existing rules using only the fixed status command', async () => {
    commandRunner.run.mockResolvedValue({
      stdout: '-P FORWARD ACCEPT\n-A FORWARD -j LAB_GUARD\n-N LAB_GUARD\n-A LAB_GUARD -s 10.1.0.0/24 -o eth0 -m comment --comment "labguard:12" -j REJECT --reject-with icmp-port-unreachable\n',
      stderr: '',
    })

    await expect(service.observeSubnet('10.1.0.0/24')).resolves.toEqual({ status: 'bloqueado', error: null })
    expect(commandRunner.run).toHaveBeenCalledTimes(1)
    expect(commandRunner.run).toHaveBeenCalledWith('/usr/bin/sudo -n /usr/local/sbin/labguard-firewall status')
  })

  it('observes an unblocked subnet from a valid empty chain', async () => {
    commandRunner.run.mockResolvedValue({ stdout: '-P FORWARD ACCEPT\n-A FORWARD -j LAB_GUARD\n-N LAB_GUARD\n', stderr: '' })

    await expect(service.observeSubnet('10.1.0.0/24')).resolves.toEqual({ status: 'liberado', error: null })
  })

  it.each([
    [new SshConnectionError('private details'), 'FIREWALL_CONNECTION_FAILED'],
    [new SshCommandError('private details'), 'FIREWALL_COMMAND_FAILED'],
    [new SshTimeoutError('private details'), 'FIREWALL_TIMEOUT'],
    [new Error('private details'), 'FIREWALL_COMMAND_FAILED'],
  ])('returns unknown with a controlled error when status fails', async (error, code) => {
    commandRunner.run.mockRejectedValue(error)

    const observation = await service.observeSubnet('10.1.0.0/24')
    expect(observation).toEqual({ status: 'desconhecido', error: { message: expect.any(String), code } })
    expect(JSON.stringify(observation)).not.toContain('private details')
  })

  it.each([
    { stdout: '', stderr: '' },
    { stdout: 'OK block lab=12', stderr: '' },
    { stdout: '-P FORWARD ACCEPT', stderr: 'permission denied' },
  ])('does not infer Internet access from invalid output', async (result) => {
    commandRunner.run.mockResolvedValue(result)

    await expect(service.observeSubnet('10.1.0.0/24')).resolves.toMatchObject({ status: 'desconhecido', error: { code: 'FIREWALL_STATE_UNKNOWN' } })
  })

  it('rejects invalid subnet data before contacting the router', async () => {
    await expect(service.observeSubnet('10.1.0.0/24; reboot')).resolves.toMatchObject({ status: 'desconhecido', error: { code: 'FIREWALL_COMMAND_FAILED' } })
    expect(commandRunner.run).not.toHaveBeenCalled()
  })
})
