import { createHash, timingSafeEqual } from 'crypto'
import { readFile } from 'fs/promises'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Client, ClientChannel, ConnectConfig } from 'ssh2'
import { SshCommandError, SshCommandResult, SshCommandRunner, SshConnectionError, SshTimeoutError } from './ssh-command-runner'

@Injectable()
export class Ssh2CommandRunner implements SshCommandRunner {
  constructor(private readonly configService: ConfigService) {}

  async run(command: string): Promise<SshCommandResult> {
    let privateKey: string

    try {
      privateKey = await readFile(this.configService.getOrThrow<string>('firewall.privateKeyPath'), 'utf8')
    } catch {
      throw new SshConnectionError('Unable to read SSH private key')
    }

    return new Promise((resolve, reject) => {
      const client = new Client()
      let settled = false
      let commandTimeout: NodeJS.Timeout | undefined

      const complete = (error?: Error, result?: SshCommandResult): void => {
        if (settled) {
          return
        }

        settled = true
        if (commandTimeout) {
          clearTimeout(commandTimeout)
        }
        client.removeAllListeners()
        client.end()

        if (error) {
          reject(error)
        } else if (result) {
          resolve(result)
        }
      }

      client.once('error', (error: Error & { level?: string }) => {
        const isTimeout = error.level === 'client-timeout' || /timeout|timed out/i.test(error.message)
        complete(isTimeout ? new SshTimeoutError('SSH connection timed out') : new SshConnectionError('SSH connection failed'))
      })
      client.once('timeout', () => complete(new SshTimeoutError('SSH connection timed out')))
      client.once('ready', () => {
        commandTimeout = setTimeout(() => {
          complete(new SshTimeoutError('SSH command timed out'))
        }, this.configService.getOrThrow<number>('firewall.commandTimeout'))

        client.exec(command, (error, stream) => {
          if (error) {
            complete(new SshCommandError('SSH command could not start'))
            return
          }

          this.collectCommandResult(stream, complete)
        })
      })

      try {
        client.connect(this.connectionConfig(privateKey))
      } catch {
        complete(new SshConnectionError('SSH connection failed'))
      }
    })
  }

  private connectionConfig(privateKey: string): ConnectConfig {
    return {
      host: this.configService.getOrThrow<string>('firewall.host'),
      port: this.configService.getOrThrow<number>('firewall.port'),
      username: this.configService.getOrThrow<string>('firewall.username'),
      privateKey,
      readyTimeout: this.configService.getOrThrow<number>('firewall.connectTimeout'),
      hostVerifier: (key: Buffer | string) => this.verifyHostFingerprint(key),
    }
  }

  private collectCommandResult(stream: ClientChannel, complete: (error?: Error, result?: SshCommandResult) => void): void {
    let stdout = ''
    let stderr = ''

    stream.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    stream.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    stream.once('error', () => complete(new SshCommandError('SSH command failed')))
    stream.once('close', (code: number | null) => {
      if (code !== 0 || stderr.trim()) {
        complete(new SshCommandError('SSH command failed'))
        return
      }

      complete(undefined, { stdout, stderr })
    })
  }

  private verifyHostFingerprint(key: Buffer | string): boolean {
    if (!Buffer.isBuffer(key)) {
      return false
    }

    const actual = `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`
    const expected = this.configService.getOrThrow<string>('firewall.hostFingerprint')
    const actualBuffer = Buffer.from(actual)
    const expectedBuffer = Buffer.from(expected)

    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  }
}
