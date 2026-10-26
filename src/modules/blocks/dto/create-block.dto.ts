import { Transform } from 'class-transformer'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value)

export class CreateBlockDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string
}
