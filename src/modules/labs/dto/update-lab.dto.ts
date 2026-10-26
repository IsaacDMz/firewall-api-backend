import { Transform } from 'class-transformer'
import { IsNotEmpty, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator'
import { IsCanonicalIpv4Cidr } from '../validators/is-canonical-ipv4-cidr.validator'

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value)
const whenProvided = (_object: object, value: unknown): boolean => value !== undefined

export class UpdateLabDto {
  @Transform(trim)
  @ValidateIf(whenProvided)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string

  @ValidateIf(whenProvided)
  @IsUUID('4')
  blockId?: string

  @Transform(trim)
  @ValidateIf(whenProvided)
  @IsCanonicalIpv4Cidr()
  subnet?: string
}
