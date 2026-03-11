import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService, LoginResult } from './auth.service';
import { CurrentUser, Public } from './decorators';
// import { RolesGuard } from './guards';
// import { Roles } from './decorators';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User } from '../database/entities';

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

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
  ): Promise<{ access_token: string; user: LoginResult }> {
    return this.authService.register(dto.email, dto.password, dto.confirmPassword);
  }

  @Get('profile')
  async getProfile(@CurrentUser() user?: User): Promise<LoginResult | { message: string }> {
    if (!user) return { message: 'Not authenticated (auth disabled or no token)' };
    const permissions = await this.authService.getPermissionsForRole(user.role);
    return this.authService.toLoginResult(user, permissions);
  }

  // Authorization disabled for now — uncomment to require admin role:
  // @UseGuards(RolesGuard)
  // @Roles(Role.Admin)
  @Get('admin')
  adminOnly() {
    return { message: 'Admin access granted.' };
  }
}
