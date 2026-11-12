import { BadGatewayException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { validateIpv4Cidr } from '../../common/network/ipv4-cidr'
import { SshCommandError, SshCommandRunner, SshConnectionError, SshTimeoutError } from './ssh-command-runner'
import { readFirewallStatus } from './firewall-status'
import { FirewallObservation } from './firewall.types'

type FirewallOperation = 'block' | 'unblock'

@Injectable()
export class FirewallService {
  constructor(
    private readonly commandRunner: SshCommandRunner,
    private readonly configService: ConfigService,
  ) {}

  blockInternet(subnet: string, labId: number): Promise<void> {
    return this.execute('block', subnet, labId)
  }

  unblockInternet(subnet: string, labId: number): Promise<void> {
    return this.execute('unblock', subnet, labId)
  }

  async observeSubnet(subnet: string): Promise<FirewallObservation> {
    if (!validateIpv4Cidr(subnet).valid) {
      return { status: 'desconhecido', error: { message: 'Firewall request is invalid', code: 'FIREWALL_COMMAND_FAILED' } }
    }

    try {
      const wanInterface = this.configService.getOrThrow<string>('firewall.wanInterface')
      const result = await this.commandRunner.run('/usr/bin/sudo -n /usr/local/sbin/labguard-firewall status')
      const status = result.stderr.trim() ? 'desconhecido' : readFirewallStatus(result.stdout, subnet, wanInterface)
      return {
        status,
        error: status === 'desconhecido' ? { message: 'Firewall state could not be determined', code: 'FIREWALL_STATE_UNKNOWN' } : null,
      }
    } catch (error) {
      if (error instanceof SshTimeoutError) {
        return { status: 'desconhecido', error: { message: 'Firewall operation timed out', code: 'FIREWALL_TIMEOUT' } }
      }
      if (error instanceof SshConnectionError) {
        return { status: 'desconhecido', error: { message: 'Firewall connection failed', code: 'FIREWALL_CONNECTION_FAILED' } }
      }
      return { status: 'desconhecido', error: { message: 'Firewall command failed', code: 'FIREWALL_COMMAND_FAILED' } }
    }
  }

  private async execute(operation: FirewallOperation, subnet: string, labId: number): Promise<void> {
    if (!validateIpv4Cidr(subnet).valid || !Number.isSafeInteger(labId) || labId < 1) {
      throw new BadGatewayException({ message: 'Firewall request is invalid', code: 'FIREWALL_COMMAND_FAILED' })
    }

    const wanInterface = this.configService.getOrThrow<string>('firewall.wanInterface')
    const command = `/usr/bin/sudo -n /usr/local/sbin/labguard-firewall ${operation} ${subnet} ${labId} ${wanInterface}`

    try {
      await this.commandRunner.run(command)
    } catch (error) {
      if (error instanceof SshTimeoutError) {
        throw new BadGatewayException({ message: 'Firewall operation timed out', code: 'FIREWALL_TIMEOUT' })
      }

      if (error instanceof SshConnectionError) {
        throw new BadGatewayException({ message: 'Firewall connection failed', code: 'FIREWALL_CONNECTION_FAILED' })
      }

      if (error instanceof SshCommandError) {
        throw new BadGatewayException({ message: 'Firewall command failed', code: 'FIREWALL_COMMAND_FAILED' })
      }

      throw new BadGatewayException({ message: 'Firewall command failed', code: 'FIREWALL_COMMAND_FAILED' })
    }
  }
}
