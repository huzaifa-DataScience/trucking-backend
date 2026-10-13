import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { AuthService, LoginResult } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { CurrentUser, Public } from './decorators';
import { JwtAuthGuard } from './guards';
import { LoginDto } from './dto/login.dto';
import { PatchTeamDto } from './dto/patch-team.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/password.dto';
import { User } from '../database/entities';
import { MAX_AVATAR_BYTES } from '../files/file-storage.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
  ): Promise<{ access_token: string; user: LoginResult } | { message: string }> {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
  ): Promise<{ access_token: string; user: LoginResult } | { message: string }> {
    return this.authService.register(dto.email, dto.password, dto.confirmPassword);
  }

  /** Emails a one-time reset link if the address has an account. Same answer either way. */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request): Promise<{ message: string }> {
    await this.passwordReset.requestReset(dto.email, req.ip);
    return { message: "If that email has an account, we've sent a link to reset the password." };
  }

  /** Sets a new password from a reset link. */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    if (dto.confirmPassword !== undefined && dto.confirmPassword !== dto.password) {
      throw new BadRequestException('Passwords do not match');
    }
    await this.passwordReset.resetPassword(dto.token, dto.password);
    return { message: 'Your password has been changed. You can sign in now.' };
  }

  /** Signed-in password change (Account settings). */
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: User | undefined,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ access_token: string; user: LoginResult; message: string }> {
    if (!user) throw new UnauthorizedException('Please sign in again.');
    const session = await this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
    return { ...session, message: 'Password changed. Other devices have been signed out.' };
  }

  /** Signs out every other device; the response carries a new token for this one. */
  @UseGuards(JwtAuthGuard)
  @Post('sign-out-other-devices')
  @HttpCode(HttpStatus.OK)
  async signOutOtherDevices(
    @CurrentUser() user: User | undefined,
  ): Promise<{ access_token: string; user: LoginResult; message: string }> {
    if (!user) throw new UnauthorizedException('Please sign in again.');
    const session = await this.authService.signOutOtherDevices(user.id);
    return { ...session, message: 'Signed out of all other devices.' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@CurrentUser() user?: User): Promise<LoginResult | { message: string }> {
    if (!user) return { message: 'Not authenticated (auth disabled or no token)' };
    const permissions = await this.authService.getPermissionsForRole(user.role);
    return this.authService.toLoginResult(user, permissions);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ): Promise<LoginResult> {
    return this.authService.updateProfile(user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_AVATAR_BYTES },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<LoginResult> {
    return this.authService.uploadAvatar(user, file);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('avatar')
  @HttpCode(HttpStatus.OK)
  async removeAvatar(@CurrentUser() user: User): Promise<LoginResult> {
    return this.authService.removeAvatar(user);
  }

  /** Captain Settings roster. Contacts: GET /connecteam/users. */
  @UseGuards(JwtAuthGuard)
  @Get('team')
  getTeam(@CurrentUser() user: User) {
    return this.authService.getMyTeam(user);
  }

  /** Captain Settings — pick people into slots. Returns `{ user, team }`. */
  @UseGuards(JwtAuthGuard)
  @Patch('team')
  @HttpCode(HttpStatus.OK)
  async setTeam(@CurrentUser() user: User, @Body() dto: PatchTeamDto) {
    return this.authService.setMyTeam(user, dto.slots);
  }

  /** Public so `<img src={API_BASE + avatarUrl}>` works. POST/DELETE stay JWT. */
  @Public()
  @Get('avatar/:userId')
  async getAvatar(
    @Param('userId', ParseIntPipe) userId: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, mimeType } = await this.authService.openAvatar(userId);
    res.set({
      'Content-Type': mimeType,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(stream);
  }

  @Get('admin')
  adminOnly() {
    return { message: 'Admin access granted.' };
  }
}
