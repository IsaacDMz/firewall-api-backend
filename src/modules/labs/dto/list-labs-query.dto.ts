import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsUUID } from 'class-validator'

export class ListLabsQueryDto {
  @ApiPropertyOptional({ description: 'Filter labs by block ID', format: 'uuid', example: 'faabce83-c7eb-4df6-a509-5722fc599339' })
  @IsOptional()
  @IsUUID('4')
  blockId?: string
}
