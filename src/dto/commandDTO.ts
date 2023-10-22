import { JoiSchema, JoiSchemaOptions } from 'nestjs-joi'
import { SshSchema } from 'src/schema/SshSchema'

export class CommandDTO {
  @JoiSchema(SshSchema.command.optional())
  command: string
}
