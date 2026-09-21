import { IsString, Length, MaxLength, MinLength } from 'class-validator'

export class LoginDto {
  @IsString()
  @Length(3, 64)
  username!: string

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string
}
