export type SshCommandResult = {
  stderr: string
  stdout: string
}

export abstract class SshCommandRunner {
  abstract run(command: string): Promise<SshCommandResult>
}

export class SshConnectionError extends Error {}
export class SshCommandError extends Error {}
export class SshTimeoutError extends Error {}
