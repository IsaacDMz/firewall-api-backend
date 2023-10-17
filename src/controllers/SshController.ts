import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { JoiPipe } from 'nestjs-joi'
import { sshConfig } from 'src/config/SshConfig'
import { CommandDTO } from 'src/dto/commandDTO'
import { SshService } from 'src/services/SshService'

@Controller('ssh')
export class SshController {
  constructor(private readonly sshService: SshService) {}

  @Get()
  async executeSshCommand(@Query(JoiPipe) commandDTO: CommandDTO): Promise<string> {
    try {
      await this.sshService.connectToServer(sshConfig)
      const result = await this.sshService.executeCommand(commandDTO.command)
      this.sshService.closeConnection()
      return result
    } catch (error) {
      return error
    }
  }
}
