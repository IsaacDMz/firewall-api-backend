import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../../common/auth/current-user.decorator'
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface'
import { JwtAccessGuard } from '../../common/guards/jwt-access.guard'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { RefreshTokenDto } from './dto/refresh-token.dto'
import { RegisterDto } from './dto/register.dto'
import { PublicUser, TokenPair } from './auth.types'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() data: RegisterDto): Promise<PublicUser> {
    return this.authService.register(data)
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() data: LoginDto): Promise<TokenPair> {
    return this.authService.login(data)
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() data: RefreshTokenDto): Promise<TokenPair> {
    return this.authService.refresh(data.refreshToken)
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout(@Body() data: RefreshTokenDto): Promise<void> {
    return this.authService.logout(data.refreshToken)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAccessGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<PublicUser> {
    return this.authService.me(user.id)
  }
}
