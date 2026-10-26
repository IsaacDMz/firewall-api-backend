import { BadGatewayException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { validateCanonicalIpv4Network } from '../../common/network/ipv4-cidr'
import { SshCommandError, SshCommandRunner, SshConnectionError, SshTimeoutError } from './ssh-command-runner'

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

  private async execute(operation: FirewallOperation, subnet: string, labId: number): Promise<void> {
    if (!validateCanonicalIpv4Network(subnet).valid || !Number.isSafeInteger(labId) || labId < 1) {
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
