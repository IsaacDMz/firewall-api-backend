import { Transform } from 'class-transformer'
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { LabStatus } from '../../../database/entities/lab.entity'
import { IsCanonicalIpv4Cidr } from '../validators/is-canonical-ipv4-cidr.validator'

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value)

export class CreateLabDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  block!: string

  @Transform(trim)
  @IsCanonicalIpv4Cidr()
  subnet!: string

  @IsOptional()
  @IsEnum(LabStatus)
  status?: LabStatus
}
