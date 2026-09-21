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

  it('rejects a non-canonical subnet without reaching SSH', async () => {
    await expect(service.blockInternet('192.168.10.37/24', 12)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FIREWALL_COMMAND_FAILED' }),
    })
    expect(commandRunner.run).not.toHaveBeenCalled()
  })
})
