import { Body, Controller, Post } from '@nestjs/common'
import { JoiPipe } from 'nestjs-joi'
import { sshConfig } from 'src/config/SshConfig'
import { CommandDTO } from 'src/dto/commandDTO'
import { SshService } from 'src/services/SshService'

@Controller('ssh')
export class SshController {
  constructor(private readonly sshService: SshService) {}

  @Post()
  async executeSshCommand(@Body(JoiPipe) commandDTO: CommandDTO): Promise<string> {
    try {
      const password = process.env.SSH_PASSWORD
      await this.sshService.connectToServer(sshConfig)
      const result = await this.sshService.executeCommand(`echo ${password} | sudo -S ${commandDTO.command}`)
      this.sshService.closeConnection()
      return result
    } catch (error) {
      return error
    }
  }
}
