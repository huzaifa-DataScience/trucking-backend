import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService, LoginResult } from './auth.service';
import { CurrentUser, Public, Roles } from './decorators';
import { RolesGuard } from './guards';
import { LoginDto } from './dto/login.dto';
import { User, Role } from '../database/entities';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
  ): Promise<{ access_token: string; user: LoginResult }> {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('profile')
  getProfile(@CurrentUser() user: User): LoginResult {
    return this.authService.toLoginResult(user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @Get('admin')
  adminOnly() {
    return { message: 'Admin access granted.' };
  }
}
