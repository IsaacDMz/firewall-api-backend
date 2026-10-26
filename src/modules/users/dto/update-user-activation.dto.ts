import { IsBoolean } from 'class-validator'

export class UpdateUserActivationDto {
  @IsBoolean()
  isActive!: boolean
}
