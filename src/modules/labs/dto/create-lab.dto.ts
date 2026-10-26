import { Transform } from 'class-transformer'
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'
import { LabStatus } from '../../../database/entities/lab.entity'
import { IsIpv4Cidr } from '../validators/is-ipv4-cidr.validator'

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value)

export class CreateLabDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string

  @IsUUID('4')
  blockId!: string

  @Transform(trim)
  @IsIpv4Cidr()
  subnet!: string

  @IsOptional()
  @IsEnum(LabStatus)
  status?: LabStatus
}
