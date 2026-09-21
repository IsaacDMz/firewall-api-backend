import { Module } from '@nestjs/common'
import { FirewallService } from './firewall.service'
import { Ssh2CommandRunner } from './ssh2-command-runner.service'
import { SshCommandRunner } from './ssh-command-runner'

@Module({
  providers: [Ssh2CommandRunner, { provide: SshCommandRunner, useExisting: Ssh2CommandRunner }, FirewallService],
  exports: [FirewallService],
})
export class FirewallModule {}
