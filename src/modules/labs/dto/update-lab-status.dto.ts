import { IsEnum } from 'class-validator'
import { LabStatus } from '../../../database/entities/lab.entity'

export class UpdateLabStatusDto {
  @IsEnum(LabStatus)
  status!: LabStatus
}
