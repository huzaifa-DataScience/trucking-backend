import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { RbacService } from './rbac.service';
import { User, UserStatus, userAvatarUrl } from '../database/entities';
import { JwtPayload } from './strategies/jwt.strategy';
import { AVATAR_MIMES, FileStorageService } from '../files/file-storage.service';
import type { PatchTeamDto } from './dto/patch-team.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly rbacService: RbacService,
    private readonly config: ConfigService,
    private readonly storage: FileStorageService,
  ) {}

  async register(
    email: string,
    password: string,
    confirmPassword?: string,
  ): Promise<{ access_token: string; user: LoginResult; message?: string }> {
    if (confirmPassword !== undefined && password !== confirmPassword) {
      throw new BadRequestException('Password and confirmPassword do not match');
    }
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    // When REQUIRE_SIGNUP_APPROVAL=false, new users can log in immediately (status=active).
    // When true (default), new users need admin approval (status=pending).
    const requireApproval = this.config.get<string>('REQUIRE_SIGNUP_APPROVAL', 'true') === 'true';
    const defaults = await this.rbacService.getUserDefaults();
    const user = await this.usersService.create({
      email,
      password,
      role: defaults.role as User['role'],
      status: requireApproval ? UserStatus.Pending : UserStatus.Active,
    });

    const permissions = await this.rbacService.getPermissionNamesForRole(user.role);
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, permissions };
    const access_token = await this.jwtService.signAsync(payload);
    return {
      access_token,
      user: this.toLoginResult(user, permissions),
      message: requireApproval
        ? 'Account created successfully. Your account is pending admin approval.'
        : 'Account created successfully. You can log in now.',
    };
  }

  async login(email: string, password: string): Promise<{ access_token: string; user: LoginResult }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const valid = await this.usersService.validatePassword(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    
    // Check if user is approved/active - block login for pending/rejected/inactive users
    if (user.status !== UserStatus.Active) {
      if (user.status === UserStatus.Pending) {
        throw new UnauthorizedException('Your account is pending admin approval. Please wait for approval before logging in.');
      } else if (user.status === UserStatus.Rejected) {
        throw new UnauthorizedException('Your account signup was rejected. Please contact an administrator.');
      } else if (user.status === UserStatus.Inactive) {
        throw new UnauthorizedException('Your account has been deactivated. Please contact an administrator.');
      }
      throw new UnauthorizedException('Your account is not active. Please contact an administrator.');
    }
    
    // Update last login timestamp
    await this.usersService.updateLastLogin(user.id);

    const permissions = await this.rbacService.getPermissionNamesForRole(user.role);
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, permissions };
    const access_token = await this.jwtService.signAsync(payload);
    return {
      access_token,
      user: this.toLoginResult(user, permissions),
    };
  }

  /** Used by GET /auth/profile to include permissions in response. */
  async getPermissionsForRole(roleName: string): Promise<string[]> {
    return this.rbacService.getPermissionNamesForRole(roleName);
  }

  toLoginResult(user: User, permissions?: string[]): LoginResult {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      permissions: permissions ?? [],
      teamId: user.bidTeamId ?? null,
      avatarUrl: userAvatarUrl(user),
    };
  }

  async uploadAvatar(user: User, file: Express.Multer.File | undefined): Promise<LoginResult> {
    if (!file?.buffer?.length) throw new BadRequestException('file required');
    const mime = file.mimetype?.trim() || '';
    if (!(AVATAR_MIMES as readonly string[]).includes(mime)) {
      throw new BadRequestException(`images only: ${AVATAR_MIMES.join(', ')}`);
    }
    if (user.avatarPath) await this.storage.deleteFile(user.avatarPath);
    const avatarPath = await this.storage.writeAvatar(user.id, file.buffer, mime);
    const saved = await this.usersService.setAvatarPath(user.id, avatarPath);
    const permissions = await this.rbacService.getPermissionNamesForRole(saved.role);
    return this.toLoginResult(saved, permissions);
  }

  async removeAvatar(user: User): Promise<LoginResult> {
    if (user.avatarPath) await this.storage.deleteFile(user.avatarPath);
    const saved = await this.usersService.setAvatarPath(user.id, null);
    const permissions = await this.rbacService.getPermissionNamesForRole(saved.role);
    return this.toLoginResult(saved, permissions);
  }

  async getMyTeam(user: User) {
    return this.usersService.getMyCrew(user);
  }

  async setMyTeam(user: User, slots: PatchTeamDto['slots']) {
    const { user: saved, team } = await this.usersService.saveMyCrew(user, slots ?? {});
    const permissions = await this.rbacService.getPermissionNamesForRole(saved.role);
    return { user: this.toLoginResult(saved, permissions), team };
  }

  async openAvatar(userId: number): Promise<{ stream: ReturnType<FileStorageService['openReadStream']>; mimeType: string }> {
    const target = await this.usersService.findById(userId);
    if (!target?.avatarPath) throw new NotFoundException('avatar not found');
    // The stored path can outlive the file (e.g. lost on a different environment's disk) —
    // check first so a missing file is a clean 404, not a raw stream error NestJS logs and
    // can't recover from once the response has started.
    if (!(await this.storage.fileExists(target.avatarPath))) {
      throw new NotFoundException('avatar file not found');
    }
    const mime =
      target.avatarPath.endsWith('.png') ? 'image/png'
      : target.avatarPath.endsWith('.webp') ? 'image/webp'
      : 'image/jpeg';
    return { stream: this.storage.openReadStream(target.avatarPath), mimeType: mime };
  }
}

export interface LoginResult {
  id: number;
  email: string;
  role: string;
  status: string;
  permissions: string[];
  teamId: number | null;
  avatarUrl: string | null;
}
