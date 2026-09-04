import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Res,
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

  // Authorization disabled for now — uncomment to require admin role:
  // @UseGuards(RolesGuard)
  // @Roles(Role.Admin)
  @Get('admin')
  adminOnly() {
    return { message: 'Admin access granted.' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadAvatar(
    @CurrentUser() user: User,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<LoginResult> {
    if (!user) throw new BadRequestException('Not authenticated');
    return this.authService.uploadAvatar(user.id, file);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('avatar')
  async deleteAvatar(@CurrentUser() user: User): Promise<LoginResult> {
    if (!user) throw new BadRequestException('Not authenticated');
    return this.authService.deleteAvatar(user.id);
  }

  /** Public so plain <img src> tags (no Authorization header) can load it. */
  @Public()
  @Get('avatar/:userId')
  async getAvatar(
    @Param('userId', ParseIntPipe) userId: number,
    @Res() res: Response,
  ): Promise<void> {
    const path = await this.authService.getAvatarPath(userId);
    if (!path) throw new NotFoundException('No avatar set');
    const stream = this.authService.openAvatarStream(path);
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).end();
    });
    const ext = path.split('.').pop()?.toLowerCase();
    const contentType =
      ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    stream.pipe(res);
  }
}
