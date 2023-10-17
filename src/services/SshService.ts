import { Injectable, Logger } from '@nestjs/common'
import { Client, ConnectConfig } from 'ssh2'
import { Duplex } from 'stream'

@Injectable()
export class SshService {
  private conn: Client

  constructor() {
    this.conn = new Client()
  }

  connectToServer(config: ConnectConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      this.conn.on('ready', () => {
        Logger.log('Conexão SSH estabelecida.')
        resolve()
      })

      this.conn.on('error', (err: string) => {
        Logger.error('Erro na conexão SSH:', err)
        reject(err)
      })

      this.conn.connect(config)
    })
  }

  executeCommand(command: string): Promise<string> {
    try {
      return new Promise((resolve, reject) => {
        this.conn.exec(command, (err: string, stream: Duplex) => {
          if (err) {
            reject(err)
            return
          }

          let output = ''

          stream
            .on('data', (data: string) => {
              output += data
            })
            .on('close', (code: number) => {
              code === 0 ? resolve(output) : reject(`Erro ao executar o comando. Código de saída: ${code}`)

              stream.end()
            })
        })
      })
    } catch (err) {
      return err
    }
  }

  closeConnection() {
    this.conn.end()
  }
}
