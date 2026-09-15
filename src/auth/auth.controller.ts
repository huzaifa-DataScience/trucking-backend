import {
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
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { AuthService, LoginResult } from './auth.service';
import { CurrentUser, Public } from './decorators';
import { JwtAuthGuard } from './guards';
import { LoginDto } from './dto/login.dto';
import { PatchTeamDto } from './dto/patch-team.dto';
import { RegisterDto } from './dto/register.dto';
import { User } from '../database/entities';
import { MAX_AVATAR_BYTES } from '../files/file-storage.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@CurrentUser() user?: User): Promise<LoginResult | { message: string }> {
    if (!user) return { message: 'Not authenticated (auth disabled or no token)' };
    const permissions = await this.authService.getPermissionsForRole(user.role);
    return this.authService.toLoginResult(user, permissions);
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
      'Cache-Control': 'private, max-age=3600',
    });
    return new StreamableFile(stream);
  }

  @Get('admin')
  adminOnly() {
    return { message: 'Admin access granted.' };
  }
}
